import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { sessionClient } from "@/lib/supabase/server";
import { indianCheckoutPhone } from "./profile";

export async function checkoutDefaults() {
  const client = await sessionClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.email_confirmed_at || !user.email) return null;
  const [profile, preferences] = await Promise.all([
    client.from("profiles").select("full_name,phone,blocked_at").eq("id", user.id).maybeSingle(),
    client
      .from("user_checkout_preferences")
      .select("ticket_name,ticket_email,ticket_phone_e164,preferred_method")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!profile.data || profile.data.blocked_at || preferences.error) return null;
  return {
    name: preferences.data?.ticket_name ?? profile.data.full_name ?? "",
    email: preferences.data?.ticket_email ?? user.email,
    phone: indianCheckoutPhone(preferences.data?.ticket_phone_e164 ?? profile.data.phone),
    method: preferences.data?.preferred_method ?? "ask",
  };
}

export async function rememberGuestBooking(
  client: SupabaseClient<Database>,
  orderId: string,
  profileId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user?.id !== profileId || !user.email_confirmed_at || !user.email) return;
  const { data: order } = await client
    .from("orders")
    .select("buyer_name,buyer_email,buyer_phone")
    .eq("id", orderId)
    .eq("buyer_id", profileId)
    .eq("status", "paid")
    .maybeSingle();
  if (!order || order.buyer_email !== user.email.toLowerCase()) return;
  const phone = indianCheckoutPhone(order.buyer_phone);
  await client.from("user_checkout_preferences").upsert(
    {
      user_id: profileId,
      ticket_name: order.buyer_name,
      ticket_email: order.buyer_email,
      ticket_phone_e164: phone ? "+91" + phone : null,
    },
    { ignoreDuplicates: true },
  );
}
