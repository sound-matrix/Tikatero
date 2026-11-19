import "server-only";
import { createHmac } from "node:crypto";
import type { SocialKind, SocialPlatform } from "@/lib/social/caption";

const requiredEnv = [
  "META_PAGE_ID",
  "META_IG_USER_ID",
  "META_PAGE_ACCESS_TOKEN",
  "META_APP_SECRET",
] as const;

const versionPattern = /^v\d{2}\.0$/;

export type MetaConfig = {
  version: string;
  pageId: string;
  igUserId: string;
  pageToken: string;
  appSecret: string;
  appId: string | null;
};

export type PublishOutcome =
  | { action: "posted"; fields: Record<string, string | null> }
  | {
      action: "wait";
      waitMs: number;
      refundAttempt: boolean;
      fields?: Record<string, string | null>;
      error?: string;
    }
  | { action: "failed"; error: string; fields?: Record<string, string | null> };

type GraphError = {
  code?: number;
  error_subcode?: number;
  type?: string;
  message?: string;
  fbtrace_id?: string;
  is_transient?: boolean;
};

type FetchLike = typeof fetch;

export const BACKOFF_MINUTES = [2, 10, 30, 120, 360] as const;

export function backoffMs(attempt: number) {
  const index = Math.min(Math.max(attempt, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[index] * 60 * 1000;
}

export function terminalAttempt(attempt: number) {
  return attempt >= 5;
}

export function readMetaConfig(env: NodeJS.ProcessEnv = process.env): MetaConfig | null {
  const version = env.META_GRAPH_VERSION?.trim() || "v27.0";
  if (!versionPattern.test(version)) return null;
  for (const name of requiredEnv) {
    if (!env[name]?.trim()) return null;
  }
  return {
    version,
    pageId: env.META_PAGE_ID!.trim(),
    igUserId: env.META_IG_USER_ID!.trim(),
    pageToken: env.META_PAGE_ACCESS_TOKEN!.trim(),
    appSecret: env.META_APP_SECRET!.trim(),
    appId: env.META_APP_ID?.trim() || null,
  };
}

export function metaConfigured(env: NodeJS.ProcessEnv = process.env) {
  return readMetaConfig(env) !== null;
}

export function missingMetaEnv(env: NodeJS.ProcessEnv = process.env) {
  const missing: string[] = [];
  for (const name of requiredEnv) {
    if (!env[name]?.trim()) missing.push(name);
  }
  const version = env.META_GRAPH_VERSION?.trim();
  if (version && !versionPattern.test(version)) missing.push("META_GRAPH_VERSION");
  return missing;
}

export function appSecretProof(token: string, secret: string) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function redactSecrets(text: string, secrets: string[] = []) {
  let out = text;
  const unique = [...new Set(secrets.filter((secret) => secret.length >= 8))].sort(
    (a, b) => b.length - a.length,
  );
  for (const secret of unique) out = out.split(secret).join("[redacted]");
  out = out.replace(/EAA[A-Za-z0-9]+/g, "[redacted]");
  out = out.replace(/access_token=[^&\s"']+/gi, "access_token=[redacted]");
  out = out.replace(/appsecret_proof=[^&\s"']+/gi, "appsecret_proof=[redacted]");
  out = out.replace(/\b[a-f0-9]{40,}\b/gi, "[redacted]");
  return out;
}

export function sanitizeMetaError(body: unknown, secrets: string[] = []) {
  const error = graphError(body);
  const message = redactSecrets(
    String(error?.message ?? "Meta could not post this.").slice(0, 300),
    secrets,
  );
  const safe = {
    code: typeof error?.code === "number" ? error.code : undefined,
    error_subcode: typeof error?.error_subcode === "number" ? error.error_subcode : undefined,
    type: typeof error?.type === "string" ? error.type.slice(0, 80) : undefined,
    message,
    fbtrace_id: typeof error?.fbtrace_id === "string" ? error.fbtrace_id.slice(0, 64) : undefined,
  };
  return redactSecrets(JSON.stringify(safe), secrets).slice(0, 500);
}

function graphError(body: unknown): GraphError | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: GraphError }).error;
  return error && typeof error === "object" ? error : null;
}

function failureClass(status: number, error: GraphError | null, network: boolean) {
  if (network || status === 429 || status >= 500) return "retry" as const;
  const code = error?.code;
  if (code === 10 || code === 190 || (typeof code === "number" && code >= 200 && code <= 299)) {
    return "permission" as const;
  }
  if (
    (typeof code === "number" && [1, 2, 4, 17, 32, 341, 368].includes(code)) ||
    error?.is_transient
  ) {
    return "retry" as const;
  }
  return "fatal" as const;
}

const permissionMessage = "Meta login needs fixing. Check the token on this page.";

type GraphResult =
  | { ok: true; status: number; json: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      network: boolean;
      error: GraphError | null;
      stored: string;
    };

async function graph(
  config: MetaConfig,
  path: string,
  options: {
    method: "GET" | "POST";
    form?: Record<string, string>;
    query?: Record<string, string>;
    fetchImpl: FetchLike;
  },
): Promise<GraphResult> {
  const proof = appSecretProof(config.pageToken, config.appSecret);
  const secrets = [config.pageToken, config.appSecret, proof, config.appId ?? ""];
  const url = new URL(`https://graph.facebook.com/${config.version}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options.method === "POST") {
    const form = new URLSearchParams(options.form ?? {});
    form.set("access_token", config.pageToken);
    form.set("appsecret_proof", proof);
    body = form.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else {
    headers.Authorization = `Bearer ${config.pageToken}`;
    url.searchParams.set("appsecret_proof", proof);
  }
  try {
    const response = await options.fetchImpl(url, {
      method: options.method,
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let json: Record<string, unknown> = {};
    if (text) {
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = { error: { message: text.slice(0, 300), code: response.status } };
      }
    }
    if (!response.ok || json.error) {
      return {
        ok: false,
        status: response.status,
        network: false,
        error: graphError(json),
        stored: sanitizeMetaError(json, secrets),
      };
    }
    return { ok: true, status: response.status, json };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      status: 0,
      network: true,
      error: null,
      stored: sanitizeMetaError({ error: { message, type: "network" } }, secrets),
    };
  }
}

function outcomeError(outcome: PublishOutcome) {
  return outcome.action === "posted" ? "" : (outcome.error ?? "");
}

function retryOrFail(
  attempt: number,
  stored: string,
  fields?: Record<string, string | null>,
): PublishOutcome {
  if (terminalAttempt(attempt)) return { action: "failed", error: stored, fields };
  return {
    action: "wait",
    waitMs: backoffMs(attempt),
    refundAttempt: false,
    error: stored,
    fields,
  };
}

function classify(
  result: GraphResult,
  attempt: number,
  fields?: Record<string, string | null>,
): PublishOutcome {
  const kind = failureClass(
    result.ok ? 200 : result.status,
    result.ok ? null : result.error,
    result.ok ? false : result.network,
  );
  if (kind === "permission") return { action: "failed", error: permissionMessage, fields };
  return retryOrFail(attempt, result.ok ? "" : result.stored, fields);
}

async function publishingLimit(
  config: MetaConfig,
  fetchImpl: FetchLike,
  attempt: number,
): Promise<PublishOutcome | { ok: true }> {
  const result = await graph(config, `/${config.igUserId}/content_publishing_limit`, {
    method: "GET",
    query: { fields: "quota_usage,config" },
    fetchImpl,
  });
  if (!result.ok) return classify(result, attempt);
  const usage = Number(result.json.quota_usage);
  const quota = result.json.config;
  const total = Number(
    quota && typeof quota === "object" ? (quota as { quota_total?: number }).quota_total : NaN,
  );
  if (Number.isFinite(usage) && Number.isFinite(total) && usage >= total) {
    return { action: "wait", waitMs: 60 * 60 * 1000, refundAttempt: true };
  }
  return { ok: true };
}

export async function publishToMeta(input: {
  config: MetaConfig | null;
  post: {
    id: string;
    platform: SocialPlatform;
    kind: SocialKind;
    attempts: number;
    ig_container_id: string | null;
    caption: string | null;
    event_slug: string;
    ig_collaborator: string | null;
  };
  imageUrl: string;
  igPostedLast24h: number;
  igDailyCap: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (entry: { postId: string; error: string }) => void;
  onContainer?: (id: string) => Promise<void>;
}): Promise<PublishOutcome | { skipped: "not_configured" }> {
  if (!input.config) return { skipped: "not_configured" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? Date.now;
  const log = input.log ?? ((entry) => console.error(entry));
  try {
    if (input.post.platform === "instagram") {
      return await publishInstagram(input.config, input, fetchImpl, sleep, now, log);
    }
    return await publishFacebook(input.config, input, fetchImpl, log);
  } catch (error) {
    const stored = sanitizeMetaError(
      {
        error: {
          message: error instanceof Error ? error.message : "Network error",
          type: "network",
        },
      },
      [input.config.pageToken, input.config.appSecret],
    );
    log({ postId: input.post.id, error: stored });
    return retryOrFail(input.post.attempts, stored);
  }
}

async function publishInstagram(
  config: MetaConfig,
  input: Parameters<typeof publishToMeta>[0],
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  now: () => number,
  log: (entry: { postId: string; error: string }) => void,
): Promise<PublishOutcome> {
  const post = input.post;
  if (input.igPostedLast24h >= input.igDailyCap) {
    return { action: "wait", waitMs: 60 * 60 * 1000, refundAttempt: true };
  }
  const room = await publishingLimit(config, fetchImpl, post.attempts);
  if (!("ok" in room)) {
    if (room.action === "failed" || outcomeError(room))
      log({ postId: post.id, error: outcomeError(room) });
    if (room.action === "wait" && !room.error)
      return { action: "wait", waitMs: 60 * 60 * 1000, refundAttempt: true };
    return room;
  }

  let containerId = post.ig_container_id;
  if (containerId) {
    const existing = await containerState(config, containerId, fetchImpl);
    if (!existing.ok) {
      const outcome = classify(existing, post.attempts, { ig_container_id: containerId });
      log({ postId: post.id, error: outcome.action === "posted" ? "" : (outcome.error ?? "") });
      return outcome;
    }
    const status = String(existing.json.status_code ?? "");
    if (status === "PUBLISHED") {
      const permalink =
        typeof existing.json.permalink === "string" ? existing.json.permalink : null;
      return {
        action: "posted",
        fields: { ig_container_id: containerId, meta_post_id: containerId, permalink },
      };
    }
    if (status === "ERROR" || status === "EXPIRED") {
      return retryOrFail(
        post.attempts,
        sanitizeMetaError({ error: { message: `Container ${status}`, type: status } }),
        { ig_container_id: "" },
      );
    }
    if (status === "IN_PROGRESS") {
      const polled = await pollContainer(config, post.ig_container_id!, fetchImpl, sleep, now);
      if (polled !== "FINISHED") {
        return inProgressOrError(polled, post.attempts, post.ig_container_id!);
      }
      containerId = post.ig_container_id;
    }
  }

  if (!containerId) {
    const form: Record<string, string> = { image_url: input.imageUrl };
    if (post.kind === "feed") {
      form.caption = post.caption ?? "";
      if (post.ig_collaborator) form.collaborators = JSON.stringify([post.ig_collaborator]);
    } else {
      form.media_type = "STORIES";
    }
    const created = await graph(config, `/${config.igUserId}/media`, {
      method: "POST",
      form,
      fetchImpl,
    });
    if (!created.ok) {
      const outcome = classify(created, post.attempts);
      log({ postId: post.id, error: outcomeError(outcome) });
      return outcome;
    }
    containerId = String(created.json.id ?? "");
    if (!containerId) return retryOrFail(post.attempts, sanitizeMetaError(created.json));
    if (input.onContainer) await input.onContainer(containerId);
    const polled = await pollContainer(config, containerId, fetchImpl, sleep, now);
    if (polled === "PUBLISHED") {
      return {
        action: "posted",
        fields: { ig_container_id: containerId, meta_post_id: containerId, permalink: null },
      };
    }
    if (polled !== "FINISHED") return inProgressOrError(polled, post.attempts, containerId);
  }

  const published = await graph(config, `/${config.igUserId}/media_publish`, {
    method: "POST",
    form: { creation_id: containerId },
    fetchImpl,
  });
  if (!published.ok) {
    const outcome = classify(published, post.attempts, { ig_container_id: containerId });
    log({ postId: post.id, error: outcomeError(outcome) });
    return outcome;
  }
  const mediaId = String(published.json.id ?? containerId);
  const link = await graph(config, `/${mediaId}`, {
    method: "GET",
    query: { fields: "permalink" },
    fetchImpl,
  });
  const permalink = link.ok && typeof link.json.permalink === "string" ? link.json.permalink : null;
  return {
    action: "posted",
    fields: { ig_container_id: containerId, meta_post_id: mediaId, permalink },
  };
}

function inProgressOrError(status: string, attempt: number, containerId: string): PublishOutcome {
  if (status === "ERROR" || status === "EXPIRED") {
    return retryOrFail(
      attempt,
      sanitizeMetaError({ error: { message: `Container ${status}`, type: status } }),
      {
        ig_container_id: "",
      },
    );
  }
  return {
    action: "wait",
    waitMs: 60_000,
    refundAttempt: true,
    fields: { ig_container_id: containerId },
  };
}

async function containerState(config: MetaConfig, id: string, fetchImpl: FetchLike) {
  return graph(config, `/${id}`, {
    method: "GET",
    query: { fields: "status_code,permalink" },
    fetchImpl,
  });
}

async function pollContainer(
  config: MetaConfig,
  id: string,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  now: () => number,
) {
  const deadline = now() + 60_000;
  let status = "";
  while (now() <= deadline) {
    const result = await containerState(config, id, fetchImpl);
    if (!result.ok) return "IN_PROGRESS";
    status = String(result.json.status_code ?? "");
    if (status !== "IN_PROGRESS") return status;
    if (now() + 3000 > deadline) break;
    await sleep(3000);
  }
  return status || "IN_PROGRESS";
}

async function publishFacebook(
  config: MetaConfig,
  input: Parameters<typeof publishToMeta>[0],
  fetchImpl: FetchLike,
  log: (entry: { postId: string; error: string }) => void,
): Promise<PublishOutcome> {
  const post = input.post;
  if (post.attempts > 1) {
    const existing = await findExistingFacebook(config, post.event_slug, fetchImpl);
    if (existing) {
      return {
        action: "posted",
        fields: {
          meta_photo_id: existing.photoId,
          meta_post_id: existing.postId,
          permalink: existing.permalink,
        },
      };
    }
  }
  const photo = await graph(config, `/${config.pageId}/photos`, {
    method: "POST",
    form: {
      url: input.imageUrl,
      ...(post.kind === "feed" ? { message: post.caption ?? "" } : { published: "false" }),
    },
    fetchImpl,
  });
  if (!photo.ok) {
    const outcome = classify(photo, post.attempts);
    log({ postId: post.id, error: outcomeError(outcome) });
    return outcome;
  }
  const photoId = String(photo.json.id ?? "");
  if (post.kind === "feed") {
    const postId = String(photo.json.post_id ?? photoId);
    const link = await graph(config, `/${postId}`, {
      method: "GET",
      query: { fields: "permalink_url" },
      fetchImpl,
    });
    const permalink =
      link.ok && typeof link.json.permalink_url === "string" ? link.json.permalink_url : null;
    return {
      action: "posted",
      fields: { meta_photo_id: photoId, meta_post_id: postId, permalink },
    };
  }
  const story = await graph(config, `/${config.pageId}/photo_stories`, {
    method: "POST",
    form: { photo_id: photoId },
    fetchImpl,
  });
  if (!story.ok) {
    const outcome = classify(story, post.attempts, { meta_photo_id: photoId });
    log({ postId: post.id, error: outcomeError(outcome) });
    return outcome;
  }
  const storyId = String(story.json.post_id ?? story.json.id ?? "");
  return {
    action: "posted",
    fields: { meta_photo_id: photoId, meta_post_id: storyId, permalink: null },
  };
}

async function findExistingFacebook(config: MetaConfig, slug: string, fetchImpl: FetchLike) {
  const needle = `/e/${slug}`;
  const photos = await graph(config, `/${config.pageId}/photos`, {
    method: "GET",
    query: { fields: "id,link,name,permalink_url", limit: "10" },
    fetchImpl,
  });
  const posts = await graph(config, `/${config.pageId}/posts`, {
    method: "GET",
    query: { fields: "id,message,permalink_url", limit: "10" },
    fetchImpl,
  });
  const rows = [...(photos.ok ? asList(photos.json) : []), ...(posts.ok ? asList(posts.json) : [])];
  for (const row of rows) {
    const blob = [row.link, row.name, row.message, row.permalink_url].filter(Boolean).join(" ");
    if (blob.includes(needle)) {
      return {
        photoId: typeof row.id === "string" ? row.id : null,
        postId:
          typeof row.post_id === "string"
            ? row.post_id
            : typeof row.id === "string"
              ? row.id
              : null,
        permalink: typeof row.permalink_url === "string" ? row.permalink_url : null,
      };
    }
  }
  return null;
}

function asList(json: Record<string, unknown>) {
  const data = json.data;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export type MetaCheck =
  | { ok: false; skipped: "not_configured" }
  | { ok: false; message: string }
  | {
      ok: true;
      pageName: string;
      igUsername: string;
      tokenExpires: string;
      dataAccessExpires: string | null;
    };

function expiryDate(unix: unknown) {
  if (unix === 0) return "Never expires";
  const value = Number(unix);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value * 1000));
}

function plainName(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 80);
  if (/EAA[A-Za-z0-9]/.test(clean) || /access_token|appsecret_proof/i.test(clean)) return "";
  return clean;
}

export async function checkMetaLogin(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<MetaCheck> {
  const config = readMetaConfig(env);
  if (!config) return { ok: false, skipped: "not_configured" };
  const page = await graph(config, `/${config.pageId}`, {
    method: "GET",
    query: { fields: "name" },
    fetchImpl,
  });
  const ig = await graph(config, `/${config.igUserId}`, {
    method: "GET",
    query: { fields: "username" },
    fetchImpl,
  });
  if (!page.ok || !ig.ok) return { ok: false, message: permissionMessage };
  let tokenExpires = "Not checked";
  let dataAccessExpires: string | null = null;
  if (config.appId) {
    const proof = appSecretProof(config.pageToken, config.appSecret);
    const url = new URL(`https://graph.facebook.com/${config.version}/debug_token`);
    url.searchParams.set("input_token", config.pageToken);
    url.searchParams.set("access_token", `${config.appId}|${config.appSecret}`);
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
      const json = (await response.json()) as { data?: Record<string, unknown> };
      const data = json.data ?? {};
      if (data.is_valid === false) return { ok: false, message: permissionMessage };
      tokenExpires = expiryDate(data.expires_at) ?? "Not checked";
      dataAccessExpires = expiryDate(data.data_access_expires_at);
    } catch (error) {
      const stored = sanitizeMetaError(
        { error: { message: error instanceof Error ? error.message : "Network error" } },
        [config.pageToken, config.appSecret, proof, config.appId],
      );
      console.error({ postId: "meta-check", error: stored });
      return { ok: false, message: permissionMessage };
    }
  }
  return {
    ok: true,
    pageName: plainName(page.json.name) || "Tikatero",
    igUsername: plainName(ig.json.username),
    tokenExpires,
    dataAccessExpires,
  };
}
