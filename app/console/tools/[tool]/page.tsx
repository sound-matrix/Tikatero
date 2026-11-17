import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { Card } from "@/components/ui/card";

type Tool = "edit" | "sales" | "instagram" | "marketing" | "team" | "scan";
const tools: Record<Tool, { title: string; description: string; action: string }> = {
  edit: { title: "Edit events", description: "Update the details, posters, dates, tickets and publishing information for your events.", action: "Edit event" },
  sales: { title: "Ticket sales", description: "See your bookings, track ticket revenue and manage refund requests.", action: "View sales" },
  marketing: { title: "Marketing", description: "Generate branded QR posters and Instagram graphics, share event links and track referrals.", action: "Open marketing kit" },
  instagram: { title: "Instagram Ticket Sales", description: "Turn your Instagram audience into ticket buyers with Story, bio and sponsored ad links, promotional artwork and performance tracking.", action: "Promote on Instagram" },
  team: { title: "Event team", description: "Invite team managers and entrance staff, and control who can manage each event.", action: "Manage team" },
  scan: { title: "QR ticket scanner", description: "Scan Tikatero QR tickets at the venue entrance to check in your guests.", action: "Open scanner" },
};

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const { tool } = await params;
  if (!(tool in tools)) return { title: "Event tools" };
  return { title: tools[tool as Tool].title };
}

function destination(id: string, tool: Tool) {
  if (tool === "marketing") return `/console/events/${id}/marketing`;
  if (tool === "instagram") return `/console/events/${id}/instagram`;
  if (tool === "sales") return `/console/events/${id}`;
  return `/console/events/${id}/${tool}`;
}

async function EventTools({ params, searchParams }: {
  params: Promise<{ tool: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { tool: raw } = await params;
  if (!(raw in tools)) notFound();
  const tool = raw as Tool;
  const details = tools[tool];
  const { account, client } = await requireAccount();
  const organiserIds = account.organisers.map((o) => o.id);
  const assignments = account.assignments ?? [];
  const visibleIds = tool === "instagram" || tool === "marketing" || tool === "edit"
    ? []
    : assignments.filter((a) => tool === "scan" || a.role === "manager").map((a) => a.eventId);
  const [owned, assigned] = await Promise.all([
    organiserIds.length
      ? client.from("events").select("id,title,status,organiser_id").in("organiser_id", organiserIds).order("updated_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
    visibleIds.length
      ? client.from("events").select("id,title,status,organiser_id").in("id", visibleIds).limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (owned.error || assigned.error) throw new Error("Event tools could not be loaded.");
  const all = [...(owned.data ?? []), ...(assigned.data ?? [])];
  const rows = all.filter((event, i) => {
    if (all.findIndex((row) => row.id === event.id) !== i) return false;
    if (tool === "instagram" || tool === "marketing")
      return organiserIds.includes(event.organiser_id) && event.status === "published";
    return true;
  });
  const requested = (await searchParams).event;
  if (requested && /^[0-9a-f-]{36}$/i.test(requested)) {
    const match = rows.find((row) => row.id.toLowerCase() === requested.toLowerCase());
    if (match) redirect(destination(match.id, tool));
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header>
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">Organiser features</p>
        <h1 className="text-3xl font-extrabold">{details.title}</h1>
        <p className="mt-2 max-w-2xl text-muted">{details.description}</p>
      </header>
      <section aria-label="Choose an event" className="space-y-4">
        <h2 className="text-xl font-bold">Select an event</h2>
        {rows.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((event) => (
              <Card key={event.id}>
                <p className="text-xs font-bold uppercase tracking-wide text-teal">{event.status}</p>
                <h3 className="mt-2 text-lg font-bold">{event.title}</h3>
                <Link
                  href={destination(event.id, tool)}
                  className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-teal px-4 py-2 font-bold text-white"
                >
                  {details.action}
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="font-bold">
              {tool === "instagram" ? "Publish an event to start selling tickets on Instagram." : "No eligible events yet."}
            </p>
            <p className="mt-2 text-muted">
              {tool === "instagram"
                ? "Your published events will appear here with their Instagram promotion tools."
                : "Create an event or ask the event owner for the required team access."}
            </p>
            {organiserIds.length > 0 && (
              <Link href="/console/events/new" className="mt-4 inline-block font-semibold text-teal underline">
                Create an event
              </Link>
            )}
          </Card>
        )}
      </section>
    </main>
  );
}

export default function Page(props: {
  params: Promise<{ tool: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading event tools…</p>}>
      <EventTools {...props} />
    </Suspense>
  );
}
