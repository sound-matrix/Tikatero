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
  expect(response.headers.get("location")).toBe("http://localhost/auth/complete");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time");
});
it("supports email token hash confirmation", async () => {
  auth.verifyOtp.mockResolvedValue({ error: null });
  const response = await GET(
    new NextRequest("http://localhost/auth/callback?token_hash=one-time&type=email"),
  );
  expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "one-time", type: "email" });
  expect(response.headers.get("location")).toBe("http://localhost/auth/complete");
});
it.each(["", "?token_hash=token&type=recovery", "?error=access_denied"])(
  "rejects malformed callbacks %s",
  async (query) => {
    const response = await GET(new NextRequest(`http://localhost/auth/callback${query}`));
    expect(response.headers.get("location")).toBe("http://localhost/login?error=link");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  },
);
it("expired or already-used link exposes no provider errors", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "private provider details" } });
  const response = await GET(new NextRequest("http://localhost/auth/callback?code=expired"));
  expect(response.headers.get("location")).toBe("http://localhost/login?error=link");
});
