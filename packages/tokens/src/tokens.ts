/** A color for each appearance. Hex `#RRGGBB`. */
export interface ColorPair {
  light: string;
  dark: string;
}

export type Scheme = keyof ColorPair;

/**
 * Apple system colors (iOS and macOS, default contrast). Every role below uses these exact
 * values, so the web app matches the native apps (Dave's Phase 1a sign-off).
 */
export const apple = {
  blue: { light: '#007AFF', dark: '#0A84FF' },
  orange: { light: '#FF9500', dark: '#FF9F0A' },
  red: { light: '#FF3B30', dark: '#FF453A' },
  green: { light: '#34C759', dark: '#30D158' },
  label: { light: '#000000', dark: '#FFFFFF' },
  gray: { light: '#8E8E93', dark: '#8E8E93' },
  gray4: { light: '#D1D1D6', dark: '#3A3A3C' },
  gray5: { light: '#E5E5EA', dark: '#2C2C2E' },
  gray6: { light: '#F2F2F7', dark: '#1C1C1E' },
  groupedBackground: { light: '#F2F2F7', dark: '#000000' },
  secondaryGroupedBackground: { light: '#FFFFFF', dark: '#1C1C1E' },
  tertiaryGroupedBackground: { light: '#F2F2F7', dark: '#2C2C2E' },
  separator: { light: '#C6C6C8', dark: '#38383A' },
} as const satisfies Record<string, ColorPair>;

const white: ColorPair = { light: '#FFFFFF', dark: '#FFFFFF' };

/** Semantic colors. Names follow shadcn/ui's CSS variables, plus the app's own roles. */
export const colors = {
  background: apple.groupedBackground,
  foreground: apple.label,
  card: apple.secondaryGroupedBackground,
  /**
   * A card under the pointer, such as a collapsed section header. Not an Apple color: light is halfway
   * from the card to the page, so it stays distinct from both; dark is halfway from the card to gray5.
   */
  'card-hover': { light: '#F9F9FB', dark: '#242426' },
  'card-foreground': apple.label,
  popover: { light: '#FFFFFF', dark: '#2C2C2E' },
  'popover-foreground': apple.label,
  primary: apple.blue,
  'primary-foreground': white,
  secondary: apple.gray5,
  'secondary-foreground': apple.label,
  muted: apple.tertiaryGroupedBackground,
  'muted-foreground': apple.gray,
  accent: { light: '#E5E5EA', dark: '#3A3A3C' },
  'accent-foreground': apple.label,
  destructive: apple.red,
  border: apple.separator,
  input: { light: '#C6C6C8', dark: '#48484A' },
  ring: apple.blue,
  link: apple.blue,
  sidebar: { light: '#F2F2F7', dark: '#1C1C1E' },
  'sidebar-foreground': apple.label,
  'sidebar-primary': apple.blue,
  'sidebar-primary-foreground': white,
  'sidebar-accent': { light: '#E5E5EA', dark: '#2C2C2E' },
  'sidebar-accent-foreground': apple.label,
  'sidebar-border': apple.separator,
  'sidebar-ring': apple.blue,

  /** The flag icon. Icon only, so the exact Apple orange. */
  flag: apple.orange,
  /** Overdue due-date text. */
  overdue: apple.red,
  'section-header': { light: '#3C3C43', dark: '#EBEBF5' },
  /** Round checkbox ring when unchecked. */
  checkbox: { light: '#C7C7CC', dark: '#636366' },
  'swipe-foreground': white,
  'swipe-date': apple.orange,
  'swipe-state': apple.blue,
  'swipe-delete': apple.red,
  'swipe-flag': apple.orange,
  /** The offline banner: Apple orange at 20% on white (light) and 25% on black (dark). */
  notice: { light: '#FFEACC', dark: '#402803' },
  'notice-foreground': apple.label,
} as const satisfies Record<string, ColorPair>;

export type ColorRole = keyof typeof colors;

/**
 * Text drawn on a background, checked at 4.5:1 in both appearances by the tests.
 * Add a pair whenever a screen puts one role's text on another role's fill.
 */
export const textPairs: readonly [text: ColorRole, on: ColorRole][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'accent'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['section-header', 'background'],
  ['section-header', 'card'],
  ['section-header', 'card-hover'],
  ['section-header', 'accent'],
  ['sidebar-foreground', 'sidebar'],
  ['notice-foreground', 'notice'],
];

/**
 * Pairs that stay below 4.5:1 because they use Apple's exact system colors, as the native apps do.
 * Dave chose exact Apple colors over text-safe variants. The tests fail if a pair here starts
 * passing (so the list stays honest) or drops below `exactAppleFloor`.
 */
export const exactApplePairs: readonly [text: ColorRole, on: ColorRole][] = [
  ['muted-foreground', 'card'],
  ['muted-foreground', 'card-hover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['destructive', 'card'],
  ['destructive', 'popover'],
  ['link', 'card'],
  ['link', 'popover'],
  ['overdue', 'card'],
  ['swipe-foreground', 'swipe-date'],
  ['swipe-foreground', 'swipe-state'],
  ['swipe-foreground', 'swipe-delete'],
  ['swipe-foreground', 'swipe-flag'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
];

/** The lowest contrast an exact-Apple pair may have (white icons on Apple orange). */
export const exactAppleFloor = 2;

/** Roles the native apps take from these tokens (Phase 4); everything else uses system colors there. */
export const nativeRoles: readonly ColorRole[] = [
  'flag',
  'overdue',
  'swipe-date',
  'swipe-state',
  'swipe-delete',
  'swipe-flag',
];

/** A value for mouse and trackpad (`pointer: fine`) and one for touch screens (`pointer: coarse`). */
export interface Density {
  fine: number;
  coarse: number;
}

export const font = {
  sans: '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;

/** Type scale in px: size and line height. Names follow Apple's text styles. */
export const text = {
  caption: { size: { fine: 11, coarse: 12 }, lineHeight: { fine: 13, coarse: 16 } },
  footnote: { size: { fine: 12, coarse: 13 }, lineHeight: { fine: 16, coarse: 18 } },
  subhead: { size: { fine: 13, coarse: 15 }, lineHeight: { fine: 18, coarse: 20 } },
  body: { size: { fine: 14, coarse: 17 }, lineHeight: { fine: 20, coarse: 22 } },
  headline: { size: { fine: 15, coarse: 17 }, lineHeight: { fine: 20, coarse: 22 } },
  title: { size: { fine: 20, coarse: 22 }, lineHeight: { fine: 26, coarse: 28 } },
  'large-title': { size: { fine: 26, coarse: 34 }, lineHeight: { fine: 32, coarse: 41 } },
} as const satisfies Record<string, { size: Density; lineHeight: Density }>;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/** Heights in px. Touch targets stay at 44 or more. */
export const size = {
  row: { fine: 38, coarse: 46 },
  /** A subtask row inside the task sheet's Subtasks card. */
  subtask: { fine: 34, coarse: 46 },
  'section-header': { fine: 32, coarse: 44 },
  toolbar: { fine: 48, coarse: 52 },
  control: { fine: 28, coarse: 44 },
  checkbox: { fine: 18, coarse: 22 },
  /** The drag handle's column, left of the checkbox. */
  handle: { fine: 18, coarse: 24 },
  icon: { fine: 16, coarse: 18 },
  /** Icon buttons revealed by a swipe, inside the row. */
  'swipe-button': { fine: 30, coarse: 36 },
} as const satisfies Record<string, Density>;

/** Spacing in px. `unit` drives Tailwind's numeric scale (p-2 = 2 units). */
export const space = {
  unit: { fine: 4, coarse: 4 },
  'row-x': { fine: 12, coarse: 16 },
  'row-gap': { fine: 10, coarse: 12 },
  'section-gap': { fine: 20, coarse: 28 },
  /** Where an inset separator starts: row padding, checkbox and gap. */
  'separator-inset': { fine: 40, coarse: 50 },
  /** Where a task row's separator starts: handle column, gap, checkbox and gap. */
  'task-separator-inset': { fine: 56, coarse: 70 },
} as const satisfies Record<string, Density>;

/** Corner radii in px. */
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
} as const;

export const tokens = { colors, font, text, fontWeight, size, space, radius } as const;
export type Tokens = typeof tokens;
