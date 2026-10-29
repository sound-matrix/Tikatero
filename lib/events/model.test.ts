import { describe, expect, it } from "vitest";
import {
  slugBase,
  toPaise,
  fromIstInput,
  toIstInput,
  mapsCoordinates,
  isGoogleMapsUrl,
  emptyValues,
} from "./model";
import {
  validateStep,
  validatePublish,
  validateSavedInput,
  inputSchema,
  stepPayload,
} from "./validation";
const id = "c8100001-0000-4000-8000-000000000001";
describe("event links", () => {
  it.each([
    ["Sample Music Night", "sample-music-night"],
    [" Café & Jazz! ", "cafe-jazz"],
    ["---", "event"],
    ["తెలుగు సంగీతం", "event"],
  ])("normalizes %s", (title, expected) => expect(slugBase(title)).toBe(expected));
  it("bounds a long link and avoids trailing separators", () => {
    expect(slugBase("Music ".repeat(50)).length).toBeLessThanOrEqual(80);
    expect(slugBase("Music ".repeat(50))).not.toMatch(/-$/);
  });
});
describe("integer paise", () => {
  it.each([
    ["1000", 100000],
    ["0.01", 1],
    ["1000.50", 100050],
    [" 12.5 ", 1250],
    ["0", 0],
  ])("converts %s exactly", (value, expected) => expect(toPaise(value)).toBe(expected));
  it.each(["12.345", "-1", "1e3", "NaN", "1,000", "", "Infinity"])(
    "rejects %s without rounding",
    (value) => expect(() => toPaise(value)).toThrow(),
  );
});
it("round trips IST and rejects impossible dates", () => {
  expect(fromIstInput("2026-11-07T19:00")).toBe("2026-11-07T13:30:00.000Z");
  expect(toIstInput("2026-11-07T13:30:00Z")).toBe("2026-11-07T19:00");
  expect(() => fromIstInput("2026-02-31T10:00")).toThrow();
});
it("extracts map coordinates without following short links or arbitrary URLs", () => {
  expect(mapsCoordinates("https://www.google.com/maps?q=17.385,78.4867")).toEqual({
    lat: 17.385,
    lng: 78.4867,
  });
  expect(mapsCoordinates("https://www.google.com/maps/place/Studio/@17.3,78.4,15z")).toEqual({
    lat: 17.3,
    lng: 78.4,
  });
  expect(mapsCoordinates("https://maps.app.goo.gl/example")).toBeNull();
  expect(isGoogleMapsUrl("https://google.com.evil.test/maps")).toBe(false);
  expect(isGoogleMapsUrl("javascript:alert(1)")).toBe(false);
});
it("validates missing fields on continue, but rejects unsafe optional values even for drafts", () => {
  const v = emptyValues();
  expect(() => validateStep(v, 0, id)).toThrow(/event name/);
  v.mapsUrl = "https://evil.test/";
  expect(() => validateSavedInput(v, 2, id)).toThrow(/Google Maps/);
  v.posterKey = `poster/c8999999-0000-4000-8000-000000000001/${crypto.randomUUID()}.png`;
  expect(() => validateSavedInput(v, 3, id)).toThrow(/this event/);
});
it("requires a whole quantity, valid sales window and explicit free-event prices", () => {
  const v = emptyValues();
  v.tiers = [
    {
      id: crypto.randomUUID(),
      name: "VIP",
      price: "1000.01",
      quantity: "10",
      perOrderMax: "2",
      salesStart: "2026-11-01T10:00",
      salesEnd: "2026-11-02T10:00",
      vip: true,
    },
  ];
  // A chosen sales window can remain open after the event starts.
  v.startsAt = "2026-11-01T19:00";
  expect(() => validateStep(v, 5, id)).not.toThrow();
  expect(stepPayload(v, 5)).toMatchObject({ tiers: [{ price_paise: 100001 }] });
  v.free = true;
  expect(stepPayload(v, 5)).toMatchObject({ tiers: [{ price_paise: 0 }] });
  v.tiers[0].quantity = "1.5";
  expect(() => validateStep(v, 5, id)).toThrow(/whole/);
});
it("validates the complete saved event before publication", () => {
  expect(() => validatePublish(emptyValues(), id)).toThrow();
  expect(
    inputSchema.safeParse({
      eventId: id,
      organiserId: id,
      revision: 0,
      step: 0,
      nextStep: 1,
      publish: false,
      advance: true,
      values: { ...emptyValues(), untrusted: "field" },
    }).success,
  ).toBe(false);
});
