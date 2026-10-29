import "server-only";

import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/db/types";
import { renderEmail } from "./render";
import { emailSiteUrl, isTemplateName } from "./templates";
import type { TemplateData, TemplateName } from "./types";

type EmailAttachment = { filename: string; content: Buffer | string; contentType?: string };
export type SendOptions<K extends TemplateName> = {
  template: K;
  to: string;
  entityRef: string;
  data: TemplateData[K];
} & (K extends "order_confirmed" ? { attachments?: EmailAttachment[] } : { attachments?: never });
export type SendResult = {
  status:
    | "sent"
    | "sent_unlogged"
    | "duplicate"
    | "skipped_not_configured"
    | "failed"
    | "unknown"
    | "logging_failed"
    | "invalid_input";
  logId?: string;
  providerId?: string;
};

function recipient(value: string) {
  if (typeof value !== "string") throw new Error("Invalid email identity.");
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(normalized)
  )
    throw new Error("Invalid email identity.");
  return normalized;
}
function configuration() {
  try {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!key || !from || !siteUrl || /[\r\n]/.test(from) || from.length > 320) return null;
    const address = from.includes("<") ? /^[^<>]*<([^<>]+)>$/.exec(from)?.[1] : from;
    if (!address) return null;
    recipient(address);
    const replyTo = process.env.EMAIL_REPLY_TO ? recipient(process.env.EMAIL_REPLY_TO) : undefined;
    return { key, from, replyTo, siteUrl: emailSiteUrl(siteUrl).origin };
  } catch {
    return null;
  }
}
function attachmentsFor(template: TemplateName, attachments: EmailAttachment[] | undefined) {
  if (!attachments?.length) return undefined;
  if (template !== "order_confirmed" || !Array.isArray(attachments) || attachments.length > 10)
    throw new Error("Invalid email attachments.");
  let bytes = 0;
  return attachments.map((item) => {
    if (
      !item ||
      typeof item.filename !== "string" ||
      !item.filename ||
      item.filename.length > 128 ||
      /[\u0000-\u001f\u007f/\\]/.test(item.filename) ||
      "path" in item
    )
      throw new Error("Invalid email attachments.");
    if (
      !Buffer.isBuffer(item.content) &&
      (typeof item.content !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.content))
    )
      throw new Error("Invalid email attachments.");
    const content = Buffer.isBuffer(item.content)
      ? Buffer.from(item.content)
      : Buffer.from(item.content, "base64");
    bytes += content.byteLength;
    if (
      !content.byteLength ||
      bytes > 10 * 1024 * 1024 ||
      (item.contentType && !/^[\w.+-]+\/[\w.+-]+$/.test(item.contentType))
    )
      throw new Error("Invalid email attachments.");
    return {
      filename: item.filename,
      content,
      ...(item.contentType ? { contentType: item.contentType } : {}),
    };
  });
}

type Client = ReturnType<typeof createServiceClient>;
async function finish(
  client: Client,
  id: string,
  status: string,
  providerId: string | null = null,
) {
  try {
    const { data, error } = await client
      .from("email_log")
      .update({ status, resend_id: providerId })
      .eq("id", id)
      .eq("status", "sending")
      .select("id")
      .single();
    return !error && !!data;
  } catch {
    return false;
  }
}

/** Backend-only notification primitive. No endpoint or event hook calls this yet. */
export async function send<K extends TemplateName>(options: SendOptions<K>): Promise<SendResult> {
  let to: string;
  let entityRef: string;
  let attachments: ReturnType<typeof attachmentsFor>;
  try {
    if (!options || !isTemplateName(options.template)) return { status: "invalid_input" };
    to = recipient(options.to);
    if (typeof options.entityRef !== "string") return { status: "invalid_input" };
    entityRef = options.entityRef.trim();
    if (!entityRef || entityRef.length > 200 || /[\u0000-\u001f\u007f]/.test(entityRef))
      return { status: "invalid_input" };
    attachments = attachmentsFor(options.template, options.attachments);
  } catch {
    return { status: "invalid_input" };
  }

  const config = configuration();
  let client: Client;
  let claim: { id: string; idempotency_key: string | null; status: string };
  try {
    client = createServiceClient();
    const identity: Database["public"]["Functions"]["claim_email_send"]["Args"] = {
      p_template: options.template,
      p_entity_ref: entityRef,
      p_to_email: to,
      p_configured: !!config,
    };
    const { data, error } = await client.rpc("claim_email_send", identity);
    if (error || !data) return { status: "logging_failed" };
    if (!data.length) return { status: config ? "duplicate" : "skipped_not_configured" };
    claim = data[0];
    if (!claim.idempotency_key) return { status: "logging_failed" };
    if (!config) return { status: "skipped_not_configured", logId: claim.id };
    if (claim.status !== "sending") return { status: "duplicate", logId: claim.id };
  } catch {
    return { status: "logging_failed" };
  }

  let message: Awaited<ReturnType<typeof renderEmail>>;
  try {
    message = await renderEmail(options.template, options.data, config.siteUrl);
  } catch {
    await finish(client, claim.id, "failed_render");
    return { status: "failed", logId: claim.id };
  }

  try {
    const resend = new Resend(config.key);
    const { data, error } = await resend.emails.send(
      {
        from: config.from,
        to: [to],
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
        ...message,
        ...(attachments ? { attachments } : {}),
      },
      { idempotencyKey: claim.idempotency_key },
    );
    if (error) {
      await finish(client, claim.id, "failed_provider");
      return { status: "failed", logId: claim.id };
    }
    if (!data?.id) {
      await finish(client, claim.id, "unknown");
      return { status: "unknown", logId: claim.id };
    }
    const logged = await finish(client, claim.id, "sent", data.id);
    return { status: logged ? "sent" : "sent_unlogged", logId: claim.id, providerId: data.id };
  } catch {
    // The provider may have accepted the request before a timeout. Keep the
    // permanent claim and do not retry, even after the provider's 24-hour TTL.
    await finish(client, claim.id, "unknown");
    return { status: "unknown", logId: claim.id };
  }
}
