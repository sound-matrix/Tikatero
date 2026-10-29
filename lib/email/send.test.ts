import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  send: vi.fn(),
  constructor: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  database: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: class {
    constructor(key: string) {
      mock.constructor(key);
    }
    emails = { send: mock.send };
  },
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mock.database }));
import { send, type SendOptions } from "./send";
import { emailSamples } from "./samples";

type Row = {
  id: string;
  idempotency_key: string;
  status: string;
  resend_id: string | null;
  template: string;
  entity_ref: string;
  to_email: string;
};
let rows: Map<string, Row>;
let finishFails: boolean;
const options: SendOptions<"order_confirmed"> = {
  template: "order_confirmed",
  to: "alex@example.test",
  entityRef: "order/demo-1042",
  data: emailSamples.order_confirmed,
};

beforeEach(() => {
  vi.resetAllMocks();
  rows = new Map();
  finishFails = false;
  vi.stubEnv("RESEND_API_KEY", "unit-test-provider-key");
  vi.stubEnv("EMAIL_FROM", "Tikatero <hello@tikatero.example>");
  vi.stubEnv("EMAIL_REPLY_TO", "support@tikatero.example");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tikatero.example");
  mock.database.mockReturnValue({ rpc: mock.rpc, from: mock.from });
  // Models the SQL function's atomic unique constraint and conditional transition.
  // Real function/grants are covered independently by the pgTAP tests.
  mock.rpc.mockImplementation(async (_name, args) => {
    const key = JSON.stringify([args.p_template, args.p_entity_ref, args.p_to_email]);
    const prior = rows.get(key);
    const status = args.p_configured ? "sending" : "skipped_not_configured";
    if (prior && !(prior.status === "skipped_not_configured" && args.p_configured))
      return { data: [], error: null };
    const row = prior ?? {
      id: crypto.randomUUID(),
      idempotency_key: `test-${rows.size}`,
      status,
      resend_id: null,
      template: args.p_template,
      entity_ref: args.p_entity_ref,
      to_email: args.p_to_email,
    };
    row.status = status;
    rows.set(key, row);
    return { data: [{ ...row }], error: null };
  });
  mock.from.mockImplementation(() => ({
    update: (values: Partial<Row>) => {
      const filters = new Map();
      const builder = {
        eq: (name: string, value: string) => {
          filters.set(name, value);
          return builder;
        },
        select: () => builder,
        single: async () => {
          if (finishFails) return { data: null, error: { message: "private database details" } };
          const row = [...rows.values()].find(
            (item) => item.id === filters.get("id") && item.status === filters.get("status"),
          );
          if (!row) return { data: null, error: {} };
          Object.assign(row, values);
          return { data: { id: row.id }, error: null };
        },
      };
      return builder;
    },
  }));
  mock.send.mockResolvedValue({ data: { id: "provider-demo-id" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("sends once, logs metadata/provider id, and supplies the opaque provider idempotency key", async () => {
  const first = await send(options);
  const second = await send(options);
  expect(first).toMatchObject({ status: "sent", providerId: "provider-demo-id" });
  expect(second.status).toBe("duplicate");
  expect(mock.send).toHaveBeenCalledOnce();
  const row = [...rows.values()][0];
  expect(row).toMatchObject({
    status: "sent",
    template: "order_confirmed",
    entity_ref: options.entityRef,
    to_email: options.to,
    resend_id: "provider-demo-id",
  });
  expect(mock.send.mock.calls[0][1]).toEqual({ idempotencyKey: row.idempotency_key });
  expect(mock.send.mock.calls[0][0]).toMatchObject({
    from: "Tikatero <hello@tikatero.example>",
    replyTo: "support@tikatero.example",
    to: [options.to],
  });
  expect(mock.send.mock.calls[0][0].html).toContain("₹1,499 incl. GST");
  expect(JSON.stringify(row)).not.toMatch(/<html|recipientName|attachment|Riverfront/);
});
it("handles concurrent duplicate calls atomically", async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => send(options)));
  expect(results.filter((result) => result.status === "sent")).toHaveLength(1);
  expect(mock.send).toHaveBeenCalledOnce();
  expect(rows.size).toBe(1);
});
it("normalizes recipient case/whitespace and trims the entity identity", async () => {
  await send({ ...options, to: " Alex@Example.Test ", entityRef: " order/demo-1042 " });
  expect((await send(options)).status).toBe("duplicate");
  expect(mock.send).toHaveBeenCalledOnce();
});
it("different template/entity/recipient tuples can each send", async () => {
  await send(options);
  await send({ ...options, entityRef: "order/demo-1043" });
  await send({ ...options, to: "sam@example.test" });
  await send({
    template: "payment_failed",
    to: options.to,
    entityRef: options.entityRef,
    data: emailSamples.payment_failed,
  });
  expect(mock.send).toHaveBeenCalledTimes(4);
  expect(rows.size).toBe(4);
});
it("missing keys log skipped_not_configured without constructing Resend", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect((await send(options)).status).toBe("skipped_not_configured");
  expect((await send(options)).status).toBe("skipped_not_configured");
  expect([...rows.values()][0].status).toBe("skipped_not_configured");
  expect(mock.constructor).not.toHaveBeenCalled();
  expect(rows.size).toBe(1);
});
it("a configuration skip can be claimed once when configuration is added", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  await send(options);
  vi.stubEnv("RESEND_API_KEY", "unit-test-provider-key");
  await Promise.all([send(options), send(options)]);
  expect(mock.send).toHaveBeenCalledOnce();
  expect(rows.size).toBe(1);
  expect([...rows.values()][0].status).toBe("sent");
});
it.each(["EMAIL_FROM", "NEXT_PUBLIC_SITE_URL"])(
  "missing %s also skips without breaking pages",
  async (name) => {
    vi.stubEnv(name, "");
    expect((await send(options)).status).toBe("skipped_not_configured");
    expect(mock.send).not.toHaveBeenCalled();
  },
);
it("fails closed when the log cannot be claimed", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { message: "private database details" } });
  expect((await send(options)).status).toBe("logging_failed");
  expect(mock.send).not.toHaveBeenCalled();
  mock.database.mockImplementation(() => {
    throw new Error("private database details");
  });
  expect((await send(options)).status).toBe("logging_failed");
});
it("never retries an ambiguous provider failure, even on a later call", async () => {
  mock.send.mockRejectedValue(new Error("private provider details and customer body"));
  expect((await send(options)).status).toBe("unknown");
  expect([...rows.values()][0].status).toBe("unknown");
  expect((await send(options)).status).toBe("duplicate");
  expect(mock.send).toHaveBeenCalledOnce();
});
it("holds confirmed provider failures instead of silently resending", async () => {
  mock.send.mockResolvedValue({ data: null, error: { message: "private recipient details" } });
  expect((await send(options)).status).toBe("failed");
  expect([...rows.values()][0].status).toBe("failed_provider");
  await send(options);
  expect(mock.send).toHaveBeenCalledOnce();
});
it("a failure to record provider success cannot cause another send", async () => {
  finishFails = true;
  expect((await send(options)).status).toBe("sent_unlogged");
  expect([...rows.values()][0].status).toBe("sending");
  expect((await send(options)).status).toBe("duplicate");
  expect(mock.send).toHaveBeenCalledOnce();
});
it("passes in-memory order attachments but never records their content", async () => {
  await send({
    ...options,
    attachments: [
      {
        filename: "booking.pdf",
        content: Buffer.from("synthetic attachment"),
        contentType: "application/pdf",
      },
    ],
  });
  expect(mock.send.mock.calls[0][0].attachments[0]).toMatchObject({
    filename: "booking.pdf",
    contentType: "application/pdf",
  });
  expect(JSON.stringify([...rows.values()])).not.toContain("synthetic attachment");
});
it("validates identities and attachment paths without logging provider/body details", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(
    (await send({ ...options, to: "alex@example.test\r\nBcc:evil@example.test" })).status,
  ).toBe("invalid_input");
  expect((await send({ ...options, entityRef: "bad\u001fidentity" })).status).toBe("invalid_input");
  expect(
    (
      await send({
        ...options,
        attachments: [{ filename: "../booking.pdf", content: Buffer.from("test") }],
      })
    ).status,
  ).toBe("invalid_input");
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(output).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  output.mockRestore();
  log.mockRestore();
});
it("records render failures without sending or storing the bad body", async () => {
  expect(
    (
      await send({
        ...options,
        data: {
          ...emailSamples.order_confirmed,
          event: { title: "Demo", startsAt: "invalid", venue: "Demo" },
        },
      })
    ).status,
  ).toBe("failed");
  expect([...rows.values()][0].status).toBe("failed_render");
  expect(mock.send).not.toHaveBeenCalled();
});
