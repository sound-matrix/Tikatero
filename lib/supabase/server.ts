import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/db/types";
import { publicSupabaseEnv } from "./env";

// Supabase constructors read the clock before reading storage. Defer them until
// request time so Cache Components never tries to prerender session work.
export async function createClient() {
  await connection();
  const store = await cookies();
  const { url, key } = publicSupabaseEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        // Server Components cannot write cookies. Proxy refreshes them before render;
        // route handlers and server actions can persist sign-in/sign-out cookies here.
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Read-only Server Component cookie store.
        }
      },
    },
  });
}
