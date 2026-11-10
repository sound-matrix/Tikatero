import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && key);
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Scanner tests must only use local Supabase.");

const service = () =>
  createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

function ticketCode() {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `TK-${[...bytes].map((byte) => alphabet[byte & 31]).join("")}-01`;
}

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

test("organiser invites a door scanner and they check a ticket in", async ({ page, browser }) => {
  test.skip(!configured, "Start local Supabase for the scanner and team flow.");
  test.setTimeout(120_000);
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  const admin = service();
  const ownerEmail = `scan-owner-${crypto.randomUUID()}@example.test`;
  const doorEmail = `scan-door-${crypto.randomUUID()}@example.test`;
  const ownerId = await signIn(page, ownerEmail, "Scan Organiser");
  const organiserId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const typeId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const code = ticketCode();
  expect(
    (
      await admin.from("organisers").insert({
        id: organiserId,
        owner_id: ownerId,
        display_name: "Doorlight Events",
        slug: `doorlight-${ownerId.slice(0, 8)}`,
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
        slug: `scan-night-${eventId.slice(0, 8)}`,
        title: "Scan Night",
        starts_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        city: "Mumbai",
        status: "published",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("ticket_types").insert({
        id: typeId,
        event_id: eventId,
        name: "General Admission",
        price_paise: 100000,
        qty_total: 20,
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
        total_paise: 100000,
        fee_payer: "organiser",
        status: "paid",
        is_test: false,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("tickets").insert({
        order_id: orderId,
        event_id: eventId,
        ticket_type_id: typeId,
        code,
        holder_name: "Asha",
        qr_secret: "v1",
      })
    ).error,
  ).toBeNull();

  await page.goto(`/console/events/${eventId}/team`);
  await expect(page.getByRole("heading", { name: "Team for Scan Night" })).toBeVisible();
  await page.getByLabel("Email").fill(doorEmail);
  await page.getByLabel("Role").selectOption("door");
  await page.getByRole("button", { name: "Send invite" }).click();
  const invite = page.getByRole("link", { name: "Open the invitation link" });
  await expect(invite).toBeVisible();
  await expect(page.getByRole("cell", { name: doorEmail })).toBeVisible();
  await expect(page.getByText("₹")).toHaveCount(0);
  const href = await invite.getAttribute("href");
  expect(href).toMatch(/^\/team\/accept\?token=[A-Za-z0-9_-]{43}$/);
  await page.screenshot({ path: "/opt/cursor/artifacts/team-page.png", fullPage: true });
  await page.screenshot({ path: test.info().outputPath("team-page.png"), fullPage: true });

  const door = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const doorPage = await door.newPage();
  await signIn(doorPage, doorEmail, "Door Staff");
  await doorPage.goto(href!);
  await expect(doorPage.getByRole("heading", { name: "Join an event team" })).toBeVisible();
  await expect(doorPage.getByText("Scan Night")).toBeVisible();
  await doorPage.getByRole("button", { name: "Join the team" }).click();
  await expect(doorPage.getByRole("heading", { name: "Scan Night" })).toBeVisible();
  await expect(doorPage.getByText("Door scanner")).toBeVisible();
  await doorPage.getByLabel("Ticket code").fill(code);
  await doorPage.getByRole("button", { name: "Check this code" }).click();
  await expect(doorPage.getByRole("status")).toContainText("Valid — let them in");
  await expect(doorPage.getByRole("status")).toContainText("Asha");
  await expect(doorPage.getByText("₹")).toHaveCount(0);
  await doorPage.screenshot({ path: "/opt/cursor/artifacts/scanner-mobile.png", fullPage: true });
  await doorPage.screenshot({ path: test.info().outputPath("scanner-mobile.png"), fullPage: true });
  await doorPage.getByLabel("Ticket code").fill(code);
  await doorPage.getByRole("button", { name: "Check this code" }).click();
  await expect(doorPage.getByRole("status")).toContainText("Already checked in");
  await doorPage.goto(`/console/events/${eventId}/team`);
  await expect(doorPage).toHaveURL(new RegExp(`/console/events/${eventId}/scan$`));
  await doorPage.goto("/console/payouts");
  await expect(doorPage).not.toHaveURL(/\/console\/payouts/);
  await expect(doorPage.getByText("Payout amounts")).toHaveCount(0);
  await door.close();
});
