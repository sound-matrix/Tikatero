"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";
import { publicSupabaseEnv } from "./env";

export function createClient() {
  const { url, key } = publicSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}
