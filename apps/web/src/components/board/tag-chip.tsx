import { tagChips, type Tag } from '@app/core';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A tag: a neutral grey pill with the name only. Tags have no colors. */
export function TagChip({ children, className, ...props }: { children: ReactNode; className?: string } & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="tag-chip"
      className={cn('inline-flex h-5 max-w-40 shrink-0 items-center rounded-full bg-accent px-2 text-footnote font-medium whitespace-nowrap text-section-header', className)}
      {...props}
    >
      <span className="optical-center truncate">{children}</span>
    </span>
  );
}

/**
 * A row's chips: the first `max` tags, then "+N" for the rest. Phone rows don't show tags, so a caller
 * hides this with `max-sm:hidden`; the sheet and the picker list every tag instead.
 */
export function TagChips({ tags, max = 2, className }: { tags: readonly Tag[] | undefined; max?: number; className?: string }) {
  const { visible, overflow } = tagChips(tags, max);
  if (visible.length === 0) return null;
  return (
    <span data-slot="tag-chips" className={cn('flex shrink-0 items-center gap-1', className)}>
      {visible.map((tag) => (
        <TagChip key={tag.id} data-tag-id={tag.id}>
          {tag.name}
        </TagChip>
      ))}
      {overflow > 0 && (
        <TagChip data-overflow>
          +{overflow}
          <span className="sr-only"> more {overflow === 1 ? 'tag' : 'tags'}</span>
        </TagChip>
      )}
    </span>
  );
}
