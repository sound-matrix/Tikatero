import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
import { GET } from "@/app/auth/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
});
it("exchanges PKCE code and ignores attacker-controlled redirects", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  const response = await GET(
    new NextRequest("http://localhost/auth/callback?code=one-time&next=https://evil.invalid"),
  );
  expect(response.headers.get("location")).toBe("/auth/complete");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time");
});
it("supports email token hash confirmation", async () => {
  auth.verifyOtp.mockResolvedValue({ error: null });
  const response = await GET(
    new NextRequest("http://localhost/auth/callback?token_hash=one-time&type=email"),
  );
  expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "one-time", type: "email" });
  expect(response.headers.get("location")).toBe("/auth/complete");
});
it.each(["", "?token_hash=token&type=recovery", "?error=access_denied"])(
  "rejects malformed callbacks %s",
  async (query) => {
    const response = await GET(new NextRequest(`http://localhost/auth/callback${query}`));
    expect(response.headers.get("location")).toBe("/login?error=link");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  },
);
it("expired or already-used link exposes no provider errors", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "private provider details" } });
  const response = await GET(new NextRequest("http://localhost/auth/callback?code=expired"));
  expect(response.headers.get("location")).toBe("/login?error=link");
});

it("keeps the public host when a reverse proxy uses an internal request origin", async () => {
  auth.verifyOtp.mockResolvedValue({ error: null });
  const response = await GET(
    new NextRequest("http://localhost:3000/auth/callback?token_hash=one-time&type=email", {
      headers: { host: "127.0.0.1:3000" },
    }),
  );
  const location = response.headers.get("location")!;
  expect(new URL(location, "http://127.0.0.1:3000").origin).toBe("http://127.0.0.1:3000");
});
