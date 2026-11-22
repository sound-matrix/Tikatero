import { describe, expect, it } from "vitest";
import { isFilteredListing } from "./indexing";

describe("indexable discovery routes", () => {
  it("keeps the clean event listing indexable", () => {
    expect(isFilteredListing({})).toBe(false);
    expect(isFilteredListing({ city: "", country: "" })).toBe(false);
    expect(isFilteredListing({ q: ["", ""] })).toBe(false);
  });
  it("prevents indexation of query, city, category and pagination variations", () => {
    expect(isFilteredListing({ q: "concert" })).toBe(true);
    expect(isFilteredListing({ city: "Hyderabad", country: "IN" })).toBe(true);
    expect(isFilteredListing({ category: "Workshop" })).toBe(true);
    expect(isFilteredListing({ page: "2" })).toBe(true);
    expect(isFilteredListing({ price: "free", from: "2026-12-01" })).toBe(true);
    expect(isFilteredListing({ q: ["", "music"] })).toBe(true);
  });
  it("ignores empty tracking parameters but treats nonempty tracking URLs as variants", () => {
    expect(isFilteredListing({ utm_source: "" })).toBe(false);
    expect(isFilteredListing({ utm_source: "instagram" })).toBe(true);
  });
});
