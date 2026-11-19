import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  BACKOFF_MINUTES,
  appSecretProof,
  backoffMs,
  metaConfigured,
  publishToMeta,
  readMetaConfig,
  sanitizeMetaError,
  terminalAttempt,
  type MetaConfig,
} from "@/lib/social/meta";

vi.mock("server-only", () => ({}));

const config: MetaConfig = {
  version: "v27.0",
  pageId: "10001",
  igUserId: "17841442825068107",
  pageToken: "EAAtesttokenvalue1234567890",
  appSecret: "synthetic-app-secret",
  appId: "10002",
};

const post = {
  id: "post-1",
  platform: "instagram" as const,
  kind: "feed" as const,
  attempts: 1,
  ig_container_id: null as string | null,
  caption: "City Lights",
  event_slug: "city-lights",
  ig_collaborator: null as string | null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Meta client", () => {
  it("builds the app secret proof and refuses to run when env is missing", async () => {
    expect(appSecretProof("token", "secret")).toBe(
      createHmac("sha256", "secret").update("token").digest("hex"),
    );
    const empty = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
    expect(readMetaConfig(empty)).toBeNull();
    expect(metaConfigured(empty)).toBe(false);
    const fetchImpl = vi.fn();
    await expect(
      publishToMeta({
        config: null,
        post,
        imageUrl: "https://tikatero.com/photo.jpg",
        igPostedLast24h: 0,
        igDailyCap: 25,
        fetchImpl,
      }),
    ).resolves.toEqual({ skipped: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("publishes after the container finishes and proves the secret without putting it in the URL", async () => {
    let statusCalls = 0;
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(`${init?.method ?? "GET"} ${url}`);
      expect(url).not.toContain(config.pageToken);
      expect(url).not.toContain("access_token=");
      if ((init?.method ?? "GET") === "GET") {
        expect(url).toContain(
          `appsecret_proof=${appSecretProof(config.pageToken, config.appSecret)}`,
        );
      }
      if (url.includes("content_publishing_limit")) {
        return json({ quota_usage: 1, config: { quota_total: 100 } });
      }
      if (init?.method === "POST" && url.endsWith("/media")) {
        const body = String(init.body);
        expect(body).toContain(
          `appsecret_proof=${appSecretProof(config.pageToken, config.appSecret)}`,
        );
        expect(body).toContain(`access_token=${config.pageToken}`);
        return json({ id: "container-1" });
      }
      if (url.includes("/container-1?") || url.endsWith("/container-1")) {
        statusCalls += 1;
        return json({ status_code: statusCalls === 1 ? "IN_PROGRESS" : "FINISHED" });
      }
      if (url.endsWith("/media_publish")) return json({ id: "media-1" });
      if (url.includes("/media-1")) return json({ permalink: "https://instagram.com/p/abc" });
      throw new Error(`unexpected ${url}`);
    });
    let clock = 0;
    const saved: string[] = [];
    const outcome = await publishToMeta({
      config,
      post,
      imageUrl: "https://tikatero.com/photo.jpg",
      igPostedLast24h: 0,
      igDailyCap: 25,
      fetchImpl,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      onContainer: async (id) => {
        saved.push(id);
      },
    });
    expect(saved).toEqual(["container-1"]);
    expect(seen.some((line) => line.includes("/media_publish"))).toBe(true);
    expect(outcome).toMatchObject({
      action: "posted",
      fields: {
        ig_container_id: "container-1",
        meta_post_id: "media-1",
        permalink: "https://instagram.com/p/abc",
      },
    });
  });

  it("clears an errored container and does not publish a second time when it is already published", async () => {
    const errored = await publishToMeta({
      config,
      post: { ...post, ig_container_id: "old-container" },
      imageUrl: "https://tikatero.com/photo.jpg",
      igPostedLast24h: 0,
      igDailyCap: 25,
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("content_publishing_limit"))
          return json({ quota_usage: 0, config: { quota_total: 50 } });
        if (url.includes("old-container")) return json({ status_code: "ERROR" });
        throw new Error(`unexpected ${url}`);
      }),
    });
    expect(errored).toMatchObject({ action: "wait", fields: { ig_container_id: "" } });

    const published = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("content_publishing_limit"))
        return json({ quota_usage: 0, config: { quota_total: 50 } });
      if (url.includes("old-container"))
        return json({ status_code: "PUBLISHED", permalink: "https://instagram.com/p/done" });
      throw new Error(`unexpected ${url}`);
    });
    const again = await publishToMeta({
      config,
      post: { ...post, attempts: 2, ig_container_id: "old-container" },
      imageUrl: "https://tikatero.com/photo.jpg",
      igPostedLast24h: 0,
      igDailyCap: 25,
      fetchImpl: published,
    });
    expect(again).toMatchObject({
      action: "posted",
      fields: { permalink: "https://instagram.com/p/done" },
    });
    expect(published.mock.calls.some((call) => String(call[0]).includes("media_publish"))).toBe(
      false,
    );
  });

  it("delays at the daily cap without using another try", async () => {
    const fetchImpl = vi.fn();
    const outcome = await publishToMeta({
      config,
      post,
      imageUrl: "https://tikatero.com/photo.jpg",
      igPostedLast24h: 25,
      igDailyCap: 25,
      fetchImpl,
    });
    expect(outcome).toEqual({ action: "wait", waitMs: 60 * 60 * 1000, refundAttempt: true });
    expect(fetchImpl).not.toHaveBeenCalled();

    const quota = await publishToMeta({
      config,
      post,
      imageUrl: "https://tikatero.com/photo.jpg",
      igPostedLast24h: 0,
      igDailyCap: 25,
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("content_publishing_limit");
        return json({ quota_usage: 100, config: { quota_total: 100 } });
      }),
    });
    expect(quota).toMatchObject({ action: "wait", refundAttempt: true, waitMs: 60 * 60 * 1000 });
  });

  it("waits on the backoff schedule and fails permission errors at once", async () => {
    expect(BACKOFF_MINUTES).toEqual([2, 10, 30, 120, 360]);
    expect(backoffMs(1)).toBe(2 * 60 * 1000);
    expect(backoffMs(2)).toBe(10 * 60 * 1000);
    expect(backoffMs(3)).toBe(30 * 60 * 1000);
    expect(backoffMs(4)).toBe(2 * 60 * 60 * 1000);
    expect(backoffMs(5)).toBe(6 * 60 * 60 * 1000);
    expect(terminalAttempt(5)).toBe(true);
    const logs: unknown[] = [];
    const retry = await publishToMeta({
      config,
      post: { ...post, attempts: 1 },
      imageUrl: "https://tikatero.com/photo.jpg",
      igPostedLast24h: 0,
      igDailyCap: 25,
      log: (entry) => logs.push(entry),
      fetchImpl: async (input: RequestInfo | URL) => {
        if (String(input).includes("content_publishing_limit")) {
          return json({ quota_usage: 0, config: { quota_total: 50 } });
        }
        return json({ error: { code: 4, message: "slow down", is_transient: true } }, 400);
      },
    });
    expect(retry).toMatchObject({ action: "wait", waitMs: 2 * 60 * 1000, refundAttempt: false });
    const last = await publishToMeta({
      config,
      post: { ...post, attempts: 5 },
      imageUrl: "https://tikatero.com/photo.jpg",
      igPostedLast24h: 0,
      igDailyCap: 25,
      log: (entry) => logs.push(entry),
      fetchImpl: async () => json({ error: { code: 1, message: "temporary" } }, 500),
    });
    expect(last).toMatchObject({ action: "failed" });
    const denied = await publishToMeta({
      config,
      post,
      imageUrl: "https://tikatero.com/photo.jpg",
      igPostedLast24h: 0,
      igDailyCap: 25,
      log: (entry) => logs.push(entry),
      fetchImpl: async () =>
        json(
          {
            error: {
              code: 190,
              message: `bad ${config.pageToken} access_token=${config.pageToken} appsecret_proof=abcdefabcdefabcdefabcdefabcdef12`,
            },
          },
          400,
        ),
    });
    expect(denied).toEqual({
      action: "failed",
      error: "Meta login needs fixing. Check the token on this page.",
    });
    const dumped = JSON.stringify(logs);
    expect(dumped).not.toContain(config.pageToken);
    expect(dumped).not.toContain("access_token=");
    expect(dumped).not.toContain("appsecret_proof=");
  });

  it("redacts tokens from stored errors", () => {
    const stored = sanitizeMetaError(
      {
        error: {
          code: 1,
          error_subcode: 99,
          type: "OAuthException",
          message: `nope ${config.pageToken} access_token=secret appsecret_proof=${"ab".repeat(32)}`,
          fbtrace_id: "trace-1",
          scopes: ["pages_manage_posts"],
        },
      },
      [config.pageToken, config.appSecret],
    );
    expect(stored).not.toContain("EAA");
    expect(stored).not.toContain("access_token=secret");
    expect(stored).not.toContain("appsecret_proof=ab");
    expect(stored).not.toContain("pages_manage_posts");
    expect(stored).toContain("trace-1");
    expect(stored.length).toBeLessThanOrEqual(500);
  });
});
