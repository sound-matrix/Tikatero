import type { Category } from "@/lib/events/model";

/** Curated public categories: no synthetic keyword pages or private-event category. */
export const eventCategories = [
  { slug: "concerts", category: "Concert", label: "Concerts", summary: "live music and concerts" },
  { slug: "festivals-and-parties", category: "Festival party", label: "Festivals & Parties", summary: "festivals and parties" },
  { slug: "conferences", category: "Conference", label: "Conferences", summary: "conferences and business events" },
  { slug: "comedy-shows", category: "Comedy", label: "Comedy Shows", summary: "stand-up comedy and comedy shows" },
  { slug: "workshops", category: "Workshop", label: "Workshops", summary: "classes and workshops" },
  { slug: "sports", category: "Sports", label: "Sports Events", summary: "sports and sporting events" },
] as const satisfies readonly { slug: string; category: Category; label: string; summary: string }[];

export type EventCategory = (typeof eventCategories)[number];
export function eventCategory(slug: string): EventCategory | undefined {
  return eventCategories.find((item) => item.slug === slug);
}
export function categoryPath(category: EventCategory) {
  return `/events/category/${category.slug}`;
}
export function categoryByName(name: Category): EventCategory | undefined {
  return eventCategories.find((item) => item.category === name);
}
