import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!key;
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Email preview tests must only use local Supabase.");

test.describe("staff email preview gallery", () => {
  test.skip(!configured, "Local Supabase is needed for role checks.");
  for (const role of ["attendee", "staff"] as const) {
    test(`${role} access is enforced without a Resend key`, async ({ page }) => {
      const client = createClient<Database>(url!, key!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const email = `email-preview-${crypto.randomUUID()}@example.test`;
      const { data: user, error } = await client.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (error || !user.user) throw new Error("Could not create local preview fixture.");
      try {
        if (role === "staff") {
          const { error: roleError } = await client
            .from("profiles")
            .update({ role })
            .eq("id", user.user.id);
          expect(roleError).toBeNull();
        }
        const { data: link, error: linkError } = await client.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
        if (linkError) throw new Error("Could not create local preview session.");
        await page.goto(
          `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=email`,
        );
        await expect(page).toHaveURL(role === "staff" ? /\/admin$/ : /\/me$/);
        await page.goto("/admin/emails/preview");
        if (role === "attendee") {
          await expect(page).toHaveURL(/\/me$/);
          return;
        }
        await expect(
          page.getByRole("heading", { name: "Email previews", exact: true }),
        ).toBeVisible();
        await expect(page.locator("iframe")).toHaveCount(14);
        const receipt = page.frameLocator('iframe[title="order_confirmed email preview"]');
        await expect(
          receipt.getByRole("heading", { name: "Your booking is confirmed" }),
        ).toBeVisible();
        await expect(receipt.getByText("₹1,499 incl. GST", { exact: true })).toBeVisible();
        await expect(receipt.getByText("7 Nov 2026, 6:00 PM IST", { exact: true })).toBeVisible();
        await expect(receipt.getByText("© Sound Matrix", { exact: true })).toBeVisible();
        await expect(
          page.getByText("Sample messages only. Opening this page does not send email."),
        ).toBeVisible();
      } finally {
        await client.auth.admin.deleteUser(user.user.id);
      }
    });
  }
});
