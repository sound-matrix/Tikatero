import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!key;
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("KYC browser tests must only use local Supabase.");
test.describe("India organiser verification", () => {
  test.skip(!configured, "Local Supabase is needed for ownership and saved progress.");
  test("mock journey saves masked checks, resumes and submits for review", async ({ page }) => {
    test.setTimeout(60_000);
    const client = createClient<Database>(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `kyc-${crypto.randomUUID()}@example.test`;
    const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw new Error("Could not create local KYC fixture.");
    const id = data.user.id;
    try {
      expect(
        (
          await client
            .from("organisers")
            .insert({ id, owner_id: id, display_name: "Riverfront Live", slug: `kyc-${id}` })
        ).error,
      ).toBeNull();
      const { data: link, error: linkError } = await client.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (linkError) throw new Error("Could not create KYC test session.");
      await page.goto(
        `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=email`,
      );
      await expect(page).toHaveURL(/\/console\/pending$/);
      await page.getByRole("link", { name: "Start or continue verification" }).click();
      await page.getByLabel("Where is your organiser based?").selectOption("INTL");
      await expect(
        page.getByRole("heading", { name: "Coming soon — please contact support" }),
      ).toBeVisible();
      await page.getByLabel("Where is your organiser based?").selectOption("IN");
      await expect(
        page.getByText(
          "Test mode — checks are simulated; the verification team will review your documents.",
          { exact: true },
        ),
      ).toBeVisible();
      await page.getByLabel("Organiser display name").fill("Riverfront Live");
      await page.getByLabel("Legal name").fill("Alex Shah");
      await page.getByLabel("Contact phone").fill("9876543210");
      await page.getByLabel("City", { exact: true }).fill("Pune");
      await page.getByRole("button", { name: "Save and continue", exact: true }).click();
      await expect(page.getByRole("heading", { name: "PAN", exact: true })).toBeVisible();
      const pan = ["ABCDE", "1234", "F"].join("");
      await page.getByLabel("PAN", { exact: true }).fill(pan);
      await page.getByRole("button", { name: "Verify", exact: true }).click();
      await expect(page.getByText("Name match: 100%", { exact: true })).toBeVisible();
      await expect(page.getByLabel("PAN", { exact: true })).toHaveValue("");
      await page.reload();
      await expect(page.getByRole("heading", { name: "Aadhaar", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Run mock DigiLocker check" }).click();
      await expect(page.getByText("Saved ending 1234", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Save GSTIN or skip" }).click();
      await expect(page.getByText("Mock check complete", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const account = "98765432100123";
      await page.getByLabel("Bank account number", { exact: true }).fill(account);
      await page.getByLabel("IFSC", { exact: true }).fill("TEST0123456");
      await page.getByRole("button", { name: "Verify", exact: true }).click();
      await expect(page.getByText("Account holder name:", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Save selfie check" }).click();
      await expect(
        page.getByText("Liveness: 99% · Face match: 99%", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Submit for verification", exact: true }).click();
      await expect(page).toHaveURL(/\/console\/pending$/);
      await expect(
        page.getByRole("heading", {
          name: "We’re checking your details — usually within 1 working day.",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "🔒 Publish — approval needed" }),
      ).toBeDisabled();
      const { data: row, error: rowError } = await client
        .from("kyc_applications")
        .select("*")
        .eq("organiser_id", id)
        .single();
      expect(rowError).toBeNull();
      expect(row?.status).toBe("auto_passed");
      expect(row?.pan_last4).toBe("234F");
      expect(row?.aadhaar_last4).toBe("1234");
      expect(row?.bank_acct_last4).toBe("0123");
      expect(JSON.stringify(row)).not.toContain(pan);
      expect(JSON.stringify(row)).not.toContain(account);
      const { data: org } = await client
        .from("organisers")
        .select("kyc_status")
        .eq("id", id)
        .single();
      expect(org?.kyc_status).toBe("auto_passed");
      // Model PR 7 requesting one correction; no admin review UI is introduced here.
      expect(
        (
          await client
            .from("kyc_applications")
            .update({
              status: "needs_docs",
              flagged_steps: ["bank"],
              reviewer_note: "Please check the bank account.",
            })
            .eq("organiser_id", id)
        ).error,
      ).toBeNull();
      expect(
        (await client.from("organisers").update({ kyc_status: "needs_docs" }).eq("id", id)).error,
      ).toBeNull();
      await page.goto("/console/onboarding");
      await expect(page.getByRole("heading", { name: "Bank account", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "2 PAN", exact: true }).click();
      await expect(page.getByLabel("PAN", { exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "5 · Check Bank account", exact: true }).click();
      await page.getByLabel("Bank account number", { exact: true }).fill(account);
      await page.getByLabel("IFSC", { exact: true }).fill("TEST0123456");
      await page.getByRole("button", { name: "Verify", exact: true }).click();
      await expect(page.getByText("Name match: 100%", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "7 Review & submit", exact: true }).click();
      await page.getByRole("button", { name: "Submit for verification", exact: true }).click();
      await expect(page).toHaveURL(/\/console\/pending$/);
      const { data: resubmitted } = await client
        .from("kyc_applications")
        .select("status,submission_count,flagged_steps")
        .eq("organiser_id", id)
        .single();
      expect(resubmitted).toMatchObject({
        status: "auto_passed",
        submission_count: 2,
        flagged_steps: [],
      });
      const { data: logs } = await client
        .from("email_log")
        .select("template,status")
        .like("entity_ref", `kyc/${row!.id}/submission/%`)
        .eq("template", "kyc_submitted");
      expect(logs).toHaveLength(2);
      expect(logs?.every((log) => log.status === "skipped_not_configured")).toBe(true);
    } finally {
      await client.from("organisers").delete().eq("id", id);
      await client.auth.admin.deleteUser(id);
    }
  });
});
