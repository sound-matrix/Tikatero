import { expect, it } from "vitest";
import {
  autoResult,
  canEdit,
  maskLast4,
  matchThreshold,
  nameMatch,
  nextStep,
  type Application,
  type Progress,
} from "./model";
const details = {
  displayName: "Riverfront",
  legalName: "Alex Shah",
  type: "individual" as const,
  phone: "9876543210",
  city: "Pune",
};
const pass = {
  completed: true,
  passed: true,
  mode: "mock" as const,
  ref: "mock-ref",
  score: 99,
  faceScore: 99,
};
const complete: Progress = {
  details,
  pan: { ...pass },
  aadhaar: { ...pass },
  gstin: { ...pass, skipped: true },
  bank: { ...pass },
  selfie: { ...pass },
};
it("scores equivalent names including token order and accents", () => {
  expect(nameMatch(" ALEX   SHAH ", "Shah Alex")).toBe(100);
  expect(nameMatch("José Shah", "Jose Shah")).toBe(100);
  expect(nameMatch("Alex Shah", "Someone Else")).toBeLessThan(85);
  expect(nameMatch("", "Alex")).toBe(0);
  expect(nameMatch("Alex Shah", "Alex Shh")).toBeGreaterThan(85);
});
it("retains only the last four characters", () => {
  expect(maskLast4(["ABCDE", "1234", "F"].join(""))).toBe("234F");
  expect(maskLast4("1234 5678 9012")).toBe("9012");
  expect(maskLast4("12345678901234")).toBe("1234");
  expect(() => maskLast4("123")).toThrow();
});
it("defaults to 85 and rejects broken thresholds rather than lowering verification", () => {
  expect(matchThreshold()).toBe(85);
  expect(matchThreshold("90")).toBe(90);
  for (const value of ["NaN", "101", "-1"]) expect(() => matchThreshold(value)).toThrow();
});
it("passes complete checks at the threshold; never approves an organiser", () => {
  expect(autoResult(complete)).toEqual({ status: "auto_passed", flagged: [] });
  expect(autoResult({ ...complete, pan: { ...pass, score: 85 } })).toEqual({
    status: "auto_passed",
    flagged: [],
  });
});
it("flags low, failed, incomplete or missing checks; manual fallback cannot auto-pass", () => {
  expect(
    autoResult({
      ...complete,
      bank: { ...pass, score: 84 },
      aadhaar: { ...pass, passed: false, mode: "manual" },
    }),
  ).toEqual({ status: "needs_docs", flagged: ["aadhaar", "bank"] });
  expect(autoResult({ ...complete, selfie: { ...pass, faceScore: 0 } }).flagged).toEqual([
    "selfie",
  ]);
  expect(autoResult({}).flagged).toHaveLength(6);
  expect(autoResult({ ...complete, pan: { ...pass, score: undefined } }).flagged).toEqual(["pan"]);
});
it("reopens only flagged steps and picks saved progress", () => {
  const application = {
    status: "needs_docs",
    flagged_steps: ["bank"],
    step_progress: complete,
  } as Application;
  expect(canEdit(application, "bank")).toBe(true);
  expect(canEdit(application, "pan")).toBe(false);
  expect(nextStep(application)).toBe(4);
  expect(canEdit({ ...application, status: "auto_passed" }, "bank")).toBe(false);
  expect(nextStep(null)).toBe(0);
  expect(nextStep({ ...application, status: "draft", step_progress: { details } })).toBe(1);
});
