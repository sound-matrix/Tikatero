import { requireStaff } from "@/lib/admin/access";
import { uuid } from "@/lib/admin/model";
import { PRIVATE_BUCKET } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  await requireStaff();
  const client = createServiceClient();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!uuid(id)) return new Response(null, { status: 404 });
  const { data } = await client.from("payouts").select("proof_path").eq("id", id).maybeSingle();
  const path = data?.proof_path;
  if (!path || !/^payout-proofs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|png|jpg)$/.test(path))
    return new Response(null, { status: 404 });
  const { data: proof } = await createServiceClient().storage.from(PRIVATE_BUCKET).download(path);
  if (!proof) return new Response(null, { status: 404 });
  return new Response(proof, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="payment-proof.${path.split(".").pop()}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
