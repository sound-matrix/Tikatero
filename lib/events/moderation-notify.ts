import "server-only";

import { send } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/service";

export async function notifyRemovalRequested(
  event: { id: string; title: string },
  requestId: string,
) {
  const service = createServiceClient();
  const { data: staff } = await service
    .from("profiles")
    .select("id")
    .in("role", ["staff", "admin"])
    .is("blocked_at", null);
  await Promise.allSettled(
    (staff ?? []).map(async ({ id }) => {
      const { data } = await service.auth.admin.getUserById(id);
      if (!data.user?.email) return;
      await send({
        template: "staff_alert",
        entityRef: `event-removal/${requestId}`,
        to: data.user.email,
        data: {
          title: "An event removal request needs review",
          summary: `The organiser asked Tikatero to cancel ${event.title}.`,
          entityLabel: event.title,
          actionPath: `/admin/events/${event.id}`,
        },
      });
    }),
  );
}

export async function notifyHost(
  event: { id: string; title: string; organiser_id: string },
  template: "event_hidden_by_admin" | "event_removal_approved" | "event_removal_rejected",
  reason: string,
  revision: string,
) {
  const service = createServiceClient();
  const { data: host } = await service
    .from("organisers")
    .select("owner_id")
    .eq("id", event.organiser_id)
    .single();
  if (!host) return;
  const { data } = await service.auth.admin.getUserById(host.owner_id);
  if (!data.user?.email) return;
  await send({
    template,
    entityRef: `event/${event.id}/${revision}`,
    to: data.user.email,
    data: { eventTitle: event.title, reason, actionPath: `/console/events/${event.id}` },
  });
}
