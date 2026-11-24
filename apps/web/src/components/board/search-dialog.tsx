import { sectionFor, sortTags, tagCounts, type ISODate, type Tag, type Task } from '@app/core';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Toggle } from '@/components/ui/toggle';
import { useSearch, useSnapshot } from '@/data/board-data';
import { dayLabel } from '@/lib/day-label';
import { cn } from '@/lib/utils';
import { SECTION_TITLES } from './board-view';
import { TagChips } from './tag-chip';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Bolds every case-insensitive occurrence of `query` in `text`. */
function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) => (i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : part));
}

/** The Tags filter: a menu of every tag with how many tasks have it. Tags already picked show as chips beside it. */
function TagsFilter({ tags, counts, selected, onToggle }: { tags: Tag[]; counts: Map<string, number>; selected: Set<string>; onToggle: (id: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            data-filter="tags"
            className="h-8 shrink-0 gap-1.5 aria-expanded:bg-primary aria-expanded:text-primary-foreground dark:aria-expanded:bg-primary"
          />
        }
      >
        <Icon name="tags" data-icon="inline-start" />
        Tags
        <Icon name="collapse" data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" data-slot="tags-menu">
        {tags.length === 0 ? (
          <p className="px-2 py-1.5 text-footnote text-muted-foreground">No tags yet</p>
        ) : (
          tags.map((tag) => (
            <DropdownMenuCheckboxItem
              key={tag.id}
              checked={selected.has(tag.id)}
              closeOnClick={false}
              onCheckedChange={() => onToggle(tag.id)}
              data-tag-id={tag.id}
              className="min-h-8 pr-8 [&_svg]:text-primary"
            >
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              <span className="mr-1 text-footnote text-muted-foreground tabular-nums" data-slot="tag-count">
                {counts.get(tag.id) ?? 0}
              </span>
            </DropdownMenuCheckboxItem>
          ))
        )}
        <p className="border-t px-2 pt-2 pb-1 text-footnote text-muted-foreground" data-slot="tags-note">
          Shows tasks that have every selected tag.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Search titles and descriptions. Completed tasks are included on request; Trash never is. */
export function SearchDialog({ open, onOpenChange, today, onOpen }: { open: boolean; onOpenChange: (open: boolean) => void; today: ISODate; onOpen: (task: Task) => void }) {
  const [query, setQuery] = useState('');
  const [completed, setCompleted] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const snapshot = useSnapshot().data;
  const catalog = sortTags(snapshot?.tags ?? []);
  const counts = new Map(tagCounts(snapshot?.tasks ?? [], catalog).map((c) => [c.tag.id, c.count]));
  // A tag deleted since it was picked drops out of the filter instead of matching nothing.
  const tagIds = picked.filter((id) => catalog.some((t) => t.id === id));
  const debounced = useDebounced(query.trim(), 200);
  const searching = debounced !== '' || flagged || tagIds.length > 0;
  const { data: results = [] } = useSearch(debounced, { completed, flagged, tagIds }, open && searching);
  const toggleTag = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((t) => t !== id) : [...now, id]));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search tasks by title and description" className="sm:max-w-lg">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search tasks" value={query} onValueChange={setQuery} />
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-2 pt-2 sm:flex-wrap sm:overflow-visible" data-slot="search-filters">
          <Toggle size="sm" variant="outline" pressed={completed} onPressedChange={setCompleted} data-filter="completed" className="h-8 shrink-0">
            <Icon name="complete" />
            Include completed
          </Toggle>
          <Toggle size="sm" variant="outline" pressed={flagged} onPressedChange={setFlagged} data-filter="flagged" className="h-8 shrink-0">
            <Icon name="flag" active={flagged} />
            Only flagged
          </Toggle>
          <TagsFilter tags={catalog} counts={counts} selected={new Set(tagIds)} onToggle={toggleTag} />
          {tagIds.map((id) => (
            <button
              key={id}
              type="button"
              data-filter-tag={id}
              aria-label={`Remove tag ${catalog.find((t) => t.id === id)?.name}`}
              onClick={() => toggleTag(id)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-primary px-3 text-footnote font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="optical-center">{catalog.find((t) => t.id === id)?.name}</span>
              <Icon name="close" className="size-3" />
            </button>
          ))}
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
                <span data-slot="result-title" className={cn('min-w-0 flex-1 truncate', task.completedAt && 'text-muted-foreground line-through')}>{highlight(task.title, debounced)}</span>
                <TagChips tags={task.tags} className="max-md:hidden" />
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
