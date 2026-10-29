import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { templateNames, createEmail } from "./templates";
import { emailSamples } from "./samples";
import { renderEmail } from "./render";
const site = "https://tikatero.example";

it.each(templateNames)(
  "renders and snapshots %s as branded HTML and plain text",
  async (template) => {
    const result = await renderEmail(template, emailSamples[template], site);
    expect(result.html).toContain("© Sound Matrix");
    expect(result.html).toContain("https://tikatero.example/brand/tikatero-email-logo.png");
    expect(result.html).toContain("#F25C54");
    expect(result.text).toContain("© Sound Matrix");
    expect(result.text.length).toBeGreaterThan(100);
    expect(result.text).not.toMatch(/\b(?:GSTIN|CIN|LLP)\b/i);
    expect(result.html).not.toMatch(/<script/i);
    expect(result).toMatchSnapshot();
  },
);
it("escapes content and refuses external or script action URLs", async () => {
  const escaped = await renderEmail(
    "staff_alert",
    {
      title: "<script>bad()</script>",
      summary: '<img src=x onerror="bad()">',
      entityLabel: "test",
    },
    site,
  );
  expect(escaped.html).not.toContain("<script>");
  expect(escaped.html).toContain("&lt;script&gt;");
  for (const actionPath of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/me\nignored",
  ]) {
    await expect(
      renderEmail("kyc_approved", { ...emailSamples.kyc_approved, actionPath }, site),
    ).rejects.toThrow("Invalid email action path");
  }
});
it("rejects incomplete template data before it can be delivered", () => {
  expect(() =>
    createEmail("kyc_needs_docs", { organiserName: "Demo", requestedDocs: [] }, site),
  ).toThrow();
  expect(() =>
    createEmail(
      "event_reminder",
      { event: { title: "Demo", startsAt: "invalid", venue: "Demo" } },
      site,
    ),
  ).toThrow();
});
