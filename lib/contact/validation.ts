import { z } from "zod";
import { contactTopicLabel, isContactTopic, type ContactTopic } from "./topics";

const controlChars = /[\u0000-\u001f\u007f\u2028\u2029]/g;
const phonePattern = /^(?:\+91|0)?([6-9]\d{9})$/;

export const CONTACT_MIN_FILL_MS = 3000;
const maxAgeMs = 24 * 60 * 60 * 1000;

export function stripControl(value: string) {
  return value.replace(controlChars, "").trim();
}

export type ContactField = "name" | "email" | "phone" | "topic" | "orderRef" | "message";

export type ContactValue = {
  name: string;
  firstName: string;
  email: string;
  phone: string | null;
  topic: ContactTopic;
  topicLabel: string;
  orderRef: string | null;
  message: string;
};

export type ContactValidation =
  | { ok: true; value: ContactValue }
  | {
      ok: false;
      error: string;
      fields?: Partial<Record<ContactField, string>>;
      spam?: boolean;
    };

const schema = z.object({
  name: z.string().min(2, "Enter your full name.").max(120, "Enter a shorter name."),
  email: z
    .email("Enter a valid email address.")
    .max(254, "Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  topic: z.string().refine(isContactTopic, "Choose what this is about."),
  orderRef: z.string().max(80, "That order or ticket ID is too long."),
  message: z
    .string()
    .min(10, "Write at least 10 characters so we can help.")
    .max(2000, "Please keep your message under 2,000 characters."),
});

function text(value: unknown) {
  return typeof value === "string" ? stripControl(value) : "";
}

function indianMobile(value: string): string | null | false {
  if (!value) return null;
  const compact = value.replace(/[\s().-]/g, "");
  const match = phonePattern.exec(compact);
  if (!match) return false;
  return `+91${match[1]}`;
}

export function validateContact(
  input: {
    name: unknown;
    email: unknown;
    phone: unknown;
    topic: unknown;
    orderRef: unknown;
    message: unknown;
    honeypot: unknown;
    startedAt: unknown;
  },
  now = Date.now(),
): ContactValidation {
  const phone = indianMobile(text(input.phone));
  const parsed = schema.safeParse({
    name: text(input.name),
    email: text(input.email),
    topic: text(input.topic),
    orderRef: text(input.orderRef),
    message: text(input.message),
  });
  const fields: Partial<Record<ContactField, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (
        key === "name" ||
        key === "email" ||
        key === "topic" ||
        key === "orderRef" ||
        key === "message"
      ) {
        if (!fields[key]) fields[key] = issue.message;
      }
    }
  }
  if (phone === false) fields.phone = "Enter an Indian mobile number, or leave the phone blank.";
  if (!parsed.success || phone === false) {
    return { ok: false, error: "Please check the highlighted fields and try again.", fields };
  }

  if (text(input.honeypot)) {
    return { ok: false, error: "Please wait a moment and send the form again.", spam: true };
  }
  const started = typeof input.startedAt === "string" ? Number(input.startedAt) : Number.NaN;
  const elapsed = now - started;
  if (
    !Number.isFinite(started) ||
    started > now + 120_000 ||
    elapsed < CONTACT_MIN_FILL_MS ||
    elapsed > maxAgeMs
  ) {
    return { ok: false, error: "Please wait a moment and send the form again.", spam: true };
  }

  const topic = parsed.data.topic as ContactTopic;
  return {
    ok: true,
    value: {
      name: parsed.data.name,
      firstName: parsed.data.name.split(/\s+/)[0] ?? parsed.data.name,
      email: parsed.data.email,
      phone,
      topic,
      topicLabel: contactTopicLabel(topic),
      orderRef: parsed.data.orderRef || null,
      message: parsed.data.message,
    },
  };
}
