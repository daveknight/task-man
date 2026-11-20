import {
  ArrowCounterClockwise,
  BellRinging,
  CalendarBlank,
  CalendarDots,
  CaretDown,
  CaretRight,
  Check,
  Desktop,
  DotsThree,
  EyeSlash,
  Flag,
  GearSix,
  Hourglass,
  MagnifyingGlass,
  Moon,
  Play,
  PlayCircle,
  Plus,
  Repeat,
  SkipForward,
  Sparkle,
  Sun,
  SunHorizon,
  Trash,
  WifiSlash,
  X,
  XCircle,
  type IconProps as PhosphorProps,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { icons, type IconMeaning, type PhosphorName } from '@app/tokens';

const PHOSPHOR = {
  ArrowCounterClockwise,
  BellRinging,
  CalendarBlank,
  CalendarDots,
  CaretDown,
  CaretRight,
  Check,
  Desktop,
  DotsThree,
  EyeSlash,
  Flag,
  GearSix,
  Hourglass,
  MagnifyingGlass,
  Moon,
  Play,
  PlayCircle,
  Plus,
  Repeat,
  SkipForward,
  Sparkle,
  Sun,
  SunHorizon,
  Trash,
  WifiSlash,
  X,
  XCircle,
} satisfies Record<PhosphorName, PhosphorIcon>;

export interface IconProps extends PhosphorProps {
  name: IconMeaning;
  /** Selected or active states use Phosphor's Fill weight. */
  active?: boolean;
}

/** An icon by meaning, from the shared icon map in `@app/tokens`. */
export function Icon({ name, active, weight, ...props }: IconProps) {
  const Component = PHOSPHOR[icons[name].phosphor];
  return <Component aria-hidden weight={weight ?? (active ? 'fill' : 'regular')} {...props} />;
}
