import { downloadEventExcel } from "@/lib/payouts/excel-download";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return downloadEventExcel((await params).id, false);
}
