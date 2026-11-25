/**
 * Where the phone capture sheet sits, in layout-viewport pixels, while the keyboard is open.
 * iOS leaves `dvh` at the full layout height and pans `visualViewport`, so a bottom-fixed
 * 85dvh sheet slides under the status bar. Returns null when the visible viewport already
 * matches the layout viewport and the CSS safe-area cap is enough.
 */
export function captureSheetFrame(layout: number, visible: number, offsetTop: number, safeTop: number): { top: number; height: number } | null {
  const visibleBottom = offsetTop + visible;
  if (offsetTop <= 1 && visibleBottom >= layout - 1) return null;
  const available = Math.max(0, visible - safeTop);
  const preferred = Math.min(layout * 0.85, available);
  const top = Math.max(offsetTop + safeTop, visibleBottom - preferred);
  return { top: Math.round(top), height: Math.round(Math.max(0, visibleBottom - top)) };
}
