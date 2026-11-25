import { captureApplyOrder, captureCardReady, chooseCaptureCreate, chooseCaptureTask, repeatLabel, type CaptureCard, type CaptureReview, type ISODate, type Task } from '@app/core';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { CAPTURE_MAX_CHARS, parseCapture } from '@/data/capture';
import { paneDate } from '@/lib/day-label';
import { useCaptureDictation } from '@/lib/use-dictation';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { captureSheetFrame } from './capture-sheet-frame';
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
  if (action.type === 'append_note') return [];
  if (action.type === 'update') {
    const patch = action.patch;
    const chips: string[] = [];
    if (patch.status === 'in_progress') chips.push('In progress');
    if (patch.status === 'waiting') chips.push('Waiting');
    if (patch.flagged) chips.push('Flagged');
    if (patch.startDate) chips.push(`Start ${paneDate(patch.startDate, today)}`);
    if (patch.hideUntil) chips.push(`Hide until ${paneDate(patch.hideUntil, today)}`);
    if (patch.dueDate) chips.push(`Due ${paneDate(patch.dueDate, today)}`);
    if (patch.repeat) chips.push(repeatLabel(patch.repeat, patch.dueDate ?? null));
    return chips;
  }
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

function LevelMeter({ level }: { level: number }) {
  const value = Math.round(Math.min(1, Math.max(0, level)) * 100);
  return (
    <div data-slot="capture-level" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="flex h-8 items-end gap-0.5 pointer-coarse:h-control">
      {Array.from({ length: 5 }, (_, index) => {
        const lit = level >= (index + 1) / 5;
        return <span key={index} className={cn('w-1 rounded-full', lit ? 'bg-destructive' : 'bg-muted')} style={{ height: `${40 + index * 15}%` }} />;
      })}
    </div>
  );
}

function cardHeading(card: CaptureCard): string {
  if (!captureCardReady(card) && card.ask) return card.ask;
  return card.action.title;
}

function dropName(card: CaptureCard): string {
  if (card.action.type === 'create') return card.action.title;
  return card.action.match;
}

function confirmLabel(cards: readonly CaptureCard[]): string {
  if (cards.length === 1) {
    const action = cards[0]!.action;
    if (action.type === 'update') return 'Update task';
    if (action.type === 'append_note') return 'Add note';
    return 'Add task';
  }
  if (cards.every((card) => card.action.type === 'create')) return `Add ${cards.length} tasks`;
  return `Save ${cards.length}`;
}

function CaptureBody({
  today,
  tags,
  tasks,
  onClose,
  onApply,
}: {
  today: ISODate;
  tags: readonly string[];
  tasks: readonly Task[];
  onClose: () => void;
  onApply: (cards: CaptureCard[]) => Promise<number>;
}) {
  const [phase, setPhase] = useState<Phase>('edit');
  const note = useCaptureDictation(phase === 'edit');
  const text = note.text;
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
  const ready = kept.filter(captureCardReady);
  const canSubmit = text.trim().length > 0 && text.length <= CAPTURE_MAX_CHARS && phase === 'edit';

  const done = async () => {
    const id = ++request.current;
    setPhase('thinking');
    setApplyError('');
    const next = await parseCapture(text, today, tags, tasks);
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

  const pickTask = (cardId: string, taskId: string) => {
    setReview((current) => current && { ...current, cards: current.cards.map((card) => (card.id === cardId ? chooseCaptureTask(card, taskId, tasks) : card)) });
  };

  const pickCreate = (cardId: string) => {
    setReview((current) => current && { ...current, cards: current.cards.map((card) => (card.id === cardId ? chooseCaptureCreate(card) : card)) });
  };

  const confirm = async () => {
    if (ready.length === 0 || ready.length !== kept.length || saving) return;
    setSaving(true);
    setApplyError('');
    const saved = await onApply(ready);
    setSaving(false);
    if (saved >= ready.length) {
      onClose();
      return;
    }
    const doneIds = captureApplyOrder(ready).slice(0, saved).map((card) => card.id);
    setDropped((current) => new Set([...current, ...doneIds]));
    setApplyError(saved === 0 ? "Couldn't save. Nothing was added." : "Couldn't save the rest. The ones added are on the board.");
  };

  const addLabel = confirmLabel(ready);

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
              className="min-h-40 scroll-mt-[env(safe-area-inset-top)] text-body"
              onChange={(event) => note.edit(event.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" aria-pressed={note.listening} className="pointer-coarse:h-control aria-pressed:bg-muted" onClick={note.press}>
                <Icon name="dictate" active={note.listening} data-icon="inline-start" className={note.listening ? 'text-destructive' : undefined} />
                {note.listening ? 'Stop dictation' : 'Dictate'}
              </Button>
              {note.showMeter && <LevelMeter level={note.level} />}
            </div>
            {note.message && (
              <p role="status" data-slot="capture-dictation" className="text-footnote text-muted-foreground">
                {note.message}
              </p>
            )}
            <p className="text-footnote text-muted-foreground">Done sends this note to be read. Nothing is saved until you confirm.</p>
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
                    {cardHeading(card)}
                  </h3>
                  <Button variant="ghost" size="sm" className="shrink-0" aria-label={`Drop ${dropName(card)}`} onClick={() => setDropped((current) => new Set(current).add(card.id))}>
                    Drop
                  </Button>
                </div>
                {card.action.type === 'create' && card.action.description && <p className="mt-1 line-clamp-3 text-footnote text-muted-foreground">{card.action.description}</p>}
                {card.action.type === 'append_note' && <p className="mt-1 text-footnote text-muted-foreground">{card.action.text}</p>}
                {captureCardReady(card) && card.action.type !== 'create' && (
                  <p className="mt-1 text-footnote text-muted-foreground" data-slot="capture-kind">
                    {card.action.type === 'update' ? 'Update' : 'Add note'}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {cardChips(card, today).map((chip) => (
                    <Chip key={chip}>{chip}</Chip>
                  ))}
                </div>
                {!captureCardReady(card) && (
                  <div className="mt-2 flex flex-col gap-2" data-slot="capture-picker">
                    {card.candidates.map((candidate) => (
                      <Button
                        key={candidate.id}
                        variant="outline"
                        className="pointer-coarse:h-control justify-start"
                        onClick={() => pickTask(card.id, candidate.id)}
                      >
                        {card.action.type === 'create' ? `Update ${candidate.title}` : candidate.title}
                      </Button>
                    ))}
                    {card.action.type === 'create' && (
                      <Button variant="outline" className="pointer-coarse:h-control justify-start" onClick={() => pickCreate(card.id)}>
                        Create another
                      </Button>
                    )}
                  </div>
                )}
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
      <div data-slot="capture-footer" className="flex items-center gap-2 border-t border-border px-4 py-3">
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
        {phase === 'review' && review?.confidence === 'high' && ready.length > 0 && ready.length === kept.length && (
          <Button className="pointer-coarse:h-control ml-auto" disabled={saving} onClick={() => void confirm()}>
            {addLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/** 85dvh from the bottom, but never taller than the viewport below the status bar. */
const PHONE_CAPTURE_STYLE: CSSProperties = {
  height: 'min(85dvh, calc(100dvh - env(safe-area-inset-top)))',
  maxHeight: 'calc(100dvh - env(safe-area-inset-top))',
  // Height follows the viewport; the drawer's height transition would lag behind the keyboard.
  transitionProperty: 'transform, opacity, filter',
};

function usePhoneCaptureStyle(active: boolean): CSSProperties {
  const [frame, setFrame] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    let last = '';
    const update = () => {
      const layout = probe.offsetHeight || window.innerHeight;
      const safeTop = Number.parseFloat(getComputedStyle(probe).paddingTop) || 0;
      const next = captureSheetFrame(layout, viewport?.height ?? window.innerHeight, viewport?.offsetTop ?? 0, safeTop);
      const key = next ? `${next.top}:${next.height}` : '';
      if (key === last) return;
      last = key;
      setFrame(next);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      probe.remove();
    };
  }, [active]);

  if (!active || !frame) return PHONE_CAPTURE_STYLE;
  return {
    top: `${frame.top}px`,
    bottom: 'auto',
    height: `${frame.height}px`,
    maxHeight: `${frame.height}px`,
    transitionProperty: 'transform, opacity, filter',
  };
}

/** The capture sheet: write a note, review proposed tasks, and save nothing until Add. */
export function CaptureSheet({
  open,
  onOpenChange,
  today,
  tags,
  tasks,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: ISODate;
  tags: readonly string[];
  tasks: readonly Task[];
  onApply: (cards: CaptureCard[]) => Promise<number>;
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  const phoneSheetStyle = usePhoneCaptureStyle(!wide && open);
  const close = () => onOpenChange(false);
  const body = open ? <CaptureBody key="open" today={today} tags={tags} tasks={tasks} onClose={close} onApply={onApply} /> : null;
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
      <DrawerContent className="bg-background" style={phoneSheetStyle}>
        <DrawerTitle className="sr-only">Capture</DrawerTitle>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
