"use client";
import { useActionState } from "react";
import {
  reviewKyc,
  changeAccount,
  changeControl,
  retryNotification,
  type ActionState,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { fieldClass, stepLabels } from "@/lib/admin/model";
function Feedback({ state }: { state: ActionState }) {
  const [retryState, retry, pending] = useActionState(retryNotification, {});
  return (
    <>
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className="my-3 text-danger">
            {state.error}
          </p>
        )}
        {(retryState.success || state.success) && (
          <p role="status" className="my-3 text-teal">
            {retryState.success || state.success}
          </p>
        )}
        {retryState.error && <p role="alert">{retryState.error}</p>}
      </div>
      {state.notificationId && (
        <form action={retry}>
          <input type="hidden" name="notificationId" value={state.notificationId} />
          <Button type="submit" disabled={pending}>
            Retry email notification
          </Button>
        </form>
      )}
    </>
  );
}
export function ReviewForm({
  id,
  revision,
  disabled,
}: {
  id: string;
  revision: number | null;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(reviewKyc, {});
  return (
    <>
      <form action={action} className="space-y-5">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="revision" value={revision ?? ""} />
        <fieldset disabled={disabled || pending} className="space-y-5">
          <legend className="text-xl font-bold">Review decision</legend>
          <label className="block font-semibold">
            Note to organiser (optional)
            <textarea
              name="note"
              maxLength={1000}
              rows={3}
              className={`${fieldClass} mt-2 py-3`}
              placeholder="Explain the decision or what needs correcting. Do not include ID numbers or secrets."
            />
          </label>
          <fieldset>
            <legend className="mb-2 font-semibold">
              Steps to correct when requesting more docs
            </legend>
            <div className="flex flex-wrap gap-4">
              {Object.entries(stepLabels).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input type="checkbox" name="steps" value={key} className="size-5 accent-teal" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="decision" value="approved" variant="primary">
              Approve
            </Button>
            <Button type="submit" name="decision" value="needs_docs">
              Request more docs
            </Button>
            <Button
              type="submit"
              name="decision"
              value="rejected"
              className="border-danger text-danger"
            >
              Reject
            </Button>
          </div>
        </fieldset>
      </form>
      <Feedback state={state} />
    </>
  );
}
export function AccountForm({
  id,
  blocked,
  self,
}: {
  id: string;
  blocked: boolean;
  self: boolean;
}) {
  const [state, action, pending] = useActionState(changeAccount, {});
  return (
    <>
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <fieldset disabled={pending || self} className="space-y-3">
          {!blocked && (
            <label className="block text-sm font-semibold">
              Reason (required)
              <input
                name="reason"
                required
                maxLength={1000}
                className={`${fieldClass} mt-1`}
                placeholder="Shown to this account"
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {blocked ? (
              <Button type="submit" name="action" value="unblock">
                Unblock
              </Button>
            ) : (
              <>
                <Button
                  type="submit"
                  name="action"
                  value="block"
                  className="border-danger text-danger"
                >
                  Block
                </Button>
                <Button
                  type="submit"
                  name="action"
                  value="suspend"
                  className="border-danger text-danger"
                >
                  Suspend
                </Button>
              </>
            )}
          </div>
        </fieldset>
      </form>
      <Feedback state={state} />
    </>
  );
}
export function ControlForm({
  id,
  control,
  enabled,
}: {
  id: string;
  control: "payouts_on_hold" | "sales_paused";
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(changeControl, {});
  const label = control === "payouts_on_hold" ? "Hold payouts" : "Pause ticket sales";
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="control" value={control} />
        <input type="hidden" name="enabled" value={String(!enabled)} />
        <button
          type="submit"
          role="switch"
          aria-checked={enabled}
          aria-label={label}
          disabled={pending}
          className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-3 py-2 font-semibold disabled:opacity-50"
        >
          <span>{label}</span>
          <span
            className={`rounded-full px-3 py-1 text-sm ${enabled ? "bg-teal-soft text-teal" : "bg-soft text-muted"}`}
          >
            {enabled ? "On" : "Off"}
          </span>
        </button>
      </form>
      <Feedback state={state} />
    </div>
  );
}
