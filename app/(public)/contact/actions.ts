"use server";

import { allowRequest, requestIp } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { hashContactIp } from "@/lib/contact/ip";
import { sendContactNotice } from "@/lib/contact/send";
import { verifyContactTurnstile } from "@/lib/contact/turnstile";
import { validateContact, type ContactField } from "@/lib/contact/validation";

export type ContactFormState = {
  error?: string;
  fields?: Partial<Record<ContactField, string>>;
  success?: { firstName: string; email: string };
};

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function submitContact(
  _state: ContactFormState,
  form: FormData,
): Promise<ContactFormState> {
  const parsed = validateContact({
    name: field(form, "name"),
    email: field(form, "email"),
    phone: field(form, "phone"),
    topic: field(form, "topic"),
    orderRef: field(form, "order_ref"),
    message: field(form, "message"),
    honeypot: field(form, "company_website"),
    startedAt: field(form, "started"),
  });
  if (!parsed.ok) return { error: parsed.error, fields: parsed.fields };

  const turnstile = field(form, "cf-turnstile-response");
  if (!(await verifyContactTurnstile(turnstile))) {
    return { error: "Please complete the security check and try again." };
  }

  const ip = await requestIp();
  const [byIp, byEmail] = await Promise.all([
    allowRequest("contact-ip", ip, 5, 60 * 60),
    allowRequest("contact-email", parsed.value.email, 5, 60 * 60),
  ]);
  if (!byIp || !byEmail) {
    return { error: "You've sent several messages. Please wait an hour and try again." };
  }

  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("contact_messages")
      .insert({
        name: parsed.value.name,
        email: parsed.value.email,
        phone: parsed.value.phone,
        topic: parsed.value.topic,
        order_ref: parsed.value.orderRef,
        message: parsed.value.message,
        ip_hash: hashContactIp(ip),
      })
      .select("id")
      .single();
    if (error || !data) {
      console.warn("Contact message could not be saved.");
      return { error: "We could not save your message. Please try again in a moment." };
    }
    const sent = await sendContactNotice(parsed.value);
    if (sent) {
      const updated = await client
        .from("contact_messages")
        .update({ emailed_at: new Date().toISOString() })
        .eq("id", data.id);
      if (updated.error) console.warn("Contact email was sent but the time could not be saved.");
    }
  } catch {
    console.warn("Contact message could not be saved.");
    return { error: "We could not save your message. Please try again in a moment." };
  }

  return { success: { firstName: parsed.value.firstName, email: parsed.value.email } };
}
