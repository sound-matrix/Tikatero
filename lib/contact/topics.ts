export const contactTopics = [
  { value: "buying", label: "Buying tickets" },
  { value: "refund", label: "Refund or cancellation" },
  { value: "selling", label: "Selling tickets as an organiser" },
  { value: "payments", label: "Payments or payouts" },
  { value: "other", label: "Other" },
] as const;

export const contactTopicValues = contactTopics.map((topic) => topic.value);

export type ContactTopic = (typeof contactTopics)[number]["value"];

export function contactTopicLabel(topic: string) {
  return contactTopics.find((item) => item.value === topic)?.label ?? topic;
}

export function isContactTopic(value: string): value is ContactTopic {
  return contactTopicValues.some((topic) => topic === value);
}
