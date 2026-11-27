import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Icon } from '@/components/icon';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { clampPan, clampZoom, pinchZoom, stepZoom, touchDistance, ZOOM_MIN, type Point } from '@/lib/image-zoom';
import { cn } from '@/lib/utils';

/**
 * Full-screen preview for a file the browser can paint. Pinch zooms on a touch
 * screen. A mouse gets on-screen zoom controls, and can drag once zoomed in.
 * Open original is the signed URL, the same place the name used to go.
 */
export function ImagePreview({ file, onClose }: { file: { filename: string; url: string } | null; onClose: () => void }) {
  return (
    <Dialog open={file != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {file && <PreviewBody key={file.url} file={file} />}
    </Dialog>
  );
}

function PreviewBody({ file }: { file: { filename: string; url: string } }) {
  const imageRef = useRef<HTMLImageElement>(null);
  // The dialog portal mounts the stage after the first commit, so the listener
  // has to follow the element, not a one-shot effect.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const pinching = useRef(false);
  const panOrigin = useRef<{ x: number; y: number; pan: Point } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);

  const apply = useCallback((nextZoom: number, nextPan: Point) => {
    const z = clampZoom(nextZoom);
    const img = imageRef.current;
    const fitted = { width: img?.offsetWidth ?? 0, height: img?.offsetHeight ?? 0 };
    const p = clampPan(nextPan, z, fitted);
    zoomRef.current = z;
    panRef.current = p;
    setZoom(z);
    setPan(p);
  }, []);

  useEffect(() => {
    const el = stageEl;
    if (!el) return;

    let pinch: { startZoom: number; startDistance: number } | null = null;

    const start = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      const [a, b] = event.touches;
      if (!a || !b) return;
      pinching.current = true;
      panOrigin.current = null;
      pinch = { startZoom: zoomRef.current, startDistance: touchDistance(point(a), point(b)) };
    };

    const move = (event: TouchEvent) => {
      if (!pinch || event.touches.length < 2) return;
      const [a, b] = event.touches;
      if (!a || !b) return;
      event.preventDefault();
      apply(pinchZoom(pinch.startZoom, pinch.startDistance, touchDistance(point(a), point(b))), panRef.current);
    };

    const end = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      pinch = null;
      pinching.current = false;
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [apply, stageEl]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || pinching.current || zoomRef.current <= ZOOM_MIN) return;
    if (event.target instanceof Element && event.target.closest('button, a')) return;
    panOrigin.current = { x: event.clientX, y: event.clientY, pan: panRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = panOrigin.current;
    if (!origin || pinching.current) return;
    apply(zoomRef.current, {
      x: origin.pan.x + (event.clientX - origin.x),
      y: origin.pan.y + (event.clientY - origin.y),
    });
  };

  const endPan = () => {
    panOrigin.current = null;
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
      <DialogPrimitive.Popup
        data-slot="image-preview"
        className="fixed inset-0 z-50 flex h-dvh w-screen flex-col bg-background text-foreground outline-none duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none"
      >
        <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <DialogTitle className="optical-center min-w-0 flex-1 truncate text-body font-medium">{file.filename}</DialogTitle>
          <DialogDescription className="sr-only">Image preview</DialogDescription>
          <a href={file.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'pointer-coarse:h-control shrink-0')}>
            <span className="optical-center">Open original</span>
          </a>
          <DialogClose render={<Button variant="ghost" size="icon" aria-label="Close" className="pointer-coarse:size-control shrink-0" />}>
            <Icon name="close" />
          </DialogClose>
        </div>
        <div
          ref={setStageEl}
          data-slot="image-stage"
          className={cn('relative min-h-0 flex-1 touch-none overflow-hidden', zoom > ZOOM_MIN && 'cursor-grab')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          {failed ? (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-body text-muted-foreground">Couldn't load this image.</p>
          ) : (
            <img
              ref={imageRef}
              src={file.url}
              alt=""
              draggable={false}
              data-zoom={zoom}
              onLoad={() => apply(zoomRef.current, panRef.current)}
              onError={() => setFailed(true)}
              className="pointer-events-none absolute top-1/2 left-1/2 max-h-full max-w-full select-none"
              style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-coarse:hidden">
            <div role="group" aria-label="Zoom" className="pointer-events-auto flex cursor-default items-center gap-1 rounded-xl bg-card p-1 ring-1 ring-border">
              <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={stepZoom(zoom, -1) === clampZoom(zoom)} onClick={() => apply(stepZoom(zoom, -1), pan)}>
                <Icon name="zoomOut" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={stepZoom(zoom, 1) === clampZoom(zoom)} onClick={() => apply(stepZoom(zoom, 1), pan)}>
                <Icon name="zoomIn" />
              </Button>
            </div>
          </div>
        </div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function point(touch: Touch): Point {
  return { x: touch.clientX, y: touch.clientY };
}
