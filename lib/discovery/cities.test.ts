import { describe, expect, it } from "vitest";
import { cityPath, eventCities, eventCity } from "./cities";

describe("curated city SEO routes", () => {
  it("builds a single canonical path per approved city", () => {
    expect(cityPath(eventCity("hyderabad")!)).toBe("/events/in/hyderabad");
    expect(cityPath(eventCity("bengaluru")!)).toBe("/events/in/bengaluru");
    expect(eventCities.map((item) => item.slug).length)
      .toBe(new Set(eventCities.map((item) => item.slug)).size);
  });
  it("does not generate arbitrary city or unsafe URL slugs", () => {
    expect(eventCity("fake-city")).toBeUndefined();
    expect(eventCity("../admin")).toBeUndefined();
    expect(eventCity("Hyderabad")).toBeUndefined();
  });
  it("covers the initial eight Indian cities", () => {
    expect(eventCities).toHaveLength(8);
    expect(eventCities.every((item) => item.name.length > 2)).toBe(true);
  });
});
