import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!key;
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Admin CMS browser tests must only use local Supabase.");
const service = () =>
  createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
async function user(role: "staff" | "attendee", name: string) {
  const client = service(),
    email = `admin-cms-${crypto.randomUUID()}@example.test`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error("Could not create CMS fixture.");
  expect((await client.from("profiles").update({ role }).eq("id", data.user.id)).error).toBeNull();
  return { id: data.user.id, email };
}
async function login(page: Page, email: string) {
  const { data, error } = await service().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error("Could not create CMS test session.");
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`,
  );
}
async function application(ownerId: string) {
  const client = service(),
    id = crypto.randomUUID();
  expect(
    (
      await client
        .from("organisers")
        .insert({
          id,
          owner_id: ownerId,
          display_name: "Riverfront Live",
          legal_name: "Alex Shah",
          slug: `admin-cms-${id}`,
          kyc_status: "auto_passed",
        })
    ).error,
  ).toBeNull();
  const { data, error } = await client
    .from("kyc_applications")
    .insert({
      organiser_id: id,
      region: "IN",
      status: "auto_passed",
      revision: 3,
      submission_count: 1,
      submitted_at: new Date().toISOString(),
      step_progress: {
        pan: {
          completed: true,
          passed: true,
          mode: "mock",
          last4: "234F",
          name: "Alex Shah",
          score: 100,
        },
        aadhaar: { completed: true, passed: true, mode: "mock", last4: "1234" },
        bank: {
          completed: true,
          passed: true,
          mode: "mock",
          last4: "0123",
          name: "Alex Shah",
          score: 100,
        },
        gstin: { completed: true, passed: true, mode: "mock", skipped: true },
        selfie: { completed: true, passed: true, mode: "mock", score: 99, faceScore: 99 },
      },
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return { id, appId: data!.id };
}

test.describe("Admin CMS", () => {
  test.skip(!configured, "Local Supabase is needed for staff permissions and audited changes.");
  test("staff approves pending organiser; publishing unlocks, audit is read-only", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    const staff = await user("staff", "CMS Reviewer"),
      owner = await user("attendee", "Alex Shah");
    const org = await application(owner.id);
    const ownerContext = await browser.newContext(),
      ownerPage = await ownerContext.newPage();
    try {
      await login(ownerPage, owner.email);
      await expect(ownerPage).toHaveURL(/\/console\/pending$/);
      await expect(
        ownerPage.getByRole("button", { name: "🔒 Publish — approval needed" }),
      ).toBeDisabled();
      await login(page, staff.email);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto("/admin/kyc?status=auto_passed");
      await expect(page.getByRole("heading", { name: "KYC queue", exact: true })).toBeVisible();
      await expect(page.getByText("Test mode — simulated").first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("queue.png"), fullPage: true });
      await page.goto(`/admin/kyc/${org.appId}`);
      await expect(page.getByText("Name match: 100%").first()).toBeVisible();
      await expect(page.getByText("Number: •••• 234F")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("detail.png"), fullPage: true });
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Saved.");
      const { data: approved } = await service()
        .from("organisers")
        .select("kyc_status,approved_by")
        .eq("id", org.id)
        .single();
      expect(approved).toMatchObject({ kyc_status: "approved", approved_by: staff.id });
      await ownerPage.goto("/console/events");
      await expect(ownerPage).toHaveURL(/\/console\/events$/);
      const { data: log } = await service()
        .from("audit_log")
        .select("id,before,after")
        .eq("entity_id", org.appId)
        .eq("action", "kyc_approved")
        .single();
      expect(log?.before).toMatchObject({ status: "auto_passed" });
      expect(log?.after).toMatchObject({ status: "approved" });
      await page.goto(`/admin/audit?actor=${staff.id}&target=${org.appId}`);
      await expect(page.getByText("Log can't be edited or deleted.")).toBeVisible();
      await expect(page.getByRole("cell", { name: "kyc_approved", exact: true })).toBeVisible();
    } finally {
      await ownerContext.close(); /* Audit actors are retained until the disposable local DB is reset. */
    }
  });
  test("staff blocks an account; next login shows its reason; controls are audited", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    const staff = await user("staff", "Accounts Reviewer"),
      owner = await user("attendee", "Account Review Fixture");
    const org = await application(owner.id);
    await login(page, staff.email);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto(`/admin/accounts?q=${encodeURIComponent(owner.email)}`);
    await expect(
      page.getByRole("heading", { name: "Account Review Fixture", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("accounts.png"), fullPage: true });
    await page.getByRole("switch", { name: "Hold payouts" }).click();
    await expect(page.getByRole("switch", { name: "Hold payouts" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("switch", { name: "Pause ticket sales" }).click();
    await expect(page.getByRole("switch", { name: "Pause ticket sales" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page
      .getByLabel("Reason (required)")
      .fill("Please contact support to confirm account ownership.");
    await page.getByRole("button", { name: "Block", exact: true }).click();
    await expect(page.getByText("Restricted", { exact: true })).toBeVisible();
    const context = await browser.newContext(),
      accountPage = await context.newPage();
    try {
      await login(accountPage, owner.email);
      await expect(accountPage).toHaveURL(/\/blocked$/);
      await expect(
        accountPage.getByText("Please contact support to confirm account ownership.", {
          exact: true,
        }),
      ).toBeVisible();
      const { data: logs } = await service()
        .from("audit_log")
        .select("action")
        .eq("actor_id", staff.id);
      expect(logs?.map((l) => l.action)).toEqual(
        expect.arrayContaining(["account_block", "payouts_on_hold", "sales_paused"]),
      );
      const { data: email } = await service()
        .from("email_log")
        .select("template")
        .eq("template", "account_blocked")
        .like("entity_ref", "admin/%")
        .eq("to_email", owner.email);
      expect(email).toHaveLength(1);
      await page.getByRole("button", { name: "Unblock", exact: true }).click();
      await expect(page.getByText("Active", { exact: true })).toBeVisible();
      await accountPage.goto("/me");
      await expect(accountPage).not.toHaveURL(/\/blocked$/);
    } finally {
      await context.close();
    }
    const { data: flags } = await service()
      .from("organisers")
      .select("payouts_on_hold,sales_paused")
      .eq("id", org.id)
      .single();
    expect(flags).toEqual({ payouts_on_hold: true, sales_paused: true });
  });
  test("request docs and reject preserve organiser notes and use existing emails", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const staff = await user("staff", "KYC Reviewer"),
      owner = await user("attendee", "Corrections Fixture");
    const org = await application(owner.id);
    await login(page, staff.email);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto(`/admin/kyc/${org.appId}`);
    await page.getByLabel("Note to organiser (optional)").fill("Please upload clear bank proof.");
    await page.getByLabel("Bank account", { exact: true }).check();
    await page.getByRole("button", { name: "Request more docs", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved.");
    const { data: app } = await service()
      .from("kyc_applications")
      .select("status,flagged_steps,reviewer_note")
      .eq("id", org.appId)
      .single();
    expect(app).toMatchObject({
      status: "needs_docs",
      flagged_steps: ["bank"],
      reviewer_note: "Please upload clear bank proof.",
    });
    await page.reload();
    await page
      .getByLabel("Note to organiser (optional)")
      .fill("The supplied documents do not establish ownership.");
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved.");
    const { data: logs } = await service()
      .from("email_log")
      .select("template")
      .eq("to_email", owner.email)
      .like("entity_ref", "admin/%");
    expect(logs?.map((l) => l.template)).toEqual(
      expect.arrayContaining(["kyc_needs_docs", "kyc_rejected"]),
    );
  });
  test("non-staff cannot reach any CMS route", async ({ page }) => {
    const account = await user("attendee", "Regular Account");
    await login(page, account.email);
    await expect(page).toHaveURL(/\/me$/);
    for (const path of [
      "/admin",
      "/admin/kyc",
      "/admin/kyc/c7200001-0000-4000-8000-000000000001",
      "/admin/accounts",
      "/admin/audit",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/me$/);
    }
  });
});
