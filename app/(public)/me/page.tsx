import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OrganiserForm } from "@/components/auth/organiser-form";
import { signOut } from "./actions";
import { loadMyTickets, type MyTicket } from "@/lib/tickets/mine";

function TicketList({
  title,
  tickets,
  empty,
}: {
  title: string;
  tickets: MyTicket[];
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      {tickets.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        tickets.map((ticket) => (
          <Card key={ticket.code}>
            {ticket.isTest && <p className="font-bold text-gold-ink">TEST TICKET</p>}
            <h3 className="text-lg font-bold">{ticket.eventTitle}</h3>
            <p className="mt-1 text-muted">{ticket.whenLabel}</p>
            <p className={ticket.vip ? "mt-2 font-bold text-gold-ink" : "mt-2 font-semibold"}>
              {ticket.tierName}
              {ticket.vip ? " · VIP" : ""}
            </p>
            <p className="text-muted">{ticket.seat}</p>
            <Button className="mt-4" href={ticket.href} variant="primary">
              Open ticket
            </Button>
          </Card>
        ))
      )}
    </section>
  );
}

async function AccountContent() {
  const { account } = await requireAccount();
  const destination = landingPath(account);
  const tickets = await loadMyTickets(account.profile.id);
  const upcoming = tickets.filter((ticket) => !ticket.past);
  const past = tickets.filter((ticket) => ticket.past).reverse();
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold text-ink">Your account</h1>
      <p className="text-muted">
        Welcome{account.profile.full_name ? `, ${account.profile.full_name}` : " to Tikatero"}.
      </p>
      <TicketList
        title="Upcoming tickets"
        tickets={upcoming}
        empty="You don’t have any upcoming tickets."
      />
      <TicketList title="Past tickets" tickets={past} empty="You don’t have any past tickets." />
      <div className="flex flex-wrap gap-3">
        <Button href="/me/settings">Edit your details</Button>
        {destination !== "/me" && (
          <Button href={destination} variant="primary">
            {destination === "/admin" ? "Open Tikatero admin" : "Open organiser console"}
          </Button>
        )}
      </div>
      {destination === "/me" && (
        <Card>
          <h2 className="text-xl font-bold">Bring people together</h2>
          <p className="mt-2 text-muted">
            Create an organiser account. Your account starts as a draft while you get ready for
            verification.
          </p>
          <OrganiserForm />
        </Card>
      )}
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </main>
  );
}
export default function MePage() {
  return (
    <Suspense fallback={<p className="p-8">Loading your account…</p>}>
      <AccountContent />
    </Suspense>
  );
}
