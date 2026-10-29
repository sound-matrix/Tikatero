import { activePricing } from "@/lib/pricing/data";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { readDraft, publicMediaBase, uploadsReady } from "@/lib/events/store";
import { EventWizard } from "./event-wizard";
import { Button } from "@/components/ui/button";
export async function EventEditor({
  id,
  searchParams,
}: {
  id?: string;
  searchParams: Promise<{ organiser?: string; step?: string }>;
}) {
  const { client, account } = await requireAccount();
  if (!account.organisers.length) redirect("/me");
  const params = await searchParams;
  const draft = id ? await readDraft(client, id) : null;
  if (id && !draft) notFound();
  const organiserId = draft?.organiserId ?? params.organiser ?? account.organisers[0].id;
  if (!account.organisers.some((o) => o.id === organiserId)) notFound();
  const { data: organisers, error } = await client
    .from("organisers")
    .select("id,display_name,kyc_status,sales_paused")
    .in(
      "id",
      account.organisers.map((o) => o.id),
    );
  const organiser = organisers?.find((o) => o.id === organiserId);
  if (error || !organiser) throw new Error("The organiser could not be loaded. Try again.");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host))
    throw new Error("The current site address could not be loaded.");
  const proto =
    h.get("x-forwarded-proto") === "http" ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1")
      ? "http"
      : "https";
  const requested = Number(params.step) - 1,
    initialStep =
      Number.isInteger(requested) && requested >= 0 && requested <= 7 && draft
        ? requested
        : (draft?.step ?? 0);
  return (
    <>
      {!draft && account.organisers.length > 1 && (
        <form className="mx-auto flex max-w-6xl flex-wrap items-end gap-3 px-4 pt-6 md:px-8">
          <label className="font-semibold">
            Create for organiser
            <select
              name="organiser"
              defaultValue={organiserId}
              className="ml-3 min-h-12 rounded-xl border border-line px-3"
            >
              {account.organisers.map((o) => (
                <option key={o.id} value={o.id}>
                  {organisers?.find((org) => org.id === o.id)?.display_name ?? "Organiser"}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Choose organiser</Button>
        </form>
      )}
      <EventWizard
        key={draft?.id ?? organiserId}
        id={id ?? randomUUID()}
        organiserId={organiserId}
        organiserName={organiser.display_name}
        approved={organiser.kyc_status === "approved"}
        paused={organiser.sales_paused}
        initial={draft}
        initialStep={initialStep}
        origin={`${proto}://${host}`}
        mediaBase={publicMediaBase()}
        uploadsConfigured={uploadsReady()}
        pricingVersion={await activePricing()}
      />
    </>
  );
}
