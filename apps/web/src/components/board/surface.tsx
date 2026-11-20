import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

export const WIDE_QUERY = '(min-width: 768px)';

/** A dialog on desktop and a bottom sheet on phones. */
export function Surface({
  open,
  onOpenChange,
  title,
  description,
  descriptionClassName,
  children,
  slot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra classes for the description, such as `sr-only` when it exists only for screen readers. */
  descriptionClassName?: string;
  children: ReactNode;
  slot?: string;
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="gap-4 sm:max-w-sm" data-slot={slot}>
          <DialogHeader>
            <DialogTitle className="text-headline font-semibold">{title}</DialogTitle>
            {description && <DialogDescription className={cn('text-body', descriptionClassName)}>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="bg-background" data-slot={slot}>
        <DrawerHeader className="gap-1 pb-3 text-left group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="text-headline font-semibold">{title}</DrawerTitle>
          {description && <DrawerDescription className={cn('text-body', descriptionClassName)}>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
