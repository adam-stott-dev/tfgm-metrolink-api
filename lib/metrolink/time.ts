// Timetable times are UK local time; these helpers convert between that and real instants.

export const TIME_ZONE = 'Europe/London';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface LocalParts {
  /** YYYYMMDD */
  date: string;
  /** Seconds since local midnight */
  seconds: number;
}

export function toLocalParts(instant: Date): LocalParts {
  const p = Object.fromEntries(partsFormatter.formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}${p.month}${p.day}`,
    seconds: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second),
  };
}

/** UTC offset of Europe/London at the given instant, in milliseconds. */
function offsetAt(instant: Date): number {
  const p = Object.fromEntries(partsFormatter.formatToParts(instant).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Convert a service date + seconds since local midnight (may exceed 24h) to a real instant. */
export function localToInstant(date: string, seconds: number): Date {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  const naive = Date.UTC(y, m - 1, d) + seconds * 1000;
  // Two passes handle instants near a DST change.
  let guess = naive - offsetAt(new Date(naive));
  guess = naive - offsetAt(new Date(guess));
  return new Date(guess);
}

/** YYYYMMDD of the day before/after. */
export function shiftDate(date: string, days: number): string {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)) + days);
  return new Date(t).toISOString().slice(0, 10).replaceAll('-', '');
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(date: string): number {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
  return (new Date(t).getUTCDay() + 6) % 7;
}

/** ISO 8601 string with the Europe/London offset, e.g. 2026-10-17T18:20:00+01:00 */
export function formatLocalIso(instant: Date): string {
  const p = Object.fromEntries(partsFormatter.formatToParts(instant).map((x) => [x.type, x.value]));
  const offsetMin = Math.round(offsetAt(instant) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}

export function formatDate(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}
