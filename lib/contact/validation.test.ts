import { describe, expect, it } from "vitest";
import { CONTACT_MIN_FILL_MS, validateContact } from "./validation";

const now = 1_700_000_000_000;

function submission(overrides: Record<string, unknown> = {}) {
  return validateContact(
    {
      name: "Priya Shah",
      email: "Priya@Example.Test",
      phone: "",
      topic: "refund",
      orderRef: "",
      message: "Please help with my refund.",
      honeypot: "",
      startedAt: String(now - CONTACT_MIN_FILL_MS),
      ...overrides,
    },
    now,
  );
}

describe("contact validation", () => {
  it("accepts a complete message and normalises the email and phone", () => {
    const result = submission({ phone: "+91 98765 43210" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Priya Shah",
      firstName: "Priya",
      email: "priya@example.test",
      phone: "+919876543210",
      topic: "refund",
      topicLabel: "Refund or cancellation",
      orderRef: null,
      message: "Please help with my refund.",
    });
  });

  it("rejects missing required fields", () => {
    const result = submission({ name: "  ", email: "", topic: "", message: "   " });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields?.name).toBe("Enter your full name.");
    expect(result.fields?.email).toBe("Enter a valid email address.");
    expect(result.fields?.topic).toBe("Choose what this is about.");
    expect(result.fields?.message).toBe("Write at least 10 characters so we can help.");
  });

  it("rejects a short message, a long message, and a long name", () => {
    expect(submission({ message: "Too short" }).ok).toBe(false);
    const longMessage = submission({ message: "a".repeat(2001) });
    expect(longMessage.ok).toBe(false);
    if (!longMessage.ok) expect(longMessage.fields?.message).toMatch(/2,000/);
    const longName = submission({ name: "A".repeat(121) });
    expect(longName.ok).toBe(false);
    if (!longName.ok) expect(longName.fields?.name).toBe("Enter a shorter name.");
    expect(submission({ message: "a".repeat(2000) }).ok).toBe(true);
    expect(submission({ message: "a".repeat(10) }).ok).toBe(true);
  });

  it("rejects a bad email and a phone that is not an Indian mobile", () => {
    const email = submission({ email: "not-an-email" });
    expect(email.ok).toBe(false);
    if (!email.ok) expect(email.fields?.email).toBe("Enter a valid email address.");
    const phone = submission({ phone: "5551234567" });
    expect(phone.ok).toBe(false);
    if (!phone.ok) expect(phone.fields?.phone).toMatch(/Indian mobile/);
    expect(submission({ phone: "9876543210" }).ok).toBe(true);
  });

  it("rejects a filled honeypot and a form sent too quickly", () => {
    const honeypot = submission({ honeypot: "https://spam.example" });
    expect(honeypot.ok).toBe(false);
    if (!honeypot.ok) expect(honeypot.spam).toBe(true);
    const fast = submission({ startedAt: String(now - 500) });
    expect(fast.ok).toBe(false);
    if (!fast.ok) expect(fast.spam).toBe(true);
    expect(submission({ startedAt: "" }).ok).toBe(false);
  });

  it("strips control characters before it checks the message", () => {
    const result = submission({ name: "Ann\u0000 Shah", message: "hello\u0000 world!!" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Ann Shah");
    expect(result.value.message).toBe("hello world!!");
    expect(result.value.message).not.toMatch(/[\u0000-\u001f]/);
  });
});
