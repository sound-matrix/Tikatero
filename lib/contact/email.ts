export type ContactEmailInput = {
  name: string;
  email: string;
  phone: string | null;
  topicLabel: string;
  orderRef: string | null;
  message: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function singleLine(value: string) {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ").slice(0, 180);
}

/** The inbox comes only from CONTACT_TO_EMAIL. There is no baked-in address. */
export function contactDestination(env: Record<string, string | undefined> = process.env) {
  const value = env.CONTACT_TO_EMAIL?.trim().toLowerCase() ?? "";
  if (!value || value.length > 254 || /[\r\n\u0000]/.test(value) || !emailPattern.test(value))
    return null;
  return value;
}

export function buildContactEmail(input: ContactEmailInput, destination: string) {
  const subject = `[Tikatero Contact] ${singleLine(input.topicLabel)} — ${singleLine(input.name)}`;
  const rows = [
    ["Name", input.name],
    ["Email", input.email],
    ["Phone", input.phone ?? ""],
    ["Topic", input.topicLabel],
    ["Order or ticket ID", input.orderRef ?? ""],
  ];
  const text = [...rows.map(([label, value]) => `${label}: ${value}`), "", input.message].join(
    "\n",
  );
  const html = [
    "<!DOCTYPE html>",
    '<html><body style="font-family:sans-serif;color:#2D3142">',
    ...rows.map(
      ([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`,
    ),
    `<p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
    "</body></html>",
  ].join("");
  return {
    to: destination,
    replyTo: input.email,
    subject,
    text,
    html,
  };
}

export function contactEmailPayload(
  input: ContactEmailInput,
  env: Record<string, string | undefined> = process.env,
) {
  const destination = contactDestination(env);
  if (!destination) return null;
  return buildContactEmail(input, destination);
}
