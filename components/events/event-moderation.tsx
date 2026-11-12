import { moderateEvent } from "@/lib/events/moderation-actions";
import { hideReasons } from "@/lib/events/moderation-model";
import type { Tables } from "@/lib/db/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModerationDialog } from "./moderation-dialog";
import { HideReasonFields } from "./hide-reason-fields";

export function EventModeration({
  event,
  request,
  staff = false,
  admin = false,
  own = false,
  hasOrders = false,
  queued = false,
  notice,
  error,
}: {
  event: Pick<
    Tables<"events">,
    "id" | "title" | "status" | "hidden_at" | "hidden_by_staff" | "hidden_reason"
  >;
  request: Tables<"event_removal_requests"> | null;
  staff?: boolean;
  admin?: boolean;
  own?: boolean;
  hasOrders?: boolean;
  queued?: boolean;
  notice?: string;
  error?: string;
}) {
  const pending = request?.status === "pending";
  const cancelled = event.status === "cancelled";
  const context = (operation: string, requestId?: string) => (
    <>
      <input type="hidden" name="event_id" value={event.id} />
      <input type="hidden" name="operation" value={operation} />
      {requestId && <input type="hidden" name="request_id" value={requestId} />}
      {staff && <input type="hidden" name="as_staff" value="yes" />}
      {staff && own && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="confirm_own" value="yes" required />I confirm that I belong
          to this organiser.
        </label>
      )}
    </>
  );
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-extrabold">
        {staff ? "Event review" : "Event visibility and cancellation"}
      </h2>
      {notice && (
        <p role="status" className="font-semibold text-teal">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="font-semibold">
          {error}
        </p>
      )}
      {!cancelled && event.hidden_at && (
        <p className="rounded-lg bg-teal-soft p-3 text-sm text-ink">
          {event.hidden_by_staff ? "Hidden by Tikatero" : "Hidden"}
          {event.hidden_reason ? `: ${event.hidden_reason}.` : "."}
          {!staff && event.hidden_by_staff && " Contact support."}
        </p>
      )}
      {cancelled && (
        <p className="rounded-lg bg-teal-soft p-3 font-semibold">This event is cancelled.</p>
      )}
      {pending && (
        <div className="rounded-lg bg-teal-soft p-3">
          <p className="font-semibold">
            {staff ? "Removal requested" : "Waiting for Tikatero to approve"}
          </p>
          <p className="mt-1 text-sm">{request.reason}</p>
        </div>
      )}
      {request?.status === "rejected" && (
        <p className="rounded-lg bg-teal-soft p-3 text-sm">
          Tikatero declined the removal request. {request.reviewer_note}
        </p>
      )}
      {staff && queued && <p className="font-semibold text-teal">Refund queued</p>}
      <div className="flex flex-wrap items-start gap-3">
        {!cancelled &&
          event.status !== "ended" &&
          (!event.hidden_at || (staff && !event.hidden_by_staff)) && (
            <ModerationDialog label="Hide event" title="Hide this event" action={moderateEvent}>
              <p className="text-sm text-muted">
                People won’t be able to find the event or book tickets. Existing tickets will still
                work.
              </p>
              {context("hide")}
              <HideReasonFields reasons={hideReasons} />
            </ModerationDialog>
          )}
        {!cancelled && event.hidden_at && !pending && (staff || !event.hidden_by_staff) && (
          <ModerationDialog
            label="Unhide event"
            title="Show this event again"
            action={moderateEvent}
          >
            {context("unhide")}
            {staff && <Input label="Reason" name="reason" maxLength={300} required />}
          </ModerationDialog>
        )}
        {!staff && !pending && !cancelled && (
          <ModerationDialog
            label="Cancel or delete this event"
            submitLabel="Send request"
            danger
            action={moderateEvent}
          >
            <p className="text-sm text-muted">
              We’ll hide your event now and send your request to Tikatero.
            </p>
            {context("request")}
            <Input label="Reason" name="reason" maxLength={300} required />
            <label className="flex items-start gap-2 text-sm font-medium">
              <input className="mt-1" type="checkbox" name="acknowledged" value="yes" required />I
              understand all buyers will get a full refund
            </label>
          </ModerationDialog>
        )}
        {!staff && pending && (
          <ModerationDialog label="Withdraw request" action={moderateEvent}>
            {context("withdraw", request.id)}
            <p className="text-sm text-muted">The event stays hidden until you show it again.</p>
          </ModerationDialog>
        )}
        {staff && pending && (
          <>
            <ModerationDialog
              label="Approve removal request"
              submitLabel="Approve and refund"
              danger
              action={moderateEvent}
            >
              <p className="text-sm text-muted">
                This cancels the event and starts full refunds for paid bookings.
              </p>
              {context("approve", request.id)}
            </ModerationDialog>
            <ModerationDialog label="Reject request" action={moderateEvent}>
              {context("reject", request.id)}
              <Input label="Note to the organiser" name="reason" maxLength={300} required />
            </ModerationDialog>
          </>
        )}
        {admin && !cancelled && (
          <ModerationDialog
            label="Emergency cancel & refund"
            submitLabel="Cancel and refund buyers"
            danger
            action={moderateEvent}
          >
            <p className="text-sm text-muted">
              This cancels the event and starts full refunds for paid bookings.
            </p>
            {context("cancel")}
            <Input label="Reason" name="reason" maxLength={300} required />
            <p className="font-semibold">{event.title}</p>
            <Input label="Type the event title" name="title" required />
          </ModerationDialog>
        )}
        {admin &&
          (hasOrders ? (
            <div>
              <Button variant="danger" disabled aria-describedby="delete-bookings">
                Delete permanently
              </Button>
              <p id="delete-bookings" className="mt-2 text-sm text-muted">
                Events with bookings are cancelled and refunded, not deleted.
              </p>
            </div>
          ) : (
            <ModerationDialog label="Delete permanently" danger action={moderateEvent}>
              <p className="text-sm text-muted">
                This permanently removes the event, ticket types, guests and images.
              </p>
              {context("delete")}
              <Input label="Reason" name="reason" maxLength={300} required />
            </ModerationDialog>
          ))}
        {staff && queued && (
          <form action={moderateEvent} className="space-y-2">
            {context("retry")}
            <Button type="submit" variant="primary">
              Retry refunds
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
