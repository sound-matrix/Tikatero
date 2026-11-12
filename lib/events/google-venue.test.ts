import { expect, it } from "vitest";
import { roundVenuePoint, venueFromPlace, venueLocationBias } from "./google-venue";

const country = {
  types: ["country", "political"],
  shortText: "ae",
  longText: "United Arab Emirates",
};
const district = { types: ["administrative_area_level_2"], longText: "Dubai District" };
const locality = { types: ["locality", "political"], longText: "Dubai" };
const place = {
  displayName: "Festival Hall",
  formattedAddress: "1 Event Street, Dubai",
  location: { toJSON: () => ({ lat: 25.20484967, lng: 55.27078217 }) },
  googleMapsURI: "https://maps.google.com/?cid=1234",
};

function mapDetails(addressComponents: object[]) {
  return venueFromPlace({ ...place, addressComponents } as google.maps.places.Place);
}

it("maps Google venue details and prefers the locality over the district", () => {
  expect(mapDetails([district, country, locality])).toEqual({
    venue: "Festival Hall",
    address: "1 Event Street, Dubai",
    city: "Dubai",
    country: "AE",
    lat: "25.204850",
    lng: "55.270782",
    mapsUrl: place.googleMapsURI,
  });
});

it("falls back to the second-level administrative area and leaves missing fields editable", () => {
  expect(mapDetails([district])).toMatchObject({ city: "Dubai District", country: "" });
  expect(mapDetails([])).toMatchObject({ city: "", country: "" });
  expect(venueFromPlace({ location: null } as google.maps.places.Place)).toBeNull();
});

it("rounds negative and zero coordinates to six decimals", () => {
  expect(roundVenuePoint({ lat: -12.1234567, lng: 0 })).toEqual({
    lat: "-12.123457",
    lng: "0.000000",
  });
});

it("biases India and the organiser’s country to different bounds", () => {
  expect(venueLocationBias("IN")).toEqual({ west: 68.18, south: 7.97, east: 97.4, north: 35.49 });
  expect(venueLocationBias("AE")).toEqual({ west: 51.58, south: 22.5, east: 56.4, north: 26.06 });
  expect(venueLocationBias("ZZ")).toBeUndefined();
});
