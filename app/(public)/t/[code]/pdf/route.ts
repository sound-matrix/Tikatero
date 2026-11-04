import { NextResponse } from "next/server";
import { privateStorageConfigured, signTicketPdf } from "@/lib/r2";
import { loadTicketPdf } from "@/lib/tickets/load";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const token = new URL(request.url).searchParams.get("t") ?? undefined;
  const result = await loadTicketPdf(code, token);
  if (!result) return new Response(null, { status: 404 });
  const filename = `${result.loaded.facts.code}.pdf`;
  if (result.loaded.pdfKey && privateStorageConfigured()) {
    try {
      const url = await signTicketPdf(result.loaded.pdfKey, filename);
      const redirect = NextResponse.redirect(url, 302);
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    } catch {
      // The stored file is unavailable. Send a fresh copy from this request.
    }
  }
  if (!result.pdf) return new Response(null, { status: 503 });
  return new Response(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
