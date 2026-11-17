import type { ISODate, StartDecision, Status, Task } from '@app/core';
import type { IconMeaning } from '@app/tokens';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { longDate } from '@/lib/day-label';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { Surface, WIDE_QUERY } from './surface';

export const STATUS_LABELS: Record<Status, string> = { open: 'Ready', in_progress: 'In Progress', waiting: 'Waiting' };

export type Answer = StartDecision['options'][number];

interface Option {
  answer: Answer;
  icon: IconMeaning;
  label: string;
  detail: string;
}

function copyFor(task: Task, to: Status, decision: StartDecision, today: ISODate) {
  const start = longDate(decision.startDate, today);
  const target = STATUS_LABELS[to];
  const options: Record<Answer, Option> =
    decision.reason === 'entering_waiting_future_start'
      ? {
          keep: { answer: 'keep', icon: 'waiting', label: `Check back ${start}`, detail: 'Tucked away under “waiting until later” until then' },
          clear: { answer: 'clear', icon: 'clear', label: 'No check-back date', detail: 'Needs follow-up now' },
          set: { answer: 'set', icon: 'pickDate', label: 'Pick a check-back date…', detail: 'May be after the due date' },
        }
      : {
          clear: { answer: 'clear', icon: 'clear', label: 'Clear the check-back date', detail: `Moves to ${target} now` },
          keep: { answer: 'keep', icon: 'startDate', label: `Start ${start}`, detail: 'Waits in Upcoming until then' },
          set: { answer: 'set', icon: 'pickDate', label: 'Pick a start date…', detail: decision.dueDate ? `On or before the due date, ${longDate(decision.dueDate, today)}` : 'Today or later' },
        };
  const description =
    decision.reason === 'entering_waiting_future_start'
      ? `It starts ${start}. While a task is waiting, its start date is the check-back date.`
      : decision.reason === 'leaving_waiting_start_after_due'
        ? `It's set to check back ${start}, after its due date (${longDate(decision.dueDate!, today)}). Outside Waiting, the start date can't be after the due date.`
        : `It's set to check back ${start}. Outside Waiting, that would be its start date.`;
  const ordered = [decision.default, ...decision.options.filter((o) => o !== decision.default)].map((a) => options[a]);
  return { title: `Move “${task.title}” to ${target}?`, description, options: ordered };
}

function OptionList({ options, onChoose, onCancel, touch }: { options: Option[]; onChoose?: (a: Answer) => void; onCancel: () => void; touch?: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-slot="start-decision-options">
      {options.map((o, i) => (
        <Button
          key={o.answer}
          variant={i === 0 ? 'default' : 'outline'}
          className={cn('h-auto justify-start gap-3 px-3 py-2 text-left whitespace-normal', touch && 'min-h-control py-3')}
          data-default={i === 0 || undefined}
          data-answer={o.answer}
          onClick={() => onChoose?.(o.answer)}
        >
          <Icon name={o.icon} className="size-icon shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="text-body font-medium">{o.label}</span>
            <span className={cn('text-footnote', i === 0 ? 'text-primary-foreground' : 'text-muted-foreground')}>{o.detail}</span>
          </span>
        </Button>
      ))}
      <Button variant="ghost" className={cn(touch && 'min-h-control')} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * Asks what happens to the start date when a status change makes it ambiguous (core `changeStatus`
 * returned a decision). The policy's default answer comes first and is highlighted.
 */
export function StartDecisionPrompt({
  task,
  to,
  decision,
  today,
  open,
  onOpenChange,
  onChoose,
}: {
  task: Task;
  to: Status;
  decision: StartDecision;
  today: ISODate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose?: (answer: Answer) => void;
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  const { title, description, options } = copyFor(task, to, decision, today);
  return (
    <Surface open={open} onOpenChange={onOpenChange} title={title} description={description} slot="start-decision-prompt">
      <OptionList options={options} onChoose={onChoose} onCancel={() => onOpenChange(false)} touch={!wide} />
    </Surface>
  );
}
