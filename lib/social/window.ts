function clockMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function istMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isoOffset(hours: number, now = Date.now()) {
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

export function istDay(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The end time is exclusive, so 21:30 waits until the next morning. */
export function insidePostWindow(now: Date, start: string, end: string) {
  const current = istMinutes(now);
  const open = clockMinutes(start);
  const close = clockMinutes(end);
  if (open === null || close === null || open >= close) return false;
  return current >= open && current < close;
}

export function nextWindowStart(now: Date, start: string) {
  const open = clockMinutes(start) ?? 9 * 60;
  const hour = String(Math.floor(open / 60)).padStart(2, "0");
  const minute = String(open % 60).padStart(2, "0");
  const startToday = new Date(`${istDay(now)}T${hour}:${minute}:00+05:30`);
  if (istMinutes(now) < open) return startToday;
  return new Date(startToday.getTime() + 24 * 60 * 60 * 1000);
}
