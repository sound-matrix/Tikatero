import { expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));

import { renderSocialImage } from "@/lib/social/render";

const event = {
  title: "City Lights",
  slug: "city-lights",
  starts_at: "2026-12-01T13:30:00.000Z",
  venue_name: "Sound Hall",
  city: "Hyderabad",
  category: "Comedy",
  poster_key: null,
  theme: "none",
  is_free: false,
  min_price_paise: 49900,
  tiers: [{ price_paise: 49900 }],
};

it("renders square and story JPEGs at the Instagram sizes", async () => {
  const square = await renderSocialImage(event, "square");
  const story = await renderSocialImage(
    { ...event, is_free: true, min_price_paise: null, tiers: [] },
    "story",
  );
  expect(square.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(story.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(await sharp(square).metadata()).toMatchObject({
    width: 1080,
    height: 1080,
    format: "jpeg",
  });
  expect(await sharp(story).metadata()).toMatchObject({
    width: 1080,
    height: 1920,
    format: "jpeg",
  });
}, 60_000);
