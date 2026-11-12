import { expect, it } from "vitest";
import { canModerate, readModerationForm } from "./moderation-model";

function form(fields: Record<string, string>) {
  const form = new FormData();
  form.set("event_id", "92100000-0000-4000-8000-000000000001");
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

it("requires a written reason for Other and staff unhide", () => {
  expect(() => readModerationForm(form({ operation: "hide", reason: "Other" }))).toThrow(
    "Enter a reason.",
  );
  expect(() => readModerationForm(form({ operation: "unhide", as_staff: "yes" }))).toThrow(
    "Enter a reason.",
  );
  expect(
    readModerationForm(form({ operation: "hide", reason: "Other", note: "  A closed venue  " }))
      .command,
  ).toMatchObject({ reason: "Other", note: "A closed venue" });
});

it("requires the organiser to acknowledge refunds and limits reasons to 300 characters", () => {
  expect(() => readModerationForm(form({ operation: "request", reason: "Venue closed" }))).toThrow(
    "full refund",
  );
  expect(() =>
    readModerationForm(
      form({
        operation: "request",
        reason: "x".repeat(301),
        acknowledged: "yes",
      }),
    ),
  ).toThrow("300 characters");
  expect(
    readModerationForm(
      form({
        operation: "request",
        reason: "Venue closed",
        acknowledged: "yes",
      }),
    ).command.operation,
  ).toBe("request");
});

it("limits emergency cancellation and permanent deletion to admins", () => {
  expect(canModerate("admin", true, "cancel")).toBe(true);
  expect(canModerate("staff", true, "cancel")).toBe(false);
  expect(canModerate("staff", true, "delete")).toBe(false);
  expect(canModerate("staff", true, "approve")).toBe(true);
  expect(canModerate("organiser", true, "approve")).toBe(false);
  expect(canModerate("organiser", false, "hide")).toBe(true);
  expect(canModerate("organiser", false, "retry")).toBe(false);
});
