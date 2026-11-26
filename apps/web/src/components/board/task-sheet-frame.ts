/** A phone task sheet taller than this fraction of the screen opens as a full-screen modal. */
export const SHEET_FILL_RATIO = 0.75;

/**
 * Whether a bottom sheet should fill the screen. `contentHeight` is the sheet's
 * natural height, including its grabber. Exactly 75% stays a bottom sheet.
 */
export function sheetFillsScreen(contentHeight: number, viewportHeight: number): boolean {
  if (!(viewportHeight > 0) || !(contentHeight > 0)) return false;
  return contentHeight > viewportHeight * SHEET_FILL_RATIO;
}
