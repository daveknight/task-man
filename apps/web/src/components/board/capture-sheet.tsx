import { captureApplyOrder, repeatLabel, type CaptureCard, type CaptureReview, type ISODate } from '@app/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { CAPTURE_MAX_CHARS, parseCapture } from '@/data/capture';
import { paneDate } from '@/lib/day-label';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { WIDE_QUERY } from './surface';

type Phase = 'edit' | 'thinking' | 'review';

function Chip({ children }: { children: ReactNode }) {
  return (
    <span data-slot="capture-chip" className="inline-flex h-5 max-w-full items-center rounded-full bg-accent px-2 text-footnote font-medium text-section-header">
      <span className="optical-center truncate">{children}</span>
    </span>
  );
}

function cardChips(card: CaptureCard, today: ISODate): string[] {
  const action = card.action;
  const chips: string[] = [];
  if (action.status === 'in_progress') chips.push('In progress');
  if (action.status === 'waiting') chips.push('Waiting');
  if (action.flagged) chips.push('Flagged');
  if (action.startDate) chips.push(`Start ${paneDate(action.startDate, today)}`);
  if (action.hideUntil) chips.push(`Hide until ${paneDate(action.hideUntil, today)}`);
  if (action.dueDate) chips.push(`Due ${paneDate(action.dueDate, today)}`);
  if (action.repeat) chips.push(repeatLabel(action.repeat, action.dueDate));
  for (const tag of action.tags) chips.push(tag);
  if (action.subtasks.length === 1) chips.push(action.subtasks[0]!);
  else if (action.subtasks.length > 1) chips.push(`${action.subtasks.length} subtasks`);
  return chips;
}

function CaptureBody({
  today,
  tags,
  onClose,
  onApply,
}: {
  today: ISODate;
  tags: readonly string[];
  onClose: () => void;
  onApply: (cards: CaptureCard[]) => Promise<number>;
}) {
  const [phase, setPhase] = useState<Phase>('edit');
  const [text, setText] = useState('');
  const [review, setReview] = useState<CaptureReview | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [applyError, setApplyError] = useState('');
  const request = useRef(0);

  useEffect(() => {
    return () => {
      request.current += 1;
    };
  }, []);

  const kept = (review?.cards ?? []).filter((card) => !dropped.has(card.id));
  const canSubmit = text.trim().length > 0 && text.length <= CAPTURE_MAX_CHARS && phase === 'edit';

  const done = async () => {
    const id = ++request.current;
    setPhase('thinking');
    setApplyError('');
    const next = await parseCapture(text, today, tags);
    if (id !== request.current) return;
    setReview(next);
    setDropped(new Set());
    setPhase('review');
  };

  const recapture = () => {
    request.current += 1;
    setPhase('edit');
    setReview(null);
    setDropped(new Set());
    setApplyError('');
  };

  const confirm = async () => {
    if (kept.length === 0 || saving) return;
    setSaving(true);
    setApplyError('');
    const saved = await onApply(kept);
    setSaving(false);
    if (saved >= kept.length) {
      onClose();
      return;
    }
    const doneIds = captureApplyOrder(kept).slice(0, saved).map((card) => card.id);
    setDropped((current) => new Set([...current, ...doneIds]));
    setApplyError(saved === 0 ? "Couldn't save. Nothing was added." : "Couldn't save the rest. The ones added are on the board.");
  };

  const addLabel = kept.length === 1 ? 'Add task' : `Add ${kept.length} tasks`;

  return (
    <div className="flex h-full min-h-0 flex-col" data-slot="capture-sheet">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-body font-semibold">Capture</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">
        {phase === 'edit' && (
          <>
            <Textarea
              autoFocus
              aria-label="Note"
              value={text}
              maxLength={CAPTURE_MAX_CHARS}
              placeholder="What needs doing?"
              className="min-h-40 text-body"
              onChange={(event) => setText(event.target.value)}
            />
            <p className="text-footnote text-muted-foreground">Done sends this note to be read. Nothing is saved until you add it.</p>
          </>
        )}
        {phase === 'thinking' && (
          <p className="flex items-center gap-2 py-8 text-body text-muted-foreground" role="status" data-slot="capture-thinking">
            <Icon name="capture" className="size-5" />
            Thinking…
          </p>
        )}
        {phase === 'review' && review && (
          <>
            <p className="line-clamp-3 rounded-lg bg-muted px-3 py-2 text-footnote text-muted-foreground" data-slot="capture-source">
              {text}
            </p>
            {review.summary && (
              <p className="text-body" data-slot="capture-summary">
                {review.summary}
              </p>
            )}
            {review.message && (
              <p className="text-body" role="status" data-slot="capture-message">
                {review.message}
              </p>
            )}
            {review.notes.map((note) => (
              <p key={note} className="text-footnote text-muted-foreground">
                {note}
              </p>
            ))}
            {kept.map((card) => (
              <article key={card.id} data-slot="capture-card" className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 text-body font-medium" data-slot="capture-card-title">
                    {card.action.title}
                  </h3>
                  <Button variant="ghost" size="sm" className="shrink-0" aria-label={`Drop ${card.action.title}`} onClick={() => setDropped((current) => new Set(current).add(card.id))}>
                    Drop
                  </Button>
                </div>
                {card.action.description && <p className="mt-1 line-clamp-3 text-footnote text-muted-foreground">{card.action.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {cardChips(card, today).map((chip) => (
                    <Chip key={chip}>{chip}</Chip>
                  ))}
                </div>
                {card.marks.map((mark) => (
                  <p key={`${mark.field}-${mark.message}`} className="mt-1 text-footnote text-flag" data-slot="capture-mark">
                    {mark.message}
                  </p>
                ))}
              </article>
            ))}
            {applyError && (
              <p className="text-footnote text-destructive" role="status">
                {applyError}
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        {phase === 'review' && (
          <Button variant="outline" className="pointer-coarse:h-control" onClick={recapture}>
            Recapture
          </Button>
        )}
        <Button variant="ghost" className="pointer-coarse:h-control" onClick={onClose}>
          Cancel
        </Button>
        {phase === 'edit' && (
          <Button className="pointer-coarse:h-control ml-auto" disabled={!canSubmit} onClick={() => void done()}>
            Done
          </Button>
        )}
        {phase === 'review' && review?.confidence === 'high' && kept.length > 0 && (
          <Button className="pointer-coarse:h-control ml-auto" disabled={kept.length === 0 || saving} onClick={() => void confirm()}>
            {addLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The capture sheet: write a note, review proposed tasks, and save nothing until Add. */
export function CaptureSheet({
  open,
  onOpenChange,
  today,
  tags,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: ISODate;
  tags: readonly string[];
  onApply: (cards: CaptureCard[]) => Promise<number>;
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  const close = () => onOpenChange(false);
  const body = open ? <CaptureBody key="open" today={today} tags={tags} onClose={close} onApply={onApply} /> : null;
  if (wide) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" showCloseButton={false} className={cn('w-full gap-0 bg-background p-0 sm:max-w-md')}>
          <SheetTitle className="sr-only">Capture</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[85dvh] bg-background">
        <DrawerTitle className="sr-only">Capture</DrawerTitle>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
