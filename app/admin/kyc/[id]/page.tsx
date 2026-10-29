import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/access";
import { checks, isSimulated, statusLabels, waitingStatuses, uuid } from "@/lib/admin/model";
import { createServiceClient } from "@/lib/supabase/service";
import { formatIst } from "@/lib/format";
import { AdminPage } from "@/components/admin/page";
import { ReviewForm } from "@/components/admin/forms";
import { DocumentPreview } from "@/components/admin/document-preview";
import { Card } from "@/components/ui/card";
async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { client, account } = await requireStaff();
  const { id } = await params;
  if (!uuid(id)) notFound();
  const { data: app, error } = await client
    .from("kyc_applications")
    .select(
      "id,organiser_id,status,step_progress,revision,flagged_steps,reviewer_note,submitted_at,decided_at,pan_last4,aadhaar_last4,gstin,bank_acct_last4,pan_name,bank_holder_name,pan_name_match,liveness_score,face_match_score",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("This application could not be loaded.");
  if (!app) notFound();
  const { data: org, error: orgError } = await client
    .from("organisers")
    .select("id,display_name,legal_name,owner_id")
    .eq("id", app.organiser_id)
    .single();
  if (orgError || !org) throw new Error("The organiser could not be loaded.");
  const { data: membership, error: memberError } = await client
    .from("organiser_members")
    .select("id")
    .eq("organiser_id", org.id)
    .eq("user_id", account.profile.id)
    .limit(1);
  if (memberError) throw new Error("Review permissions could not be loaded.");
  const own = org.owner_id === account.profile.id || !!membership?.length;
  // PR 2 deliberately hides doc_keys; fetch only those after staff authorization.
  const { data: docs, error: docsError } = await createServiceClient()
    .from("kyc_applications")
    .select("doc_keys")
    .eq("id", id)
    .single();
  if (docsError) throw new Error("Document references could not be loaded.");
  const results = checks(app.step_progress).map((c) => ({
    ...c,
    last4:
      c.last4 ??
      (c.key === "pan"
        ? app.pan_last4
        : c.key === "aadhaar"
          ? app.aadhaar_last4
          : c.key === "gstin"
            ? app.gstin
            : c.key === "bank"
              ? app.bank_acct_last4
              : null
      )?.slice(-4),
  }));
  const docKeys = [
    ...new Set([
      ...(docs?.doc_keys ?? []),
      ...results.flatMap((c) => (c.docKey ? [c.docKey] : [])),
    ]),
  ];
  const waiting = (waitingStatuses as readonly string[]).includes(app.status) && !!app.submitted_at;
  return (
    <AdminPage title={org.display_name} description="Verification review · India">
      <Link href="/admin/kyc" className="text-teal underline">
        ← Back to queue
      </Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{org.legal_name || "Legal name not provided"}</h2>
            <p className="mt-1 text-muted">{statusLabels[app.status]}</p>
            {app.submitted_at && (
              <p className="mt-2 text-sm text-muted">Submitted {formatIst(app.submitted_at)}</p>
            )}
          </div>
          {isSimulated(app.step_progress) && (
            <span className="rounded-full bg-soft px-4 py-2 font-semibold">
              Test mode — simulated
            </span>
          )}
        </div>
        <p className="mt-4 text-sm text-muted">
          Identity numbers show the last 4 characters only. A simulated pass is not a real
          verification.
        </p>
      </Card>
      <section aria-label="Verification checks" className="grid gap-4 lg:grid-cols-2">
        {results.map((c) => (
          <Card key={c.key}>
            <div className="flex justify-between gap-3">
              <h2 className="text-lg font-bold">{c.label}</h2>
              <span className={c.completed && c.passed ? "font-semibold text-teal" : "text-muted"}>
                {c.skipped
                  ? "Skipped (optional)"
                  : c.completed
                    ? c.passed
                      ? "Passed"
                      : "Needs review"
                    : "No saved check"}
              </span>
            </div>
            {c.simulated && <p className="mt-2 text-sm text-muted">Test mode — simulated</p>}
            {c.last4 && <p className="mt-3">Number: •••• {c.last4}</p>}
            {c.name && <p className="mt-2">Name: {c.name}</p>}
            {c.score !== null && (
              <p className="mt-2">
                {c.key === "selfie" ? "Liveness" : "Name match"}: {c.score}%
              </p>
            )}
            {c.faceScore !== null && <p className="mt-2">Face match: {c.faceScore}%</p>}
          </Card>
        ))}
      </section>
      <Card>
        <h2 className="mb-4 text-xl font-bold">Private documents & selfie</h2>
        {docKeys.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {docKeys.map((key, index) => (
              <DocumentPreview
                key={key}
                docKey={key}
                label={results.find((c) => c.docKey === key)?.label ?? `document ${index + 1}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted">
            No uploaded documents. Mock checks may have no real document or selfie.
          </p>
        )}
      </Card>
      <Card>
        {app.reviewer_note && (
          <p className="mb-4 rounded-xl bg-soft p-4">Previous note: {app.reviewer_note}</p>
        )}
        {own && <p className="mb-4 font-semibold">You cannot review your own organiser.</p>}
        {!waiting && <p className="mb-4 text-muted">This application is not waiting for review.</p>}
        <ReviewForm id={id} revision={app.revision} disabled={own || !waiting} />
      </Card>
    </AdminPage>
  );
}
export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading verification details…</p>}>
      <Detail {...props} />
    </Suspense>
  );
}
