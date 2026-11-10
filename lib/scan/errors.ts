const KNOWN = new Set([
  "This person is already on the team.",
  "This person already has an invitation.",
  "Enter a valid email address.",
  "Choose a team role.",
  "That team member was not found.",
  "That device was not found.",
]);

export function plainDatabaseError(
  error: { message?: string } | null | undefined,
  fallback: string,
) {
  const message = error?.message ?? "";
  if (KNOWN.has(message)) return message;
  if (message === "not authorised to scan" || message === "not authorised to invite")
    return "You can't do that for this event.";
  if (message === "This device is not authorised for this event.")
    return "This phone is not allowed to scan this event.";
  return fallback;
}
