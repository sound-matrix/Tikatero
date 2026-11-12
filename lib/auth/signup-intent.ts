import { z } from "zod";

export const signupIntent = z.enum(["attendee", "organiser"]);
export type SignupIntent = z.infer<typeof signupIntent>;
