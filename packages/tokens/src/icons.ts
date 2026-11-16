/**
 * One icon per meaning on every platform. Web uses Phosphor (Regular weight,
 * Fill for selected or active states); native uses SF Symbols.
 */
export interface IconSpec {
  phosphor: string;
  sfSymbol: string;
  /** SF Symbol for the active state; on the web the same Phosphor icon switches to Fill. */
  sfSymbolActive?: string;
}

export const icons = {
  dueDate: { phosphor: 'CalendarBlank', sfSymbol: 'calendar' },
  waiting: { phosphor: 'Hourglass', sfSymbol: 'hourglass' },
  startDate: { phosphor: 'SunHorizon', sfSymbol: 'sunrise' },
  inProgress: { phosphor: 'Play', sfSymbol: 'play' },
  flag: { phosphor: 'Flag', sfSymbol: 'flag', sfSymbolActive: 'flag.fill' },
  repeat: { phosphor: 'Repeat', sfSymbol: 'repeat' },
  trash: { phosphor: 'Trash', sfSymbol: 'trash' },
  capture: { phosphor: 'Sparkle', sfSymbol: 'sparkles' },
  complete: { phosphor: 'Check', sfSymbol: 'checkmark' },
  followUp: { phosphor: 'BellRinging', sfSymbol: 'bell.badge' },
  pickDate: { phosphor: 'CalendarDots', sfSymbol: 'calendar.badge.plus' },
  clear: { phosphor: 'XCircle', sfSymbol: 'xmark.circle' },
  skip: { phosphor: 'SkipForward', sfSymbol: 'forward.end' },
  restore: { phosphor: 'ArrowCounterClockwise', sfSymbol: 'arrow.uturn.backward' },
  add: { phosphor: 'Plus', sfSymbol: 'plus' },
  search: { phosphor: 'MagnifyingGlass', sfSymbol: 'magnifyingglass' },
  more: { phosphor: 'DotsThree', sfSymbol: 'ellipsis' },
  settings: { phosphor: 'GearSix', sfSymbol: 'gearshape' },
  appearanceSystem: { phosphor: 'Desktop', sfSymbol: 'circle.lefthalf.filled' },
  appearanceLight: { phosphor: 'Sun', sfSymbol: 'sun.max' },
  appearanceDark: { phosphor: 'Moon', sfSymbol: 'moon' },
  expand: { phosphor: 'CaretRight', sfSymbol: 'chevron.right' },
  collapse: { phosphor: 'CaretDown', sfSymbol: 'chevron.down' },
  close: { phosphor: 'X', sfSymbol: 'xmark' },
} as const satisfies Record<string, IconSpec>;

export type IconMeaning = keyof typeof icons;
export type PhosphorName = (typeof icons)[IconMeaning]['phosphor'];
