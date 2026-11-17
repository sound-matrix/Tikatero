"use client";

import { useActionState } from "react";
import { saveOrganisationSettings, type OrganisationSettingsState } from "./actions";

export function OrganisationNameForm({
  organiserId, displayName,
}: { organiserId: string; displayName: string }) {
  const [state, formAction, pending] = useActionState<OrganisationSettingsState, FormData>(
    saveOrganisationSettings,
    {},
  );
  return (
    <form action={formAction} className="mt-5 space-y-3">
      <input type="hidden" name="organiserId" value={organiserId} />
      <label htmlFor={`organisation-name-${organiserId}`} className="block text-sm font-bold">
        Public organisation name
      </label>
      <input
        id={`organisation-name-${organiserId}`}
        name="displayName"
        defaultValue={displayName}
        required
        minLength={2}
        maxLength={100}
        className="block min-h-12 w-full max-w-xl rounded-xl border border-line bg-white px-4"
      />
      <p className="text-xs text-muted">
        This changes your public display name only. It does not alter verified legal or bank details.
      </p>
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-xl bg-teal px-5 py-2 font-bold text-white disabled:opacity-60">
        {pending ? "Saving…" : "Save name"}
      </button>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.success && <p role="status" className="text-sm font-semibold text-teal">{state.success}</p>}
    </form>
  );
}
