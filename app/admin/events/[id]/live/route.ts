import { liveSalesResponse } from "@/lib/payouts/live-response";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return liveSalesResponse((await params).id, true);
}
