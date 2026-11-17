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

/** The board menu: Show completed, Trash, and the Appearance setting. */
export function BoardMenu({ defaultOpen }: { defaultOpen?: boolean }) {
  const { appearance, setAppearance } = useAppearance();
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" className="pointer-coarse:size-control" />}>
        <Icon name="more" weight="bold" className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem checked={false}>Show completed</DropdownMenuCheckboxItem>
          <DropdownMenuItem>
            <Icon name="trash" />
            Trash
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Toolbar({ title, subtitle, menuOpen }: { title: string; subtitle?: ReactNode; menuOpen?: boolean }) {
  return (
    <header className="sticky top-0 z-20 -mx-row-x bg-background/85 px-row-x pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex h-toolbar items-center gap-1">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-large-title font-bold tracking-tight">{title}</h1>
        </div>
        <Button variant="ghost" size="icon" aria-label="Search" className="pointer-coarse:size-control">
          <Icon name="search" className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Add task" className="text-link pointer-coarse:size-control">
          <Icon name="add" weight="bold" className="size-5" />
        </Button>
        <BoardMenu defaultOpen={menuOpen} />
      </div>
      {subtitle && <p className="-mt-1 pb-2 text-footnote text-muted-foreground">{subtitle}</p>}
    </header>
  );
}
