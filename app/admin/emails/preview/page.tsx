import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";
import { templateNames, templateLabel, emailSiteUrl } from "@/lib/email/templates";
import { emailSamples } from "@/lib/email/samples";
import { renderEmail } from "@/lib/email/render";

export const metadata = { title: "Email previews" };

async function Gallery() {
  const { client, account } = await requireAccount();
  const { data: staff, error } = await client.rpc("is_staff");
  if (error) throw new Error("Email previews could not be loaded. Please try again.");
  if (!staff) redirect(landingPath(account));
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const siteUrl = emailSiteUrl(
    process.env.NEXT_PUBLIC_SITE_URL || `${local ? "http" : "https"}://${host}`,
    true,
  ).origin;
  const previews = await Promise.all(
    templateNames.map(async (name) => ({
      name,
      ...(await renderEmail(name, emailSamples[name], siteUrl)),
    })),
  );
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
      <h1 className="text-3xl font-extrabold text-ink">Email previews</h1>
      <p className="mt-3 text-muted">
        Sample messages only. Opening this page does not send email.
      </p>
      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        {previews.map((preview) => (
          <article
            key={preview.name}
            id={preview.name}
            className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white"
          >
            <header className="border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold text-ink">{templateLabel(preview.name)}</h2>
              <p className="mt-1 text-sm text-muted">Subject: {preview.subject}</p>
            </header>
            <iframe
              title={`${preview.name} email preview`}
              srcDoc={preview.html}
              sandbox=""
              referrerPolicy="no-referrer"
              className="block h-[980px] w-full border-0"
            />
          </article>
        ))}
      </div>
    </main>
  );
}
export default function EmailPreviewsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading email previews…</p>}>
      <Gallery />
    </Suspense>
  );
}
