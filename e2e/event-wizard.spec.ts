import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { previewPricing } from "../lib/pricing";
import { formatInr } from "../lib/format";
import type { Database } from "../lib/db/types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!key;
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Event wizard tests must only use local Supabase.");
const fixtureKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY === "playwright-maps-fixture";
const mapsScript = "https://maps.googleapis.com/maps/api/js";
const manualFallback =
  "Map search is unavailable right now. Type the address or paste a Google Maps link.";
const placeLink = "https://maps.google.com/?cid=123456789";
const client = () =>
  createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
async function setup(page: Page, approved: boolean) {
  const service = client(),
    email = `event-wizard-${crypto.randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: "Event Organiser" },
  });
  if (error || !data.user) throw new Error("Could not create event fixture.");
  const id = data.user.id;
  expect(
    (
      await service.from("organisers").insert({
        id,
        owner_id: id,
        display_name: "Riverfront Events",
        slug: `wizard-${id}`,
        kyc_status: approved ? "approved" : "submitted",
        approved_at: approved ? new Date().toISOString() : null,
      })
    ).error,
  ).toBeNull();
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw new Error("Could not create event test session.");
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=email`,
  );
  await expect(page).toHaveURL(approved ? /\/console$/ : /\/console\/pending$/);
  return id;
}
async function next(page: Page, heading: string) {
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}
const futureDay = () => new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
async function dates(page: Page) {
  const day = futureDay();
  await page.getByLabel("Starts (IST)", { exact: true }).fill(`${day}T19:00`);
  await page.getByLabel("Ends (IST, optional)").fill(`${day}T21:00`);
  await page.getByLabel("Gates open (IST, optional)").fill(`${day}T18:00`);
}
async function venue(page: Page) {
  await page.getByLabel("Venue name", { exact: true }).fill("Riverfront Hall");
  await page.getByLabel("Address", { exact: true }).fill("12 Music Street, near the main entrance");
  await page.getByLabel("City", { exact: true }).fill("Hyderabad");
  await page
    .getByLabel("Google Maps link (optional)")
    .fill("https://www.google.com/maps?q=17.385,78.4867");
  await expect(page.getByLabel("Latitude (optional)")).toHaveValue("17.385");
}
async function shot(page: Page, info: TestInfo, step: number) {
  await page.screenshot({
    path: info.outputPath(`wizard-step-${String(step).padStart(2, "0")}.png`),
    fullPage: true,
  });
}

test.describe("Organiser event wizard", () => {
  test.skip(!configured, "Start local Supabase for saved drafts and role checks.");
  test.beforeEach(async ({ page }) => {
    await page.route(
      /^https:\/\/(?:[^/]+\.)?(?:googleapis\.com|gstatic\.com|ggpht\.com)\//,
      (route) => route.abort("blockedbyclient"),
    );
  });
  test("approved organiser creates Sample Music Night, resumes it and publishes", async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const owner = await setup(page, true);
    await page.goto("/console/events/new");
    await expect(page.getByRole("heading", { name: "Tell people about your event" })).toBeVisible();
    await page.getByLabel("Event name", { exact: true }).fill("Sample Music Night");
    await page
      .getByLabel("Description", { exact: true })
      .fill("An evening of live acoustic music, special guests and good company.");
    await shot(page, info, 1);
    await next(page, "When is your event?");
    await expect(page).toHaveURL(/\/console\/events\/[0-9a-f-]+\/edit\?step=2$/);
    const eventId = /\/events\/([0-9a-f-]+)\/edit/.exec(page.url())![1];
    await page.reload();
    await expect(page.getByRole("heading", { name: "When is your event?" })).toBeVisible();
    await dates(page);
    await shot(page, info, 2);
    const blockedScript = fixtureKey
      ? page.waitForEvent("requestfailed", (request) => request.url().startsWith(mapsScript))
      : null;
    await next(page, "Where will people meet?");
    await expect(page.getByText(manualFallback)).toBeVisible();
    await blockedScript;
    await venue(page);
    await expect(page.getByRole("region", { name: "Venue map" })).toHaveCount(0);
    await shot(page, info, 3);
    await next(page, "Give your event a poster");
    await expect(page.getByLabel("Choose a photo")).toBeVisible();
    await shot(page, info, 4);
    await next(page, "VIPs & chief guests");
    await page.getByRole("link", { name: "Your events", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: "Sample Music Night" });
    await expect(row).toContainText("Draft");
    await row.getByRole("link", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "VIPs & chief guests" })).toBeVisible();
    await page.getByRole("button", { name: "Add special guest", exact: true }).click();
    await page.getByLabel("Guest 1 name", { exact: true }).fill("Alex Rao");
    await page.getByLabel("Guest 1 title", { exact: true }).fill("Chief guest & musician");
    await shot(page, info, 5);
    await next(page, "Build your ticket tiers");
    await page.getByRole("button", { name: "Add ticket tier", exact: true }).click();
    await page.getByLabel("Tier 1 name", { exact: true }).fill("VIP admission");
    await page.getByLabel("Tier 1 price incl. GST (₹)", { exact: true }).fill("1000");
    await page.getByLabel("Tier 1 quantity", { exact: true }).fill("100");
    await page.getByLabel("Tier 1 per-order max (optional)").fill("4");
    await page.getByLabel("VIP tier", { exact: true }).check();
    await expect(page.getByLabel("VIP admission design preview")).toContainText("₹1,000 incl. GST");
    await shot(page, info, 6);
    await next(page, "Fees & refunds");
    await page.getByRole("radio", { name: /The buyer pays the platform fee/ }).check();
    const example = page.getByTestId("wizard-pricing-example");
    const versionId = await example.getAttribute("data-pricing-version");
    const { data: version, error: pricingError } = await client()
      .from("pricing_versions")
      .select("*")
      .eq("id", versionId!)
      .single();
    expect(pricingError).toBeNull();
    const pricing = previewPricing({ ticketPaise: 100000, feePayer: "buyer" }, version!);
    await expect(
      example.getByText(`${formatInr(pricing.buyerTotalPaise)} incl. GST`, { exact: true }),
    ).toBeVisible();
    await expect(
      example.getByText(formatInr(pricing.organiserPayoutPaise), { exact: true }),
    ).toBeVisible();
    await shot(page, info, 7);
    await next(page, "Review & publish");
    const publicLink = page.getByRole("link", {
      name: new RegExp(`${new URL(page.url()).origin}/e/sample-music-night`),
    });
    await expect(publicLink).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish event", exact: true })).toBeEnabled();
    await shot(page, info, 8);
    await page.getByRole("button", { name: "Publish event", exact: true }).click();
    await expect(page.getByRole("button", { name: "Published", exact: true })).toBeDisabled();
    const { data: event } = await client()
      .from("events")
      .select(
        "title,status,organiser_id,starts_at,fee_payer,refund_policy,lat,lng,maps_url,wizard_completed_steps",
      )
      .eq("id", eventId)
      .single();
    expect(event).toMatchObject({
      title: "Sample Music Night",
      status: "published",
      organiser_id: owner,
      fee_payer: "buyer",
      refund_policy: "72h",
      lat: 17.385,
      lng: 78.4867,
      maps_url: "https://www.google.com/maps?q=17.385,78.4867",
    });
    expect(event?.wizard_completed_steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const { data: tiers } = await client()
      .from("ticket_types")
      .select("price_paise,qty_total,is_vip")
      .eq("event_id", eventId);
    expect(tiers).toEqual([{ price_paise: 100000, qty_total: 100, is_vip: true }]);
    await page.getByRole("link", { name: "Your events", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: "Sample Music Night" })).toContainText(
      "Published",
    );
    await expect(page.getByRole("contentinfo")).toHaveText("© Sound Matrix");
  });
  test("searches Google venues, saves a selection and fine-tunes its pin", async ({
    page,
  }, info) => {
    test.skip(!fixtureKey, "Build and run with the Playwright Maps fixture key.");
    test.setTimeout(120_000);
    let loaderRequests = 0;
    await page.route(`${mapsScript}?**`, async (route) => {
      loaderRequests++;
      await route.fulfill({
        path: resolve("e2e/fixtures/google-maps.js"),
        contentType: "application/javascript",
      });
    });
    const owner = await setup(page, true);
    await page.goto("/console/events/new");
    await page.getByLabel("Event name", { exact: true }).fill("Autumn Venue Search");
    await page
      .getByLabel("Description", { exact: true })
      .fill("A live music evening for local audiences.");
    await next(page, "When is your event?");
    await dates(page);
    expect(loaderRequests).toBe(0);
    await next(page, "Where will people meet?");

    const search = page.getByRole("combobox", { name: "Search for your venue" });
    const list = page.getByRole("listbox", { name: "Venue suggestions" });
    await search.fill("Taj");
    await expect(list.getByRole("option")).toHaveCount(2);
    await search.fill("Taj Krishna Hyderabad");
    await expect(list.getByRole("option", { name: /Taj Krishna/ })).toBeVisible();
    await shot(page, info, 31);
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 390, height: 560 });
    await search.scrollIntoViewIfNeeded();
    await expect(list.getByRole("option", { name: /Taj Krishna/ })).toBeInViewport();
    await shot(page, info, 32);
    await page.setViewportSize(viewport);
    await search.press("ArrowDown");
    await search.press("Enter");

    await expect(page.getByLabel("Venue name", { exact: true })).toHaveValue("Taj Krishna");
    await expect(page.getByLabel("Address", { exact: true })).toHaveValue(
      "Road No. 1, Banjara Hills, Hyderabad, Telangana, India",
    );
    await expect(page.getByLabel("City", { exact: true })).toHaveValue("Hyderabad");
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue("IN");
    await expect(page.getByLabel("Latitude (optional)")).toHaveValue("17.417816");
    await expect(page.getByLabel("Longitude (optional)")).toHaveValue("78.449501");
    await expect(page.getByLabel("Google Maps link (optional)")).toHaveValue(placeLink);
    await expect(page.getByRole("link", { name: /Open in Maps/ })).toHaveAttribute(
      "href",
      placeLink,
    );

    const map = page.getByRole("region", { name: "Venue map" });
    const pin = page.getByRole("button", { name: "Venue pin" });
    await expect(map).toHaveAttribute("aria-busy", "false");
    await expect(pin).toHaveAttribute("data-draggable", "true");
    expect(loaderRequests).toBe(1);
    const googleFixture = await page.evaluate(() => Reflect.get(window, "venueGoogleFixture"));
    expect(googleFixture.libraries.sort()).toEqual(["maps", "marker", "places"]);
    expect(googleFixture.requests).toHaveLength(2);
    expect(googleFixture.requests[0].sessionToken).toEqual(googleFixture.requests[1].sessionToken);
    expect(googleFixture.requests[1]).toMatchObject({
      region: "in",
      locationBias: { west: 68.18, south: 7.97, east: 97.4, north: 35.49 },
    });
    expect(googleFixture.fields).toEqual([
      ["displayName", "formattedAddress", "location", "addressComponents", "googleMapsURI"],
    ]);
    await shot(page, info, 33);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
    const eventId = /\/events\/([0-9a-f-]+)\/edit/.exec(page.url())![1];
    const saved = () =>
      client()
        .from("events")
        .select("organiser_id,venue_name,address,city,country,lat,lng,maps_url")
        .eq("id", eventId)
        .single();
    expect((await saved()).data).toMatchObject({
      organiser_id: owner,
      venue_name: "Taj Krishna",
      city: "Hyderabad",
      country: "IN",
      lat: 17.417816,
      lng: 78.449501,
      maps_url: placeLink,
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.reload();
    await expect(pin).toBeVisible();
    await expect(page.getByLabel("Google Maps link (optional)")).toHaveValue(placeLink);
    await pin.scrollIntoViewIfNeeded();
    const point = (await pin.boundingBox())!;
    await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
    await page.mouse.down();
    await page.mouse.move(point.x + 30, point.y + 25);
    await page.mouse.up();
    await expect(page.getByLabel("Latitude (optional)")).toHaveValue("17.418257");
    await map.click({ position: { x: 40, y: 50 } });
    await expect(page.getByLabel("Latitude (optional)")).toHaveValue("17.419006");
    await page.getByLabel("Venue name", { exact: true }).fill("Taj Krishna, main entrance");
    await next(page, "Give your event a poster");
    expect((await saved()).data).toMatchObject({
      venue_name: "Taj Krishna, main entrance",
      lat: 17.419006,
      lng: 78.449408,
      maps_url: "https://www.google.com/maps/search/?api=1&query=17.419006%2C78.449408",
    });
    expect(pageErrors).toEqual([]);
  });
  test("pending organiser saves a partial free draft and cannot publish by UI or API", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const owner = await setup(page, false);
    await page.goto("/console/events/new");
    await page.getByLabel("Event name", { exact: true }).fill("Community Music Meetup");
    await page.getByLabel("Free event — RSVP only", { exact: true }).check();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(/\/edit\?step=1$/);
    await page.reload();
    await expect(page.getByLabel("Event name", { exact: true })).toHaveValue(
      "Community Music Meetup",
    );
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("");
    await page
      .getByLabel("Description", { exact: true })
      .fill("A free evening of community music and conversation.");
    await next(page, "When is your event?");
    await dates(page);
    await next(page, "Where will people meet?");
    await venue(page);
    await next(page, "Give your event a poster");
    await next(page, "VIPs & chief guests");
    await next(page, "RSVP groups");
    await page.getByRole("button", { name: "Add RSVP group", exact: true }).click();
    await expect(page.getByLabel("Tier 1 price incl. GST (₹)", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("RSVP design preview")).toContainText("Free entry · RSVP");
    await next(page, "Fees & refunds");
    await next(page, "Review & publish");
    await expect(page.getByText("Publishing is locked", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish event", exact: true })).toBeDisabled();
    const eventId = /\/events\/([0-9a-f-]+)\/edit/.exec(page.url())![1];
    const { data: tiers } = await client()
      .from("ticket_types")
      .select("price_paise")
      .eq("event_id", eventId);
    expect(tiers).toEqual([{ price_paise: 0 }]);
    const { data: link } = await client().auth.admin.generateLink({
      type: "magiclink",
      email: (await client().auth.admin.getUserById(owner)).data.user!.email!,
    });
    if (!link?.properties?.hashed_token)
      throw new Error("Could not create the pending organiser API session.");
    const userClient = createClient<Database>(
      url!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(
      (
        await userClient.auth.verifyOtp({
          token_hash: link.properties.hashed_token,
          type: "email",
        })
      ).error,
    ).toBeNull();
    const publish = await userClient
      .from("events")
      .update({ status: "published" })
      .eq("id", eventId);
    expect(publish.error?.message).toContain("publish blocked");
  });
});
