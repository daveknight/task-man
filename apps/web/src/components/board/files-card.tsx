import { formatBytes, isPreviewableImage, type Task } from '@app/core';
import type { AttachmentFile } from '@app/data';
import { useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { useFileWrites, useTaskFiles } from '@/data/files';
import { prepareUpload } from '@/lib/downscale';
import { useOnline } from '@/lib/online';
import { useBoardActions } from './board-actions';
import { RowList } from './board-view';
import { ImagePreview } from './image-preview';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Files live on the task sheet only: a thumbnail for a photo, a file icon and the name
 * otherwise. Nothing about them is shown on the board row. One Add file button opens the
 * system picker, with no accept filter and no capture flag, so a phone may still offer
 * the camera, the photo library, or files. A photo is still downscaled before upload.
 * A previewable image's name opens a full-screen preview. Any other file opens its
 * signed URL, the same as before.
 */
export function FilesCard({ task }: { task: Task }) {
  const actions = useBoardActions();
  const online = useOnline();
  const files = useTaskFiles(task.id, actions != null);
  const writes = useFileWrites(task.id);
  const [activity, setActivity] = useState<'adding' | 'deleting' | null>(null);
  const busy = activity != null;
  const [preview, setPreview] = useState<AttachmentFile | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = !!task.deletedAt || !online || !actions || busy;

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    if (picked.length === 0 || locked) return;
    setActivity('adding');
    void (async () => {
      try {
        for (const file of picked) await writes.add(await prepareUpload(file));
      } catch (error) {
        toast.error(message(error));
      } finally {
        setActivity(null);
      }
    })();
  };

  const remove = (file: AttachmentFile) => {
    setActivity('deleting');
    void writes
      .remove(file)
      .catch((error: unknown) => toast.error(message(error)))
      .finally(() => setActivity(null));
  };

  const list = files.data ?? [];
  return (
    <div data-slot="files" data-base-ui-swipe-ignore>
      <RowList fields className="ring-1 ring-border/60">
        <div className="flex min-h-row items-center gap-row-gap px-row-x">
          <Icon name="file" className="size-icon shrink-0 text-muted-foreground" />
          <span className="optical-center flex-1 text-body">Files</span>
        </div>
        {files.isError && <p className="px-row-x py-2 text-footnote text-destructive">Couldn't load files.</p>}
        {list.map((file) => (
          <div key={file.id} data-slot="file-row" className="group/row flex items-center gap-row-gap px-row-x py-2">
            {file.url && isPreviewableImage(file.mime) ? (
              <img src={file.url} alt="" data-slot="file-thumb" className="size-11 shrink-0 rounded-md object-cover ring-1 ring-border" />
            ) : (
              <Icon name="file" className="size-icon shrink-0 text-muted-foreground" />
            )}
            {file.url && isPreviewableImage(file.mime) ? (
              <button
                type="button"
                className="optical-center min-w-0 flex-1 truncate rounded-sm text-left text-body text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                onClick={() => setPreview(file)}
              >
                {file.filename}
              </button>
            ) : file.url ? (
              <a href={file.url} target="_blank" rel="noreferrer" className="optical-center min-w-0 flex-1 truncate text-body text-foreground underline-offset-2 hover:underline">
                {file.filename}
              </a>
            ) : (
              <span className="optical-center min-w-0 flex-1 truncate text-body">{file.filename}</span>
            )}
            <span className="optical-center shrink-0 text-footnote text-muted-foreground">{formatBytes(file.bytes)}</span>
            {!task.deletedAt && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${file.filename}`}
                title={`Remove ${file.filename}`}
                disabled={!online || busy || !actions}
                onClick={() => remove(file)}
                className="text-foreground hover:text-destructive focus-visible:text-destructive max-sm:not-sr-only pointer-coarse:not-sr-only sr-only group-hover/row:not-sr-only group-has-focus-visible/row:not-sr-only"
              >
                <Icon name="trash" />
              </Button>
            )}
          </div>
        ))}
        {!task.deletedAt && (
          <div className="flex flex-col gap-2 px-row-x py-2">
            <input ref={fileInput} data-slot="file-input" type="file" multiple tabIndex={-1} aria-hidden className="sr-only" onChange={onPick} />
            <div data-slot="file-add">
              <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-control" disabled={locked} onClick={() => fileInput.current?.click()}>
                <Icon name="file" data-icon="inline-start" />
                Add file
              </Button>
            </div>
            {activity === 'adding' && <p className="text-footnote text-muted-foreground">Adding…</p>}
            {activity === 'deleting' && <p className="text-footnote text-muted-foreground">Deleting…</p>}
          </div>
        )}
      </RowList>
      <ImagePreview file={preview?.url ? { filename: preview.filename, url: preview.url } : null} onClose={() => setPreview(null)} />
    </div>
  );
}
