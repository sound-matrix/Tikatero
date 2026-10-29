import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Heading,
  Text,
  Button,
  Hr,
  Row,
  Column,
} from "react-email";
import type { CSSProperties } from "react";
import { formatINR, formatIST } from "./format";
import type { EmailBase, EventDetails, TemplateData, TemplateName, Notice } from "./types";

function text(value: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("Invalid email data.");
  return value;
}
const detail = (label: string, value: string) => ({ label, value: text(value) });
const eventRows = (event: EventDetails) => [
  detail("Event", event.title),
  detail("When", formatIST(event.startsAt)),
  detail("Where", event.venue),
];
const notice = (
  subject: string,
  message: string,
  details: Notice["details"],
  actionLabel = "Open your account",
  actionPath = "/me",
  extras: Partial<Notice> = {},
): Notice => ({
  subject,
  title: subject,
  preview: subject,
  message,
  details,
  actionLabel,
  actionPath,
  ...extras,
});

const definitions: {
  [K in TemplateName]: { label: string; build: (data: TemplateData[K]) => Notice };
} = {
  order_confirmed: {
    label: "Order confirmed",
    build: (d) =>
      notice(
        "Your booking is confirmed",
        "You’re all set. Here are your booking details. Keep this email handy for your event.",
        [
          ...eventRows(d.event),
          detail("Booking reference", d.orderRef),
          detail("Total paid", formatINR(d.amountPaise)),
        ],
        "View your booking",
        "/me",
        { badge: "Booking confirmed", vip: d.vip },
      ),
  },
  payment_failed: {
    label: "Payment failed",
    build: (d) =>
      notice(
        "Your payment didn’t go through",
        "Your booking is not confirmed. Please check your payment status before trying again. If money left your account, contact support.",
        [
          detail("Event", d.eventTitle),
          detail("Booking reference", d.orderRef),
          detail("Amount", formatINR(d.amountPaise)),
        ],
        "Open your account",
      ),
  },
  event_reminder: {
    label: "Event reminder",
    build: (d) =>
      notice(
        "Your event is coming up",
        "Here’s a quick reminder so you can plan your visit. Check the event time and venue before you leave.",
        eventRows(d.event),
        "View your booking",
      ),
  },
  event_changed: {
    label: "Event changed",
    build: (d) =>
      notice(
        "Your event details have changed",
        text(d.changes),
        eventRows(d.event),
        "Check your event details",
      ),
  },
  event_cancelled: {
    label: "Event cancelled",
    build: (d) =>
      notice(
        "Your event has been cancelled",
        "We’re sorry this event can’t go ahead. Any refund updates will be sent separately.",
        [detail("Event", d.eventTitle), detail("Reason", d.reason)],
        "Open your account",
      ),
  },
  refund_processed: {
    label: "Refund processed",
    build: (d) =>
      notice(
        "Your refund has been processed",
        "Your refund has been sent to your original payment method. Your bank or payment provider controls when it appears in your account.",
        [
          detail("Event", d.eventTitle),
          detail("Refund reference", d.refundRef),
          detail("Refund amount", formatINR(d.amountPaise)),
        ],
        "View your account",
        "/me",
        { badge: "Refund processed" },
      ),
  },
  kyc_submitted: {
    label: "Verification submitted",
    build: (d) =>
      notice(
        "Your verification is with us",
        "We’ve received your verification details. Our team will review them and email you when there’s an update.",
        [detail("Organiser", d.organiserName)],
        "View organiser account",
        "/console/pending",
        { badge: "Received securely" },
      ),
  },
  kyc_needs_docs: {
    label: "More documents needed",
    build: (d) => {
      if (
        !Array.isArray(d.requestedDocs) ||
        d.requestedDocs.length < 1 ||
        d.requestedDocs.length > 10
      )
        throw new Error("Invalid email data.");
      return notice(
        "We need a little more information",
        "Please check the items below to help us finish your organiser verification.",
        [
          detail("Organiser", d.organiserName),
          ...d.requestedDocs.map((item) => detail("What we need", item)),
        ],
        "View organiser account",
        "/console/pending",
      );
    },
  },
  kyc_approved: {
    label: "Verification approved",
    build: (d) =>
      notice(
        "Your organiser account is approved",
        "Your verification is complete. You can now open your organiser console and get ready for your next event.",
        [detail("Organiser", d.organiserName)],
        "Open organiser console",
        "/console",
        { badge: "Verified organiser" },
      ),
  },
  kyc_rejected: {
    label: "Verification not approved",
    build: (d) =>
      notice(
        "Your verification was not approved",
        "Please read the reason below. If you need help understanding this decision, contact Tikatero support.",
        [detail("Organiser", d.organiserName), detail("Reason", d.reason)],
        "View organiser account",
        "/console/pending",
      ),
  },
  team_invite: {
    label: "Team invitation",
    build: (d) =>
      notice(
        "You’ve been invited to a team",
        `${text(d.inviterName)} has invited you to join ${text(d.organiserName)} on Tikatero.`,
        [detail("Organiser", d.organiserName), detail("Your role", d.role)],
        "View invitation",
        "/me",
      ),
  },
  payout_settled: {
    label: "Payout settled",
    build: (d) =>
      notice(
        "Your payout has been settled",
        "Your payout has been sent to your registered bank account. Your bank controls when the funds appear.",
        [
          detail("Organiser", d.organiserName),
          detail("Payout reference", d.payoutRef),
          detail("Payout amount", formatINR(d.amountPaise)),
        ],
        "Open organiser console",
        "/console",
        { badge: "Payout settled" },
      ),
  },
  account_blocked: {
    label: "Account blocked",
    build: (d) =>
      notice(
        "Your Tikatero account is blocked",
        "Your account access has been restricted. Please read the reason below and contact support if you need help.",
        [detail("Reason", d.reason)],
        "Get help",
        "/help",
      ),
  },
  staff_alert: {
    label: "Staff alert",
    build: (d) =>
      notice(
        text(d.title, 160),
        text(d.summary),
        [detail("Reference", d.entityLabel)],
        "Open Tikatero admin",
        "/admin",
      ),
  },
};
export const templateNames = Object.keys(definitions) as TemplateName[];
export const templateLabel = (name: TemplateName) => definitions[name].label;
export const isTemplateName = (name: unknown): name is TemplateName =>
  typeof name === "string" && Object.hasOwn(definitions, name);

export function emailSiteUrl(value: string, allowLocal = false) {
  const url = new URL(value);
  const local =
    allowLocal && ["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:";
  if (
    (!local && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Invalid email site URL.");
  return url;
}
function actionUrl(base: URL, path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f]/.test(path))
    throw new Error("Invalid email action path.");
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error("Invalid email action path.");
  return url.href;
}
const paragraph: CSSProperties = {
  color: "#4A5061",
  fontSize: "16px",
  lineHeight: "26px",
  margin: "16px 0",
};

export function BrandedEmail({
  model,
  data,
  siteUrl,
}: {
  model: Notice;
  data: EmailBase;
  siteUrl: string;
}) {
  const base = emailSiteUrl(siteUrl, true);
  const action = actionUrl(base, data.actionPath ?? model.actionPath);
  if (data.recipientName !== undefined) text(data.recipientName, 100);
  return (
    <Html lang="en">
      <Head />
      <Preview>{model.preview}</Preview>
      <Body
        style={{
          backgroundColor: "#FFFFFF",
          fontFamily: "Arial, Helvetica, sans-serif",
          color: "#2D3142",
          margin: 0,
          padding: "32px 12px",
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            border: "1px solid #E7E8EC",
            borderRadius: "16px",
            backgroundColor: "#FFFFFF",
            overflow: "hidden",
          }}
        >
          <Section style={{ padding: "24px 32px", borderBottom: "1px solid #E7E8EC" }}>
            <Img
              src={new URL("/brand/tikatero-email-logo.png", base).href}
              alt="Tikatero"
              width="180"
              height="48"
              style={{ display: "block" }}
            />
          </Section>
          <Section style={{ padding: "28px 32px 32px" }}>
            <Text
              style={{
                color: "#0E9F9A",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "1px",
                margin: "0 0 14px",
              }}
            >
              TIKATERO · BY SOUND MATRIX
            </Text>
            <Heading
              as="h1"
              style={{
                color: "#2D3142",
                fontSize: "28px",
                fontWeight: 800,
                lineHeight: "36px",
                margin: "0 0 20px",
              }}
            >
              {model.title}
            </Heading>
            {data.recipientName && <Text style={paragraph}>Hi {data.recipientName},</Text>}
            <Text style={paragraph}>{model.message}</Text>
            {(model.badge || model.vip) && (
              <Section style={{ margin: "20px 0" }}>
                {model.badge && (
                  <Text
                    style={{
                      color: "#0E9F9A",
                      fontWeight: 700,
                      margin: "0 0 8px",
                      fontSize: "14px",
                    }}
                  >
                    {model.badge}
                  </Text>
                )}
                {model.vip && (
                  <Text
                    style={{
                      display: "inline-block",
                      color: "#8A6D0B",
                      backgroundColor: "#FBF4DC",
                      border: "1px solid #C9A227",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      margin: 0,
                      fontWeight: 700,
                      fontSize: "13px",
                    }}
                  >
                    VIP access
                  </Text>
                )}
              </Section>
            )}
            <Section
              style={{
                border: "1px solid #E7E8EC",
                borderRadius: "10px",
                padding: "8px 18px",
                margin: "24px 0",
              }}
            >
              {model.details.map((row, index) => (
                <Row key={`${row.label}-${index}`}>
                  <Column
                    style={{
                      padding: "12px 0",
                      width: "36%",
                      verticalAlign: "top",
                      color: "#5C6170",
                      fontSize: "13px",
                      lineHeight: "21px",
                    }}
                  >
                    {row.label}
                  </Column>
                  <Column
                    style={{
                      padding: "12px 0 12px 12px",
                      verticalAlign: "top",
                      color: "#2D3142",
                      fontWeight: 700,
                      fontSize: "14px",
                      lineHeight: "21px",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {row.value}
                  </Column>
                </Row>
              ))}
            </Section>
            <Button
              href={action}
              style={{
                backgroundColor: "#F25C54",
                backgroundImage: "linear-gradient(135deg, #F25C54, #FF9F43)",
                color: "#FFFFFF",
                borderRadius: "10px",
                padding: "16px 22px",
                fontSize: "16px",
                fontWeight: 700,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              {model.actionLabel}
            </Button>
          </Section>
          <Hr style={{ borderColor: "#E7E8EC", margin: 0 }} />
          <Section style={{ padding: "20px 32px" }}>
            <Text style={{ margin: 0, color: "#5C6170", fontSize: "13px", textAlign: "center" }}>
              © Sound Matrix
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function createEmail<K extends TemplateName>(
  template: K,
  data: TemplateData[K],
  siteUrl: string,
) {
  const model = definitions[template].build(data);
  if (/[\r\n\u0000]/.test(model.subject)) throw new Error("Invalid email subject.");
  return {
    subject: model.subject,
    element: <BrandedEmail model={model} data={data} siteUrl={siteUrl} />,
  };
}
