export type EmailBase = { recipientName?: string; actionPath?: string };
export type EventDetails = { title: string; startsAt: string; venue: string };
export type TemplateData = {
  order_confirmed: EmailBase & {
    event: EventDetails;
    orderRef: string;
    amountPaise: number;
    vip?: boolean;
  };
  payment_failed: EmailBase & { eventTitle: string; orderRef: string; amountPaise: number };
  event_reminder: EmailBase & { event: EventDetails };
  event_changed: EmailBase & { event: EventDetails; changes: string };
  event_cancelled: EmailBase & { eventTitle: string; reason: string };
  refund_processed: EmailBase & { eventTitle: string; refundRef: string; amountPaise: number };
  kyc_submitted: EmailBase & { organiserName: string };
  kyc_needs_docs: EmailBase & { organiserName: string; requestedDocs: string[] };
  kyc_approved: EmailBase & { organiserName: string };
  kyc_rejected: EmailBase & { organiserName: string; reason: string };
  team_invite: EmailBase & { organiserName: string; inviterName: string; role: string };
  payout_settled: EmailBase & { organiserName: string; payoutRef: string; amountPaise: number };
  account_blocked: EmailBase & { reason: string };
  staff_alert: EmailBase & { title: string; summary: string; entityLabel: string };
};
export type TemplateName = keyof TemplateData;
export type Notice = {
  subject: string;
  title: string;
  preview: string;
  message: string;
  details: { label: string; value: string }[];
  actionLabel: string;
  actionPath: string;
  badge?: string;
  vip?: boolean;
};
