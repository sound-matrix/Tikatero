import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key && !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Moderation tests require local Supabase.");
const db = () =>
  createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function account(role: "attendee" | "admin") {
  const client = db();
  const email = `event-review-${crypto.randomUUID()}@example.test`;
  const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error("Could not create review fixture.");
  if (role === "admin")
    expect(
      (await client.from("profiles").update({ role }).eq("id", data.user.id)).error,
    ).toBeNull();
  return { id: data.user.id, email };
}

async function login(page: Page, email: string) {
  const { data, error } = await db().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`,
  );
}

async function fixture(status: "draft" | "published" = "published") {
  const client = db();
  const host = await account("attendee");
  const organiser = crypto.randomUUID();
  const id = crypto.randomUUID();
  const slug = `event-review-${id}`;
  const title = `Riverfront Music Night ${id.slice(0, 5)}`;
  const starts = new Date(Date.now() + 86400000 * 14);
  expect(
    (
      await client.from("organisers").insert({
        id: organiser,
        owner_id: host.id,
        display_name: "Riverfront Live",
        slug: `review-${organiser}`,
        kyc_status: "approved",
        approved_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await client.from("events").insert({
        id,
        organiser_id: organiser,
        slug,
        title,
        status,
        starts_at: status === "draft" ? null : starts.toISOString(),
        ends_at: status === "draft" ? null : new Date(starts.getTime() + 7200000).toISOString(),
        venue_name: "Riverfront Hall",
        address: "12 Music Street",
        city: "Hyderabad",
        category: "Concert",
        description: "An evening of acoustic music with local artists.",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await client.from("ticket_types").insert([
        { event_id: id, name: "General", price_paise: 10000, qty_total: 10, sort: 0 },
        { event_id: id, name: "VIP", price_paise: 20000, qty_total: 10, sort: 1 },
      ])
    ).error,
  ).toBeNull();
  return { id, slug, title, host, organiser };
}

async function buy(page: Page, slug: string, twoTypes = false) {
  await page.goto(`/e/${slug}/checkout`);
  await page.getByLabel("How many General tickets?").selectOption("1");
  if (twoTypes) await page.getByLabel("How many VIP tickets?").selectOption("1");
  await page.getByLabel("Full name").fill("Test Buyer");
  await page.getByLabel("Email", { exact: true }).fill(`buyer-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await page.getByRole("button", { name: "Success", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  return page.url();
}

async function requestRemoval(host: Page, id: string) {
  await host.goto(`/console/events/${id}`);
  await host.getByRole("button", { name: "Cancel or delete this event" }).click();
  const dialog = host.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("The venue closed unexpectedly.");
  await dialog
    .getByRole("checkbox", { name: "I understand all buyers will get a full refund" })
    .check();
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(host.getByText("Waiting for Tikatero to approve")).toBeVisible();
}

test.describe("Event review", () => {
  test.skip(!url || !key, "Start local Supabase to test event review.");
  test.setTimeout(120000);

  test("host hides and unhides, staff approves removal, buyer sees the refund", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    const event = await fixture();
    const host = await browser.newPage({ baseURL });
    const admin = await browser.newPage({ baseURL });
    try {
      const statusUrl = await buy(page, event.slug);
      await login(host, event.host.email);
      await host.goto(`/console/events/${event.id}`);
      await host.getByRole("button", { name: "Hide event" }).click();
      await host.getByRole("dialog").getByLabel("Reason").selectOption("Date or venue changing");
      await host.screenshot({ path: info.outputPath("organiser-hide-dialog.png"), fullPage: true });
      await host.getByRole("dialog").getByRole("button", { name: "Hide event" }).click();
      await expect(host.getByText("This event is now hidden.")).toBeVisible();
      await page.goto(`/e/${event.slug}`);
      await expect(
        page.getByRole("heading", { name: "This event isn't available right now" }),
      ).toBeVisible();
      await page.goto(statusUrl);
      await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
      await host.getByRole("button", { name: "Unhide event" }).click();
      await host.getByRole("dialog").getByRole("button", { name: "Unhide event" }).click();
      await expect(host.getByText("The event is no longer hidden.")).toBeVisible();
      await page.goto(`/e/${event.slug}`);
      await expect(page.getByRole("heading", { name: event.title })).toBeVisible();
      await requestRemoval(host, event.id);
      await host.screenshot({
        path: info.outputPath("organiser-removal-pending.png"),
        fullPage: true,
      });
      await login(admin, (await account("admin")).email);
      await admin.goto("/admin/events");
      await admin.getByLabel("Search by event or organiser").fill(event.title);
      await admin.getByLabel("Show").selectOption("removal");
      await admin.getByRole("button", { name: "Apply filters" }).click();
      await expect(admin.getByRole("link", { name: event.title })).toBeVisible();
      await admin.screenshot({ path: info.outputPath("admin-event-list.png"), fullPage: true });
      await admin.getByRole("link", { name: event.title }).click();
      await expect(admin.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
      await admin.screenshot({ path: info.outputPath("admin-event-review.png"), fullPage: true });
      await admin.getByRole("button", { name: "Approve removal request" }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Approve and refund" }).click();
      await expect(admin.getByText("This event is cancelled.", { exact: true })).toBeVisible();
      await page.goto(statusUrl);
      await expect(page.getByRole("heading", { name: "Booking refunded" })).toBeVisible();
    } finally {
      await host.close();
      await admin.close();
    }
  });

  test("admin rejects a request, then emergency cancels and deletes a separate draft", async ({
    page,
    browser,
    baseURL,
  }) => {
    const event = await fixture();
    const draft = await fixture("draft");
    const host = await browser.newPage({ baseURL });
    try {
      await login(host, event.host.email);
      await requestRemoval(host, event.id);
      await login(page, (await account("admin")).email);
      await page.goto(`/admin/events/${event.id}`);
      await page.getByRole("button", { name: "Reject request" }).click();
      await page
        .getByRole("dialog")
        .getByLabel("Note to the organiser")
        .fill("Check the new venue first.");
      await page.getByRole("dialog").getByRole("button", { name: "Reject request" }).click();
      await expect(
        page.getByText("Request declined. The event stays hidden.", { exact: true }),
      ).toBeVisible();
      await host.reload();
      await expect(host.getByRole("button", { name: "Unhide event" })).toBeVisible();
      await page.getByRole("button", { name: "Emergency cancel & refund" }).click();
      await page.getByRole("dialog").getByLabel("Reason").fill("Venue closed by the council.");
      await page.getByRole("dialog").getByLabel("Type the event title").fill(event.title);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cancel and refund buyers" })
        .click();
      await expect(page.getByText("This event is cancelled.", { exact: true })).toBeVisible();
      await page.goto(`/admin/events/${draft.id}`);
      await page.getByRole("button", { name: "Delete permanently" }).click();
      await page.getByRole("dialog").getByLabel("Reason").fill("Test draft");
      await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
      await expect(page.getByText("The event was permanently deleted.")).toBeVisible();
      expect(
        (await db().from("events").select("id").eq("id", draft.id).maybeSingle()).data,
      ).toBeNull();
    } finally {
      await host.close();
    }
  });

  test("two ticket types share the two-seat limit saved in the wizard", async ({
    page,
    browser,
    baseURL,
  }) => {
    const event = await fixture();
    const host = await browser.newPage({ baseURL });
    try {
      await login(host, event.host.email);
      await host.goto(`/console/events/${event.id}/edit?step=6`);
      await host.getByLabel("Total seats at your venue", { exact: false }).fill("2");
      await expect(
        host.getByText(
          "Your ticket types add up to 20, but only 2 seats are available. Sales will stop at 2.",
        ),
      ).toBeVisible();
      await host.getByRole("button", { name: "Save changes" }).click();
      await expect(host.getByText("Changes saved.")).toBeVisible();
      await page.goto(`/e/${event.slug}`);
      await expect(page.getByText("Only 2 seats left")).toBeVisible();
      await buy(page, event.slug, true);
      const nextBuyer = await browser.newPage({ baseURL });
      try {
        await nextBuyer.goto(`/e/${event.slug}/checkout`);
        await expect(nextBuyer.getByRole("heading", { name: "Sold out" })).toBeVisible();
      } finally {
        await nextBuyer.close();
      }
      await host.goto(`/console/events/${event.id}`);
      await expect(host.getByText(/Seats left at venue: 2 of 2/)).toBeVisible();
    } finally {
      await host.close();
    }
  });
});
