import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/db/types";
import { decimalHundredths } from "../lib/pricing";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!key;
if (configured && !["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
  throw new Error("Pricing browser tests must only use local Supabase.");

test("staff saves a version; preview and public fees update; previous version is preserved", async ({
  page,
}, testInfo) => {
  test.skip(!configured, "Local Supabase is needed to verify staff saves and audit records.");
  test.setTimeout(90_000);
  const client = createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: previous, error: readError } = await client.rpc("active_pricing_version");
  expect(readError).toBeNull();
  const original = previous![0];
  const email = `pricing-${crypto.randomUUID()}@example.test`;
  const { data: created, error } = await client.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: "Pricing Reviewer" },
  });
  expect(error).toBeNull();
  const id = created.user!.id;
  expect((await client.from("profiles").update({ role: "staff" }).eq("id", id)).error).toBeNull();
  const { data: link, error: linkError } = await client.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties) throw new Error("Could not create pricing test session.");
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=email`,
  );
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/pricing");
  const row = page.getByTestId("pricing-preview-100000");
  await expect(row).toBeVisible();
  await expect(row).toContainText("₹ 953.39");
  await page.screenshot({
    path: testInfo.outputPath("pricing-active-desktop.png"),
    fullPage: true,
  });
  const fill = async (values: typeof original) => {
    await page
      .getByLabel("Platform fee (%)", { exact: true })
      .fill(decimalHundredths(values.platform_pct));
    await page
      .getByLabel("Fixed fee per paid ticket (₹)")
      .fill(decimalHundredths(values.fixed_fee_paise));
    await page
      .getByRole("combobox", { name: "Gateway mode", exact: true })
      .selectOption(values.gateway_mode);
    await page.getByLabel("Gateway fee (%) before GST").fill(decimalHundredths(values.gateway_bps));
    await page.getByLabel("Payout days", { exact: true }).fill(String(values.payout_days));
  };
  let changed = false;
  try {
    await page.getByLabel("Who pays the fees?").selectOption("buyer");
    await expect(row).toContainText("₹ 1,046.61");
    await page.getByLabel("Who pays the fees?").selectOption("organiser");
    await fill({
      ...original,
      platform_pct: 200,
      fixed_fee_paise: 1000,
      gateway_mode: "absorb",
      payout_days: 3,
    });
    await expect(row).toContainText("₹ 964.60");
    await page.getByRole("button", { name: "Save — applies to new orders" }).click();
    await expect(page.getByRole("status")).toContainText("Saved — applies to new orders");
    changed = true;
    const { data: current } = await client.rpc("active_pricing_version");
    const next = current![0];
    expect(next.id).not.toBe(original.id);
    expect(next).toMatchObject({
      platform_pct: 200,
      fixed_fee_paise: 1000,
      gateway_mode: "absorb",
      payout_days: 3,
    });
    await page.reload();
    await expect(row).toBeVisible();
    await expect(row).toContainText("₹ 964.60");
    await expect(page.getByTestId("active-pricing-id")).toHaveText(next.id);
    const { data: old } = await client
      .from("pricing_versions")
      .select("*")
      .eq("id", original.id)
      .single();
    expect(old).toMatchObject(original);
    const { data: audit } = await client
      .from("audit_log")
      .select("actor_id,action,after")
      .eq("entity_id", next.id)
      .single();
    expect(audit).toMatchObject({
      actor_id: id,
      action: "pricing_version_created",
      after: { platform_pct: 200 },
    });
    await page.screenshot({
      path: testInfo.outputPath("pricing-saved-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(row).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("pricing-saved-mobile.png"),
      fullPage: true,
    });
    await page.goto("/");
    await expect(page.getByText(/Free for free events\. Paid tickets: 2%/)).toContainText(
      "₹ 964.60",
    );
  } finally {
    if (changed) {
      await page.goto("/admin/pricing");
      await fill(original);
      await page.getByRole("button", { name: "Save — applies to new orders" }).click();
      await expect(page.getByRole("status")).toContainText("Saved — applies to new orders");
    }
    // Audited staff actors remain in this disposable database until its next reset.
  }
});
