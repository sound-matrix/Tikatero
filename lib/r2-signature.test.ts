import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { signUpload } from "./r2";
afterEach(() => vi.unstubAllEnvs());

it("the actual SDK signature binds Content-Length and Content-Type without contacting R2", async () => {
  vi.stubEnv("R2_ACCOUNT_ID", "0".repeat(32));
  vi.stubEnv("R2_ACCESS_KEY_ID", crypto.randomUUID());
  vi.stubEnv("R2_SECRET_ACCESS_KEY", crypto.randomUUID());
  vi.stubEnv("R2_PUBLIC_BUCKET", "unit-public");
  vi.stubEnv("R2_PRIVATE_BUCKET", "unit-private");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.example.test");
  const result = await signUpload({
    kind: "poster",
    entityId: "f1111111-1111-4111-8111-111111111111",
    mime: "image/jpeg",
    size: 100,
  });
  const url = new URL(result.url);
  expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
    expect.arrayContaining(["content-length", "content-type", "host"]),
  );
  expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  expect(url.hostname).toContain("r2.cloudflarestorage.com");
  expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
});
