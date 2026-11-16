/** A color for each appearance. Hex `#RRGGBB`. */
export interface ColorPair {
  light: string;
  dark: string;
}

export type Scheme = keyof ColorPair;

/**
 * Apple system colors (iOS and macOS, default contrast) and the increased-contrast
 * variants Apple ships for accessibility. Roles below pick from these where they can.
 */
export const apple = {
  blue: { light: '#007AFF', dark: '#0A84FF' },
  blueHighContrast: { light: '#0040DD', dark: '#409CFF' },
  orange: { light: '#FF9500', dark: '#FF9F0A' },
  orangeHighContrast: { light: '#C93400', dark: '#FFB340' },
  red: { light: '#FF3B30', dark: '#FF453A' },
  redHighContrast: { light: '#D70015', dark: '#FF6961' },
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

/**
 * Web-only values where an Apple color would put text below 4.5:1.
 * Each is the closest Apple-adjacent value that passes (apple.com's own blues among them).
 */
export const textSafe = {
  secondaryLabel: { light: '#6E6E73', dark: '#98989D' },
  buttonBlue: { light: '#0071E3', dark: '#0071E3' },
  linkBlue: { light: '#0066CC', dark: '#409CFF' },
  swipeOrange: { light: '#C93400', dark: '#B25000' },
  swipeBlue: { light: '#0066CC', dark: '#0064D2' },
  swipeRed: { light: '#D70015', dark: '#D9302A' },
  swipeGreen: { light: '#208338', dark: '#208338' },
} as const satisfies Record<string, ColorPair>;

const white: ColorPair = { light: '#FFFFFF', dark: '#FFFFFF' };

/** Semantic colors. Names follow shadcn/ui's CSS variables, plus the app's own roles. */
export const colors = {
  background: apple.groupedBackground,
  foreground: apple.label,
  card: apple.secondaryGroupedBackground,
  'card-foreground': apple.label,
  popover: { light: '#FFFFFF', dark: '#2C2C2E' },
  'popover-foreground': apple.label,
  primary: textSafe.buttonBlue,
  'primary-foreground': white,
  secondary: apple.gray5,
  'secondary-foreground': apple.label,
  muted: apple.tertiaryGroupedBackground,
  'muted-foreground': textSafe.secondaryLabel,
  accent: { light: '#E5E5EA', dark: '#3A3A3C' },
  'accent-foreground': apple.label,
  destructive: apple.redHighContrast,
  border: apple.separator,
  input: { light: '#C6C6C8', dark: '#48484A' },
  ring: apple.blue,
  link: textSafe.linkBlue,
  sidebar: { light: '#F2F2F7', dark: '#1C1C1E' },
  'sidebar-foreground': apple.label,
  'sidebar-primary': textSafe.buttonBlue,
  'sidebar-primary-foreground': white,
  'sidebar-accent': { light: '#E5E5EA', dark: '#2C2C2E' },
  'sidebar-accent-foreground': apple.label,
  'sidebar-border': apple.separator,
  'sidebar-ring': apple.blue,

  /** The flag icon. Icon only, so the exact Apple orange. */
  flag: apple.orange,
  /** Overdue due-date text. */
  overdue: { light: apple.redHighContrast.light, dark: apple.red.dark },
  /** The Waiting "Follow up" badge text and icon, on `follow-up-muted`. */
  'follow-up': { light: apple.orangeHighContrast.light, dark: apple.orange.dark },
  'follow-up-muted': { light: '#FFF4E5', dark: '#3A2A12' },
  'section-header': { light: '#3C3C43', dark: '#EBEBF5' },
  /** Round checkbox ring when unchecked. */
  checkbox: { light: '#C7C7CC', dark: '#636366' },
  'swipe-foreground': white,
  'swipe-date': textSafe.swipeOrange,
  'swipe-state': textSafe.swipeBlue,
  'swipe-delete': textSafe.swipeRed,
  'swipe-flag': textSafe.swipeOrange,
  'swipe-complete': textSafe.swipeGreen,
} as const satisfies Record<string, ColorPair>;

export type ColorRole = keyof typeof colors;

/**
 * Text drawn on a background, checked at 4.5:1 in both appearances by the tests.
 * Add a pair whenever a screen puts one role's text on another role's fill.
 */
export const textPairs: readonly [text: ColorRole, on: ColorRole][] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive', 'card'],
  ['destructive', 'popover'],
  ['link', 'card'],
  ['link', 'popover'],
  ['overdue', 'card'],
  ['follow-up', 'follow-up-muted'],
  ['section-header', 'background'],
  ['swipe-foreground', 'swipe-date'],
  ['swipe-foreground', 'swipe-state'],
  ['swipe-foreground', 'swipe-delete'],
  ['swipe-foreground', 'swipe-flag'],
  ['swipe-foreground', 'swipe-complete'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
];

/** Roles the native apps take from these tokens (Phase 3); everything else uses system colors there. */
export const nativeRoles: readonly ColorRole[] = [
  'flag',
  'overdue',
  'follow-up',
  'follow-up-muted',
  'swipe-date',
  'swipe-state',
  'swipe-delete',
  'swipe-flag',
  'swipe-complete',
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
  row: { fine: 36, coarse: 44 },
  'section-header': { fine: 32, coarse: 44 },
  toolbar: { fine: 48, coarse: 52 },
  control: { fine: 28, coarse: 44 },
  checkbox: { fine: 18, coarse: 22 },
  icon: { fine: 16, coarse: 18 },
  'swipe-button': { fine: 72, coarse: 76 },
} as const satisfies Record<string, Density>;

/** Spacing in px. `unit` drives Tailwind's numeric scale (p-2 = 2 units). */
export const space = {
  unit: { fine: 4, coarse: 4 },
  'row-x': { fine: 12, coarse: 16 },
  'row-gap': { fine: 10, coarse: 12 },
  'section-gap': { fine: 20, coarse: 28 },
  /** Where an inset separator starts: row padding, checkbox and gap. */
  'separator-inset': { fine: 40, coarse: 50 },
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
