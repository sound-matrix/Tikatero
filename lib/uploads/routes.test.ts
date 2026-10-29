import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Account } from "@/lib/auth/routing";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  event: vi.fn(),
  signed: vi.fn(),
  s3: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mock.from, rpc: mock.rpc }),
}));
vi.mock("@/lib/auth/account", () => ({ readAccount: mock.actor }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(config: unknown) {
      mock.s3(config);
    }
    destroy() {
      mock.destroy();
    }
  },
  PutObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mock.signed }));
import { POST as sign } from "@/app/api/uploads/sign/route";
import { POST as read } from "@/app/api/uploads/read/route";
import { MAX_IMAGE_BYTES } from "./policy";
const org = "f1111111-1111-4111-8111-111111111111";
const otherOrg = "f2222222-2222-4222-8222-222222222222";
const event = "f3333333-3333-4333-8333-333333333333";
const objectKey = `kyc_doc/${org}/f4444444-4444-4444-8444-444444444444.pdf`;
const attendee: Account = {
  profile: {
    id: "user",
    full_name: null,
    phone: null,
    role: "attendee",
    blocked_at: null,
    block_reason: null,
  },
  organisers: [],
};
const member: Account = { ...attendee, organisers: [{ id: org, kyc_status: "draft" }] };
const body = { kind: "poster", mime: "image/png", size: 1200, entityId: event };
const request = (data: unknown) =>
  new Request("http://localhost/api/uploads", { method: "POST", body: JSON.stringify(data) });

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("R2_ACCOUNT_ID", "0".repeat(32));
  vi.stubEnv("R2_ACCESS_KEY_ID", "unit-test-access-id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "unit-test-secret-value");
  vi.stubEnv("R2_PUBLIC_BUCKET", "unit-public");
  vi.stubEnv("R2_PRIVATE_BUCKET", "unit-private");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.example.test/assets/");
  mock.actor.mockResolvedValue(member);
  mock.from.mockReturnValue({ select: mock.select });
  mock.select.mockReturnValue({ eq: mock.eq });
  mock.eq.mockReturnValue({ maybeSingle: mock.event });
  mock.event.mockResolvedValue({ data: { organiser_id: org }, error: null });
  mock.rpc.mockResolvedValue({ data: false, error: null });
  mock.signed.mockResolvedValue("https://storage.example.test/signed");
});

it("returns 401 for anonymous callers, and 403 for blocked accounts", async () => {
  mock.actor.mockResolvedValue(null);
  expect((await sign(request(body))).status).toBe(401);
  mock.actor.mockResolvedValue({
    ...member,
    profile: { ...member.profile, blocked_at: "2026-10-29" },
  });
  expect((await sign(request(body))).status).toBe(403);
  expect((await read(request({ key: objectKey }))).status).toBe(403);
  expect(mock.signed).not.toHaveBeenCalled();
});
it("attendees and unrelated organisers cannot sign event uploads", async () => {
  for (const actor of [
    attendee,
    { ...member, organisers: [{ id: otherOrg, kyc_status: "approved" }] },
  ]) {
    mock.actor.mockResolvedValue(actor);
    expect((await sign(request(body))).status).toBe(403);
  }
  expect(mock.signed).not.toHaveBeenCalled();
});
it.each(["poster", "guest_photo"])(
  "signs %s only after resolving the event's owning organiser",
  async (kind) => {
    const response = await sign(request({ ...body, kind }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.key).toMatch(new RegExp(`^${kind}/${event}/[0-9a-f-]+\\.png$`));
    expect(result.publicUrl).toBe(`https://media.example.test/assets/${result.key}`);
    expect(mock.from).toHaveBeenCalledWith("events");
    expect(mock.eq).toHaveBeenCalledWith("id", event);
    const command = mock.signed.mock.calls[0][1];
    expect(command.input).toMatchObject({
      Bucket: "unit-public",
      ContentType: "image/png",
      ContentLength: 1200,
    });
    expect(mock.signed.mock.calls[0][2]).toEqual({
      expiresIn: 300,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mock.destroy).toHaveBeenCalledOnce();
  },
);
it.each(["org_logo", "kyc_doc"])("signs %s only for the caller's own organiser", async (kind) => {
  expect((await sign(request({ ...body, kind, entityId: otherOrg }))).status).toBe(403);
  const response = await sign(request({ ...body, kind, entityId: org }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(mock.signed.mock.calls[0][1].input.Bucket).toBe(
    kind === "kyc_doc" ? "unit-private" : "unit-public",
  );
  if (kind === "kyc_doc") expect(result).not.toHaveProperty("publicUrl");
  expect(mock.from).not.toHaveBeenCalled();
});
it("does not give staff an upload override without membership", async () => {
  mock.actor.mockResolvedValue({ ...attendee, profile: { ...attendee.profile, role: "staff" } });
  expect((await sign(request(body))).status).toBe(403);
  expect(mock.signed).not.toHaveBeenCalled();
});
it("denies missing events and fails closed on lookup errors", async () => {
  mock.event.mockResolvedValue({ data: null, error: null });
  expect((await sign(request(body))).status).toBe(403);
  mock.event.mockResolvedValue({ data: null, error: { message: "private provider details" } });
  expect((await sign(request(body))).status).toBe(503);
  expect(mock.signed).not.toHaveBeenCalled();
});
it("rejects wrong types, oversized files, malformed JSON and oversized metadata before signing", async () => {
  expect((await sign(request({ ...body, mime: "text/html" }))).status).toBe(400);
  const oversized = await sign(request({ ...body, size: MAX_IMAGE_BYTES + 1 }));
  expect(oversized.status).toBe(413);
  expect((await oversized.json()).error).toContain("under 5 MB");
  expect(
    (await sign(new Request("http://localhost", { method: "POST", body: "invalid JSON" }))).status,
  ).toBe(400);
  expect((await sign(request({ extra: "x".repeat(4097) }))).status).toBe(413);
  expect(mock.signed).not.toHaveBeenCalled();
});
it("non-staff members cannot get KYC read links", async () => {
  expect((await read(request({ key: objectKey }))).status).toBe(403);
  expect(mock.rpc).toHaveBeenCalledWith("is_staff");
  expect(mock.signed).not.toHaveBeenCalled();
});
it("staff reads are private, short-lived and download-only", async () => {
  mock.rpc.mockResolvedValue({ data: true, error: null });
  const response = await read(request({ key: objectKey, ttlSeconds: 60 }));
  expect(response.status).toBe(200);
  expect(mock.signed.mock.calls[0][1].input).toMatchObject({
    Bucket: "unit-private",
    Key: objectKey,
    ResponseCacheControl: "private, no-store",
    ResponseContentDisposition: 'attachment; filename="verification-document.pdf"',
  });
  expect(mock.signed.mock.calls[0][2]).toEqual({ expiresIn: 60 });
  expect(await response.json()).toEqual({
    url: "https://storage.example.test/signed",
    expiresIn: 60,
  });
});
it("never signs arbitrary private keys or long read URLs, even for staff", async () => {
  mock.rpc.mockResolvedValue({ data: true, error: null });
  for (const key of ["../../secret", objectKey.replace("kyc_doc", "poster")])
    expect((await read(request({ key }))).status).toBe(400);
  expect((await read(request({ key: objectKey, ttlSeconds: 301 }))).status).toBe(400);
  expect(mock.signed).not.toHaveBeenCalled();
});
it("fails closed on staff lookup errors, and never returns SDK details or keys", async () => {
  mock.rpc.mockResolvedValue({ data: true, error: { message: "private details" } });
  expect((await read(request({ key: objectKey }))).status).toBe(503);
  mock.signed.mockRejectedValue(new Error("unit-test-secret-value private SDK details"));
  const response = await sign(request(body));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toMatch(/unit-test-secret-value|SDK details/);
});
it("rejects an unsafe shared public/private bucket configuration", async () => {
  vi.stubEnv("R2_PRIVATE_BUCKET", "unit-public");
  expect((await sign(request({ ...body, kind: "kyc_doc", entityId: org }))).status).toBe(503);
  expect(mock.signed).not.toHaveBeenCalled();
});
