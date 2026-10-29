import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

// Never use this client for user requests that can be served through RLS.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server Supabase credentials are not configured.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
