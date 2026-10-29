import "server-only";
import { KycError } from "./model";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/lib/db/types";
import type { Application } from "./model";
export const applicationColumns =
  "id,organiser_id,status,revision,step_progress,flagged_steps,reviewer_note,submission_count" as const;
export async function loadApplication(
  client: SupabaseClient<Database>,
  organiserId: string,
): Promise<Application | null> {
  const { data, error } = await client
    .from("kyc_applications")
    .select(applicationColumns)
    .eq("organiser_id", organiserId)
    .not("revision", "is", null)
    .maybeSingle();
  if (error) throw new KycError("Your saved details could not be loaded. Please try again.");
  return data ? applicationDto(data) : null;
}
export function progressJson(application: Application["step_progress"]): Json {
  return JSON.parse(JSON.stringify(application)) as Json;
}

export function applicationDto(
  row: Pick<
    Tables<"kyc_applications">,
    | "id"
    | "organiser_id"
    | "status"
    | "revision"
    | "step_progress"
    | "flagged_steps"
    | "reviewer_note"
    | "submission_count"
  >,
): Application {
  return {
    id: row.id,
    organiser_id: row.organiser_id,
    status: row.status,
    revision: row.revision ?? 0,
    step_progress: row.step_progress as unknown as Application["step_progress"],
    flagged_steps: row.flagged_steps,
    reviewer_note: row.reviewer_note,
    submission_count: row.submission_count,
  };
}
