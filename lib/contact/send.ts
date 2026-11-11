import "server-only";

import { Resend } from "resend";
import { contactEmailPayload, type ContactEmailInput } from "./email";

export async function sendContactNotice(input: ContactEmailInput) {
  const payload = contactEmailPayload(input);
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!payload || !key || !from || from.length > 320 || /[\r\n]/.test(from)) {
    console.warn("Contact message saved but the notification email is not configured.");
    return false;
  }
  try {
    const { error } = await new Resend(key).emails.send({
      from,
      to: [payload.to],
      replyTo: payload.replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    if (error) {
      console.warn("Contact message saved but the notification email was not accepted.");
      return false;
    }
    return true;
  } catch {
    console.warn("Contact message saved but the notification email could not be sent.");
    return false;
  }
}
