import { addDays, type ISODate } from '@app/core';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(date: ISODate) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Nov 24", or "Nov 24, 2027" outside this year. */
export function shortDate(date: ISODate, today: ISODate): string {
  const { y, m, d } = parts(date);
  const base = `${MONTHS[m - 1]} ${d}`;
  return y === parts(today).y ? base : `${base}, ${y}`;
}

/** "Wed, Nov 18". */
export function longDate(date: ISODate, today: ISODate): string {
  return `${WEEKDAYS[parts(date).weekday]}, ${shortDate(date, today)}`;
}

/** Today, Tomorrow, Yesterday, a weekday within the next six days, else a short date. */
export function dayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date > today && date <= addDays(today, 6)) return WEEKDAYS[parts(date).weekday]!;
  return shortDate(date, today);
}

export function weekdayShort(date: ISODate): string {
  return WEEKDAYS[parts(date).weekday]!;
}
