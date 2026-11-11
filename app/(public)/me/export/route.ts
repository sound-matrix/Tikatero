import { readAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { presentAccountExport, type AccountExportRaw } from "@/lib/refunds/present";

export async function GET() {
  const client = await createClient();
  const account = await readAccount(client);
  if (!account) return new Response(null, { status: 401 });
  const { data, error } = await client.rpc("export_my_account");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return new Response(null, { status: 400 });
  }
  try {
    const body = presentAccountExport(data as AccountExportRaw);
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="tikatero-data.json"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
