const inrGrouping = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const istDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});

/**
 * Format an integer number of paise as Indian rupees.
 * Whole rupees omit the decimal; leftover paise always show two digits.
 * Example: 100000 → ₹1,000
 */
export function formatInr(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new RangeError("Price must be an integer number of paise");
  }

  const negative = paise < 0;
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const grouped = inrGrouping.format(rupees);
  const amount = remainder === 0 ? grouped : `${grouped}.${String(remainder).padStart(2, "0")}`;

  return `${negative ? "-" : ""}₹${amount}`;
}

/**
 * Format an instant in India Standard Time.
 * Example: 2026-11-07T12:30:00.000Z → 7 Nov 2026, 6:00 PM IST
 */
export function formatIst(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }

  const parts = istDateTime.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const dayPeriod = value("dayPeriod").toUpperCase();
  return `${value("day")} ${value("month")} ${value("year")}, ${value("hour")}:${value("minute")} ${dayPeriod} IST`;
}
