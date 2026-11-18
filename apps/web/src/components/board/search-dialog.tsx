import { sectionFor, type ISODate, type Task } from '@app/core';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Toggle } from '@/components/ui/toggle';
import { useSearch } from '@/data/board-data';
import { dayLabel } from '@/lib/day-label';
import { cn } from '@/lib/utils';
import { SECTION_TITLES } from './board-view';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Search titles and descriptions. Completed tasks are included on request; Trash never is. */
export function SearchDialog({ open, onOpenChange, today, onOpen }: { open: boolean; onOpenChange: (open: boolean) => void; today: ISODate; onOpen: (task: Task) => void }) {
  const [query, setQuery] = useState('');
  const [completed, setCompleted] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const debounced = useDebounced(query.trim(), 200);
  const searching = debounced !== '' || flagged;
  const { data: results = [] } = useSearch(debounced, { completed, flagged }, open && searching);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search tasks by title and description" className="sm:max-w-lg">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search tasks" value={query} onValueChange={setQuery} />
        <div className="flex gap-1 px-2 pt-2">
          <Toggle size="sm" variant="outline" pressed={completed} onPressedChange={setCompleted} data-filter="completed">
            <Icon name="complete" />
            Include completed
          </Toggle>
          <Toggle size="sm" variant="outline" pressed={flagged} onPressedChange={setFlagged} data-filter="flagged">
            <Icon name="flag" active={flagged} />
            Flagged
          </Toggle>
        </div>
        <CommandList className="max-h-96">
          {searching && <CommandEmpty>No matching tasks</CommandEmpty>}
          {searching &&
            results.map((task) => (
              <CommandItem
                key={task.id}
                value={task.id}
                onSelect={() => {
                  onOpenChange(false);
                  onOpen(task);
                }}
                data-task-id={task.id}
              >
                <span className={cn('min-w-0 flex-1 truncate', task.completedAt && 'text-muted-foreground line-through')}>{task.title}</span>
                {task.flagged && <Icon name="flag" active className="text-flag!" />}
                <span className="shrink-0 text-footnote text-muted-foreground">
                  {SECTION_TITLES[sectionFor(task, today)]}
                  {task.dueDate && <> · {dayLabel(task.dueDate, today)}</>}
                </span>
              </CommandItem>
            ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
