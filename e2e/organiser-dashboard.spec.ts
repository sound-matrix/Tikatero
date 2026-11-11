import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && key);
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Dashboard tests must only use local Supabase.");
const service = () =>
  createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(page: Page, email: string, fullName: string, role?: "staff") {
  const admin = service();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error("Could not create the test account.");
  if (role)
    expect((await admin.from("profiles").update({ role }).eq("id", data.user.id)).error).toBeNull();
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

test("organiser sees sales and a test payout; staff cannot hold their own organiser", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!configured, "Start local Supabase for organiser sales and payouts.");
  test.setTimeout(120_000);
  const admin = service();
  const ownerEmail = `dash-owner-${crypto.randomUUID()}@example.test`;
  const staffEmail = `dash-staff-${crypto.randomUUID()}@example.test`;
  const doorEmail = `dash-door-${crypto.randomUUID()}@example.test`;
  const ownerId = await signIn(page, ownerEmail, "River Owner");
  const organiserId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const vipId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const testOrderId = crypto.randomUUID();
  expect(
    (
      await admin.from("organisers").insert({
        id: organiserId,
        owner_id: ownerId,
        display_name: "Riverfront Live",
        legal_name: "River Owner",
        slug: `river-${organiserId.slice(0, 8)}`,
        kyc_status: "approved",
        approved_at: new Date().toISOString(),
        cashfree_vendor_id: `mock_vendor_${organiserId.replaceAll("-", "")}`,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("events").insert({
        id: eventId,
        organiser_id: organiserId,
        slug: `river-night-${eventId.slice(0, 8)}`,
        title: "River Night",
        starts_at: "2026-11-20T12:30:00.000Z",
        city: "Mumbai",
        status: "published",
        is_free: false,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("ticket_types").insert({
        id: vipId,
        event_id: eventId,
        name: "VIP lounge",
        price_paise: 200000,
        qty_total: 10,
        is_vip: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("orders").insert({
        id: orderId,
        event_id: eventId,
        buyer_name: "Asha",
        buyer_email: "asha@example.test",
        subtotal_paise: 100000,
        platform_fee_paise: 2000,
        platform_fee_gst_paise: 360,
        gateway_fee_paise: 2301,
        total_paise: 100000,
        organiser_share_paise: 95339,
        platform_share_paise: 2360,
        fee_payer: "organiser",
        status: "pending",
        is_test: false,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("orders").insert({
        id: testOrderId,
        event_id: eventId,
        buyer_name: "Test Buyer",
        buyer_email: "test-buyer@example.test",
        subtotal_paise: 5000,
        total_paise: 5000,
        organiser_share_paise: 5000,
        platform_share_paise: 0,
        fee_payer: "organiser",
        status: "pending",
        is_test: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin
        .from("orders")
        .update({ status: "paid", paid_at: "2026-11-06T12:30:00.000Z" })
        .in("id", [orderId, testOrderId])
    ).error,
  ).toBeNull();
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const code = `TK-${[...bytes].map((byte) => alphabet[byte & 31]).join("")}-01`;
  expect(
    (
      await admin.from("tickets").insert({
        order_id: orderId,
        event_id: eventId,
        ticket_type_id: vipId,
        code,
        qr_secret: "v1",
        status: "used",
        used_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();

  await page.goto("/console");
  await expect(page.getByRole("heading", { name: "Your events" })).toBeVisible();
  await expect(page.getByText("₹953.39").first()).toBeVisible();
  await expect(page.getByText("20 Nov 2026, 6:00 PM IST").first()).toBeVisible();
  await expect(page.getByText("sent to your bank")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("console.png"), fullPage: true });
  await page.goto(`/console/events/${eventId}`);
  await expect(page.getByRole("heading", { name: "River Night" })).toBeVisible();
  await expect(page.getByText("VIP")).toBeVisible();
  await expect(page.getByText("1 checked in of 1 tickets sold")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("event-sales.png"), fullPage: true });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download sales CSV" }).click(),
  ]);
  const csvPath = testInfo.outputPath("sales.csv");
  await download.saveAs(csvPath);
  const csv = await readFile(csvPath, "utf8");
  expect(csv).toContain("95339");
  expect(csv).toContain("₹953.39");
  expect(csv).not.toMatch(/sb_secret_|account_number|CASHFREE/i);
  await page.goto("/console/payouts");
  await expect(page.getByText("Usually paid within 2 days of settlement.")).toBeVisible();
  await expect(page.getByText("T+2")).toHaveCount(0);
  await expect(
    page.getByText("Payouts are in test mode. No money has been sent to a bank."),
  ).toBeVisible();
  await expect(page.getByText("11 Nov 2026, 6:00 PM IST").first()).toBeVisible();
  await expect(page.getByText("sent to your bank")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("payouts.png"), fullPage: true });

  const doorContext = await browser.newContext();
  const doorPage = await doorContext.newPage();
  const doorId = await signIn(doorPage, doorEmail, "Door Staff");
  expect(
    (
      await admin.from("event_team").insert({
        event_id: eventId,
        user_id: doorId,
        role: "door",
      })
    ).error,
  ).toBeNull();
  await doorPage.goto(`/console/events/${eventId}`);
  await expect(doorPage).toHaveURL(new RegExp(`/console/events/${eventId}/scan`));
  await doorContext.close();

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  const staffId = await signIn(staffPage, staffEmail, "Hold Staff", "staff");
  const ownId = crypto.randomUUID();
  expect(
    (
      await admin.from("organisers").insert({
        id: ownId,
        owner_id: staffId,
        display_name: "Staff Own Live",
        slug: `staff-own-${ownId.slice(0, 8)}`,
        kyc_status: "approved",
        approved_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();
  await staffPage.goto(`/admin/accounts?q=${encodeURIComponent(staffEmail)}`);
  await expect(staffPage.getByRole("heading", { name: "Hold Staff" })).toBeVisible();
  await staffPage.getByRole("switch", { name: "Hold payouts" }).click();
  await expect(
    staffPage.getByText("You cannot change payouts or sales on your own organiser"),
  ).toBeVisible();
  await staffPage.screenshot({ path: testInfo.outputPath("hold-self-check.png"), fullPage: true });
  await staffPage.goto(`/admin/accounts?q=${encodeURIComponent(ownerEmail)}`);
  await expect(staffPage.getByRole("heading", { name: "River Owner" })).toBeVisible();
  await staffPage.getByRole("switch", { name: "Hold payouts" }).click();
  await expect(staffPage.getByRole("status")).toContainText("Organiser control saved");
  const { data: held } = await admin
    .from("organisers")
    .select("payouts_on_hold")
    .eq("id", organiserId)
    .single();
  expect(held?.payouts_on_hold).toBe(true);
  await staffContext.close();
});
