import { STORAGE_BYTE_LIMIT, formatStorage } from '@app/core';
import webPackage from '../../../package.json';
import { Button } from '@/components/ui/button';
import { useStorageUsage } from '@/data/files';
import { Surface } from './surface';

/** Storage for the signed-in user. Appearance stays in the board menu. */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const usage = useStorageUsage(open);
  const used = usage.data ?? 0;
  const label = usage.data != null ? formatStorage(used) : usage.isError ? 'Unavailable offline' : '…';
  const width = usage.data != null ? Math.min(100, (used / STORAGE_BYTE_LIMIT) * 100) : 0;
  return (
    <Surface open={open} onOpenChange={onOpenChange} title="Settings" description="Storage" descriptionClassName="sr-only" slot="settings">
      <div className="flex flex-col gap-4">
        <div data-slot="storage-usage" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body">Storage</span>
            <span className="text-body text-muted-foreground">{label}</span>
          </div>
          <div
            role="meter"
            aria-label="Storage"
            aria-valuemin={0}
            aria-valuemax={STORAGE_BYTE_LIMIT}
            aria-valuenow={used}
            aria-valuetext={label}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
          </div>
          <p className="text-footnote text-muted-foreground">50 MB per file. Photos are downscaled before they upload.</p>
        </div>
        <div data-slot="app-version" className="flex items-baseline justify-between gap-3">
          <span className="text-body">Version</span>
          <span className="text-body text-muted-foreground">{webPackage.version}</span>
        </div>
        <Button className="pointer-coarse:h-control w-full" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </div>
    </Surface>
  );
}
