import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mediaUrl } from "@/components/discovery/media";
afterEach(() => vi.unstubAllEnvs());
it("renders legacy/malformed values as missing images and accepts new paths", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  const key =
    "poster/f1111111-1111-4111-8111-111111111111/f2222222-2222-4222-8222-222222222222.png";
  for (const value of [null, key, "https://old-media.example.test/photo.png", "../../image.png"])
    expect(mediaUrl(value)).toBeNull();
  expect(mediaUrl(`media/${key}`)).toBe(
    `https://project.supabase.co/storage/v1/object/public/event-media/media/${key}`,
  );
});
