import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { publicSupabaseEnv } from "./env";
/** Public read client: no cookies, user session or service key, including for signed-in visitors. */
export function createAnonClient() {
  const { url, key } = publicSupabaseEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
