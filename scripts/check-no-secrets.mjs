import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2] ?? ".next/static";
const forbiddenName = /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/;
const forbiddenValue = /sb_secret_[A-Za-z0-9_-]+/;
const serverValues = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SECRET_KEY,
].filter(Boolean);
let files = 0;
let leaks = false;

function hasPrivilegedJwt(text) {
  const candidates = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
  return candidates.some((token) => {
    try {
      return (
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role === "service_role"
      );
    } catch {
      return false;
    }
  });
}

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    const text = await readFile(path, "utf8");
    files++;
    if (
      forbiddenName.test(text) ||
      forbiddenValue.test(text) ||
      hasPrivilegedJwt(text) ||
      serverValues.some((value) => text.includes(value))
    ) {
      // Report only filenames, never matching text or values.
      console.error(`Server credential found in client asset: ${path}`);
      leaks = true;
    }
  }
}

try {
  await scan(root);
  if (!files) throw new Error("No client assets found");
  if (leaks) process.exitCode = 1;
  else console.log(`No server credentials found in ${files} client assets.`);
} catch {
  console.error("Client assets could not be checked. Run pnpm build first.");
  process.exitCode = 1;
}
