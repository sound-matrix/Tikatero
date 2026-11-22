/** Approved Indian city discovery routes. Do not create arbitrary keyword/doorway URLs. */
export const eventCities = [
  { slug: "hyderabad", name: "Hyderabad" },
  { slug: "bengaluru", name: "Bengaluru" },
  { slug: "mumbai", name: "Mumbai" },
  { slug: "delhi", name: "Delhi" },
  { slug: "pune", name: "Pune" },
  { slug: "chennai", name: "Chennai" },
  { slug: "kolkata", name: "Kolkata" },
  { slug: "ahmedabad", name: "Ahmedabad" },
] as const;

export type EventCity = (typeof eventCities)[number];

export function eventCity(slug: string): EventCity | undefined {
  return eventCities.find((city) => city.slug === slug);
}

export function cityPath(city: EventCity) {
  return `/events/in/${city.slug}`;
}
