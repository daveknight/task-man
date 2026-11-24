import { checkTagName, findTagByName, normalizeTagName, sortTags, tagsMatching, type Tag, type Task } from '@app/core';
import { useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSnapshot } from '@/data/board-data';
import { useOnline } from '@/lib/online';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { useBoardActions } from './board-actions';
import { TagChip } from './tag-chip';
import { WIDE_QUERY } from './surface';

type Managing = { kind: 'rename' | 'delete'; id: string } | null;

function TagRename({ tag, tags, onDone }: { tag: Tag; tags: Tag[]; onDone: () => void }) {
  const actions = useBoardActions();
  const [text, setText] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);

  const finish = (save: boolean, blurred = false) => {
    if (finished.current) return;
    if (save) {
      const check = checkTagName(text, tags, tag.id);
      if (!check.ok) {
        // Leaving the field with a bad name abandons the rename; pressing Return keeps it open to fix.
        if (!blurred) return setError(check.message);
      } else if (check.name !== tag.name) void actions?.renameTag(tag, check.name);
    }
    finished.current = true;
    onDone();
  };

  return (
    <div className="flex flex-col gap-1 px-1 py-0.5" data-slot="tag-rename">
      <Input
        autoFocus
        value={text}
        aria-label={`Rename ${tag.name}`}
        aria-invalid={error ? true : undefined}
        className="h-8"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={() => finish(true, true)}
        onKeyDown={(e) => {
          // Keep keys away from the list around the field, which would otherwise pick a row on Return.
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
          }
        }}
      />
      {error && (
        <p role="alert" className="px-1 text-footnote text-destructive" data-slot="tag-error">
          {error}
        </p>
      )}
    </div>
  );
}

function TagDelete({ tag, uses, onDone }: { tag: Tag; uses: number; onDone: () => void }) {
  const actions = useBoardActions();
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted p-2" data-slot="tag-delete" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onDone())}>
      <p className="text-footnote">
        Delete “{tag.name}”? {uses === 0 ? 'No tasks have it.' : `It comes off ${uses === 1 ? '1 task' : `${uses} tasks`}.`}
      </p>
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          autoFocus
          onClick={() => {
            onDone();
            void actions?.deleteTag(tag);
          }}
        >
          Delete tag
        </Button>
      </div>
    </div>
  );
}

function TagRow({ tag, attached, onToggle, onManage }: { tag: Tag; attached: boolean; onToggle: () => void; onManage: (kind: 'rename' | 'delete') => void }) {
  return (
    <div className="group/tag flex items-center rounded-lg has-data-selected:bg-muted" data-slot="tag-row">
      <CommandItem
        value={tag.id}
        data-checked={attached}
        data-tag-id={tag.id}
        aria-label={tag.name}
        onSelect={onToggle}
        className="min-h-9 flex-1 pr-1 pointer-coarse:min-h-11 pointer-coarse:text-body data-selected:bg-transparent [&>svg:last-child]:text-primary"
      >
        <span className="optical-center min-w-0 truncate">{tag.name}</span>
      </CommandItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Manage ${tag.name}`} data-slot="tag-manage" className="mr-1 text-muted-foreground" />}
        >
          <Icon name="more" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => onManage('rename')}>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onManage('delete')}>
            <Icon name="trash" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The tag list for one task: search or create at the top, then every tag alphabetically with a check on the
 * ones the task has. Tapping a row puts the tag on or off; each row's menu renames or deletes the tag everywhere.
 */
export function TagPicker({ task, className }: { task: Task; className?: string }) {
  const actions = useBoardActions();
  const snapshot = useSnapshot().data;
  const catalog = sortTags(snapshot?.tags ?? []);
  const [text, setText] = useState('');
  const [managing, setManaging] = useState<Managing>(null);
  const attached = new Set((task.tags ?? []).map((t) => t.id));

  const typed = normalizeTagName(text) ?? '';
  const shown = tagsMatching(catalog, typed);
  const check = typed && !findTagByName(catalog, typed) ? checkTagName(typed, catalog) : null;
  const canCreate = check?.ok === true;
  const problem = check && !check.ok ? check.message : null;
  const usesOf = (id: string) => (snapshot?.tasks ?? []).filter((t) => !t.deletedAt && t.tags?.some((g) => g.id === id)).length;

  return (
    <Command shouldFilter={false} className={cn('p-0', className)} data-slot="tag-picker">
      <CommandInput value={text} onValueChange={setText} placeholder="Search or create tag" aria-label="Search or create tag" />
      {problem && (
        <p role="alert" className="px-3 pt-1.5 text-footnote text-destructive" data-slot="tag-error">
          {problem}
        </p>
      )}
      <CommandList className="max-h-64 p-1" data-base-ui-swipe-ignore>
        {shown.map((tag) =>
          managing?.id === tag.id && managing.kind === 'rename' ? (
            <TagRename key={tag.id} tag={tag} tags={catalog} onDone={() => setManaging(null)} />
          ) : managing?.id === tag.id && managing.kind === 'delete' ? (
            <TagDelete key={tag.id} tag={tag} uses={usesOf(tag.id)} onDone={() => setManaging(null)} />
          ) : (
            <TagRow
              key={tag.id}
              tag={tag}
              attached={attached.has(tag.id)}
              onToggle={() => void actions?.setTag(task, tag, !attached.has(tag.id))}
              onManage={(kind) => setManaging({ kind, id: tag.id })}
            />
          ),
        )}
        {canCreate && (
          <CommandItem
            value="create-tag"
            data-slot="tag-create"
            onSelect={() => {
              void actions?.createTag(task, typed);
              setText('');
            }}
            className="min-h-9 text-primary pointer-coarse:min-h-11 pointer-coarse:text-body data-selected:text-primary"
          >
            <Icon name="add" />
            <span className="optical-center truncate">Create “{typed}”</span>
          </CommandItem>
        )}
        {shown.length === 0 && !typed && (
          <p className="px-2 py-3 text-center text-footnote text-muted-foreground" data-slot="tag-empty">
            No tags yet. Type a name to make one.
          </p>
        )}
      </CommandList>
    </Command>
  );
}

/**
 * The Tags row in the task sheet: every tag on the task (or None), opening the picker. A popover beside the row on
 * wide screens and a bottom sheet on phones. A task in Trash, or no connection, shows the tags without the picker.
 */
export function TagsField({ task }: { task: Task }) {
  const actions = useBoardActions();
  const online = useOnline();
  const wide = useMediaQuery(WIDE_QUERY);
  const [open, setOpen] = useState(false);
  const locked = !!task.deletedAt || !online || !actions;
  const tags = task.tags ?? [];

  const row = (
    <div className="flex min-h-row items-center gap-row-gap px-row-x py-1">
      <Icon name="tags" className="size-icon shrink-0 text-muted-foreground" />
      <span className="optical-center text-body">Tags</span>
      <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-1" data-slot="tag-values">
        {tags.length === 0 ? (
          <span className="optical-center text-body text-muted-foreground">None</span>
        ) : (
          tags.map((tag) => (
            <TagChip key={tag.id} data-tag-id={tag.id}>
              {tag.name}
            </TagChip>
          ))
        )}
      </span>
    </div>
  );

  if (locked) return <div data-field="Tags">{row}</div>;

  const trigger = 'w-full text-left outline-none hover:bg-muted focus-visible:bg-muted';
  if (wide) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={trigger} data-field="Tags">
          {row}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-0 p-1.5">
          <TagPicker task={task} />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <>
      <button type="button" className={trigger} data-field="Tags" onClick={() => setOpen(true)}>
        {row}
      </button>
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent className="bg-background" data-slot="tag-sheet">
          <div className="relative flex min-h-12 items-center justify-center px-row-x">
            <DrawerTitle className="text-body font-semibold">Tags</DrawerTitle>
            <Button variant="ghost" className="absolute right-2 text-primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
          <TagPicker task={task} className="min-h-0 bg-background px-2 pb-6" />
        </DrawerContent>
      </Drawer>
    </>
  );
}
