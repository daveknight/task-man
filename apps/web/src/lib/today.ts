import { isValidDate, localDate, type ISODate } from '@app/core';
import { useEffect, useState } from 'react';

/** Dev-only `?today=YYYY-MM-DD`, matching the CLI's --today. */
export function pinnedToday(): ISODate | null {
  const param = new URLSearchParams(window.location.search).get('today');
  return import.meta.env.DEV && param && isValidDate(param) ? param : null;
}

/**
 * The device's local calendar day. The board re-derives its sections at local midnight and when the
 * app comes back to the foreground, so tasks move between sections without a refresh.
 */
export function useToday(): ISODate {
  const pinned = pinnedToday();
  const [today, setToday] = useState(() => pinned ?? localDate());

  useEffect(() => {
    if (pinned) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setToday(localDate());
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      clearTimeout(timer);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    };
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pinned]);

  return today;
}

export function toDate(day: ISODate): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function fromDate(date: Date): ISODate {
  return localDate(date);
}