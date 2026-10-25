// The image viewer: a full-screen native <dialog> over the album page. The thumbnail that was clicked morphs into the
// picture (View Transitions), the picture can be zoomed, panned and swiped, and the details sit in a side panel.
// It reads the markup the grid carries (data-* attributes written at build time) and never parses an index.
// Everything beyond "open, show, close" is an enhancement: without View Transitions it fades in, without pointer
// events the buttons and arrow keys still work, and a failed cache read never hides an image.
import enUS from '../i18n/generated/en-US/ui.json';
import type { ViewerScriptMessages } from '../i18n/messages/types.ts';
import type { MetadataLoad, ImageMetadata } from '../lib/image-cache/metadata.ts';
import {
  DOUBLE_TAP_SCALE,
  KEY_ZOOM_STEP,
  REST,
  clampPan,
  formatPosition,
  pinchTo,
  swipeIntent,
  zoomAt,
  type Box,
  type Point,
  type View,
} from '../lib/viewer/transform.ts';

const PANEL_KEY = 'gallery:panel';
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
// A tap is a press that barely moves and ends quickly. Two taps this close together, in time and space, zoom.
const TAP_MOVE = 8;
const TAP_TIME = 320;
const DOUBLE_TAP_TIME = 320;
const DOUBLE_TAP_DISTANCE = 32;
// How long the morph waits for the viewer's picture to decode, so it never lands on an empty box.
const DECODE_WAIT = 260;

export interface ViewerDeps {
  readCached(url: string, bytes: number): Promise<Blob | null>;
  enqueueStore(url: string, bytes: number): void;
  loadMetadata(url: string): Promise<MetadataLoad>;
  whenIdle(task: () => void): void;
}

function formatGeneratedAt(value: string | null, unknown: string): string {
  if (value === null) return unknown;
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return unknown;
  return `${time.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

// The cover on an album page keeps its name for the page-to-page morph. In a same-page transition that name would give
// it its own layer above the viewer, so it steps out of the transition and takes its name back afterwards.
function transitionWithoutCovers(start: () => ViewTransition): ViewTransition {
  const covers = [...document.querySelectorAll<HTMLElement>('[style*="view-transition-name: cover-"]')];
  const names = covers.map((cover) => cover.style.getPropertyValue('view-transition-name'));
  for (const cover of covers) cover.style.setProperty('view-transition-name', 'none');
  const transition = start();
  void transition.finished.finally(() => covers.forEach((cover, at) => cover.style.setProperty('view-transition-name', names[at] ?? '')));
  return transition;
}

const setViewTransitionName = (element: HTMLElement, name: string | null): void => {
  if (name === null) element.style.removeProperty('view-transition-name');
  else element.style.setProperty('view-transition-name', name);
};

function readPanelPreference(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) === 'open';
  } catch {
    return false;
  }
}

function storePanelPreference(open: boolean): void {
  try {
    localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed');
  } catch {
    // The choice just is not remembered.
  }
}

// The language of the page and the strings this script sets at run time, both written onto the dialog at build time. A
// missing or unreadable attribute falls back to English, so the viewer still works.
function readMessages(dialog: HTMLElement): { locale: string; text: ViewerScriptMessages } {
  const locale = dialog.dataset.locale || 'en-US';
  try {
    const parsed = JSON.parse(dialog.dataset.messages ?? '') as Partial<ViewerScriptMessages>;
    return { locale, text: { ...enUS.viewer, ...parsed } };
  } catch {
    return { locale, text: enUS.viewer };
  }
}

export function setupViewer(dialog: HTMLDialogElement, grid: HTMLElement, deps: ViewerDeps): void {
  const { locale, text: strings } = readMessages(dialog);
  const items = [...grid.querySelectorAll<HTMLAnchorElement>('a.gallery-item')];
  const pick = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector);
  const viewer = pick<HTMLElement>('[data-viewer]');
  const title = pick<HTMLElement>('[data-dialog-title]');
  const count = pick<HTMLElement>('[data-viewer-count]');
  const stage = pick<HTMLElement>('[data-viewer-stage]');
  const figure = pick<HTMLElement>('[data-dialog-figure]');
  const ambient = pick<HTMLElement>('[data-viewer-ambient]');
  const panel = pick<HTMLElement>('[data-viewer-panel]');
  const status = pick<HTMLElement>('[data-dialog-status]');
  const previous = pick<HTMLButtonElement>('[data-dialog-previous]');
  const next = pick<HTMLButtonElement>('[data-dialog-next]');
  const close = pick<HTMLButtonElement>('[data-dialog-close]');
  const info = pick<HTMLButtonElement>('[data-dialog-info]');
  const zoomButton = pick<HTMLButtonElement>('[data-viewer-zoom]');
  if (!viewer || !title || !count || !stage || !figure || !ambient || !panel || !status) return;
  if (!previous || !next || !close || !info || !zoomButton) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canMorph = () => typeof document.startViewTransition === 'function' && !reducedMotion.matches;

  let current = -1;
  let opener: HTMLAnchorElement | null = null;
  // True when this viewer pushed its fragment, so closing it goes back one history entry.
  let pushed = false;
  let metadataRequest = 0;
  let view: View = REST;
  let metadataLoaded = false;

  const fact = (name: string) => dialog.querySelector<HTMLElement>(`[data-fact="${name}"]`);
  const field = (name: string) => dialog.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const copyButton = (name: string) => dialog.querySelector<HTMLButtonElement>(`[data-copy="${name}"]`);
  const currentImage = () => figure.querySelector<HTMLImageElement>('img');
  const thumbOf = (item: HTMLAnchorElement | undefined) => item?.querySelector<HTMLElement>('.gallery-thumb') ?? null;

  // ---------------------------------------------------------------- zoom, pan and swipe

  const geometry = (): { center: Point; stage: Box; image: Box } => {
    const box = stage.getBoundingClientRect();
    const style = getComputedStyle(stage);
    const left = parseFloat(style.paddingLeft);
    const right = parseFloat(style.paddingRight);
    const top = parseFloat(style.paddingTop);
    const bottom = parseFloat(style.paddingBottom);
    const image = currentImage();
    return {
      center: { x: box.left + left + (box.width - left - right) / 2, y: box.top + top + (box.height - top - bottom) / 2 },
      stage: { width: box.width, height: box.height },
      image: { width: image?.offsetWidth ?? 0, height: image?.offsetHeight ?? 0 },
    };
  };

  const relative = (point: Point, center: Point): Point => ({ x: point.x - center.x, y: point.y - center.y });

  const paintView = (next: View, animated: boolean) => {
    view = next;
    figure.style.transition = animated ? `transform 0.34s ${EASE_OUT}` : 'none';
    figure.style.transform = next.scale === 1 && next.x === 0 && next.y === 0 ? '' : `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.scale})`;
    viewer.toggleAttribute('data-zoomed', next.scale > 1);
    const zoomed = next.scale > 1;
    zoomButton.setAttribute('aria-label', zoomed ? strings.zoomOut : strings.zoomIn);
    zoomButton.querySelector('[data-zoom-plus]')?.setAttribute('d', zoomed ? 'm20 20-3.5-3.5M8 11h6' : 'm20 20-3.5-3.5M8 11h6M11 8v6');
  };

  const setView = (next: View, animated = true) => paintView(next, animated && !reducedMotion.matches);

  const zoomBy = (factor: number, point?: Point) => {
    const { center, stage: stageBox, image } = geometry();
    const at = point ? relative(point, center) : { x: 0, y: 0 };
    setView(zoomAt(view, view.scale * factor, at, image, stageBox));
  };

  const toggleZoom = (point?: Point) => {
    const { center, stage: stageBox, image } = geometry();
    const at = point ? relative(point, center) : { x: 0, y: 0 };
    setView(view.scale > 1 ? REST : zoomAt(view, DOUBLE_TAP_SCALE, at, image, stageBox));
  };

  type Gesture =
    | { kind: 'none' }
    | { kind: 'pan'; start: View; from: Point }
    | { kind: 'swipe'; from: Point; at: number }
    | { kind: 'pinch'; start: View; distance: number; center: Point };

  const pointers = new Map<number, Point>();
  let gesture: Gesture = { kind: 'none' };
  let pressedAt = 0;
  let pressedFrom: Point = { x: 0, y: 0 };
  let moved = 0;
  let lastTap: { at: number; point: Point } | null = null;

  const distanceBetween = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const beginGesture = (pointerType: string) => {
    const points = [...pointers.values()];
    if (points.length >= 2) {
      const [a, b] = points as [Point, Point];
      const { center } = geometry();
      gesture = { kind: 'pinch', start: view, distance: distanceBetween(a, b), center: relative(midpoint(a, b), center) };
    } else if (points.length === 1) {
      const [from] = points as [Point];
      if (view.scale > 1) gesture = { kind: 'pan', start: view, from };
      else gesture = pointerType === 'mouse' ? { kind: 'none' } : { kind: 'swipe', from, at: performance.now() };
    } else {
      gesture = { kind: 'none' };
    }
  };

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      pressedAt = performance.now();
      pressedFrom = { x: event.clientX, y: event.clientY };
      moved = 0;
    }
    beginGesture(event.pointerType);
    if (view.scale > 1) viewer.toggleAttribute('data-panning', true);
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const here = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, here);
    moved = Math.max(moved, distanceBetween(here, pressedFrom));
    const { center, stage: stageBox, image } = geometry();
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [Point, Point];
      paintView(
        pinchTo(gesture.start, gesture, { distance: distanceBetween(a, b), center: relative(midpoint(a, b), center) }, image, stageBox),
        false,
      );
    } else if (gesture.kind === 'pan') {
      paintView(
        clampPan({ scale: gesture.start.scale, x: gesture.start.x + here.x - gesture.from.x, y: gesture.start.y + here.y - gesture.from.y }, image, stageBox),
        false,
      );
    } else if (gesture.kind === 'swipe') {
      // The picture follows the finger along one axis, with some give, so the drag feels attached.
      const dx = here.x - gesture.from.x;
      const dy = here.y - gesture.from.y;
      const sideways = Math.abs(dx) >= Math.abs(dy);
      const x = sideways ? dx * 0.85 : 0;
      const y = sideways ? 0 : Math.max(0, dy) * 0.85;
      figure.style.transition = 'none';
      figure.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${1 - Math.min(0.12, y / 1600)})`;
    }
  });

  const endPointer = (event: PointerEvent, cancelled: boolean) => {
    if (!pointers.has(event.pointerId)) return;
    const here = { x: event.clientX, y: event.clientY };
    const ended = gesture;
    pointers.delete(event.pointerId);
    viewer.removeAttribute('data-panning');

    if (ended.kind === 'pinch') {
      // One finger stays down: carry on as a pan from where it is now. A pinch that fell to rest scale snaps home.
      if (view.scale <= 1.02) setView(REST);
      beginGesture(event.pointerType);
      return;
    }
    const elapsed = performance.now() - pressedAt;
    const isTap = !cancelled && moved <= TAP_MOVE && elapsed <= TAP_TIME;
    gesture = { kind: 'none' };

    if (ended.kind === 'swipe' && !cancelled) {
      const intent = swipeIntent(here.x - ended.from.x, here.y - ended.from.y, performance.now() - ended.at);
      if (intent === 'close') {
        requestClose();
        return;
      }
      if ((intent === 'next' && current < items.length - 1) || (intent === 'previous' && current > 0)) {
        figure.style.transition = '';
        figure.style.transform = '';
        move(intent === 'next' ? 1 : -1);
        return;
      }
    }
    if (ended.kind === 'swipe') {
      figure.style.transition = `transform 0.4s ${EASE_OUT}`;
      figure.style.transform = '';
    }

    if (!isTap) return;
    const now = performance.now();
    if (lastTap && now - lastTap.at <= DOUBLE_TAP_TIME && distanceBetween(lastTap.point, here) <= DOUBLE_TAP_DISTANCE) {
      lastTap = null;
      toggleZoom(here);
      return;
    }
    lastTap = { at: now, point: here };
    // A tap on the empty room around the picture, with nothing zoomed, puts the picture away.
    if (view.scale === 1 && (event.target === stage || event.target === figure)) requestClose();
  };

  stage.addEventListener('pointerup', (event) => endPointer(event, false));
  stage.addEventListener('pointercancel', (event) => endPointer(event, true));

  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      // Lines and pages are scaled to pixels. A pinch on a trackpad arrives as a ctrl-wheel with small deltas.
      const pixels = event.deltaY * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1);
      const factor = Math.exp(-pixels * (event.ctrlKey ? 0.01 : 0.0018));
      const { center, stage: stageBox, image } = geometry();
      paintView(zoomAt(view, view.scale * factor, relative({ x: event.clientX, y: event.clientY }, center), image, stageBox), false);
    },
    { passive: false },
  );

  zoomButton.addEventListener('click', () => toggleZoom());

  // ---------------------------------------------------------------- the picture and what surrounds it

  const setAmbient = (url: string) => {
    const layer = document.createElement('span');
    layer.style.backgroundImage = `url("${url}")`;
    ambient.append(layer);
    if (reducedMotion.matches) {
      while (ambient.children.length > 1) ambient.firstElementChild?.remove();
      return;
    }
    layer
      .animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' })
      .finished.then(() => {
        while (ambient.firstElementChild && ambient.firstElementChild !== layer) ambient.firstElementChild.remove();
      })
      .catch(() => {});
  };

  const showImage = (item: HTMLAnchorElement, direction: -1 | 0 | 1): HTMLImageElement => {
    const url = item.getAttribute('href') ?? '';
    const bytes = Number(item.dataset.bytes);
    const width = Number(item.dataset.width);
    const height = Number(item.dataset.height);
    const image = document.createElement('img');
    image.className = 'gallery-dialog-image';
    image.alt = item.dataset.key ?? '';
    image.width = width;
    image.height = height;
    image.style.setProperty('--ar', String(width / height));
    image.style.setProperty('--nw', String(width));
    // The thumbnail's own picture is already loaded, so showing it first means no blank frame under the morph.
    const thumb = item.querySelector<HTMLImageElement>('img.gallery-thumb');
    const shown = thumb?.currentSrc || thumb?.src || '';
    image.src = shown || url;
    image.addEventListener('error', () => {
      if (figure.contains(image) && image.src !== url) image.src = url;
      else if (figure.contains(image)) status.textContent = strings.imageFailed;
    });
    figure.replaceChildren(image);
    if (direction !== 0 && !reducedMotion.matches) {
      image.animate(
        [
          { opacity: 0, transform: `translateX(${direction * 56}px) scale(0.98)` },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 380, easing: EASE_OUT },
      );
    }
    if (!shown && Number.isFinite(bytes)) {
      void deps.readCached(url, bytes).then((blob) => {
        if (blob && figure.contains(image)) image.src = URL.createObjectURL(blob);
      });
    }
    setAmbient(image.src);
    return image;
  };

  const showFacts = (item: HTMLAnchorElement, index: number) => {
    title.textContent = item.dataset.key ?? '';
    count.textContent = formatPosition(index + 1, items.length);
    fact('key')!.textContent = item.dataset.key ?? '';
    fact('size')!.textContent = `${item.dataset.width} × ${item.dataset.height} px`;
    fact('bytes')!.textContent = strings.bytes.replace('{{n}}', Number(item.dataset.bytes).toLocaleString(locale));
  };

  const setFields = (metadata: ImageMetadata | null) => {
    field('positive')!.textContent = metadata?.prompt.positive ?? '—';
    field('negative')!.textContent = metadata?.prompt.negative ?? '—';
    field('seed')!.textContent = metadata ? String(metadata.seed) : '—';
    field('generatedAt')!.textContent = metadata ? formatGeneratedAt(metadata.generatedAt, strings.unknown) : '—';
    for (const name of ['positive', 'negative'] as const) {
      const button = copyButton(name);
      if (!button) continue;
      button.disabled = !metadata || (metadata.prompt[name] ?? '') === '';
      button.textContent = strings.copy;
    }
  };

  const showMetadata = async (item: HTMLAnchorElement) => {
    const request = ++metadataRequest;
    const metadataUrl = item.dataset.metadata;
    metadataLoaded = false;
    setFields(null);
    if (!metadataUrl) {
      status.textContent = strings.notPublished;
      return;
    }
    status.textContent = strings.loading;
    const result = await deps.loadMetadata(metadataUrl);
    if (request !== metadataRequest) return;
    if (result.status === 'failed') {
      status.textContent = strings.notLoaded;
      return;
    }
    status.textContent = '';
    metadataLoaded = true;
    setFields(result.metadata);
    void result.refresh.then((fresh) => {
      if (fresh && request === metadataRequest) setFields(fresh);
    });
  };

  // The next pictures are fetched ahead as plain images, so an arrow key never waits on the network.
  const warmed = new Set<string>();
  const warm = (item: HTMLAnchorElement | undefined) => {
    const url = item?.getAttribute('href');
    if (!url || warmed.has(url)) return;
    warmed.add(url);
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  };

  const showAt = (index: number, direction: -1 | 0 | 1): HTMLImageElement | null => {
    const item = items[index];
    if (!item) return null;
    current = index;
    setView(REST, false);
    // A new picture's prompts start at their first line, wherever the last one was scrolled to.
    panel.scrollTop = 0;
    showFacts(item, index);
    status.textContent = '';
    const image = showImage(item, direction);
    void showMetadata(item);
    previous.disabled = index === 0;
    next.disabled = index === items.length - 1;
    warm(items[index + 1]);
    warm(items[index - 1]);
    deps.whenIdle(() => {
      for (const neighbour of [items[index - 1], item, items[index + 1]]) {
        if (neighbour) deps.enqueueStore(neighbour.getAttribute('href') ?? '', Number(neighbour.dataset.bytes));
      }
    });
    return image;
  };

  // ---------------------------------------------------------------- the details panel

  const setPanel = (open: boolean, remember = true) => {
    viewer.dataset.panel = open ? 'open' : 'closed';
    panel.inert = !open;
    info.setAttribute('aria-expanded', String(open));
    if (remember) storePanelPreference(open);
  };
  setPanel(readPanelPreference(), false);

  info.addEventListener('click', () => {
    setView(REST, false);
    setPanel(viewer.dataset.panel !== 'open');
  });

  for (const name of ['positive', 'negative'] as const) {
    const button = copyButton(name);
    button?.addEventListener('click', () => {
      const text = field(name)?.textContent ?? '';
      if (!text || !metadataLoaded) return;
      const done = (label: string) => {
        button.textContent = label;
        window.setTimeout(() => {
          if (button.isConnected) button.textContent = strings.copy;
        }, 1600);
      };
      if (!navigator.clipboard) {
        done(strings.copyFailed);
        return;
      }
      navigator.clipboard.writeText(text).then(
        () => done(strings.copied),
        () => done(strings.copyFailed),
      );
    });
  }

  // ---------------------------------------------------------------- opening, moving and closing

  const keyOf = (index: number) => encodeURIComponent(items[index]?.dataset.key ?? '');

  const decodeSoon = async (image: HTMLImageElement | null) => {
    if (!image) return;
    await Promise.race([image.decode().catch(() => {}), new Promise((resolve) => window.setTimeout(resolve, DECODE_WAIT))]);
  };

  const inViewport = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    return box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth;
  };

  const open = (index: number, source: 'thumbnail' | 'deep-link') => {
    if (dialog.open) {
      showAt(index, 0);
    } else {
      opener = items[index] ?? null;
      const thumb = thumbOf(opener ?? undefined);
      const reveal = () => {
        dialog.showModal();
        return showAt(index, 0);
      };
      if (source === 'thumbnail' && thumb && inViewport(thumb) && canMorph()) {
        setViewTransitionName(thumb, 'viewer-photo');
        const transition = transitionWithoutCovers(() =>
          document.startViewTransition(async () => {
            const image = reveal();
            setViewTransitionName(thumb, null);
            if (image) setViewTransitionName(image, 'viewer-photo');
            await decodeSoon(image);
          }),
        );
        void transition.finished.finally(() => {
          setViewTransitionName(thumb, null);
          for (const image of figure.querySelectorAll<HTMLElement>('img')) setViewTransitionName(image, null);
        });
      } else {
        if (!reducedMotion.matches) dialog.dataset.arrive = 'fade';
        reveal();
      }
      // A fragment opened on load is already in the address bar, so it is replaced rather than pushed.
      if (source === 'thumbnail') {
        history.pushState(null, '', `#${keyOf(index)}`);
        pushed = true;
      }
    }
    if (pushed || source === 'deep-link') history.replaceState(null, '', `#${keyOf(index)}`);
  };

  function move(delta: -1 | 1) {
    const target = current + delta;
    if (target < 0 || target >= items.length) return;
    showAt(target, delta);
    history.replaceState(null, '', `#${keyOf(target)}`);
  }

  // Closes the viewer with the picture flying back into its thumbnail when the browser can morph, and plainly otherwise.
  function requestClose() {
    if (!dialog.open) return;
    const item = items[current];
    const thumb = thumbOf(item);
    const image = currentImage();
    if (!item || !thumb || !image || !canMorph()) {
      dialog.close();
      return;
    }
    // A picture dragged down to close starts its flight from where the finger left it; only a zoom is undone first.
    if (view.scale !== 1) setView(REST, false);
    setViewTransitionName(image, 'viewer-photo');
    const transition = transitionWithoutCovers(() =>
      document.startViewTransition(() => {
        setViewTransitionName(image, null);
        dialog.close();
        thumb.scrollIntoView({ block: inViewport(thumb) ? 'nearest' : 'center', behavior: 'instant' });
        setViewTransitionName(thumb, 'viewer-photo');
      }),
    );
    void transition.finished.finally(() => setViewTransitionName(thumb, null));
  }

  dialog.addEventListener('close', () => {
    const wasPushed = pushed;
    const index = current;
    pushed = false;
    current = -1;
    metadataRequest += 1;
    delete dialog.dataset.arrive;
    setView(REST, false);
    if (wasPushed) {
      history.back();
    } else if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    // Focus goes to the picture that was last on show, which is where the page has scrolled to.
    (items[index] ?? opener)?.focus({ preventScroll: true });
    opener = null;
  });

  // Escape takes the same road as the close button, so it gets the same morph.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });

  close.addEventListener('click', () => requestClose());
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));

  dialog.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        move(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        move(1);
        break;
      case 'Home':
        event.preventDefault();
        if (current > 0) {
          showAt(0, -1);
          history.replaceState(null, '', `#${keyOf(0)}`);
        }
        break;
      case 'End':
        event.preventDefault();
        if (current < items.length - 1) {
          showAt(items.length - 1, 1);
          history.replaceState(null, '', `#${keyOf(items.length - 1)}`);
        }
        break;
      case '+':
      case '=':
        event.preventDefault();
        zoomBy(KEY_ZOOM_STEP);
        break;
      case '-':
      case '_':
        event.preventDefault();
        zoomBy(1 / KEY_ZOOM_STEP);
        break;
      case '0':
        event.preventDefault();
        setView(REST);
        break;
      case 'i':
      case 'I':
        if ((event.target as Element).closest('input, textarea')) return;
        event.preventDefault();
        info.click();
        break;
      default:
    }
  });

  // Back from an open image closes the dialog. The fragment is already gone at that point, so nothing is pushed.
  window.addEventListener('popstate', () => {
    if (!dialog.open) return;
    const fragment = decodeURIComponent(location.hash.slice(1));
    if (items[current]?.dataset.key === fragment) return;
    pushed = false;
    requestClose();
  });

  window.addEventListener('resize', () => {
    if (!dialog.open || view.scale === 1) return;
    const { stage: stageBox, image } = geometry();
    paintView(clampPan(view, image, stageBox), false);
  });

  grid.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = (event.target as Element).closest<HTMLAnchorElement>('a.gallery-item');
    const index = link ? items.indexOf(link) : -1;
    if (index < 0) return;
    event.preventDefault();
    open(index, 'thumbnail');
  });

  const fragment = decodeURIComponent(location.hash.slice(1));
  if (fragment) {
    const index = items.findIndex((item) => item.dataset.key === fragment);
    if (index >= 0) open(index, 'deep-link');
  }
}
