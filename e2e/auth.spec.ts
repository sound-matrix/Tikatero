import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!key;
if (process.env.AUTH_E2E_REQUIRED === "1" && !configured)
  throw new Error("Local auth test environment is missing.");
// These tests use a local-only service client to arrange roles, never to authorize app requests.
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Auth tests must only target local Supabase.");

test.describe("Supabase role routing", () => {
  test.skip(!configured, "Start local Supabase and run node scripts/local-auth-env.mjs first.");
  test.describe.configure({ mode: "serial" });
  const users: string[] = [];
  const admin = () =>
    createClient<Database>(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  test.afterAll(async () => {
    if (!configured) return;
    const client = admin();
    // Membership trigger protects the last owner, so remove the organiser first.
    for (const id of users) {
      await client.from("organisers").delete().eq("owner_id", id);
      await client.auth.admin.deleteUser(id);
    }
  });

  for (const role of ["attendee", "pending", "approved", "staff", "admin", "blocked"] as const) {
    test(`${role} signs in by OTP and can only enter allowed surfaces`, async ({ page }) => {
      const client = admin();
      const email = `auth-${crypto.randomUUID()}@example.test`;
      const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
      if (error || !data.user) throw new Error("Could not create local auth fixture.");
      const id = data.user.id;
      users.push(id);
      const profileRole = role === "staff" || role === "admin" ? role : "attendee";
      const { error: roleError } = await client
        .from("profiles")
        .update({
          role: profileRole,
          ...(role === "blocked"
            ? { blocked_at: new Date().toISOString(), block_reason: "Account needs review" }
            : {}),
        })
        .eq("id", id);
      expect(roleError).toBeNull();
      if (role === "pending" || role === "approved") {
        const { error: orgError } = await client.from("organisers").insert({
          id,
          owner_id: id,
          display_name: "Local organiser",
          slug: `test-${id}`,
          kyc_status: role === "approved" ? "approved" : "draft",
          approved_at: role === "approved" ? new Date().toISOString() : null,
        });
        expect(orgError).toBeNull();
      }
      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByRole("button", { name: "Email me a code or sign-in link" }).click();
      await expect(page.getByLabel("6-digit code")).toBeVisible();
      // Generate a fresh local token for UI verification; no email templates are changed.
      const { data: link, error: linkError } = await client.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (linkError || !link.properties.email_otp) throw new Error("Could not create local OTP.");
      await page.getByLabel("6-digit code").fill(link.properties.email_otp);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const destination = {
        attendee: "/me",
        pending: "/console/pending",
        approved: "/console",
        staff: "/admin",
        admin: "/admin",
        blocked: "/blocked",
      }[role];
      await expect(page).toHaveURL(new RegExp(`${destination}$`));
      if (role === "blocked") await expect(page.getByText("Account needs review")).toBeVisible();
      for (const surface of ["/admin/events", "/console/events", "/me/settings"]) {
        await page.goto(surface);
        const allowed = surface.startsWith("/admin")
          ? role === "staff" || role === "admin"
          : surface.startsWith("/console")
            ? role === "approved"
            : role !== "blocked";
        await expect(page).toHaveURL(new RegExp(`${allowed ? surface : destination}$`));
      }
      if (role === "attendee") {
        await page.goto("/me/settings");
        await page.getByLabel("Your name").fill("Local attendee");
        await page.getByLabel("Phone (optional)").fill("+91 98765 43210");
        await page.getByRole("button", { name: "Save details" }).click();
        await expect(
          page.getByRole("status").filter({ hasText: "Your details have been saved." }),
        ).toBeVisible();
        await page.reload();
        await expect(page.getByLabel("Your name")).toHaveValue("Local attendee");
        await page.goto("/me");
        await page.getByLabel("Organiser name").fill("New organiser");
        await page.getByRole("button", { name: "Become an organiser" }).click();
        await expect(page).toHaveURL(/\/console\/pending$/);
        const { data: org } = await client
          .from("organisers")
          .select("kyc_status")
          .eq("owner_id", id)
          .single();
        const { data: member } = await client
          .from("organiser_members")
          .select("role")
          .eq("organiser_id", id)
          .eq("user_id", id)
          .single();
        expect(org?.kyc_status).toBe("draft");
        expect(member?.role).toBe("owner");
      }
      await page.goto(role === "blocked" ? "/blocked" : "/me");
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await page.goto("/me/settings");
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("magic link establishes SSR cookies and cannot be reused", async ({ page }) => {
    const client = admin();
    const email = `link-${crypto.randomUUID()}@example.test`;
    const { data: user } = await client.auth.admin.createUser({ email, email_confirm: true });
    if (!user.user) throw new Error("Could not create local auth fixture.");
    users.push(user.user.id);
    const { data, error } = await client.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw new Error("Could not create local sign-in link.");
    const link = `/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`;
    await page.goto(link);
    await expect(page).toHaveURL(/\/me$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    // Finish the server-action redirect before testing the consumed link.
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(link);
    await expect(page).toHaveURL(/\/login\?error=link$/);
    await expect(page.getByRole("status").filter({ hasText: "expired" })).toBeVisible();
  });
});

test("anonymous visitors cannot enter protected routes", async ({ page }) => {
  test.skip(!configured, "Local Supabase is needed.");
  for (const path of [
    "/admin",
    "/admin/organisers",
    "/console",
    "/console/pending",
    "/me/settings",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});
