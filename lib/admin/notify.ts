import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { send } from "@/lib/email/send";
import { object, reviewStepLabels } from "./model";
export async function notifyAdminAction(auditId: string) {
  const service = createServiceClient();
  const { data: log, error } = await service
    .from("audit_log")
    .select("id,action,entity_id,after,reason")
    .eq("id", auditId)
    .single();
  if (error || !log) throw new Error("Notification could not be loaded.");
  const entityRef = `admin/${log.id}`;
  let ownerId = log.entity_id;
  let organiserName = "";
  let region: "IN" | "INTL" | undefined;
  let note = log.reason;
  if (log.action.startsWith("kyc_")) {
    const { data: app } = await service
      .from("kyc_applications")
      .select("organiser_id,region,reviewer_note,status,revision")
      .eq("id", log.entity_id!)
      .single();
    if (!app) throw new Error("Application not found.");
    const { data: org } = await service
      .from("organisers")
      .select("owner_id,display_name")
      .eq("id", app.organiser_id)
      .single();
    if (!org) throw new Error("Organiser not found.");
    region = app.region;
    if (
      region === "INTL" &&
      (app.revision === object(log.after).revision ||
        (app.status === "needs_docs" && log.action === "kyc_needs_docs"))
    )
      note = app.reviewer_note;
    ownerId = org.owner_id;
    organiserName = org.display_name;
  }
  if (!ownerId) throw new Error("Account not found.");
  const { data, error: userError } = await service.auth.admin.getUserById(ownerId);
  if (userError || !data.user?.email) throw new Error("This account has no email address.");
  const to = data.user.email;
  switch (log.action) {
    case "kyc_approved":
      return send({
        template: "kyc_approved",
        entityRef,
        to,
        data: {
          organiserName,
          actionPath: "/console",
          ...(region === "INTL" ? { international: true } : {}),
        },
      });
    case "kyc_rejected":
      return send({
        template: "kyc_rejected",
        entityRef,
        to,
        data: {
          organiserName,
          reason: note || "Your verification application could not be approved.",
          actionPath: "/console/pending",
        },
      });
    case "kyc_needs_docs": {
      const labels: Record<string, string> = reviewStepLabels(region);
      const flagged = object(log.after).flagged_steps;
      const requestedDocs: string[] = Array.isArray(flagged)
        ? flagged.filter((s): s is string => typeof s === "string").map((s) => labels[s] || s)
        : [];
      if (note) requestedDocs.push(`Note: ${note}`);
      return send({
        template: "kyc_needs_docs",
        entityRef,
        to,
        data: { organiserName, requestedDocs, actionPath: "/console/onboarding" },
      });
    }
    case "account_block":
    case "account_suspend":
      return send({
        template: "account_blocked",
        entityRef,
        to,
        data: { reason: log.reason || "Contact support for help.", actionPath: "/blocked" },
      });
    default:
      return null;
  }
}
