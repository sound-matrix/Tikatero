import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mock.send };
  },
}));

import { sendContactNotice } from "./send";

const input = {
  name: "<b>Ann</b>",
  email: "ann@example.test",
  phone: null,
  topicLabel: "Other",
  orderRef: null,
  message: "Hello from the form.",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CONTACT_TO_EMAIL", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_FROM", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("sends to the env destination and sets reply_to", async () => {
  vi.stubEnv("CONTACT_TO_EMAIL", "desk@example.test");
  vi.stubEnv("RESEND_API_KEY", "unit-test-provider-key");
  vi.stubEnv("EMAIL_FROM", "Tikatero <hello@tikatero.example>");
  mock.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(sendContactNotice(input)).resolves.toBe(true);
  expect(mock.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: ["desk@example.test"],
      replyTo: "ann@example.test",
      subject: "[Tikatero Contact] Other — <b>Ann</b>",
    }),
  );
  const html = mock.send.mock.calls[0]?.[0].html as string;
  expect(html).toContain("&lt;b&gt;Ann&lt;/b&gt;");
  expect(html).not.toContain("<b>");
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

it("does not send or reveal the destination when email is not configured", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(sendContactNotice(input)).resolves.toBe(false);
  expect(mock.send).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledOnce();
  expect(String(warn.mock.calls[0]?.[0])).not.toContain("@");
  warn.mockRestore();
});
