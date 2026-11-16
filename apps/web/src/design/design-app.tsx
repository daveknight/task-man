import { placementFor, type ISODate, type Task } from '@app/core';
import { ArrowCircleRight, ArrowUUpRight, Hourglass, Play, PlayCircle, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import { BoardView, RowList, SECTION_TITLES } from '@/components/board/board-view';
import { PresetPanel } from '@/components/board/preset-panel';
import { rowActionsFor } from '@/components/board/row-actions';
import { SwipeRow, type SwipeReveal } from '@/components/board/swipe-row';
import { TaskSheet } from '@/components/board/task-sheet';
import { Toolbar } from '@/components/board/toolbar';
import { longDate } from '@/lib/day-label';
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

const RESUME_OPTIONS: { name: string; sf: string; icon: PhosphorIcon }[] = [
  { name: 'Play', sf: 'play', icon: Play },
  { name: 'PlayCircle', sf: 'play.circle', icon: PlayCircle },
  { name: 'ArrowUUpRight', sf: 'arrow.uturn.forward', icon: ArrowUUpRight },
  { name: 'ArrowCircleRight', sf: 'arrow.right.circle', icon: ArrowCircleRight },
];

/** Each Resume candidate beside Extend wait, as it would sit at the end of a follow-up row. */
function ResumeIconsScreen({ today }: { today: ISODate }) {
  return (
    <Page title="Resume icon" today={today}>
      <RowList>
        {RESUME_OPTIONS.map(({ name, sf, icon: Candidate }, i) => (
          <div key={name} className="flex min-h-row items-center gap-row-gap px-row-x py-2" data-option={name}>
            <span className="w-6 text-footnote font-semibold text-muted-foreground">{String.fromCharCode(65 + i)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-body">{name}</span>
              <span className="block text-footnote text-muted-foreground">SF Symbol: {sf}</span>
            </span>
            <span className="flex items-center gap-0.5 text-link">
              <span className="flex size-7 items-center justify-center rounded-md" title="Extend wait">
                <Hourglass className="size-4" />
              </span>
              <span className="flex size-7 items-center justify-center rounded-md bg-muted" title="Resume">
                <Candidate className="size-4" />
              </span>
            </span>
          </div>
        ))}
      </RowList>
    </Page>
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
      return <ResumeIconsScreen today={today} />;
    case 'sheet-waiting':
      return <BoardScreen seed={seed} today={today} sheetFor="Reimbursement for conference travel" />;
    default:
      return <Index />;
  }
}

