import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ZOOM_MAX, ZOOM_MIN, clampPan, clampZoom, pinchZoom, stepZoom, touchDistance } from './image-zoom.ts';

describe('image preview zoom', () => {
  it('keeps a zoom between the fitted size and four times that', () => {
    assert.equal(clampZoom(1), 1);
    assert.equal(clampZoom(2.5), 2.5);
    assert.equal(clampZoom(0.2), ZOOM_MIN);
    assert.equal(clampZoom(9), ZOOM_MAX);
    assert.equal(clampZoom(Number.NaN), ZOOM_MIN);
  });

  it('steps through the on-screen stops and stays put at each end', () => {
    assert.equal(stepZoom(1, 1), 1.5);
    assert.equal(stepZoom(1.5, 1), 2);
    assert.equal(stepZoom(2, 1), 3);
    assert.equal(stepZoom(3, 1), 4);
    assert.equal(stepZoom(4, 1), 4);
    assert.equal(stepZoom(4, -1), 3);
    assert.equal(stepZoom(1, -1), 1);
    assert.equal(stepZoom(2.2, 1), 3);
    assert.equal(stepZoom(2.2, -1), 2);
  });

  it('scales a pinch by how far the fingers moved, and never past the ends', () => {
    assert.equal(pinchZoom(1, 100, 200), 2);
    assert.equal(pinchZoom(2, 100, 50), 1);
    assert.equal(pinchZoom(3, 100, 200), ZOOM_MAX);
    assert.equal(pinchZoom(1, 100, 40), ZOOM_MIN);
    assert.equal(pinchZoom(2, 0, 50), 2);
    assert.equal(pinchZoom(Number.NaN, 100, 150), 1.5);
  });

  it('measures the distance between two fingers', () => {
    assert.equal(touchDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });

  it('keeps a zoomed image from being dragged off the view, and centers it when it fits', () => {
    assert.deepEqual(clampPan({ x: 80, y: -80 }, 1, { width: 200, height: 100 }), { x: 0, y: 0 });
    assert.deepEqual(clampPan({ x: 40, y: 10 }, 2, { width: 200, height: 100 }), { x: 40, y: 10 });
    assert.deepEqual(clampPan({ x: 500, y: -500 }, 2, { width: 200, height: 100 }), { x: 100, y: -50 });
    assert.deepEqual(clampPan({ x: 10, y: 10 }, Number.NaN, { width: 200, height: 100 }), { x: 0, y: 0 });
  });
});
