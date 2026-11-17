import { useCallback, useState } from 'react';

/** A boolean remembered in localStorage, so collapsible parts open as the user last left them. */
export function usePersistedBoolean(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return stored === null ? initial : stored === 'true';
  });
  const set = useCallback(
    (next: boolean) => {
      localStorage.setItem(key, String(next));
      setValue(next);
    },
    [key],
  );
  return [value, set];
}
