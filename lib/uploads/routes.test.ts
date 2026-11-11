import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Account } from "@/lib/auth/routing";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  event: vi.fn(),
  signed: vi.fn(),
  upload: vi.fn(),
  bucket: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mock.from, rpc: mock.rpc }),
}));
vi.mock("@/lib/auth/account", () => ({ readAccount: mock.actor }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ storage: { from: mock.bucket } }),
}));
import { POST as sign } from "@/app/api/uploads/sign/route";
import { POST as read } from "@/app/api/uploads/read/route";
import { PUT as upload } from "@/app/api/uploads/file/route";
import { MAX_IMAGE_BYTES, type SignedUpload } from "./policy";
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
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const body = { kind: "poster", mime: "image/png", size: png.length, entityId: event };
const request = (data: unknown) =>
  new Request("http://localhost/api/uploads", { method: "POST", body: JSON.stringify(data) });
const fileRequest = (signed: SignedUpload, data = png) =>
  new Request("http://localhost/api/uploads/file?part=0", {
    method: "PUT",
    headers: { ...signed.headers, "content-type": signed.mime },
    body: new Uint8Array(data),
  });
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", crypto.randomUUID());
  mock.actor.mockResolvedValue(member);
  mock.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mock.event }) }) });
  mock.event.mockResolvedValue({ data: { organiser_id: org }, error: null });
  mock.rpc.mockResolvedValue({ data: false, error: null });
  mock.bucket.mockReturnValue({ createSignedUrl: mock.signed, upload: mock.upload });
  mock.upload.mockResolvedValue({ data: {}, error: null });
  mock.signed.mockResolvedValue({
    data: { signedUrl: "https://project.supabase.co/signed" },
    error: null,
  });
});
it("returns 401 for anonymous callers and 403 for blocked accounts", async () => {
  mock.actor.mockResolvedValue(null);
  expect((await sign(request(body))).status).toBe(401);
  mock.actor.mockResolvedValue({
    ...member,
    profile: { ...member.profile, blocked_at: "2026-10-29" },
  });
  expect((await sign(request(body))).status).toBe(403);
  expect((await read(request({ key: objectKey }))).status).toBe(403);
  expect(mock.bucket).not.toHaveBeenCalled();
});
it("attendees, unrelated organisers and staff without membership cannot sign uploads", async () => {
  for (const actor of [
    attendee,
    { ...member, organisers: [{ id: otherOrg, kyc_status: "approved" }] },
    { ...attendee, profile: { ...attendee.profile, role: "staff" } },
  ]) {
    mock.actor.mockResolvedValue(actor);
    expect((await sign(request(body))).status).toBe(403);
  }
});
it.each(["poster", "guest_photo"])(
  "authorises %s against event ownership and returns a Supabase path",
  async (kind) => {
    const response = await sign(request({ ...body, kind }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.key).toMatch(new RegExp(`^media/${kind}/${event}/[0-9a-f-]+\\.png$`));
    expect(result.publicUrl).toBe(
      `https://project.supabase.co/storage/v1/object/public/event-media/${result.key}`,
    );
    expect(result.url).toBe("/api/uploads/file");
    expect(result.expiresIn).toBe(300);
    expect(mock.from).toHaveBeenCalledWith("events");
    expect(response.headers.get("cache-control")).toContain("no-store");
  },
);
it.each(["org_logo", "kyc_doc"])("authorises %s only for the caller's organiser", async (kind) => {
  expect((await sign(request({ ...body, kind, entityId: otherOrg }))).status).toBe(403);
  const response = await sign(request({ ...body, kind, entityId: org }));
  expect(response.status).toBe(200);
  if (kind === "kyc_doc") expect(await response.json()).not.toHaveProperty("publicUrl");
  expect(mock.from).not.toHaveBeenCalled();
});
it("denies missing events and fails closed on lookup errors", async () => {
  mock.event.mockResolvedValue({ data: null, error: null });
  expect((await sign(request(body))).status).toBe(403);
  mock.event.mockResolvedValue({ data: null, error: { message: "private details" } });
  expect((await sign(request(body))).status).toBe(503);
});
it("rejects wrong types, oversized metadata/files and invalid JSON", async () => {
  expect((await sign(request({ ...body, mime: "text/html" }))).status).toBe(400);
  expect((await sign(request({ ...body, size: MAX_IMAGE_BYTES + 1 }))).status).toBe(413);
  expect((await sign(request({ extra: "x".repeat(4097) }))).status).toBe(413);
  expect(
    (await sign(new Request("http://localhost", { method: "POST", body: "bad" }))).status,
  ).toBe(400);
});
it("rechecks membership on file transfer and sniffs actual bytes before storage", async () => {
  const signed = await (await sign(request(body))).json();
  mock.actor.mockResolvedValue(attendee);
  expect((await upload(fileRequest(signed))).status).toBe(403);
  expect(mock.upload).not.toHaveBeenCalled();
  mock.actor.mockResolvedValue(member);
  expect((await upload(fileRequest(signed, Buffer.from("badbytes")))).status).toBe(400);
  expect((await upload(fileRequest(signed, Buffer.concat([png, png])))).status).toBe(413);
  expect(mock.upload).not.toHaveBeenCalled();
  expect((await upload(fileRequest(signed))).status).toBe(200);
  expect(mock.bucket).toHaveBeenCalledWith("event-media");
  expect(mock.upload).toHaveBeenCalledWith(
    signed.key,
    png,
    expect.objectContaining({ contentType: "image/png", upsert: false }),
  );
});
it("rejects tampered upload tokens", async () => {
  const signed = await (await sign(request(body))).json();
  signed.headers["x-upload-token"] += "invalid";
  expect((await upload(fileRequest(signed))).status).toBe(403);
  expect(mock.upload).not.toHaveBeenCalled();
});
it("only staff get short private KYC download links", async () => {
  expect((await read(request({ key: objectKey }))).status).toBe(403);
  expect(mock.signed).not.toHaveBeenCalled();
  mock.rpc.mockResolvedValue({ data: true, error: null });
  const response = await read(request({ key: objectKey, ttlSeconds: 60 }));
  expect(response.status).toBe(200);
  expect(mock.bucket).toHaveBeenCalledWith("private-files");
  expect(mock.signed).toHaveBeenCalledWith(objectKey, 60, {
    download: "verification-document.pdf",
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("never signs arbitrary keys or long-lived reads, even for staff", async () => {
  mock.rpc.mockResolvedValue({ data: true, error: null });
  for (const key of ["../../secret", objectKey.replace("kyc_doc", "poster")])
    expect((await read(request({ key }))).status).toBe(400);
  expect((await read(request({ key: objectKey, ttlSeconds: 301 }))).status).toBe(400);
  expect(mock.signed).not.toHaveBeenCalled();
});
it("fails closed on staff/service errors without returning provider details", async () => {
  mock.rpc.mockResolvedValue({ data: true, error: { message: "private details" } });
  expect((await read(request({ key: objectKey }))).status).toBe(503);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const response = await sign(request(body));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toMatch(/private details|credentials/);
});
