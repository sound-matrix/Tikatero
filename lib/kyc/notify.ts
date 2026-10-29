import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { send } from "@/lib/email/send";
import type { Application } from "./model";
export async function notifyKycSubmitted(application: Application) {
  const service = createServiceClient();
  const { data: org } = await service
    .from("organisers")
    .select("owner_id,display_name")
    .eq("id", application.organiser_id)
    .single();
  if (!org) return;
  const entityRef = `kyc/${application.id}/submission/${application.submission_count}`;
  const { data: owner } = await service.auth.admin.getUserById(org.owner_id);
  const work: Promise<unknown>[] = [];
  if (owner.user?.email)
    work.push(
      send({
        template: "kyc_submitted",
        entityRef,
        to: owner.user.email,
        data: { organiserName: org.display_name, actionPath: "/console/pending" },
      }),
    );
  const { data: staff } = await service
    .from("profiles")
    .select("id")
    .in("role", ["staff", "admin"])
    .is("blocked_at", null);
  for (const member of staff ?? []) {
    const { data } = await service.auth.admin.getUserById(member.id);
    if (data.user?.email)
      work.push(
        send({
          template: "staff_alert",
          entityRef,
          to: data.user.email,
          data: {
            title: "An organiser is ready for verification",
            summary:
              "An India verification application has been submitted. Please check the saved results and documents before approving.",
            entityLabel: application.id,
            actionPath: "/admin/organisers",
          },
        }),
      );
  }
  await Promise.allSettled(work);
}
