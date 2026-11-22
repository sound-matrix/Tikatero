import { describe, expect, it } from "vitest";
import { categories } from "@/lib/events/model";
import { eventCategories, eventCategory, categoryByName, categoryPath } from "./categories";

describe("category SEO routes", () => {
  it("only creates known, unique public category paths", () => {
    expect(eventCategories).toHaveLength(6);
    expect(new Set(eventCategories.map((item) => item.slug)).size).toBe(6);
    expect(eventCategory("concerts")?.category).toBe("Concert");
    expect(categoryPath(eventCategory("workshops")!)).toBe("/events/category/workshops");
    expect(eventCategory("../admin")).toBeUndefined();
    expect(eventCategory("unknown")).toBeUndefined();
  });
  it("maps routes to real organiser categories without private or generic SEO pages", () => {
    expect(eventCategories.every((item) => categories.includes(item.category))).toBe(true);
    expect(categoryByName("Wedding / Private")).toBeUndefined();
    expect(categoryByName("Other")).toBeUndefined();
    expect(categoryByName("Comedy")?.slug).toBe("comedy-shows");
  });
});
