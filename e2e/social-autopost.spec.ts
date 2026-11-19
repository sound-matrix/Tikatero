import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && key);
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname)) {
  throw new Error("Social tests must only use local Supabase.");
}
const service = () =>
  createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(page: Page, email: string, fullName: string, role?: "staff" | "admin") {
  const admin = service();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error("Could not create the test account.");
  if (role) {
    expect((await admin.from("profiles").update({ role }).eq("id", data.user.id)).error).toBeNull();
  }
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

test.describe.configure({ mode: "serial" });

test("upcoming page lists only public events and keeps the Sound Matrix footer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  if (!configured) {
    await page.goto("/events/upcoming");
    await expect(page.getByRole("heading", { name: "Upcoming events on Tikatero" })).toBeVisible();
    await expect(page.getByText("No upcoming events right now. Check back soon.")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText("© Sound Matrix");
    return;
  }
  const admin = service();
  const ownerId = await signIn(
    page,
    `social-up-${crypto.randomUUID()}@example.test`,
    "Upcoming Host",
  );
  const organiserId = crypto.randomUUID();
  const liveId = crypto.randomUUID();
  const hiddenId = crypto.randomUUID();
  const slug = `social-live-${liveId.slice(0, 8)}`;
  const title = `Bio Link Night ${liveId.slice(0, 8)}`;
  expect(
    (
      await admin.from("organisers").insert({
        id: organiserId,
        owner_id: ownerId,
        display_name: "Upcoming Live",
        slug: `upcoming-${organiserId.slice(0, 8)}`,
        kyc_status: "approved",
        approved_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();
  const starts = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  expect(
    (
      await admin.from("events").insert([
        {
          id: liveId,
          organiser_id: organiserId,
          slug,
          title,
          city: "Hyderabad",
          starts_at: starts,
          status: "published",
          is_free: false,
          category: "Comedy",
        },
        {
          id: hiddenId,
          organiser_id: organiserId,
          slug: `social-hidden-${hiddenId.slice(0, 8)}`,
          title: "Hidden Bio Night",
          city: "Hyderabad",
          starts_at: starts,
          status: "published",
          hidden_at: new Date().toISOString(),
          is_free: false,
          category: "Comedy",
        },
      ])
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("ticket_types").insert({
        event_id: liveId,
        name: "General",
        price_paise: 49900,
        qty_total: 40,
      })
    ).error,
  ).toBeNull();
  await page.goto("/events/upcoming");
  const liveEvent = page.getByRole("listitem").filter({ hasText: title });
  await expect(liveEvent.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hidden Bio Night" })).toHaveCount(0);
  const book = liveEvent.getByRole("link", { name: "Book", exact: true });
  await expect(book).toHaveAttribute("href", new RegExp(`/e/${slug}/book`));
  await expect(book).toHaveAttribute("href", /utm_source=instagram/);
  await expect(book).toHaveAttribute("href", /utm_content=bio/);
  await expect(book).toHaveAttribute("href", /ref=instagram/);
  await expect(page.getByRole("contentinfo")).toContainText("© Sound Matrix");
  await expect(page.getByRole("contentinfo")).not.toContainText(/GSTIN|\bCIN\b/);
});

test("host share kit downloads a JPEG and a scanner cannot open it", async ({ page, browser }) => {
  test.skip(!configured, "Start local Supabase for the share kit.");
  test.setTimeout(120_000);
  const admin = service();
  const ownerId = await signIn(page, `social-kit-${crypto.randomUUID()}@example.test`, "Kit Host");
  const organiserId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const slug = `share-kit-${eventId.slice(0, 8)}`;
  expect(
    (
      await admin.from("organisers").insert({
        id: organiserId,
        owner_id: ownerId,
        display_name: "Share Kit Live",
        slug: `kit-${organiserId.slice(0, 8)}`,
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
        slug,
        title: "Share Kit Night",
        city: "Hyderabad",
        venue_name: "Sound Hall",
        starts_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        status: "published",
        is_free: true,
        category: "Comedy",
      })
    ).error,
  ).toBeNull();
  await page.goto(`/console/events/${eventId}/marketing`);
  await expect(page.getByRole("heading", { name: "Share kit" })).toBeVisible();
  await expect(page.getByText("@tikatero_official").first()).toBeVisible();
  const download = await page.request.get(`/console/events/${eventId}/share-kit/square`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("image/jpeg");
  expect(download.headers()["content-disposition"]).toContain(`${slug}-square.jpg`);
  const body = await download.body();
  expect(body[0]).toBe(0xff);
  expect(body[1]).toBe(0xd8);

  const door = await browser.newPage();
  await signIn(door, `social-door-${crypto.randomUUID()}@example.test`, "Door Person");
  await door.goto("/me");
  await expect(door.getByText("Welcome, Door Person.")).toBeVisible();
  const denied = await door.request.get(`/console/events/${eventId}/share-kit/square`, {
    maxRedirects: 0,
  });
  expect([303, 404]).toContain(denied.status());
  if (denied.status() === 303) {
    expect(denied.headers().location).toMatch(/^\/(login|auth\/complete)(?:[?#]|$)/);
  }
  expect(denied.headers()["content-type"] ?? "").not.toContain("image/jpeg");
  await door.close();
});

test("admin social page shows that Meta is not set up and can skip then retry", async ({
  page,
}) => {
  test.skip(!configured, "Start local Supabase for the admin social page.");
  test.setTimeout(120_000);
  const admin = service();
  await signIn(page, `social-admin-${crypto.randomUUID()}@example.test`, "Social Admin", "admin");
  const owner = await admin.auth.admin.createUser({
    email: `social-admin-host-${crypto.randomUUID()}@example.test`,
    email_confirm: true,
    user_metadata: { full_name: "Admin Host" },
  });
  if (!owner.data.user) throw new Error("Could not create the host.");
  const organiserId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  expect(
    (
      await admin.from("organisers").insert({
        id: organiserId,
        owner_id: owner.data.user.id,
        display_name: "Admin Social Host",
        slug: `adminsocial-${organiserId.slice(0, 8)}`,
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
        slug: `admin-social-${eventId.slice(0, 8)}`,
        title: "Admin Social Night",
        city: "Hyderabad",
        starts_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        status: "published",
        is_free: false,
        category: "Comedy",
      })
    ).error,
  ).toBeNull();
  await page.goto("/admin/social");
  await expect(page.getByRole("heading", { name: "Not set up yet" })).toBeVisible();
  await expect(page.getByText("META_PAGE_ACCESS_TOKEN")).toBeVisible();
  await expect(page.getByText("META_APP_SECRET")).toBeVisible();
  await page.getByLabel("Auto-posting").selectOption("no");
  await page.getByLabel("Reason").fill("Turn on for the social test");
  await page.getByRole("button", { name: "Save auto-posting" }).click();
  await expect(page.getByText("Social settings saved.")).toBeVisible();
  await expect(page.getByText("Admin Social Night")).toBeVisible();
  await page.getByRole("button", { name: "Post this event" }).click();
  await page.goto("/admin/social?status=queued");
  await expect(page.getByText("Waiting").first()).toBeVisible();
  await page.getByLabel("Reason to skip").first().fill("Skip this test post");
  await page.getByRole("button", { name: "Skip" }).first().click();
  await expect(page.getByText("Skipped").first()).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByText("Waiting").first()).toBeVisible();
  await page.goto("/admin/events/" + eventId);
  await expect(page.getByRole("heading", { name: "Tikatero social" })).toBeVisible();
  await page.goto("/admin/social");
  await page.getByLabel("Auto-posting").selectOption("yes");
  await page.getByLabel("Reason").fill("Pause again after the social test");
  await page.getByRole("button", { name: "Save auto-posting" }).click();
  await expect(page.getByText("Auto-posting is paused")).toBeVisible();
});
