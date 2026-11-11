import { expect, it } from "vitest";
import { buildContactEmail, contactEmailPayload } from "./email";

const input = {
  name: 'Ann <script>alert("x")</script>',
  email: "ann@example.test",
  phone: "+919876543210",
  topicLabel: "Refund or cancellation",
  orderRef: "TK-1",
  message: "Please help & thanks <b>now</b>",
};

it("escapes HTML, sets reply_to, and takes the destination only from env", () => {
  expect(contactEmailPayload(input, {})).toBeNull();
  expect(contactEmailPayload(input, { CONTACT_TO_EMAIL: "not-an-email" })).toBeNull();
  const payload = contactEmailPayload(input, { CONTACT_TO_EMAIL: "Desk@Example.Test" });
  expect(payload).not.toBeNull();
  if (!payload) return;
  expect(payload.to).toBe("desk@example.test");
  expect(payload.replyTo).toBe("ann@example.test");
  expect(payload.subject).toBe(
    '[Tikatero Contact] Refund or cancellation — Ann <script>alert("x")</script>',
  );
  expect(payload.html).toContain("&lt;script&gt;");
  expect(payload.html).toContain("&quot;x&quot;");
  expect(payload.html).toContain("Please help &amp; thanks &lt;b&gt;now&lt;/b&gt;");
  expect(payload.html).not.toContain("<script");
  expect(payload.html).not.toContain("<b>");
  expect(payload.text).toContain("Please help & thanks <b>now</b>");
  expect(payload.to).not.toBe(payload.replyTo);
  expect(payload.html).not.toContain("desk@example.test");
});

it("keeps the subject on one line", () => {
  const payload = buildContactEmail({ ...input, name: "Ann\nBcc: someone" }, "desk@example.test");
  expect(payload.subject).not.toMatch(/[\r\n]/);
  expect(payload.subject.startsWith("[Tikatero Contact] Refund or cancellation — ")).toBe(true);
});
