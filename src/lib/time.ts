/** All calendar timestamps use Beijing time; durations remain elapsed seconds. */
export const BEIJING_TIME_ZONE = 'Asia/Shanghai';
export function beijingTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  if (value == null || value === '') return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: BEIJING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')} 北京时间`;
}
export function beijingToday(value: Date = new Date()): string {
 return new Intl.DateTimeFormat('zh-CN', {timeZone: BEIJING_TIME_ZONE, month: 'long', day: 'numeric', weekday: 'long'}).format(value) + ' · 北京时间';
}
