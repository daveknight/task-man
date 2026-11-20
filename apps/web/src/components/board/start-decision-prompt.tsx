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

function copyFor(to: Status, decision: StartDecision, today: ISODate) {
  const start = longDate(decision.startDate, today);
  const target = STATUS_LABELS[to];
  // The hide-until date is after the due date: the only way forward is to clear the start date.
  if (decision.reason === 'leaving_waiting_start_after_due') {
    return {
      title: 'Move and clear start date?',
      description: undefined,
      options: [{ answer: 'clear' as const, icon: 'clear' as const, label: 'Yes, clear start date', detail: '' }],
    };
  }
  const options: Record<Answer, Option> =
    decision.reason === 'entering_waiting_future_start'
      ? {
          keep: { answer: 'keep', icon: 'waiting', label: `Hide until ${start}`, detail: 'Tucked away under “hidden until later” until then' },
          clear: { answer: 'clear', icon: 'clear', label: "Don't hide", detail: 'Needs follow-up now' },
          set: { answer: 'set', icon: 'pickDate', label: 'Pick a hide-until date…', detail: 'May be after the due date' },
        }
      : {
          // Future hide-until date on or before the due date. This prompt's wording stays as it is.
          clear: { answer: 'clear', icon: 'clear', label: 'Clear the check-back date', detail: `Moves to ${target} now` },
          keep: { answer: 'keep', icon: 'startDate', label: `Start ${start}`, detail: 'Waits in Upcoming until then' },
          set: { answer: 'set', icon: 'pickDate', label: 'Pick a start date…', detail: decision.dueDate ? `On or before the due date, ${longDate(decision.dueDate, today)}` : 'Today or later' },
        };
  const description =
    decision.reason === 'entering_waiting_future_start'
      ? `It starts ${start}. While a task is waiting, its start date is the hide-until date.`
      : `It's set to check back ${start}. Outside Waiting, that would be its start date.`;
  const ordered = [decision.default, ...decision.options.filter((o) => o !== decision.default)].map((a) => options[a]);
  return { title: `Move to ${target}`, description, options: ordered };
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
            {o.detail ? <span className={cn('text-footnote', i === 0 ? 'text-primary-foreground' : 'text-muted-foreground')}>{o.detail}</span> : null}
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
  const { title, description, options } = copyFor(to, decision, today);
  return (
    <Surface
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description ?? task.title}
      descriptionClassName={description ? undefined : 'sr-only'}
      slot="start-decision-prompt"
    >
      <OptionList options={options} onChoose={onChoose} onCancel={() => onOpenChange(false)} touch={!wide} />
    </Surface>
  );
}
