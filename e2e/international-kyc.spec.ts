import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!key;
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("KYC browser tests must only use local Supabase.");

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+NM1sAAAAASUVORK5CYII=",
  "base64",
);

async function upload(panel: Locator, name: string) {
  await panel
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType: "image/png", buffer: image });
  await panel.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(panel.getByText("Your file has been uploaded.")).toBeVisible();
}

test("international organiser uploads ID, corrects requested documents and gets free event access", async ({
  page: owner,
  browser,
}, testInfo) => {
  test.skip(!configured, "Local Supabase is needed for private uploads and audited review.");
  test.setTimeout(120_000);
  const service = createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function user(prefix: string) {
    const email = `${prefix}-${crypto.randomUUID()}@example.test`;
    const result = await service.auth.admin.createUser({ email, email_confirm: true });
    if (result.error || !result.data.user)
      throw new Error("Could not create a local test account.");
    return { email, id: result.data.user.id };
  }
  async function login(page: Page, email: string) {
    const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw new Error("Could not create a local test session.");
    await page.goto(
      `/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`,
    );
  }
  const [organiser, admin] = await Promise.all([user("intl-owner"), user("intl-admin")]);
  const name = `Meridian Events ${organiser.id.slice(0, 6)}`;
  expect(
    (await service.from("profiles").update({ role: "admin" }).eq("id", admin.id)).error,
  ).toBeNull();
  expect(
    (
      await service.from("organisers").insert({
        id: organiser.id,
        owner_id: organiser.id,
        display_name: name,
        slug: `intl-${organiser.id}`,
      })
    ).error,
  ).toBeNull();
  await owner.setViewportSize({ width: 430, height: 932 });
  const adminContext = await browser.newContext();
  try {
    await login(owner, organiser.email);
    await expect(owner).toHaveURL(/\/console\/pending$/);
    await owner.getByRole("link", { name: "Start or continue verification" }).click();
    const region = owner.getByLabel("Where is your organiser based?");
    await region.selectOption("INTL");
    await expect(owner.getByRole("heading", { name: "About you", exact: true })).toBeVisible();
    await expect(
      owner.getByLabel("Country", { exact: true }).locator("option[value=IN]"),
    ).toHaveCount(0);
    await owner.getByLabel("Legal full name").fill("Alex Rivera");
    await owner.getByLabel("Search countries").fill("United Kingdom");
    await owner.getByLabel("Country", { exact: true }).selectOption("GB");
    await owner.getByLabel("City", { exact: true }).fill("London");
    await owner.getByLabel("Phone with country code").fill("+442079460123");
    await owner.screenshot({ path: testInfo.outputPath("intl-01-about-you.png"), fullPage: true });
    await owner.getByRole("button", { name: "Save and continue" }).click();
    await expect(owner.getByRole("heading", { name: "Your ID", exact: true })).toBeVisible();
    await expect(region).toBeDisabled();
    await expect(
      owner.getByText("To change country, contact support", { exact: true }),
    ).toBeVisible();
    await owner.reload();
    await expect(owner.getByRole("heading", { name: "Your ID", exact: true })).toBeVisible();
    const number = "TESTID7429";
    await owner.getByLabel("Document type").selectOption("national_id");
    await owner.getByLabel("Expiry date").fill("2090-01-01");
    const front = owner.getByRole("region", { name: "Upload the front of your ID" });
    const back = owner.getByRole("region", { name: "Upload the back of your ID" });
    await owner.screenshot({ path: testInfo.outputPath("intl-02-your-id.png"), fullPage: true });
    await owner.getByLabel("Document number").fill(number);
    await upload(front, "sample-front.png");
    await owner.getByRole("button", { name: "Save and continue" }).click();
    await expect(
      owner.getByRole("alert").filter({ hasText: "Upload the requested file first." }),
    ).toBeVisible();
    await upload(back, "sample-back.png");
    await owner.getByRole("button", { name: "Save and continue" }).click();
    await expect(
      owner.getByRole("heading", { name: "Selfie with your ID", exact: true }),
    ).toBeVisible();
    await owner.screenshot({ path: testInfo.outputPath("intl-03-selfie.png"), fullPage: true });
    await upload(owner.getByRole("region", { name: "Upload your selfie" }), "sample-selfie.png");
    await owner.getByRole("button", { name: "Save and continue" }).click();
    await owner.getByRole("button", { name: "Submit for verification" }).click();
    await expect(owner).toHaveURL(/\/console\/pending/);
    await expect(
      owner.getByText("We check documents by hand, usually within 2 working days."),
    ).toBeVisible();

    const { data: app, error } = await service
      .from("kyc_applications")
      .select("*")
      .eq("organiser_id", organiser.id)
      .single();
    expect(error).toBeNull();
    expect(app).toMatchObject({
      status: "submitted",
      region: "INTL",
      id_country: "GB",
      id_doc_last4: "7429",
    });
    expect(JSON.stringify(app)).not.toContain(number);
    expect(app!.doc_keys).toHaveLength(3);
    const reviewer = await adminContext.newPage();
    await login(reviewer, admin.email);
    await reviewer.goto("/admin/kyc?region=INTL");
    const row = reviewer.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("United Kingdom");
    await row.getByRole("link", { name: `Review ${name}` }).click();
    await expect(reviewer.getByText("•••• 7429")).toBeVisible();
    await expect(reviewer.getByText("National ID card", { exact: true })).toBeVisible();
    await reviewer.screenshot({
      path: testInfo.outputPath("intl-04-admin-detail.png"),
      fullPage: true,
    });
    await reviewer.getByRole("button", { name: "Preview ID front" }).click();
    await expect(reviewer.getByRole("link", { name: "Open ID front in a new tab" })).toBeVisible();
    const audit = await service
      .from("audit_log")
      .select("after")
      .eq("entity_id", app!.id)
      .eq("action", "kyc_document_view")
      .single();
    expect(audit.data?.after).toEqual({ document: "front" });
    await reviewer.getByLabel("Your ID", { exact: true }).check();
    await reviewer.getByLabel("Note to organiser (optional)").fill("Please upload clearer images.");
    await reviewer.getByRole("button", { name: "Request more docs" }).click();
    await expect(reviewer.getByRole("status")).toContainText("Saved.");

    await owner.goto("/console/onboarding");
    await expect(owner.getByText("Please upload clearer images.")).toBeVisible();
    await expect(owner.getByRole("heading", { name: "Your ID", exact: true })).toBeVisible();
    await owner.getByRole("button", { name: "About you", exact: true }).click();
    await expect(owner.getByLabel("Legal full name")).toBeDisabled();
    await owner.getByRole("button", { name: "Your ID · Check", exact: true }).click();
    await upload(front, "new-front.png");
    await upload(back, "new-back.png");
    await owner.getByRole("button", { name: "Save and continue" }).click();
    await owner.getByRole("button", { name: "Submit for verification" }).click();
    await expect(
      owner.getByText("We check documents by hand, usually within 2 working days."),
    ).toBeVisible();

    await reviewer.reload();
    await reviewer.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(reviewer.getByRole("status")).toContainText("Saved.");
    const approved = await service
      .from("organisers")
      .select("kyc_status,cashfree_vendor_id")
      .eq("id", organiser.id)
      .single();
    expect(approved.data).toEqual({ kyc_status: "approved", cashfree_vendor_id: null });
    await owner.goto("/console/events/new");
    const free = owner.getByLabel("Free event — RSVP only");
    await expect(free).toBeChecked();
    await expect(free).toBeDisabled();
    await expect(
      owner.getByText(
        "Paid tickets need an Indian bank account for now. Contact support to set this up.",
      ),
    ).toBeVisible();

    const { data: event, error: eventError } = await service
      .from("events")
      .insert({
        organiser_id: organiser.id,
        slug: `intl-event-${organiser.id}`,
        title: "International event",
        is_free: true,
      })
      .select("id")
      .single();
    expect(eventError).toBeNull();
    await owner.goto(`/console/events/${event!.id}/edit?step=6`);
    await expect(owner.getByRole("heading", { name: "RSVP groups" })).toBeVisible();
    await owner.getByRole("button", { name: "Add RSVP group" }).click();
    await expect(owner.getByLabel("Tier 1 name")).toHaveValue("RSVP");
    await expect(owner.getByLabel("Tier 1 price incl. GST (₹)")).toHaveCount(0);
    const blocked = await service.from("ticket_types").insert({
      event_id: event!.id,
      name: "Paid ticket",
      price_paise: 100,
      qty_total: 10,
    });
    expect(blocked.error?.message).toBe(
      "Paid tickets need an Indian bank account for now. Contact support to set this up.",
    );
  } finally {
    // Audited fixture accounts are retained until the disposable local database is reset.
    await adminContext.close();
  }
});
