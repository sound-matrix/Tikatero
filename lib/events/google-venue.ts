import { isGoogleMapsUrl, type Values } from "./model";
// Public-domain Natural Earth bounds via sandstrom and graydon/country-bounding-boxes.
import countryBounds from "./country-bounds.json";

export type VenueDetails = Pick<
  Values,
  "venue" | "address" | "city" | "country" | "lat" | "lng" | "mapsUrl"
>;

export const venuePlaceFields = [
  "displayName",
  "formattedAddress",
  "location",
  "addressComponents",
  "googleMapsURI",
];

export function venueLocationBias(country: string): google.maps.LatLngBoundsLiteral | undefined {
  const bounds = countryBounds[country as keyof typeof countryBounds];
  if (!bounds) return;
  const [west, south, east, north] = bounds;
  return { west, south, east, north };
}

export function roundVenuePoint({ lat, lng }: google.maps.LatLngLiteral) {
  return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
}

export function venueFromPlace(place: google.maps.places.Place): VenueDetails | null {
  if (!place.location) return null;
  const component = (type: string) =>
    place.addressComponents?.find((part) => part.types.includes(type));
  const country = component("country")?.shortText?.toUpperCase() ?? "";
  const city =
    component("locality")?.longText || component("administrative_area_level_2")?.longText || "";
  return {
    venue: place.displayName ?? "",
    address: place.formattedAddress ?? "",
    city,
    country: /^[A-Z]{2}$/.test(country) ? country : "",
    ...roundVenuePoint(place.location.toJSON()),
    mapsUrl: place.googleMapsURI && isGoogleMapsUrl(place.googleMapsURI) ? place.googleMapsURI : "",
  };
}
