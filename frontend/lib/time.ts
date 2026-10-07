const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dayMonthFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

const dayMonthYearFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

const DAY_MS = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

export function formatBubbleTime(ts: number): string {
  return timeFmt.format(new Date(ts));
}

export function dayLabel(ts: number, now: number = Date.now()): string {
  if (isSameDay(ts, now)) return 'Today';
  if (isSameDay(ts, now - DAY_MS)) return 'Yesterday';
  const daysAgo = Math.floor((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (daysAgo < 7) return weekdayFmt.format(new Date(ts));
  return formatListTime(ts, now);
}

export function formatListTime(ts: number, now: number = Date.now()): string {
  if (isSameDay(ts, now)) return timeFmt.format(new Date(ts));
  if (isSameDay(ts, now - DAY_MS)) return 'Yesterday';
  const monthsAgo = (now - ts) / (30 * DAY_MS);
  if (monthsAgo < 6) return dayMonthFmt.format(new Date(ts));
  return dayMonthYearFmt.format(new Date(ts));
}
