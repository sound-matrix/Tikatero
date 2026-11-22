import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { send } from "@/lib/email/send";
import { promotionEmailConfigured, signUnsubscribe } from "./unsubscribe";

export async function runPromotionsEmailCron() {
  // Feature is opt-in and disabled until owner configures the mailer, token
  // secret, and explicitly enables promotional delivery in Production.
  if (!promotionEmailConfigured())
    return { enabled: false, claimed: 0, sent: 0, failed: 0 };
  const client = createServiceClient();
  const { data, error } = await client.rpc("promotion_claim_emails", { p_limit: 10 });
  if (error || !data) throw new Error("Smart Promotions claim failed.");
  let sent = 0;
  let failed = 0;
  for (const row of data) {
    let success = false;
    try {
      // Re-check consent at send time, not only at scheduling.
      const { data: preference, error: preferenceError } = await client
        .from("marketing_preferences")
        .select("email_opt_in,email_consented_at")
        .eq("user_id", row.buyer_id)
        .single();
      if (preferenceError || !preference?.email_opt_in || !preference.email_consented_at)
        throw new Error("Consent was withdrawn or cannot be confirmed.");
      const result = await send({
        template: "marketing_event",
        to: row.buyer_email,
        entityRef: `promo:${row.campaign_id}:${row.buyer_id}`,
        data: {
          event: {
            title: row.event_title,
            startsAt: row.starts_at,
            venue: row.venue_name,
          },
          organiserName: row.organiser_name,
          actionPath: `/e/${row.event_slug}?ref=email`,
          unsubscribePath: `/unsubscribe?token=${signUnsubscribe(row.buyer_id)}`,
        },
      });
      success = ["sent", "sent_unlogged", "duplicate"].includes(result.status);
    } catch {
      // Do not expose buyer addresses or the unsubscribe token in logs.
    }
    const { error: finishError } = await client.rpc("promotion_finish_email", {
      p_campaign: row.campaign_id, p_buyer: row.buyer_id, p_success: success,
    });
    if (finishError) throw new Error("Smart Promotions delivery status failed.");
    if (success) sent++;
    else failed++;
  }
  return { enabled: true, claimed: data.length, sent, failed };
}
