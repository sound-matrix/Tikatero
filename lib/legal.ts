export const COMPANY_NAME = "Sound Matrix";
export const FOOTER_CREDIT = `© ${COMPANY_NAME}`;

export const footerLinks = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/refunds", label: "Refunds" },
  { href: "/help", label: "Help" },
] as const;

export const legalPages = {
  terms: {
    title: "Terms",
    paragraphs: [
      "Tikatero is a product of Sound Matrix.",
      "These terms will explain how people buy tickets and how organisers list events. The full text will be published on this page before tickets go on sale.",
    ],
  },
  privacy: {
    title: "Privacy",
    paragraphs: [
      "Tikatero is a product of Sound Matrix.",
      "This page will explain what information is collected when you book a ticket, and how you can ask for a copy or ask for it to be deleted.",
    ],
  },
  refunds: {
    title: "Refunds",
    paragraphs: [
      "Tikatero is a product of Sound Matrix.",
      "Each event will show its refund rule before you pay. If an event is cancelled, the ticket price is refunded. The full refund policy will be published on this page.",
    ],
  },
} as const;

export type LegalSlug = keyof typeof legalPages;
