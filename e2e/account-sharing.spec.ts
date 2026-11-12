import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PNG } from "pngjs";
import type { Database } from "../lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!serviceKey;
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Account sharing tests require local Supabase.");

const db = () =>
  createClient<Database>(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
function value<T extends { data: unknown; error: unknown }>(result: T): T["data"] {
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.data;
}

async function actor(prefix: string) {
  const id = crypto.randomUUID();
  const email = `${prefix}-${id}@example.test`;
  value(await db().auth.admin.createUser({ id, email, email_confirm: true }));
  return { id, email };
}

async function eventFixture(free: boolean) {
  const host = await actor("sharing-host");
  const id = crypto.randomUUID();
  const slug = `sharing-${id}`;
  const client = db();
  value(
    await client.from("organisers").insert({
      id: host.id,
      owner_id: host.id,
      slug,
      display_name: "Riverfront Cinema",
      kyc_status: "approved",
      approved_at: new Date().toISOString(),
    }),
  );
  value(
    await client.from("events").insert({
      id,
      organiser_id: host.id,
      slug,
      title: free ? "Sunday Film Workshop" : "Cinema Under the Stars",
      starts_at: new Date(Date.now() + 86400000 * 10).toISOString(),
      status: "published",
      is_free: free,
      venue_name: "Riverfront Hall",
      city: "Hyderabad",
      fee_payer: "buyer",
    }),
  );
  value(
    await client.from("ticket_types").insert({
      id,
      event_id: id,
      name: free ? "Free pass" : "General",
      price_paise: free ? 0 : 49900,
      qty_total: 10,
    }),
  );
  return { id, slug, host };
}

async function signIn(page: Page, email: string, next?: string) {
  const link = value(await db().auth.admin.generateLink({ type: "magiclink", email }));
  if (!link.properties) throw new Error("The fixture did not return a sign-in link.");
  const query = new URLSearchParams({ token_hash: link.properties.hashed_token, type: "email" });
  if (next) query.set("next", next);
  await page.goto(`/auth/callback?${query}`);
}

test.describe("Profile, booking and event sharing", () => {
  test.skip(!configured, "Requires local Supabase and mock payments.");

  test("profile, session menu, WhatsApp sharing and paid booking retain attribution", async ({
    page,
    context,
  }, info) => {
    const { slug, id, host } = await eventFixture(false);
    const attendee = await actor("sharing-attendee");
    const eventPath = `/e/${slug}`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(eventPath);
    const signInLink = page.getByRole("link", { name: "Sign in", exact: true });
    await expect(signInLink).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(eventPath)}`,
    );
    await signIn(page, attendee.email, eventPath);
    await expect(page).toHaveURL(new RegExp(`${eventPath}$`));
    await page.getByLabel("Account menu", { exact: true }).click();
    await expect(page.getByRole("link", { name: "My profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Host console" })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("pr23-header-menu.png") });
    await page.getByRole("link", { name: "My profile" }).click();
    await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();

    await page.getByLabel("Full name", { exact: true }).fill("Anthony Rao");
    await page.getByLabel("Display name (optional)").fill("Anthony");
    await page.getByLabel("City", { exact: true }).fill("Hyderabad");
    await page.getByRole("button", { name: "Save about you" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();

    const image = new PNG({ width: 40, height: 60 });
    for (let i = 0; i < image.data.length; i += 4) image.data.set([20, 135, 130, 255], i);
    await page
      .getByLabel("Choose a photo")
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: PNG.sync.write(image) });
    await page.getByRole("button", { name: "Save photo" }).click();
    await expect(page.getByRole("img", { name: "Your profile photo" })).toBeVisible();
    const avatar = await page.getByRole("img", { name: "Your profile photo" }).getAttribute("src");
    const photo = await page.request.get(avatar!);
    const png = await photo.body();
    expect(photo.ok()).toBe(true);
    expect(photo.headers()["content-type"]).toContain("image/webp");
    expect(png.toString("ascii", 8, 12)).toBe("WEBP");

    await page.getByLabel("Phone number", { exact: true }).fill("98765 43210");
    await page.getByRole("button", { name: "Add number" }).click();
    await expect(page.getByText("+919876543210", { exact: false })).toBeVisible();
    await page.getByRole("main").getByText("Instagram", { exact: true }).click();
    await page.getByLabel("Instagram handle or link").fill("@anthony.rao");
    await page.getByRole("button", { name: "Save Instagram" }).click();
    await expect(page.getByText("Instagram · Saved")).toBeVisible();
    await page.getByRole("button", { name: "Save booking details" }).click();
    await expect
      .poll(async () =>
        value(
          await db()
            .from("user_checkout_preferences")
            .select("ticket_name,ticket_phone_e164")
            .eq("user_id", attendee.id)
            .maybeSingle(),
        ),
      )
      .toMatchObject({
        ticket_name: "Anthony Rao",
        ticket_phone_e164: "+919876543210",
      });
    await page.screenshot({ path: info.outputPath("pr23-profile.png"), fullPage: true });

    await page.goto(`${eventPath}?ref=whatsapp`);
    await page.getByRole("button", { name: "Share event" }).click();
    const dialog = page.getByRole("dialog", { name: "Share this event" });
    const whatsapp = dialog.getByRole("link", { name: "WhatsApp" });
    const target = new URL((await whatsapp.getAttribute("href"))!);
    expect(target.origin).toBe("https://wa.me");
    expect(target.searchParams.get("text")).toContain(`${eventPath}?ref=whatsapp`);
    await page.screenshot({ path: info.outputPath("pr23-share-sheet.png") });
    await context.route("https://wa.me/**", (route) => route.fulfill({ body: "WhatsApp test" }));
    const popup = page.waitForEvent("popup");
    await whatsapp.click();
    await (await popup).close();
    await dialog.getByRole("button", { name: "Close share options" }).click();

    await page.getByRole("link", { name: "Book · General" }).click();
    await expect(page).toHaveURL(/\/checkout\?tier=.*&ref=whatsapp$/);
    const book = page.getByRole("button", { name: /Book now as Anthony · ₹.*incl. GST/ });
    await expect(book).toBeEnabled();
    await expect(page.getByText(`${attendee.email} · 9876543210`)).toBeVisible();
    await page.screenshot({ path: info.outputPath("pr23-checkout.png"), fullPage: true });
    await book.click();
    await expect(page.getByRole("heading", { name: "Test payment", exact: true })).toBeVisible();
    const orderId = /\/orders\/([^/]+)/.exec(page.url())![1];
    expect(
      value(await db().from("orders").select("buyer_id,ref_channel").eq("id", orderId).single()),
    ).toEqual({
      buyer_id: attendee.id,
      ref_channel: "whatsapp",
    });

    await page.goto(eventPath);
    await page.getByLabel("Account menu", { exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${eventPath}$`));
    await expect(signInLink).toBeVisible();

    await signIn(page, host.email, `/console/events/${id}`);
    await expect(page.getByRole("heading", { name: "Share your event" })).toBeVisible();
    await expect(
      page.getByRole("img", { name: "QR code for Cinema Under the Stars" }),
    ).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "WhatsApp" })).toHaveText(
      /WhatsApp\s*1\s*1\s*0/,
    );
    await page.getByRole("heading", { name: "Share your event" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("pr23-organiser-qr.png") });
  });

  test("saved details let a signed-in buyer confirm a free pass in one click", async ({ page }) => {
    const { id, slug } = await eventFixture(true);
    const buyer = await actor("free-pass");
    value(
      await db().from("user_checkout_preferences").insert({
        user_id: buyer.id,
        ticket_name: "Anthony Rao",
        ticket_email: "tickets@example.test",
        ticket_phone_e164: "+919876543210",
      }),
    );
    await signIn(page, buyer.email, `/e/${slug}/checkout`);
    await page.getByRole("button", { name: "Book now as Anthony · Free" }).click();
    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
    const order = value(
      await db()
        .from("orders")
        .select("buyer_id,buyer_email,payment_provider,status")
        .eq("event_id", id)
        .single(),
    );
    expect(order).toEqual({
      buyer_id: buyer.id,
      buyer_email: "tickets@example.test",
      payment_provider: "free",
      status: "paid",
    });
  });
});
