// Integration test against an isolated local Supabase. Real simultaneous RPC transactions.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Checkout concurrency test requires local Supabase.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const check = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const owner = randomUUID(),
  event = randomUUID(),
  tier = randomUUID(),
  email = `checkout-race-${owner}@example.test`;
check(await client.auth.admin.createUser({ id: owner, email, email_confirm: true }));
check(
  await client.from("organisers").insert({
    id: owner,
    owner_id: owner,
    display_name: "Checkout race",
    slug: `race-${owner}`,
    kyc_status: "approved",
    approved_at: new Date().toISOString(),
    cashfree_vendor_id: "test-vendor",
  }),
);
check(
  await client.from("events").insert({
    id: event,
    organiser_id: owner,
    title: "Race test",
    slug: `race-${event}`,
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    status: "published",
    capacity: 10,
  }),
);
check(
  await client.from("ticket_types").insert({
    id: tier,
    event_id: event,
    name: "Ten seats",
    price_paise: 100000,
    qty_total: 10,
    per_order_max: 1,
  }),
);
const [version] = check(await client.rpc("active_pricing_version"));
const results = await Promise.all(
  Array.from({ length: 50 }, async () => {
    const id = randomUUID();
    return client.rpc("checkout_hold", {
      p_order_id: id,
      p_buyer_id: owner,
      p_slug: `race-${event}`,
      p_name: "Race Buyer",
      p_email: email,
      p_phone: "9876543210",
      p_lines: [{ id: tier, qty: 1, price_paise: 100000 }],
      p_pricing_version_id: version.id,
      p_fee_payer: "organiser",
      p_is_free: false,
      p_amounts: {
        subtotal: 100000,
        platform_fee: 2000,
        platform_fee_gst: 360,
        gateway_fee: 2301,
        buyer_total: 100000,
        organiser_share: 95339,
        platform_share: 2360,
      },
      p_provider: "cashfree",
      p_token_hash: createHash("sha256").update(id).digest("hex"),
      p_attendees: [],
      p_is_test: true,
    });
  }),
);
const held = results.filter((r) => !r.error).map((r) => r.data);
assert.equal(held.length, 10, "Exactly ten of fifty parallel checkouts hold inventory");
assert.equal(
  results.filter((r) => r.error?.code === "P0001").length,
  40,
  "All other requests fail with inventory errors",
);
await Promise.all(
  held
    .flatMap((order) => [
      client.rpc("checkout_transition", {
        p_order_id: order.id,
        p_state: "paid",
        p_amount: 100000,
        p_currency: "INR",
        p_source: "cashfree",
        p_event_id: `race-${order.id}`,
        p_payload: {},
      }),
      client.rpc("checkout_transition", {
        p_order_id: order.id,
        p_state: "paid",
        p_amount: 100000,
        p_currency: "INR",
        p_source: "cashfree",
        p_event_id: `race-${order.id}`,
        p_payload: {},
      }),
      client.rpc("checkout_transition", {
        p_order_id: order.id,
        p_state: "paid",
        p_amount: 100000,
        p_currency: "INR",
      }),
    ])
    .map((p) => p.then(check)),
);
assert.equal(
  check(await client.from("ticket_types").select("qty_sold").eq("id", tier).single()).qty_sold,
  10,
);
const outbox = check(
  await client
    .from("order_outbox")
    .select("id")
    .in(
      "order_id",
      held.map((o) => o.id),
    )
    .eq("topic", "order.paid"),
);
assert.equal(outbox.length, 10, "One paid event per order across webhook + poller races");
console.log(
  "PASS: 50 parallel checkouts / 10 seats; duplicate webhooks + poller; 10 sold, 10 outbox rows.",
);
