export const COMPANY_NAME = "Sound Matrix";
export const FOOTER_CREDIT = `© ${COMPANY_NAME}`;

export const footerLinks = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/refunds", label: "Refunds" },
  { href: "/help", label: "Help" },
] as const;

export const helpParagraphs = [
  "Tikatero is a product of Sound Matrix.",
  "Open your account to see your tickets and orders. Times are shown in India Standard Time (IST). Prices are in Indian rupees and include GST.",
  "Each event shows its refund rule before you pay. You can request a refund from your account when that rule allows it. A refund goes back to your original payment method. A test booking is labelled as a test, and no money is sent to a bank.",
  "From your details page you can download a copy of your profile, tickets, and orders, or ask to delete your account.",
  "If you run events, use the organiser console to review refund requests.",
] as const;

export const legalPages = {
  terms: {
    title: "Terms",
    paragraphs: [
      "Tikatero is a product of Sound Matrix.",
      "Tikatero lets people buy tickets for events listed by organisers. A ticket is your right to attend the event named on it, at the time shown in India Standard Time (IST).",
      "Prices are in Indian rupees (INR) and include GST. The price you pay is shown before you confirm the booking.",
      "When you book, you give your name and an email address, and a phone number if you choose to. Keep your ticket private. A refunded ticket cannot be used for entry.",
      "Organisers list the event and choose the refund rule. That rule is shown on the event page before you pay. Sound Matrix provides the Tikatero service. The organiser is responsible for putting on the event.",
      "If an event is cancelled, paid bookings are refunded in full to the original payment method. Test bookings are labelled as tests and no money is sent to a bank.",
    ],
  },
  privacy: {
    title: "Privacy",
    paragraphs: [
      "Tikatero is a product of Sound Matrix.",
      "When you book, we collect your name, email address, phone number if you give one, and the tickets and orders on your account. We use this to deliver tickets, take payment, pay refunds, and show you your bookings.",
      "We do not sell your details. Payments are handled by our payment provider. We do not store your card, UPI, or bank account details.",
      "From your account settings you can download a copy of your profile, tickets, and orders. You can also ask us to delete your account. If you have upcoming valid tickets, those bookings must be refunded or used first. If you run published or upcoming events, we will not delete the organiser for you. Close those events from the organiser console, or read the Help page, first.",
      "When an account is deleted we remove the personal details we no longer need from your profile, tickets, and orders. We keep payment and audit records we are required to retain.",
      "Times on Tikatero are shown in India Standard Time (IST). Prices are in Indian rupees and include GST.",
    ],
  },
  refunds: {
    title: "Refunds",
    paragraphs: [
      "Tikatero is a product of Sound Matrix.",
      "Each event shows its refund rule before you pay. Times are in India Standard Time (IST). Prices are in Indian rupees and include GST. A refund goes back to your original payment method.",
      "If the event allows refunds until 72 hours before the start, you can request a full refund from your account while the start is at least 72 hours away and none of the tickets have been used. You receive the full amount you paid, including GST.",
      "If the event says there are no refunds, you cannot request one yourself. The organiser can still refund you, for example if the show cannot go ahead.",
      "If the event writes its own refund rule, you can send a request. The organiser reviews it. Your tickets stay valid until the request is approved. No money moves until then.",
      "If an event is cancelled, every paid booking that has not already been refunded in full is refunded in full to the original payment method.",
      "Once a ticket is refunded it cannot be scanned at the door. A test refund is labelled as a test, and no money is sent to a bank.",
    ],
  },
} as const;

export type LegalSlug = keyof typeof legalPages;
