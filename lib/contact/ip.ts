import "server-only";

import { createHash } from "node:crypto";

/** Hash a caller address with an existing server secret. Never store the raw value. */
export function hashContactIp(ip: string) {
  const salt =
    process.env.TICKET_QR_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "tikatero-contact";
  return createHash("sha256").update(`contact-ip\n${salt}\n${ip}`).digest("hex");
}
