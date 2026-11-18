import { timingSafeEqual } from "node:crypto";

export function cronAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET
    ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`)
    : null;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return Boolean(
    expected && expected.length === actual.length && timingSafeEqual(expected, actual),
  );
}
