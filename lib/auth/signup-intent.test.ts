import { expect, it } from "vitest";
import { signupIntent } from "./signup-intent";

it("accepts only buyer and host intent", () => {
  expect(signupIntent.parse("attendee")).toBe("attendee");
  expect(signupIntent.parse("organiser")).toBe("organiser");
  for (const value of ["admin", "staff", "organiser ", "", null])
    expect(signupIntent.safeParse(value).success).toBe(false);
});
