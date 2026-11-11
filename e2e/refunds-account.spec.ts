import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && key);
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Refund tests must only use local Supabase.");
const service = () =>
  createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(page: Page, email: string, fullName: string) {
  const admin = service();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error("Could not create the test account.");
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw new Error("Could not create the test session.");
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=email`,
  );
  return data.user.id;
}

test("buyer sees tickets and orders, a test refund, and the legal footer", async ({ page }) => {
  test.skip(!configured, "Start local Supabase for refunds and the attendee account.");
  test.setTimeout(120_000);
  const admin = service();
  const ownerId = crypto.randomUUID();
  const { error: ownerError } = await admin.auth.admin.createUser({
    id: ownerId,
    email: `refund-owner-${ownerId.slice(0, 8)}@example.test`,
    email_confirm: true,
  });
  if (ownerError) throw new Error("Could not create the organiser.");
  const buyerEmail = `refund-buyer-${crypto.randomUUID()}@example.test`;
  const buyerId = await signIn(page, buyerEmail, "Asha Buyer");
  const organiserId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const tierId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const ticketId = crypto.randomUUID();
  expect(
    (
      await admin.from("organisers").insert({
        id: organiserId,
        owner_id: ownerId,
        display_name: "Riverfront Live",
        slug: `refund-${organiserId.slice(0, 8)}`,
        kyc_status: "approved",
        approved_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("events").insert({
        id: eventId,
        organiser_id: organiserId,
        slug: `refund-night-${eventId.slice(0, 8)}`,
        title: "Refund Night",
        starts_at: "2027-06-01T12:30:00.000Z",
        status: "published",
        refund_policy: "72h",
        is_free: false,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("ticket_types").insert({
        id: tierId,
        event_id: eventId,
        name: "General admission",
        price_paise: 150000,
        qty_total: 10,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("orders").insert({
        id: orderId,
        event_id: eventId,
        buyer_id: buyerId,
        buyer_name: "Asha Buyer",
        buyer_email: buyerEmail,
        subtotal_paise: 150000,
        platform_fee_paise: 0,
        platform_fee_gst_paise: 0,
        gateway_fee_paise: 0,
        total_paise: 150000,
        organiser_share_paise: 150000,
        platform_share_paise: 0,
        fee_payer: "organiser",
        status: "paid",
        paid_at: "2026-11-10T12:30:00.000Z",
        is_test: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("tickets").insert({
        id: ticketId,
        order_id: orderId,
        event_id: eventId,
        ticket_type_id: tierId,
        code: `TK-${ticketId.replace(/-/g, "").slice(0, 5).toUpperCase()}-01`,
        holder_name: "Asha Buyer",
        qr_secret: "v1",
        status: "valid",
      })
    ).error,
  ).toBeNull();

  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Refund Night" }).first()).toBeVisible();
  await expect(page.getByText("₹1,500 incl. GST").first()).toBeVisible();
  await expect(page.getByText("1 Jun 2027, 6:00 PM IST").first()).toBeVisible();
  await expect(page.getByText("10 Nov 2026, 6:00 PM IST").first()).toBeVisible();
  await expect(page.getByText("Valid").first()).toBeVisible();

  await page.goto("/me/settings");
  await expect(page.getByRole("link", { name: "Download your data" })).toBeVisible();
  await expect(page.getByText(/refunded or used/i)).toBeVisible();
  const download = await page.request.get("/me/export");
  expect(download.ok()).toBeTruthy();
  const exported = await download.text();
  expect(exported).toContain("Refund Night");
  expect(exported).toContain("₹1,500 incl. GST");
  expect(exported).not.toContain("qr_secret");
  expect(exported).not.toContain("vendor_id");

  await page.goto("/me");
  await page.getByRole("button", { name: "Request a refund" }).click();
  await expect(page.getByTestId("refund-status")).toContainText(
    "Test refund. No money was sent to a bank.",
  );
  await expect(page.getByText(/sent to your bank/i)).toHaveCount(0);
  await expect(page.getByText("Refunded. Not valid for entry.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open ticket" })).toHaveCount(0);

  await page.screenshot({ path: "test-results/refund-account.png", fullPage: true });

  await page.goto("/legal/refunds");
  await expect(page.getByRole("heading", { name: "Refunds" })).toBeVisible();
  await expect(page.getByText("Tikatero is a product of Sound Matrix").first()).toBeVisible();
  await expect(page.getByText("72 hours before the start")).toBeVisible();
  const footer = page.locator("footer");
  await expect(footer).toContainText("© Sound Matrix");
  await expect(footer).toContainText("Terms");
  await expect(footer).toContainText("Privacy");
  await expect(footer).toContainText("Help");
  await expect(footer).not.toContainText("GSTIN");
  await expect(footer).not.toContainText("LLP");
  await page.screenshot({ path: "test-results/legal-refunds.png", fullPage: true });

  await page.goto("/legal/terms");
  await expect(page.getByText("include GST").first()).toBeVisible();
  await page.goto("/legal/privacy");
  await expect(page.getByText("download a copy").first()).toBeVisible();
  await expect(page.locator("footer")).toContainText("© Sound Matrix");
});
