/** Treat formula markers and control characters at the start of user-entered cells as text. */
export function spreadsheetText(value: string) {
  return /^(?:[\t\r\n]|\s*[=+\-@＝＋－＠])/u.test(value) ? `'${value}` : value;
}

const IST_OFFSET = (5 * 60 + 30) * 60 * 1000;

/** Excel dates have no time zone. Shift the stored instant so Excel displays Indian time. */
export function excelIstDate(value: string | null) {
  if (value === null) return null;
  return new Date(Date.parse(value) + IST_OFFSET);
}

export function istDateStamp(date: Date) {
  return new Date(date.getTime() + IST_OFFSET).toISOString().slice(0, 10);
}

export function excelRupees(paise: number) {
  if (!Number.isSafeInteger(paise)) throw new RangeError("Money must be a whole number of paise.");
  return paise / 100;
}
