import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Capture locally generated CLI output in memory. Do not print credentials.
const status = execFileSync("supabase", ["status", "-o", "env"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const values = Object.fromEntries(
  status.split("\n").flatMap((line) => {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line);
    return match ? [[match[1], match[2]]] : [];
  }),
);
if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY)
  throw new Error("Local Supabase credentials are unavailable.");
writeFileSync(
  ".env.local",
  [
    `NEXT_PUBLIC_SUPABASE_URL=${values.API_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${values.ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${values.SERVICE_ROLE_KEY}`,
    "AUTH_E2E_REQUIRED=1",
    "KYC_MODE=mock",
  ].join("\n") + "\n",
  { mode: 0o600 },
);
console.log("Local auth test environment prepared.");
