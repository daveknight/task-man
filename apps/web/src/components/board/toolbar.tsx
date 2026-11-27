import type { ReactNode } from 'react';
import type { IconMeaning } from '@app/tokens';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { APPEARANCES, useAppearance, type Appearance } from '@/lib/appearance';

const APPEARANCE_LABELS: Record<Appearance, { label: string; icon: IconMeaning }> = {
  system: { label: 'System', icon: 'appearanceSystem' },
  light: { label: 'Light', icon: 'appearanceLight' },
  dark: { label: 'Dark', icon: 'appearanceDark' },
};

export interface BoardMenuProps {
  defaultOpen?: boolean;
  showCompleted?: boolean;
  onShowCompletedChange?: (show: boolean) => void;
  onTrash?: () => void;
  /** Opens the completed log, the read-only "what I finished" screen. */
  onCompletedLog?: () => void;
  /** The signed-in account, with its sign-out. Left out on the static design screens. */
  account?: { email: string; onSignOut: () => void };
  /** Opens Settings, where storage use is shown. */
  onSettings?: () => void;
}

/** The board menu: Show completed, the completed log, View recently deleted, and the Appearance setting. */
export function BoardMenu({ defaultOpen, showCompleted = false, onShowCompletedChange, onTrash, onCompletedLog, account, onSettings }: BoardMenuProps) {
  const { appearance, setAppearance } = useAppearance();
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" className="pointer-coarse:size-control" />}>
        <Icon name="more" weight="bold" className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem checked={showCompleted} onCheckedChange={(checked) => onShowCompletedChange?.(checked)}>
            Show completed
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onClick={onCompletedLog}>Completed log</DropdownMenuItem>
          <DropdownMenuItem onClick={onTrash}>View recently deleted</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSettings?.()}>
            <Icon name="settings" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={appearance} onValueChange={(value) => setAppearance(value as Appearance)}>
            {APPEARANCES.map((a) => (
              <DropdownMenuRadioItem key={a} value={a}>
                <Icon name={APPEARANCE_LABELS[a].icon} />
                {APPEARANCE_LABELS[a].label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {account && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {account.email && <DropdownMenuLabel className="truncate">{account.email}</DropdownMenuLabel>}
              <DropdownMenuItem onClick={account.onSignOut}>
                <Icon name="signOut" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Toolbar({
  title,
  subtitle,
  menuOpen,
  onBack,
  onSearch,
  onAdd,
  onCapture,
  addDisabled,
  menu,
}: {
  title: string;
  subtitle?: ReactNode;
  menuOpen?: boolean;
  /** Shows a back button instead of search and add (the Trash screen). */
  onBack?: () => void;
  onSearch?: () => void;
  onAdd?: () => void;
  onCapture?: () => void;
  addDisabled?: boolean;
  menu?: Omit<BoardMenuProps, 'defaultOpen'>;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-row-x bg-background/85 px-row-x pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex h-toolbar items-center gap-1 pointer-coarse:gap-0">
        {onBack && (
          <Button variant="ghost" size="icon" aria-label="Back" className="-ml-2 text-link pointer-coarse:size-control" onClick={onBack}>
            <Icon name="expand" weight="bold" className="size-5 rotate-180" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-large-title font-bold tracking-tight">{title}</h1>
        </div>
        {!onBack && (
          <>
            {/* Phones get `AddTaskFab` instead. */}
            {onCapture && (
              <Button variant="outline" className="max-md:hidden pointer-coarse:h-control" disabled={addDisabled} onClick={onCapture}>
                <Icon name="capture" data-icon="inline-start" />
                <span className="optical-center">Capture</span>
              </Button>
            )}
            <Button className="mr-1 max-md:hidden pointer-coarse:mr-0 pointer-coarse:h-control" disabled={addDisabled} onClick={onAdd}>
              <Icon name="add" weight="bold" data-icon="inline-start" />
              <span className="optical-center">Add task</span>
            </Button>
            <Button variant="ghost" size="icon" aria-label="Search" className="pointer-coarse:size-control" onClick={onSearch}>
              <Icon name="search" className="size-5" />
            </Button>
            <BoardMenu defaultOpen={menuOpen} {...menu} />
          </>
        )}
      </div>
      {subtitle && <p className="-mt-1 pb-2 text-footnote text-muted-foreground">{subtitle}</p>}
    </header>
  );
}

/** Bottom padding for the board on phones, so the last row can scroll clear of `AddTaskFab`. */
export const FAB_CLEARANCE = 'max-md:pb-[calc(env(safe-area-inset-bottom)+6rem)]';

/**
 * The phone layout's Add task button, floating in the lower right. Render it outside the toolbar:
 * the toolbar's backdrop blur would pin a fixed child to the header instead of the screen.
 */
export function AddTaskFab({ disabled, onAdd, onCapture }: { disabled?: boolean; onAdd?: () => void; onCapture?: () => void }) {
  return (
    <div className="fixed right-[calc(env(safe-area-inset-right)+1rem)] bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-30 flex items-center gap-3 md:hidden">
      {onCapture && (
        <Button aria-label="Capture" variant="outline" disabled={disabled} onClick={onCapture} className="size-14 rounded-full bg-background shadow-lg">
          <Icon name="capture" className="size-6" />
        </Button>
      )}
      <Button aria-label="Add task" data-slot="add-task-fab" disabled={disabled} onClick={onAdd} className="size-14 rounded-full shadow-lg">
        <Icon name="add" weight="bold" className="size-6" />
      </Button>
    </div>
  );
}
