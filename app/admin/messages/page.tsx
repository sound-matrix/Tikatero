import { Suspense } from "react";
import { requireStaff } from "@/lib/admin/access";
import { AdminPage } from "@/components/admin/page";
import { MarkReplied } from "@/components/admin/mark-replied";
import { Card } from "@/components/ui/card";
import { contactTopicLabel } from "@/lib/contact/topics";
import { formatIst } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";

async function Messages() {
  await requireStaff();
  const { data, error } = await createServiceClient()
    .from("contact_messages")
    .select("id, created_at, name, email, phone, topic, order_ref, message, status")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (error) throw new Error("Messages could not be loaded. Try again.");
  const rows = data ?? [];
  return (
    <AdminPage
      title="Messages"
      description="Messages from the contact form, newest first. You can mark one as replied."
    >
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Contact messages</caption>
          <thead className="bg-soft text-muted">
            <tr>
              {["Topic", "Name", "Email", "Received (IST)", "Status"].map((heading) => (
                <th key={heading} scope="col" className="p-4">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="p-4 font-semibold">{contactTopicLabel(row.topic)}</td>
                <td className="p-4">
                  <span className="font-semibold">{row.name}</span>
                  {row.phone ? <small className="mt-1 block text-muted">{row.phone}</small> : null}
                </td>
                <td className="p-4 break-all">{row.email}</td>
                <td className="p-4 whitespace-nowrap">{formatIst(row.created_at)}</td>
                <td className="p-4">
                  <p className="mb-3 font-semibold">
                    {row.status === "replied" ? "Replied" : "New"}
                  </p>
                  {row.status === "new" ? <MarkReplied id={row.id} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length ? null : <p className="p-8 text-muted">No messages yet.</p>}
      </Card>
      <div className="space-y-4">
        {rows.map((row) => (
          <Card key={`${row.id}-body`}>
            <h2 className="font-bold text-ink">
              {contactTopicLabel(row.topic)} — {row.name}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-ink">{row.message}</p>
            {row.order_ref ? (
              <p className="mt-3 text-sm text-muted">Order or ticket ID: {row.order_ref}</p>
            ) : null}
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8">Loading messages…</p>}>
      <Messages />
    </Suspense>
  );
}
