import type { Task } from '@app/core';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useOnline } from '@/lib/online';
import { setLiveTitle } from '@/lib/transient';
import { cn } from '@/lib/utils';
import { useBoardActions } from './board-actions';

const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ');

/**
 * The row title, edited in place on desktop. Saves on Enter or blur; Escape puts the title back.
 * While it's typed in, the detail pane shows the same text, so both stay in step.
 * A plain-text contentEditable rather than an input, so the title stays the row's text and the
 * browser's own undo works while typing. React never renders the text, so it can't fight the caret.
 */
export function InlineTitle({ task, className }: { task: Task; className?: string }) {
  const actions = useBoardActions();
  const online = useOnline();
  const ref = useRef<HTMLSpanElement>(null);
  const cancelled = useRef(false);
  const before = useRef('');
  const editable = online && !!actions;

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== task.title) el.textContent = task.title;
  }, [task.title]);

  const focused = () => document.activeElement === ref.current;

  useEffect(() => () => setLiveTitle(null), []);

  return (
    <span
      ref={ref}
      data-slot="task-title"
      role="textbox"
      aria-label="Title"
      contentEditable={editable ? 'plaintext-only' : false}
      // Click to select the row and edit; keyboard users Tab to the row's open button and edit in the pane.
      tabIndex={-1}
      suppressContentEditableWarning
      spellCheck={false}
      onClick={() => actions?.open(task)}
      // Once editing, a drag selects text and a right-click gets the browser's menu, not the row's.
      onMouseDown={(e) => focused() && e.stopPropagation()}
      onContextMenu={(e) => focused() && e.stopPropagation()}
      onInput={(e) => setLiveTitle({ id: task.id, text: oneLine(e.currentTarget.textContent ?? '') })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, oneLine(e.clipboardData.getData('text/plain')));
      }}
      onFocus={(e) => (before.current = e.currentTarget.textContent ?? '')}
      onBlur={(e) => {
        const el = e.currentTarget;
        const title = oneLine(el.textContent ?? '').trim();
        const keep = !cancelled.current && title && title !== before.current.trim() && title !== task.title;
        cancelled.current = false;
        el.textContent = keep ? title : task.title;
        el.scrollLeft = 0;
        if (keep) void actions?.edit(task, { title }).finally(() => setLiveTitle(null));
        else setLiveTitle(null);
      }}
      className={cn(
        'relative min-w-4 truncate text-body optical-center outline-none',
        editable ? 'cursor-text focus:text-clip' : 'cursor-pointer',
        className,
      )}
    />
  );
}
