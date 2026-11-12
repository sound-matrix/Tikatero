import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { formatIst } from "../lib/format";
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
  await login(page, email);
  return data.user.id;
}

async function login(page: Page, email: string) {
  const { data: link, error } = await service().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=email`,
  );
}

test("buyer sees tickets and orders, a test refund, and the legal footer", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(!configured, "Start local Supabase for refunds and the attendee account.");
  test.setTimeout(120_000);
  const admin = service();
  const ownerId = crypto.randomUUID();
  const ownerEmail = `refund-owner-${ownerId.slice(0, 8)}@example.test`;
  const { error: ownerError } = await admin.auth.admin.createUser({
    id: ownerId,
    email: ownerEmail,
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
  const startsAt = new Date(Date.now() + (5 * 24 + 1) * 3600000).toISOString();
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
        starts_at: startsAt,
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
  const host = await browser.newPage({ baseURL });
  await login(host, ownerEmail);
  await host.goto(`/console/events/${eventId}/edit?step=7`);
  await host.getByLabel("Refund rules", { exact: true }).selectOption("schedule");
  await expect(host.getByText(/100% back.*50% back.*no refund/)).toBeVisible();
  await host.screenshot({ path: testInfo.outputPath("pr24-rules-editor.png"), fullPage: true });
  await host.getByRole("button", { name: "Save changes" }).click();
  await expect(host.getByText("Changes saved.")).toBeVisible();

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
  await expect(page.getByText(formatIst(startsAt)).first()).toBeVisible();
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
  await expect(page.getByText(/₹750 of ₹1,500 \(50%\)/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("pr24-buyer-cancel.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancel my booking" }).click();
  await expect(page.getByTestId("refund-status")).toContainText("waiting for the organiser");

  const staff = await browser.newPage({ baseURL });
  const staffId = await signIn(
    staff,
    `refund-admin-${crypto.randomUUID()}@example.test`,
    "Refund Admin",
  );
  expect(
    (await admin.from("profiles").update({ role: "admin" }).eq("id", staffId)).error,
  ).toBeNull();
  await staff.goto(`/admin/events/${eventId}`);
  await staff.getByLabel("Reason for pausing").fill("Checking this event.");
  await staff.getByRole("button", { name: "Pause refunds for this event" }).click();
  await expect(staff.getByText(/Refunds paused:/)).toBeVisible();
  await expect(staff.getByRole("button", { name: "Approve refund" })).toBeDisabled();
  await staff.screenshot({ path: testInfo.outputPath("pr24-admin-pause.png"), fullPage: true });
  await host.goto(`/console/events/${eventId}`);
  await expect(host.getByRole("button", { name: "Approve refund" })).toBeDisabled();

  await staff.getByLabel("Reason for resuming").fill("Review finished.");
  await staff.getByRole("button", { name: "Resume refunds for this event" }).click();
  await expect(staff.getByRole("button", { name: "Approve refund" })).toBeEnabled();
  await host.reload();
  const approval = host
    .locator("form")
    .filter({ has: host.getByRole("button", { name: "Approve refund" }) });
  await approval.getByLabel("Refund amount (₹ incl. GST)").fill("700");
  await approval
    .getByLabel("Reason if lowering the amount or declining")
    .fill("Agreed with the buyer.");
  await host.screenshot({ path: testInfo.outputPath("pr24-refund-desk.png"), fullPage: true });
  await approval.getByRole("button", { name: "Approve refund" }).click();
  await expect(host.getByText("The refund has been updated.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("refund-status")).toContainText("₹700");
  await staff.reload();
  await staff.getByLabel("Reason for pausing").fill("Hold for venue confirmation.");
  await staff.getByRole("button", { name: "Pause refunds for this event" }).click();
  await staff.getByRole("button", { name: "Emergency cancel & refund" }).click();
  const dialog = staff.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("The venue closed.");
  await dialog.getByLabel("Type the event title").fill("Refund Night");
  await dialog.getByRole("button", { name: "Cancel and refund buyers" }).click();
  await expect(staff.getByText("Refund queued", { exact: false }).first()).toBeVisible();
  const queued = await admin
    .from("refunds")
    .select("amount_paise, status, cf_refund_id")
    .eq("order_id", orderId)
    .eq("status", "approved")
    .single();
  expect(queued.data).toEqual({ amount_paise: 80000, status: "approved", cf_refund_id: null });
  await staff.getByLabel("Reason for resuming").fill("Venue cancellation confirmed.");
  await staff.getByRole("button", { name: "Resume refunds for this event" }).click();
  await expect
    .poll(
      async () =>
        (await admin.from("orders").select("status").eq("id", orderId).single()).data?.status,
      { timeout: 20000 },
    )
    .toBe("refunded");
  await staff.close();
  await host.close();
  await page.reload();
  await expect(page.getByTestId("refund-status").first()).toContainText(
    "Test refund. No money was sent to a bank.",
  );
  await expect(page.getByText(/sent to your bank/i)).toHaveCount(0);
  await expect(page.getByText("Refunded. Not valid for entry.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open ticket" })).toHaveCount(0);

  await page.screenshot({ path: "test-results/refund-account.png", fullPage: true });

  await page.goto("/legal/refunds");
  await expect(page.getByRole("heading", { name: "Refunds" })).toBeVisible();
  await expect(page.getByText("Tikatero is a product of Sound Matrix").first()).toBeVisible();
  await expect(page.getByText(/Some organisers automatically approve requests/)).toBeVisible();
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
