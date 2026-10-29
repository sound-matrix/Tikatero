import type { TemplateData, EventDetails } from "./types";
const event: EventDetails = {
  title: "An evening of live music",
  startsAt: "2026-11-07T12:30:00.000Z",
  venue: "Riverfront Hall, Hyderabad",
};
const recipientName = "Alex";
export const emailSamples: TemplateData = {
  order_confirmed: {
    recipientName,
    event,
    orderRef: "TK-DEMO-1042",
    amountPaise: 149900,
    vip: true,
  },
  payment_failed: {
    recipientName,
    eventTitle: event.title,
    orderRef: "TK-DEMO-1042",
    amountPaise: 149900,
  },
  event_reminder: { recipientName, event },
  event_changed: {
    recipientName,
    event,
    changes: "The start time has moved to 6:00 PM IST. The updated details are below.",
  },
  event_cancelled: {
    recipientName,
    eventTitle: event.title,
    reason: "The venue is unavailable on the event date.",
  },
  refund_processed: {
    recipientName,
    eventTitle: event.title,
    refundRef: "RF-DEMO-2041",
    amountPaise: 149900,
  },
  kyc_submitted: { recipientName, organiserName: "Riverfront Live" },
  kyc_needs_docs: {
    recipientName,
    organiserName: "Riverfront Live",
    requestedDocs: [
      "A clearer copy of the requested identity document.",
      "A bank document showing the account holder’s name.",
    ],
  },
  kyc_approved: { recipientName, organiserName: "Riverfront Live" },
  kyc_rejected: {
    recipientName,
    organiserName: "Riverfront Live",
    reason: "The organiser name could not be matched to the documents provided.",
  },
  team_invite: {
    recipientName,
    organiserName: "Riverfront Live",
    inviterName: "Sam",
    role: "Event manager",
  },
  payout_settled: {
    recipientName,
    organiserName: "Riverfront Live",
    payoutRef: "PO-DEMO-3052",
    amountPaise: 149900,
  },
  account_blocked: {
    recipientName,
    reason: "Your account needs a review. Please contact support for help.",
  },
  staff_alert: {
    recipientName: "Tikatero team",
    title: "A verification review needs attention",
    summary:
      "An organiser has supplied the requested information. Please review the account when you’re ready.",
    entityLabel: "Organiser review · DEMO-4063",
  },
};
