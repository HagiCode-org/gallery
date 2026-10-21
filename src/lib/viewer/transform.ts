// Pure geometry for the image viewer's zoom, pan and swipe. No DOM here, so the rules are testable in Node. Points are
// measured from the centre of the stage, which is also the transform origin of the zoomed picture.

export interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
// Where a double click or double tap zooms to, and how far one key press or wheel notch steps.
export const DOUBLE_TAP_SCALE = 2.5;
export const KEY_ZOOM_STEP = 1.4;

export const REST: View = { scale: MIN_SCALE, x: 0, y: 0 };

export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

// A picture may be dragged only while it is larger than the stage, and only until its edge meets the stage edge.
export function clampPan(view: View, image: Box, stage: Box): View {
  const spareX = Math.max(0, (image.width * view.scale - stage.width) / 2);
  const spareY = Math.max(0, (image.height * view.scale - stage.height) / 2);
  return {
    scale: view.scale,
    // `|| 0` turns a negative zero into zero, so a picture at rest compares equal to REST.
    x: Math.min(spareX, Math.max(-spareX, view.x)) || 0,
    y: Math.min(spareY, Math.max(-spareY, view.y)) || 0,
  };
}

// Zooms to `next` while the picture point under `point` stays under it.
export function zoomAt(view: View, next: number, point: Point, image: Box, stage: Box): View {
  const scale = clampScale(next);
  if (scale === MIN_SCALE) return REST;
  const ratio = scale / view.scale;
  return clampPan({ scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, image, stage);
}

// A two-finger gesture: `start` is the view when the second finger landed. The scale follows the finger distance and
// the picture follows the finger midpoint, so the pinch pivots on the fingers rather than on the stage centre.
export function pinchTo(
  start: View,
  startGesture: { readonly distance: number; readonly center: Point },
  gesture: { readonly distance: number; readonly center: Point },
  image: Box,
  stage: Box,
): View {
  if (startGesture.distance <= 0) return start;
  const scale = clampScale((start.scale * gesture.distance) / startGesture.distance);
  if (scale === MIN_SCALE) return REST;
  const ratio = scale / start.scale;
  return clampPan(
    {
      scale,
      x: gesture.center.x - (startGesture.center.x - start.x) * ratio,
      y: gesture.center.y - (startGesture.center.y - start.y) * ratio,
    },
    image,
    stage,
  );
}

export type SwipeIntent = 'previous' | 'next' | 'close' | 'stay';

const SWIPE_DISTANCE = 80;
const SWIPE_FLICK_DISTANCE = 24;
const SWIPE_FLICK_SPEED = 0.5;
const CLOSE_DISTANCE = 120;

// What a finished one-finger drag at rest scale means. A drag is mostly sideways or mostly downward, never both:
// sideways moves one image, downward closes the viewer. `elapsed` is milliseconds, so speed is pixels per millisecond.
export function swipeIntent(dx: number, dy: number, elapsed: number): SwipeIntent {
  const across = Math.abs(dx);
  const down = Math.abs(dy);
  const speed = Math.max(across, down) / Math.max(elapsed, 1);
  if (across >= down) {
    if (across >= SWIPE_DISTANCE || (speed >= SWIPE_FLICK_SPEED && across >= SWIPE_FLICK_DISTANCE)) {
      return dx < 0 ? 'next' : 'previous';
    }
    return 'stay';
  }
  if (dy > 0 && down > across * 1.2 && (down >= CLOSE_DISTANCE || (speed >= SWIPE_FLICK_SPEED && down >= SWIPE_DISTANCE))) {
    return 'close';
  }
  return 'stay';
}

// `5` of `720` as `005 / 720`: the index is padded to the width of the total, so the counter does not change width.
export function formatPosition(position: number, total: number): string {
  const width = String(total).length;
  return `${String(position).padStart(width, '0')} / ${total}`;
}
