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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Files live on the task sheet only: a thumbnail for a photo, a file icon and the name
 * otherwise. Nothing about them is shown on the board row. The phone offers the camera,
 * the photo library and the file picker; a desktop offers a photo and a file.
 */
export function FilesCard({ task }: { task: Task }) {
  const actions = useBoardActions();
  const online = useOnline();
  const files = useTaskFiles(task.id, actions != null);
  const writes = useFileWrites(task.id);
  const [busy, setBusy] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const anyFile = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const locked = !!task.deletedAt || !online || !actions || busy;

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    if (picked.length === 0 || locked) return;
    setBusy(true);
    void (async () => {
      try {
        for (const file of picked) await writes.add(await prepareUpload(file));
      } catch (error) {
        toast.error(message(error));
      } finally {
        setBusy(false);
      }
    })();
  };

  const remove = (file: AttachmentFile) => {
    setBusy(true);
    void writes
      .remove(file)
      .catch((error: unknown) => toast.error(message(error)))
      .finally(() => setBusy(false));
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
            {file.url ? (
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
            <input ref={camera} data-slot="file-input-camera" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden className="sr-only" onChange={onPick} />
            <input ref={library} data-slot="file-input-library" type="file" accept="image/*" multiple tabIndex={-1} aria-hidden className="sr-only" onChange={onPick} />
            <input ref={anyFile} data-slot="file-input-file" type="file" multiple tabIndex={-1} aria-hidden className="sr-only" onChange={onPick} />
            <input ref={photo} data-slot="file-input-photo" type="file" accept="image/*" multiple tabIndex={-1} aria-hidden className="sr-only" onChange={onPick} />
            <div data-slot="file-add-touch" className="hidden flex-wrap gap-2 max-md:flex pointer-coarse:flex">
              <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-control" disabled={locked} onClick={() => camera.current?.click()}>
                <Icon name="camera" data-icon="inline-start" />
                Camera
              </Button>
              <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-control" disabled={locked} onClick={() => library.current?.click()}>
                <Icon name="photo" data-icon="inline-start" />
                Photo library
              </Button>
              <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-control" disabled={locked} onClick={() => anyFile.current?.click()}>
                <Icon name="file" data-icon="inline-start" />
                File
              </Button>
            </div>
            <div data-slot="file-add-desktop" className="flex flex-wrap gap-2 max-md:hidden pointer-coarse:hidden">
              <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => photo.current?.click()}>
                <Icon name="photo" data-icon="inline-start" />
                Add photo
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => anyFile.current?.click()}>
                <Icon name="file" data-icon="inline-start" />
                Add file
              </Button>
            </div>
            {busy && <p className="text-footnote text-muted-foreground">Adding…</p>}
          </div>
        )}
      </RowList>
    </div>
  );
}
