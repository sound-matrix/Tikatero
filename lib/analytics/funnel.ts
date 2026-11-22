/** GA4 funnel events: never include names, emails, phone numbers, order IDs, payment IDs or URLs. */
export type FunnelEvent =
  | "organiser_signup_intent"
  | "organiser_email_verified"
  | "begin_checkout"
  | "ticket_reservation_created";

export type FunnelParams = {
  role?: "organiser" | "attendee";
  admission?: "free" | "paid";
};

type GaWindow = Window & {
  gtag?: (command: "event", name: string, params?: Record<string, string>) => void;
};

/** Fire only browser-side when the existing optional GA4 integration is enabled. */
export function trackFunnelEvent(name: FunnelEvent, params: FunnelParams = {}) {
  if (typeof window === "undefined") return;
  const { role, admission } = params;
  const payload: Record<string, string> = {};
  if (role === "organiser" || role === "attendee") payload.role = role;
  if (admission === "free" || admission === "paid") payload.admission = admission;
  (window as GaWindow).gtag?.("event", name, payload);
}
