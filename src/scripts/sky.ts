// The motion of the home page's sky. The markup is already a finished page: every album is a link at its place. This
// module adds three things on top of it: the stars drift and lean toward a fine pointer, a canvas under them draws the
// lines that join the albums, and the album in play lights its own lines and sends a pulse along them. Nothing here
// reads layout per frame; positions are measured when the box changes and animated from there.

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const STAR = '143, 176, 255';
const POINTER_REACH = 300;
// How far a star leans toward the pointer at most, as a share of its distance to it.
const LEAN = 0.075;
const ENTRY_DELAY = 0.45;

interface Satellite {
  el: HTMLElement;
  // Where the markup placed it, relative to its star's centre, in rendered pixels.
  baseX: number;
  baseY: number;
  angle: number;
  radius: number;
  phase: number;
  speed: number;
  // The live offset from the star's centre, which the canvas tethers to.
  x: number;
  y: number;
}

interface Star {
  el: HTMLElement;
  link: HTMLElement | null;
  size: number;
  depth: number;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  lit: number;
  litTarget: number;
  satellites: Satellite[];
}

interface Dust {
  x: number;
  y: number;
  radius: number;
  depth: number;
  phase: number;
}

// A small seeded generator, so the dust is the same on every visit and in every screenshot.
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const easeOut = (value: number): number => 1 - (1 - value) ** 4;

function setupSky(sky: HTMLElement, canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx = context;

  const stars: Star[] = [...sky.querySelectorAll<HTMLElement>('[data-sky-node]')].map((el, index) => {
    const size = Number(el.style.getPropertyValue('--s')) || 80;
    return {
      el,
      link: el.querySelector<HTMLElement>('[data-sky-star]'),
      size,
      depth: 0.6 + clamp((size - 40) / 80, 0, 1) * 0.8,
      homeX: 0,
      homeY: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      phase: index * 2.399,
      lit: 0,
      litTarget: 0,
      satellites: [...el.querySelectorAll<HTMLElement>('[data-sky-sat]')].map((sat, step) => ({
        el: sat,
        baseX: 0,
        baseY: 0,
        angle: 0,
        radius: 0,
        phase: index * 1.7 + step * 2.1,
        speed: 0.28 + ((index + step) % 3) * 0.09,
        x: 0,
        y: 0,
      })),
    };
  });

  // Each star is joined to its two nearest neighbours. Worked out from the homes, so it changes only with the layout.
  let edges: [number, number][] = [];
  const dust: Dust[] = [];
  let width = 0;
  let height = 0;
  let ratio = 1;

  function measure(): void {
    const box = sky.getBoundingClientRect();
    width = box.width;
    height = box.height;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    for (const star of stars) {
      // The anchor point never moves, so a star's home is read from it; the picture and its satellites are the parts
      // that move, and each moves on its own so that no album's pictures form a layer above another album's name.
      if (star.link) star.link.style.translate = '';
      for (const satellite of star.satellites) satellite.el.style.translate = '';
    }
    for (const star of stars) {
      const at = star.el.getBoundingClientRect();
      star.homeX = at.left - box.left;
      star.homeY = at.top - box.top;
      // Rendered size over the declared size is how much the narrow layout shrinks the star.
      const shown = star.link ? star.link.offsetWidth : star.size;
      const scale = shown / star.size;
      for (const satellite of star.satellites) {
        const sx = Number(satellite.el.style.getPropertyValue('--sx')) * scale;
        const sy = Number(satellite.el.style.getPropertyValue('--sy')) * scale;
        satellite.baseX = sx;
        satellite.baseY = sy;
        satellite.angle = Math.atan2(sy, sx);
        satellite.radius = Math.hypot(sx, sy);
        satellite.x = sx;
        satellite.y = sy;
      }
    }
    for (const star of stars) {
      if (!moving) {
        star.x = star.homeX;
        star.y = star.homeY;
      }
    }

    const seen = new Set<string>();
    edges = [];
    stars.forEach((star, a) => {
      const nearest = stars
        .map((other, b) => ({ b, distance: Math.hypot(other.homeX - star.homeX, other.homeY - star.homeY) }))
        .filter(({ b }) => b !== a)
        .sort((first, second) => first.distance - second.distance)
        .slice(0, 2);
      for (const { b } of nearest) {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    });

    const random = seeded(7);
    dust.length = 0;
    const count = clamp(Math.round((width * height) / 11000), 28, 120);
    for (let index = 0; index < count; index += 1) {
      dust.push({
        x: random(),
        y: random(),
        radius: 0.5 + random() * 0.9,
        depth: 0.25 + random() * 0.75,
        phase: random() * Math.PI * 2,
      });
    }
  }

  // Pointer, in sky pixels, and a smoothed copy that the lean and the parallax read.
  let pointerX = 0;
  let pointerY = 0;
  let pointerIn = false;
  let glow = 0;
  let smoothX = 0;
  let smoothY = 0;
  let moving = false;

  function frame(seconds: number, step: number): void {
    const still = prefersReducedMotion;
    const reach = easeOut(clamp(1 - Math.exp(-step * 10), 0, 1));

    glow += ((pointerIn ? 1 : 0) - glow) * (1 - Math.exp(-step * 5));
    const targetX = pointerIn ? pointerX : width / 2;
    const targetY = pointerIn ? pointerY : height / 2;
    smoothX += (targetX - smoothX) * (1 - Math.exp(-step * 6));
    smoothY += (targetY - smoothY) * (1 - Math.exp(-step * 6));

    for (const star of stars) {
      star.lit += (star.litTarget - star.lit) * (still ? 1 : reach * 0.9 + 0.1);
      let leanX = 0;
      let leanY = 0;
      let driftX = 0;
      let driftY = 0;
      if (!still) {
        driftX = Math.sin(seconds * 0.42 + star.phase) * 5;
        driftY = Math.cos(seconds * 0.33 + star.phase * 1.3) * 5;
        if (pointerIn) {
          const dx = pointerX - star.homeX;
          const dy = pointerY - star.homeY;
          const near = Math.exp(-((Math.hypot(dx, dy) / POINTER_REACH) ** 2));
          leanX = dx * near * LEAN * star.depth;
          leanY = dy * near * LEAN * star.depth;
        }
      }
      const goalX = star.homeX + driftX + leanX;
      const goalY = star.homeY + driftY + leanY;
      // A spring with a little less damping than critical: it settles with one small overshoot, like the page's springs.
      const stiffness = 70;
      const damping = 2 * Math.sqrt(stiffness) * 0.78;
      star.vx += ((goalX - star.x) * stiffness - star.vx * damping) * step;
      star.vy += ((goalY - star.y) * stiffness - star.vy * damping) * step;
      star.x += star.vx * step;
      star.y += star.vy * step;
      const offsetX = star.x - star.homeX;
      const offsetY = star.y - star.homeY;
      if (star.link) star.link.style.translate = `${offsetX.toFixed(2)}px ${offsetY.toFixed(2)}px`;

      for (const satellite of star.satellites) {
        let angle = satellite.angle;
        let radius = satellite.radius;
        let extraX = 0;
        let extraY = 0;
        if (!still) {
          angle += Math.sin(seconds * satellite.speed + satellite.phase) * 0.5;
          radius *= 1 + Math.sin(seconds * 0.7 + satellite.phase) * 0.06;
          extraX = leanX * 0.9;
          extraY = leanY * 0.9;
        }
        satellite.x = Math.cos(angle) * radius + extraX;
        satellite.y = Math.sin(angle) * radius + extraY;
        satellite.el.style.translate = `${(offsetX + satellite.x - satellite.baseX).toFixed(2)}px ${(offsetY + satellite.y - satellite.baseY).toFixed(2)}px`;
      }
    }
    draw(seconds, still);
  }

  function draw(seconds: number, still: boolean): void {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Dust: far points drift least and twinkle softly. The whole field shifts a little against the pointer.
    const shiftX = still ? 0 : (smoothX / (width || 1) - 0.5) * -14;
    const shiftY = still ? 0 : (smoothY / (height || 1) - 0.5) * -14;
    for (const speck of dust) {
      const rise = still ? 0 : (seconds * 0.006 * speck.depth) % 1;
      const y = (((speck.y - rise) % 1) + 1) % 1;
      const twinkle = still ? 0.7 : 0.55 + 0.45 * Math.sin(seconds * 0.9 + speck.phase);
      ctx.fillStyle = `rgba(214, 226, 255, ${(0.16 + 0.42 * speck.depth * twinkle).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(speck.x * width + shiftX * speck.depth, y * height + shiftY * speck.depth, speck.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (glow > 0.01) {
      const light = ctx.createRadialGradient(smoothX, smoothY, 0, smoothX, smoothY, 240);
      light.addColorStop(0, `rgba(${STAR}, ${(0.12 * glow).toFixed(3)})`);
      light.addColorStop(1, `rgba(${STAR}, 0)`);
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, width, height);
    }

    // Halos: a soft light under each star, stronger for the one in play.
    for (const star of stars) {
      const born = easeOut(clamp((seconds - ENTRY_DELAY) / 1.2, 0, 1));
      const radius = star.size * 1.5 * (width < 720 ? 0.72 : 1);
      const halo = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius);
      halo.addColorStop(0, `rgba(${STAR}, ${((0.09 + 0.22 * star.lit) * (still ? 1 : born)).toFixed(3)})`);
      halo.addColorStop(1, `rgba(${STAR}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(star.x - radius, star.y - radius, radius * 2, radius * 2);
    }

    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    // Tethers from a star to the small pictures around it.
    for (const star of stars) {
      ctx.strokeStyle = `rgba(${STAR}, ${(0.12 + 0.3 * star.lit).toFixed(3)})`;
      ctx.beginPath();
      for (const satellite of star.satellites) {
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(star.x + satellite.x, star.y + satellite.y);
      }
      ctx.stroke();
    }

    // The constellation: lines between neighbouring stars. They draw themselves in once, then stay.
    edges.forEach(([a, b], order) => {
      const first = stars[a];
      const second = stars[b];
      if (!first || !second) return;
      const drawn = still ? 1 : easeOut(clamp((seconds - ENTRY_DELAY - order * 0.1) / 1.1, 0, 1));
      if (drawn <= 0) return;
      const lit = Math.max(first.lit, second.lit);
      const endX = first.x + (second.x - first.x) * drawn;
      const endY = first.y + (second.y - first.y) * drawn;
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${STAR}, ${(0.16 + 0.5 * lit).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      if (lit > 0.04 && !still && drawn >= 1) {
        // A short bright dash runs along a line that touches the star in play, away from it.
        const outward = first.lit >= second.lit;
        ctx.setLineDash([16, 140]);
        ctx.lineDashOffset = outward ? -seconds * 150 : seconds * 150;
        ctx.strokeStyle = `rgba(214, 228, 255, ${(0.9 * lit).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(second.x, second.y);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
      }
    });
  }

  // Frames run only while the sky is on screen and the tab is visible, and never at all with reduced motion.
  let onScreen = true;
  let running = false;
  let last = 0;
  let start = 0;
  let queued = 0;
  let clock = 0;

  function tick(now: number): void {
    queued = 0;
    if (!start) start = now;
    const step = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    moving = true;
    clock = (now - start) / 1000;
    frame(clock, step);
    if (running) queued = requestAnimationFrame(tick);
  }

  function play(): void {
    if (prefersReducedMotion || running || !onScreen || document.hidden) return;
    running = true;
    last = 0;
    queued = requestAnimationFrame(tick);
  }

  function pause(): void {
    running = false;
    if (queued) cancelAnimationFrame(queued);
    queued = 0;
  }

  // With reduced motion, or while paused, one frame is drawn whenever something about the picture changes.
  function once(): void {
    if (running || queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      moving = true;
      frame(prefersReducedMotion ? 99 : clock, 1 / 60);
    });
  }

  measure();
  once();

  new ResizeObserver(() => {
    measure();
    once();
  }).observe(sky);
  new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    if (onScreen) play();
    else pause();
  }).observe(sky);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  play();

  if (finePointer && !prefersReducedMotion) {
    sky.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        const box = sky.getBoundingClientRect();
        pointerX = event.clientX - box.left;
        pointerY = event.clientY - box.top;
        pointerIn = true;
      },
      { passive: true },
    );
    sky.addEventListener('pointerleave', () => {
      pointerIn = false;
    });
  }

  // The album in play lights its lines. Hover and keyboard focus both count; a mouse click's focus does not.
  for (const star of stars) {
    const link = star.link;
    if (!link) continue;
    const light = (on: boolean) => {
      star.litTarget = on ? 1 : 0;
      if (prefersReducedMotion) star.lit = star.litTarget;
      once();
    };
    link.addEventListener('pointerenter', () => light(true));
    link.addEventListener('pointerleave', () => light(false));
    link.addEventListener('focus', () => light(link.matches(':focus-visible')));
    link.addEventListener('blur', () => light(false));
  }
}

const sky = document.querySelector<HTMLElement>('[data-sky]');
const canvas = document.querySelector<HTMLCanvasElement>('[data-sky-canvas]');
if (sky && canvas) setupSky(sky, canvas);
