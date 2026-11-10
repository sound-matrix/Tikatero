import { formatIst } from "@/lib/format";

export type TimedResult = {
  code: string;
  scannedAt: string;
  result: string;
};

/**
 * Two offline scans of the same ticket: the earliest time is the check-in.
 * Later "Valid" results become "Already checked in at <IST time>".
 */
export function earliestWins<T extends TimedResult>(items: T[]): T[] {
  const winner = new Map<string, string>();
  for (const item of items) {
    if (item.result !== "Valid") continue;
    const current = winner.get(item.code);
    if (!current || item.scannedAt < current) winner.set(item.code, item.scannedAt);
  }
  return items.map((item) => {
    const at = winner.get(item.code);
    if (!at || item.result !== "Valid" || item.scannedAt <= at) return item;
    return { ...item, result: `Already checked in at ${formatIst(at)}` };
  });
}
