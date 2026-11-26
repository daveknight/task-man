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
  hideUntil: { phosphor: 'EyeSlash', sfSymbol: 'eye.slash' },
  startDate: { phosphor: 'SunHorizon', sfSymbol: 'sunrise' },
  inProgress: { phosphor: 'Play', sfSymbol: 'play' },
  resume: { phosphor: 'PlayCircle', sfSymbol: 'play.circle' },
  flag: { phosphor: 'Flag', sfSymbol: 'flag', sfSymbolActive: 'flag.fill' },
  repeat: { phosphor: 'ArrowClockwise', sfSymbol: 'arrow.clockwise' },
  history: { phosphor: 'ClockCounterClockwise', sfSymbol: 'clock.arrow.counterclockwise' },
  subtasks: { phosphor: 'ListChecks', sfSymbol: 'checklist' },
  tags: { phosphor: 'Tag', sfSymbol: 'tag' },
  trash: { phosphor: 'Trash', sfSymbol: 'trash' },
  capture: { phosphor: 'Sparkle', sfSymbol: 'sparkles' },
  dictate: { phosphor: 'Microphone', sfSymbol: 'mic', sfSymbolActive: 'mic.fill' },
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
  camera: { phosphor: 'Camera', sfSymbol: 'camera' },
  photo: { phosphor: 'Image', sfSymbol: 'photo' },
  file: { phosphor: 'File', sfSymbol: 'doc' },
  appearanceSystem: { phosphor: 'Desktop', sfSymbol: 'circle.lefthalf.filled' },
  appearanceLight: { phosphor: 'Sun', sfSymbol: 'sun.max' },
  appearanceDark: { phosphor: 'Moon', sfSymbol: 'moon' },
  expand: { phosphor: 'CaretRight', sfSymbol: 'chevron.right' },
  collapse: { phosphor: 'CaretDown', sfSymbol: 'chevron.down' },
  reorder: { phosphor: 'DotsSixVertical', sfSymbol: 'line.3.horizontal' },
  close: { phosphor: 'X', sfSymbol: 'xmark' },
  offline: { phosphor: 'WifiSlash', sfSymbol: 'wifi.slash' },
  signOut: { phosphor: 'SignOut', sfSymbol: 'rectangle.portrait.and.arrow.right' },
} as const satisfies Record<string, IconSpec>;

export type IconMeaning = keyof typeof icons;
export type PhosphorName = (typeof icons)[IconMeaning]['phosphor'];
