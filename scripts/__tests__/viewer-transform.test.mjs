import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_SCALE,
  REST,
  clampPan,
  clampScale,
  formatPosition,
  pinchTo,
  swipeIntent,
  zoomAt,
} from '../../src/lib/viewer/transform.ts';

const image = { width: 800, height: 800 };
const stage = { width: 1000, height: 600 };

describe('clampScale', () => {
  it('keeps the scale between rest and the maximum', () => {
    assert.equal(clampScale(0.2), 1);
    assert.equal(clampScale(3), 3);
    assert.equal(clampScale(99), MAX_SCALE);
  });
});

describe('clampPan', () => {
  it('does not move a picture that fits the stage', () => {
    assert.deepEqual(clampPan({ scale: 1, x: 300, y: -200 }, { width: 400, height: 300 }, stage), { scale: 1, x: 0, y: 0 });
  });

  it('stops each edge at the stage edge', () => {
    // 800 x 800 at 2x is 1600 x 1600 in a 1000 x 600 stage: 300 spare sideways, 500 spare vertically.
    assert.deepEqual(clampPan({ scale: 2, x: 999, y: -999 }, image, stage), { scale: 2, x: 300, y: -500 });
    assert.deepEqual(clampPan({ scale: 2, x: 120, y: 40 }, image, stage), { scale: 2, x: 120, y: 40 });
  });
});

describe('zoomAt', () => {
  it('returns to rest when the scale falls back to one', () => {
    assert.deepEqual(zoomAt({ scale: 3, x: 50, y: 50 }, 1, { x: 0, y: 0 }, image, stage), REST);
  });

  it('keeps the point under the cursor fixed', () => {
    const point = { x: 100, y: 40 };
    const view = zoomAt(REST, 2, point, image, stage);
    // A picture point p sits at x + p * scale. The point that was under the cursor at rest is p = point.
    assert.equal(view.x + point.x * view.scale, point.x);
    assert.equal(view.y + point.y * view.scale, point.y);
  });

  it('never zooms past the maximum', () => {
    assert.equal(zoomAt(REST, 50, { x: 0, y: 0 }, image, stage).scale, MAX_SCALE);
  });
});

describe('pinchTo', () => {
  const start = { distance: 100, center: { x: 0, y: 0 } };

  it('scales with the finger distance', () => {
    const view = pinchTo(REST, start, { distance: 250, center: { x: 0, y: 0 } }, image, stage);
    assert.equal(view.scale, 2.5);
    assert.deepEqual([view.x, view.y], [0, 0]);
  });

  it('follows the midpoint of the fingers', () => {
    const view = pinchTo({ scale: 2, x: 0, y: 0 }, start, { distance: 100, center: { x: 60, y: 20 } }, image, stage);
    assert.deepEqual([view.scale, view.x, view.y], [2, 60, 20]);
  });

  it('ignores a gesture that started with the fingers together', () => {
    const view = { scale: 2, x: 10, y: 10 };
    assert.equal(pinchTo(view, { distance: 0, center: { x: 0, y: 0 } }, { distance: 80, center: { x: 5, y: 5 } }, image, stage), view);
  });
});

describe('swipeIntent', () => {
  it('turns a long sideways drag into previous or next', () => {
    assert.equal(swipeIntent(-120, 10, 400), 'next');
    assert.equal(swipeIntent(120, -10, 400), 'previous');
  });

  it('accepts a short fast flick but not a short slow drag', () => {
    assert.equal(swipeIntent(-40, 0, 40), 'next');
    assert.equal(swipeIntent(-40, 0, 600), 'stay');
  });

  it('closes on a long downward drag only', () => {
    assert.equal(swipeIntent(10, 180, 500), 'close');
    assert.equal(swipeIntent(10, -180, 500), 'stay');
  });

  it('leaves a diagonal drag alone', () => {
    assert.equal(swipeIntent(70, 100, 500), 'stay');
  });
});

describe('formatPosition', () => {
  it('pads the position to the width of the total', () => {
    assert.equal(formatPosition(5, 720), '005 / 720');
    assert.equal(formatPosition(720, 720), '720 / 720');
    assert.equal(formatPosition(1, 9), '1 / 9');
  });
});
