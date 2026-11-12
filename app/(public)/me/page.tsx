import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OrganiserForm } from "@/components/auth/organiser-form";
import { signOut } from "./actions";
import { loadMyTickets, type MyTicket } from "@/lib/tickets/mine";
import { loadMyOrders } from "@/lib/refunds/account";
import { requestBuyerRefund } from "@/lib/refunds/actions";

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
            <p className="mt-2 font-semibold">{ticket.statusLabel}</p>
            {ticket.canEnter ? (
              <Button className="mt-4" href={ticket.href} variant="primary">
                Open ticket
              </Button>
            ) : (
              <p className="mt-3 text-sm text-muted">This ticket cannot be used for entry.</p>
            )}
          </Card>
        ))
      )}
    </section>
  );
}

async function AccountContent({ notice, error }: { notice?: string; error?: string }) {
  const { account } = await requireAccount();
  const destination = landingPath(account);
  const tickets = await loadMyTickets(account.profile.id);
  const orders = await loadMyOrders(account.profile.id);
  const upcoming = tickets.filter((ticket) => !ticket.past);
  const past = tickets.filter((ticket) => ticket.past).reverse();
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold text-ink">Your account</h1>
      <p className="text-muted">
        Welcome{account.profile.full_name ? `, ${account.profile.full_name}` : " to Tikatero"}.
      </p>
      {notice && <p className="font-semibold text-teal">{notice}</p>}
      {error && (
        <p className="font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
      <section className="space-y-3" data-testid="my-orders">
        <h2 className="text-xl font-bold">Your orders</h2>
        {orders.length === 0 ? (
          <p className="text-muted">You don’t have any orders yet.</p>
        ) : (
          orders.map((order) => (
            <Card key={order.id}>
              <h3 className="text-lg font-bold">{order.eventTitle}</h3>
              {order.isTest && <p className="font-bold text-gold-ink">Test booking</p>}
              <p className="mt-1 text-muted">{order.whenLabel}</p>
              <p className="mt-2 font-semibold">
                {order.totalLabel} · {order.statusLabel}
              </p>
              <p className="text-muted">Paid {order.paidLabel}</p>
              <p className="mt-2 text-sm text-muted">{order.policyText}</p>
              {order.refunds.map((refund) => (
                <p
                  key={refund.id}
                  className="mt-3 rounded-xl bg-soft p-3"
                  data-testid="refund-status"
                >
                  {refund.amountLabel} · {refund.whenLabel}. {refund.copy}
                </p>
              ))}
              {order.canRequest ? (
                <form action={requestBuyerRefund} className="mt-4">
                  <input type="hidden" name="order_id" value={order.id} />
                  <Button type="submit" variant="primary">
                    Request a refund
                  </Button>
                </form>
              ) : (
                order.requestReason && (
                  <p className="mt-3 text-sm text-muted">{order.requestReason}</p>
                )
              )}
            </Card>
          ))
        )}
      </section>
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
      <Button href="/me/profile">My profile</Button>
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </main>
  );
}
export default function MePage({
  searchParams,
}: {
  searchParams: Promise<{ refund?: string; refund_error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading your account…</p>}>
      <MeNotice searchParams={searchParams} />
    </Suspense>
  );
}

async function MeNotice({
  searchParams,
}: {
  searchParams: Promise<{ refund?: string; refund_error?: string }>;
}) {
  const query = await searchParams;
  return (
    <AccountContent
      notice={query.refund === "updated" ? "Your refund has been updated." : undefined}
      error={query.refund_error}
    />
  );
}
