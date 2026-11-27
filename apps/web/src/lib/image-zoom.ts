/**
 * Zoom for the image preview. On-screen buttons step through fixed stops.
 * A pinch scales by how far the fingers moved and can land between stops.
 * The fitted image is 1. Nothing goes past four times that, and a pan can't
 * drag the picture off the view.
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

/** Stops for the on-screen zoom controls, smallest to largest. */
export const ZOOM_STOPS = [1, 1.5, 2, 3, 4] as const;

export interface Point {
  x: number;
  y: number;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** The next on-screen stop in `direction` (1 zooms in, -1 zooms out). Stays put at an end. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const current = clampZoom(zoom);
  if (direction > 0) return ZOOM_STOPS.find((stop) => stop > current + 1e-6) ?? ZOOM_MAX;
  return [...ZOOM_STOPS].reverse().find((stop) => stop < current - 1e-6) ?? ZOOM_MIN;
}

/**
 * Zoom after a pinch. `startDistance` and `distance` are the finger spans in pixels.
 * A missing span leaves the zoom where it started. A missing start counts as fitted.
 */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  const start = clampZoom(startZoom);
  if (!(startDistance > 0) || !(distance > 0)) return start;
  return clampZoom(start * (distance / startDistance));
}

export function touchDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clampAxis(value: number, max: number): number {
  if (!Number.isFinite(value) || !(max > 0)) return 0;
  return Math.min(max, Math.max(-max, value));
}

/**
 * Pan, in pixels, after a drag. `fitted` is the image's layout size at zoom 1.
 * At the fitted size the picture stays centered.
 */
export function clampPan(pan: Point, zoom: number, fitted: { width: number; height: number }): Point {
  const z = clampZoom(zoom);
  const width = Number.isFinite(fitted.width) ? Math.max(0, fitted.width) : 0;
  const height = Number.isFinite(fitted.height) ? Math.max(0, fitted.height) : 0;
  return {
    x: clampAxis(pan.x, (width * (z - 1)) / 2),
    y: clampAxis(pan.y, (height * (z - 1)) / 2),
  };
}
