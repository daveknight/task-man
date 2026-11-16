import { placementFor, type ISODate, type Task } from '@app/core';
import {
  ArrowBendUpLeft,
  ArrowUUpRight,
  Hourglass,
  Lightning,
  LockOpen,
  Play,
  PlayCircle,
  Tray,
  TrayArrowDown,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import { BoardView, RowList, SECTION_TITLES } from '@/components/board/board-view';
import { PresetPanel } from '@/components/board/preset-panel';
import { rowActionsFor } from '@/components/board/row-actions';
import { SwipeRow, type SwipeReveal } from '@/components/board/swipe-row';
import { TaskSheet } from '@/components/board/task-sheet';
import { Toolbar } from '@/components/board/toolbar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { longDate } from '@/lib/day-label';
import { cn } from '@/lib/utils';
import { designToday, seedBoard, type SeedBoard } from './seed-board';

export const DESIGN_SCREENS = {
  board: 'Board: Upcoming and "waiting until later" collapsed',
  'board-expanded': 'Board with Upcoming and "waiting until later" expanded',
  menu: 'Board menu with the Appearance setting',
  hover: 'Desktop hover buttons on a row',
  'context-menu': 'Right-click menu with due-date presets',
  actions: 'Swipe buttons and quick-pick presets for every state',
  sheet: 'Task sheet (side sheet on desktop, bottom sheet on phones)',
  'sheet-waiting': 'Task sheet for a Waiting task that needs follow-up',
  'resume-icons': 'Resume icon options',
} as const;

export type DesignScreen = keyof typeof DESIGN_SCREENS;

function Page({ title, today, menuOpen, children }: { title: string; today: ISODate; menuOpen?: boolean; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-row-x pb-[max(2rem,env(safe-area-inset-bottom))]" data-design-today={today}>
      <Toolbar title={title} subtitle={longDate(today, today)} menuOpen={menuOpen} />
      <div className="pt-2">{children}</div>
    </main>
  );
}

function BoardScreen({ seed, today, expanded, menuOpen, sheetFor }: { seed: SeedBoard; today: ISODate; expanded?: boolean; menuOpen?: boolean; sheetFor?: string }) {
  const [sheetTask, setSheetTask] = useState<Task | null>(sheetFor ? seed.byTitle(sheetFor) : null);
  const [open, setOpen] = useState(!!sheetFor);
  return (
    <Page title="Tasks" today={today} menuOpen={menuOpen}>
      <BoardView
        board={seed.board}
        today={today}
        expanded={expanded ? { upcoming: true, waiting_later: true } : undefined}
        actionContext={(task) => ({ recurring: seed.recurring(task) })}
        onOpenTask={(task) => {
          setSheetTask(task);
          setOpen(true);
        }}
      />
      <TaskSheet task={sheetTask} today={today} open={open} onOpenChange={setOpen} />
    </Page>
  );
}

const PLACEMENT_TITLES = { ...SECTION_TITLES, waiting: 'Waiting, needs follow-up', waiting_later: 'Waiting until later' } as const;

function ActionCase({ seed, task, today, note }: { seed: SeedBoard; task: Task; today: ISODate; note?: string }) {
  const context = { recurring: seed.recurring(task) };
  const actions = rowActionsFor(task, today, context);
  const groups = [actions.date, ...actions.state].filter((g) => g && g.presets.length > 0);
  return (
    <section className="flex flex-col gap-2" data-case={actions.placement}>
      <h2 className="px-row-x text-subhead font-semibold text-section-header">
        {PLACEMENT_TITLES[placementFor(task, today)]}
        {note && <span className="font-normal text-muted-foreground"> · {note}</span>}
      </h2>
      <RowList>
        <SwipeRow task={task} today={today} context={context} reveal="left" />
      </RowList>
      {groups.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((g) => (
            <PresetPanel key={g!.title} group={g!} className="rounded-lg bg-popover p-2.5 shadow-md ring-1 ring-foreground/10" />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionsScreen({ seed, today }: { seed: SeedBoard; today: ISODate }) {
  const swipes: { reveal: SwipeReveal; title: string; task: Task }[] = [
    { reveal: 'right', title: 'Swipe right: Flag', task: seed.byTitle('Return library books') },
  ];
  return (
    <Page title="Row actions" today={today}>
      <div className="flex flex-col gap-section-gap">
        {swipes.map((s) => (
          <section key={s.reveal} className="flex flex-col gap-2">
            <h2 className="px-row-x text-subhead font-semibold text-section-header">{s.title}</h2>
            <RowList>
              <SwipeRow task={s.task} today={today} reveal={s.reveal} />
            </RowList>
          </section>
        ))}
        <ActionCase seed={seed} today={today} task={seed.byTitle('Finance quarterly action items')} note="overdue and repeating" />
        <ActionCase seed={seed} today={today} task={seed.byTitle('Twitter litigation claim')} />
        <ActionCase seed={seed} today={today} task={seed.byTitle('Reimbursement for conference travel')} />
        <ActionCase seed={seed} today={today} task={seed.byTitle('Warranty replacement for headphones')} />
        <ActionCase seed={seed} today={today} task={seed.byTitle('Winterize the sprinkler system')} note="due Dec 2, so Next month is hidden" />
        <ActionCase seed={seed} today={today} task={seed.byTitle('Pay November credit card bill')} />
        <ActionCase seed={seed} today={today} task={seed.byTitle('Look into standing desk')} />
      </div>
    </Page>
  );
}

interface ResumeOption {
  letter: string;
  phosphor: string;
  sf: string;
  icon: PhosphorIcon;
}

/** Grouped by metaphor; the letters match the sign-off doc. */
const RESUME_GROUPS: { metaphor: string; options: ResumeOption[] }[] = [
  {
    metaphor: 'Resume / play',
    options: [
      { letter: 'A', phosphor: 'Play', sf: 'play', icon: Play },
      { letter: 'B', phosphor: 'PlayCircle', sf: 'play.circle', icon: PlayCircle },
    ],
  },
  {
    metaphor: 'Activate / unblock',
    options: [
      { letter: 'C', phosphor: 'Lightning', sf: 'bolt', icon: Lightning },
      { letter: 'D', phosphor: 'LockOpen', sf: 'lock.open', icon: LockOpen },
    ],
  },
  {
    metaphor: 'Move back / return',
    options: [
      { letter: 'E', phosphor: 'ArrowUUpRight', sf: 'arrow.uturn.forward', icon: ArrowUUpRight },
      { letter: 'F', phosphor: 'ArrowBendUpLeft', sf: 'arrow.turn.up.left', icon: ArrowBendUpLeft },
    ],
  },
  {
    metaphor: 'Inbox / tray',
    options: [
      { letter: 'G', phosphor: 'Tray', sf: 'tray', icon: Tray },
      { letter: 'H', phosphor: 'TrayArrowDown', sf: 'tray.and.arrow.down', icon: TrayArrowDown },
    ],
  },
];

function ResumePanel({ dark }: { dark?: boolean }) {
  return (
    <section className={cn('flex-1 rounded-xl bg-background p-3 text-foreground', dark && 'dark')} data-theme={dark ? 'dark' : 'light'}>
      <h2 className="px-row-x pb-1 text-footnote font-semibold text-muted-foreground">{dark ? 'Dark' : 'Light'}</h2>
      {RESUME_GROUPS.map(({ metaphor, options }) => (
        <div key={metaphor} className="pt-2">
          <h3 className="px-row-x pb-1 text-footnote font-semibold text-section-header">{metaphor}</h3>
          <RowList>
            {options.map(({ letter, phosphor, sf, icon: Candidate }) => (
              <div key={letter} className="flex min-h-row items-center gap-row-gap bg-card px-row-x" data-option={letter}>
                <Checkbox aria-label="Complete" />
                <span className="min-w-0 flex-1 truncate text-body">Plumber quote for kitchen sink</span>
                <span className="shrink-0 text-footnote text-muted-foreground">
                  <span className="font-semibold">{letter}</span> {phosphor} · {sf}
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-link">
                  <Button variant="ghost" size="icon-sm" aria-label="Extend wait" className="text-link">
                    <Hourglass />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Option ${letter}`} className="bg-muted text-link">
                    <Candidate />
                  </Button>
                </span>
              </div>
            ))}
          </RowList>
        </div>
      ))}
    </section>
  );
}

/** Every Resume candidate at row size beside Extend wait, light and dark side by side. */
function ResumeIconsScreen() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-3 bg-background px-row-x py-4">
      <h1 className="text-title font-bold">Resume icon options</h1>
      <div className="flex gap-4">
        <ResumePanel />
        <ResumePanel dark />
      </div>
    </main>
  );
}

function Index() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-large-title font-bold">Phase 1a design screens</h1>
      <p className="text-muted-foreground">Static screens from seed/tasks.json at a pinned day. Nothing here saves.</p>
      <RowList>
        {(Object.keys(DESIGN_SCREENS) as DesignScreen[]).map((key) => (
          <a key={key} href={`/design/${key}`} className="flex min-h-row items-center px-row-x text-link hover:bg-muted">
            {DESIGN_SCREENS[key]}
          </a>
        ))}
      </RowList>
    </main>
  );
}

export function DesignApp({ screen }: { screen: string }) {
  const today = useMemo(designToday, []);
  const seed = useMemo(() => seedBoard(today), [today]);
  switch (screen) {
    case 'board':
    case 'hover':
    case 'context-menu':
      return <BoardScreen seed={seed} today={today} />;
    case 'board-expanded':
      return <BoardScreen seed={seed} today={today} expanded />;
    case 'menu':
      return <BoardScreen seed={seed} today={today} menuOpen />;
    case 'actions':
      return <ActionsScreen seed={seed} today={today} />;
    case 'sheet':
      return <BoardScreen seed={seed} today={today} sheetFor="Twitter litigation claim" />;
    case 'resume-icons':
      return <ResumeIconsScreen />;
    case 'sheet-waiting':
      return <BoardScreen seed={seed} today={today} sheetFor="Reimbursement for conference travel" />;
    default:
      return <Index />;
  }
}

