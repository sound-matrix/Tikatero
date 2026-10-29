import { expect, it } from "vitest";
import { checks, istDayRange, isSimulated, ageLabel, pageNumber } from "./model";
it("projects masked, bounded check results without raw provider values", () => {
  const result = checks({
    pan: {
      completed: true,
      passed: true,
      mode: "mock",
      last4: "legacy-number-234F",
      score: 104,
      ref: "private-provider-ref",
    },
    selfie: { score: 95, faceScore: 91 },
  });
  expect(result[0]).toMatchObject({ last4: "234F", score: 100, simulated: true });
  expect(JSON.stringify(result)).not.toContain("private-provider-ref");
  expect(isSimulated({ pan: { mode: "mock" } })).toBe(true);
  expect(checks(null)[0].completed).toBe(false);
});
it("uses India's date boundary even before midnight UTC", () => {
  expect(istDayRange(new Date("2026-10-29T19:00:00Z"))).toEqual({
    start: "2026-10-29T18:30:00.000Z",
    end: "2026-10-30T18:30:00.000Z",
  });
  expect(ageLabel("2026-10-28T00:00:00Z", Date.parse("2026-10-29T02:00:00Z"))).toBe("1d 2h");
  expect(pageNumber("-1")).toBe(1);
  expect(pageNumber("NaN")).toBe(1);
});
