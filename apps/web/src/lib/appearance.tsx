import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Appearance = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

export const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'appearance';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function storedAppearance(): Appearance {
  const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

function systemScheme(): Scheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Sets shadcn's `.dark` class and the browser chrome color (`theme-color`, iOS status bar) to match. */
function applyScheme(scheme: Scheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', scheme === 'dark');
  const background = getComputedStyle(root).getPropertyValue('--background').trim();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  if (background) meta.content = background;
}

interface AppearanceContextValue {
  appearance: Appearance;
  scheme: Scheme;
  setAppearance: (appearance: Appearance) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(storedAppearance);
  const [system, setSystem] = useState<Scheme>(systemScheme);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const scheme = appearance === 'system' ? system : appearance;
  useEffect(() => applyScheme(scheme), [scheme]);

  const setAppearance = useCallback((next: Appearance) => {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
    setAppearanceState(next);
  }, []);

  const value = useMemo(() => ({ appearance, scheme, setAppearance }), [appearance, scheme, setAppearance]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance needs an AppearanceProvider.');
  return value;
}
