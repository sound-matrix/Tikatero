import Link from "next/link";
import { Suspense } from "react";
import { AdminPage } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/admin/access";
import { uuid } from "@/lib/admin/model";
import { formatInr, formatIst } from "@/lib/format";
import { adminPayouts, paymentDate, type AdminHost } from "@/lib/payouts/earnings";
import { istDateStamp } from "@/lib/payouts/spreadsheet";
import { PayoutForm, RevealBank } from "./form";

type Params = { test?: string; event?: string; host?: string; filter?: string; sort?: string };
type Props = { searchParams: Promise<Params> };
const input = "w-full rounded-lg border border-line bg-white px-3 py-2";

function Scope({ host, test, operation }: { host: AdminHost; test: boolean; operation: string }) {
  return (
    <>
      <input type="hidden" name="host" value={host.id} />
      <input type="hidden" name="test" value={String(test)} />
      <input type="hidden" name="operation" value={operation} />
      <label className="block">
        Event
        <select name="event" className={input}>
          <option value="">All events</option>
          {host.events
            .filter((event) => event.event_id)
            .map((event) => (
              <option key={event.event_id} value={event.event_id!}>
                {event.title}
              </option>
            ))}
        </select>
      </label>
    </>
  );
}

function HostRow({
  host,
  test,
  query,
}: {
  host: AdminHost;
  test: boolean;
  query: URLSearchParams;
}) {
  const trail = new URLSearchParams(query);
  trail.set("host", host.id);
  return (
    <Card className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <h2 className="text-xl font-bold">{host.display_name}</h2>
          <p className="text-sm text-muted">Host ID {host.id}</p>
          <p>
            ID {host.kyc_status} · Bank check {host.bank_passed ? "passed" : "pending or failed"}
          </p>
          {host.payouts_on_hold && <p className="font-semibold text-danger">Payments on hold</p>}
        </div>
        <div>
          <p>{host.bank_holder_name ?? "Bank account pending"}</p>
          {host.bank_acct_last4 && (
            <p>
              Ending {host.bank_acct_last4} · {host.bank_ifsc}
            </p>
          )}
          {host.bank_passed && <RevealBank host={host.id} test={test} />}
        </div>
        <div>
          <p>
            Payable now{" "}
            <strong>{formatInr(host.payouts_on_hold ? 0 : host.available_paise)}</strong>
          </p>
          <p>
            {host.payouts_on_hold ? "On hold" : "Not yet available"}{" "}
            {formatInr(host.payouts_on_hold ? Math.max(0, host.remaining_paise) : host.later_paise)}
          </p>
          {host.remaining_paise < 0 && <p>Balance {formatInr(host.remaining_paise)}</p>}
          <p>Oldest unpaid {host.oldest_at ? formatIst(host.oldest_at) : "—"}</p>
          <Link href={`/admin/payouts?${trail}`} className="text-teal underline">
            View earnings trail
          </Link>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer font-semibold">By event</summary>
        <ul className="mt-2 space-y-2">
          {host.events.map((event) => (
            <li key={event.event_id ?? "host"}>
              {event.title ?? "Host balance"} · {formatInr(event.available_paise)} available ·{" "}
              {formatInr(event.remaining_paise)} remaining
            </li>
          ))}
        </ul>
      </details>
      {!host.payouts_on_hold && host.bank_passed && host.kyc_status === "approved" && (
        <details>
          <summary className="cursor-pointer font-semibold">Mark as paid</summary>
          <PayoutForm className="mt-3 max-w-lg">
            <Scope host={host} test={test} operation="pay" />
            <label className="block">
              Amount (₹)
              <input className={input} name="amount" inputMode="decimal" required />
            </label>
            <label className="block">
              Method
              <select className={input} name="method">
                {["NEFT", "IMPS", "RTGS", "UPI", "Other"].map((method) => (
                  <option key={method} value={method.toLowerCase()}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Bank reference (UTR)
              <input name="reference" className={input} maxLength={80} required />
            </label>
            <label className="block">
              Paid on (IST)
              <input
                name="paidOn"
                className={input}
                type="date"
                max={istDateStamp(new Date())}
                required
              />
            </label>
            <label className="block">
              Note
              <input className={input} name="note" maxLength={1000} />
            </label>
            <label className="block">
              Transfer proof (optional)
              <input
                className={input}
                name="proof"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
              />
            </label>
            <label className="flex gap-2">
              <input name="override" type="checkbox" /> Override the available amount
            </label>
            <label className="block">
              Override reason
              <input className={input} name="reason" maxLength={1000} />
            </label>
            <Button type="submit" variant="primary">
              Record payment
            </Button>
          </PayoutForm>
        </details>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">Host payment mode</summary>
        <PayoutForm className="mt-3 max-w-lg">
          <input type="hidden" name="host" value={host.id} />
          <input type="hidden" name="operation" value="mode" />
          <label className="block">
            Mode
            <select name="mode" className={input} defaultValue={host.payout_mode_override ?? ""}>
              <option value="">Platform default</option>
              <option value="manual">Manual bank transfer</option>
              <option value="gateway_split">Gateway split</option>
            </select>
          </label>
          <label className="block">
            Reason
            <input className={input} name="reason" maxLength={1000} required />
          </label>
          <Button type="submit">Save host payment mode</Button>
        </PayoutForm>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold">Adjust earnings</summary>
        <PayoutForm className="mt-3 max-w-lg">
          <Scope host={host} test={test} operation="adjust" />
          <label className="block">
            Signed amount (₹)
            <input className={input} name="amount" inputMode="decimal" required />
          </label>
          <label className="block">
            Reason
            <input className={input} name="reason" maxLength={1000} required />
          </label>
          <Button type="submit">Record adjustment</Button>
        </PayoutForm>
      </details>
    </Card>
  );
}

async function Payouts({ searchParams }: Props) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const test = params.test === "true";
  const event = params.event && uuid(params.event) ? params.event : null;
  const host = params.host && uuid(params.host) ? params.host : null;
  const { hosts, history, entries } = await adminPayouts(client, test, event, host);
  const query = new URLSearchParams();
  if (test) query.set("test", "true");
  if (event) query.set("event", event);
  const visible = hosts
    .filter((row) =>
      params.filter === "held"
        ? row.payouts_on_hold
        : params.filter === "available"
          ? !row.payouts_on_hold && row.available_paise > 0
          : true,
    )
    .sort((a, b) =>
      params.sort === "oldest"
        ? (a.oldest_at ?? "~").localeCompare(b.oldest_at ?? "~")
        : b.available_paise - a.available_paise,
    );
  const bankQuery = new URLSearchParams(event ? { event } : {});
  return (
    <AdminPage
      title={host ? "Host earnings trail" : "Host payouts"}
      description="Review earnings, then record each bank transfer after it has been sent."
    >
      <Card>
        <form className="flex flex-wrap items-end gap-4">
          {host && <input type="hidden" name="host" value={host} />}
          <label>
            Records
            <select className={input} name="test" defaultValue={String(test)}>
              <option value="false">Real</option>
              <option value="true">Test</option>
            </select>
          </label>
          <label>
            Status
            <select className={input} name="filter" defaultValue={params.filter ?? ""}>
              <option value="">All</option>
              <option value="available">Payable now</option>
              <option value="held">On hold</option>
            </select>
          </label>
          <label>
            Event
            <select className={input} name="event" defaultValue={event ?? ""}>
              <option value="">All events</option>
              {Array.from(
                new Map(
                  hosts
                    .flatMap((row) => row.events)
                    .filter((item) => item.event_id)
                    .map((item) => [item.event_id!, item.title]),
                ),
              ).map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select className={input} name="sort" defaultValue={params.sort ?? ""}>
              <option value="">Amount</option>
              <option value="oldest">Oldest unpaid</option>
            </select>
          </label>
          <Button type="submit">Apply filters</Button>
        </form>
        {!test && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button href={`/admin/payouts/bank-sheet?${bankQuery}`} prefetch={false}>
              Bank transfer CSV
            </Button>
            <Button
              href={`/admin/payouts/bank-sheet?${new URLSearchParams([...bankQuery, ["format", "xlsx"]])}`}
              prefetch={false}
            >
              Bank transfer Excel
            </Button>
          </div>
        )}
        {host && (
          <Link className="mt-4 block text-teal underline" href={`/admin/payouts?${query}`}>
            All hosts
          </Link>
        )}
      </Card>
      {test && (
        <p className="rounded-xl bg-gold-soft p-3">
          Test payments. Use these records for testing only.
        </p>
      )}
      {!visible.length && <p>No hosts match these filters.</p>}
      {visible.map((row) => (
        <HostRow key={row.id} host={row} test={test} query={query} />
      ))}
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Payment history</h2>
        {!history.length && <p className="text-muted">No transfers recorded.</p>}
        {history.map((row) => (
          <details key={row.id} className="border-t border-line pt-3">
            <summary className="cursor-pointer font-semibold">
              {paymentDate(row)} · {formatInr(row.amount_paise)} · {row.bank_reference}{" "}
              {row.voided_at ? "· Voided" : ""}
            </summary>
            <div className="mt-2 space-y-2">
              <p>
                {row.event_title ?? "All events"} · {row.method?.toUpperCase()} · Recorded by{" "}
                {row.paid_by}
              </p>
              {row.note && <p>{row.note}</p>}
              {row.proof_path && (
                <a className="text-teal underline" href={`/admin/payouts/proof?id=${row.id}`}>
                  Download transfer proof
                </a>
              )}
              {row.voided_at ? (
                <p>
                  Voided {formatIst(row.voided_at)} by {row.voided_by}. {row.void_reason}
                </p>
              ) : (
                <PayoutForm className="max-w-lg">
                  <input type="hidden" name="operation" value="void" />
                  <input type="hidden" name="payout" value={row.id} />
                  <label className="block">
                    Type bank reference to confirm
                    <input name="reference" className={input} required />
                  </label>
                  <label className="block">
                    Void reason
                    <input name="reason" className={input} maxLength={1000} required />
                  </label>
                  <Button type="submit">Void payment record</Button>
                </PayoutForm>
              )}
            </div>
          </details>
        ))}
      </Card>
      {host && (
        <Card className="overflow-x-auto">
          <h2 className="mb-4 text-xl font-bold">Earnings entries</h2>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr>
                {[
                  "Date",
                  "Event",
                  "Entry",
                  "Amount",
                  "Running balance",
                  "Available from",
                  "Actor",
                  "Note",
                ].map((label) => (
                  <th key={label} className="p-2" scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-line">
                  {[
                    formatIst(entry.created_at),
                    entry.event_title,
                    entry.kind.replaceAll("_", " "),
                    formatInr(entry.amount_paise),
                    formatInr(entry.balance_paise),
                    formatIst(entry.available_at),
                    entry.created_by,
                    entry.note,
                  ].map((value, index) => (
                    <td className="p-2" key={index}>
                      {value ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AdminPage>
  );
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p className="p-8">Loading host payouts…</p>}>
      <Payouts {...props} />
    </Suspense>
  );
}
