import { expect, it } from "vitest";
import { profileValues } from "./validation";

it("trims profile fields and accepts an optional phone", () => {
  const data = new FormData();
  data.set("full_name", "  Anthony  ");
  data.set("role", "admin");
  expect(profileValues(data)).toEqual({ fullName: "Anthony", phone: null });
  data.set("phone", "+91 98765 43210");
  expect(profileValues(data)).toEqual({ fullName: "Anthony", phone: "+91 98765 43210" });
});
it("rejects invalid profile values", () => {
  const data = new FormData();
  expect(profileValues(data).error).toBeDefined();
  data.set("full_name", "a".repeat(101));
  expect(profileValues(data).error).toBeDefined();
  data.set("full_name", "Anthony");
  data.set("phone", "not a number");
  expect(profileValues(data).error).toBeDefined();
});
