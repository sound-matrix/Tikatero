import { setRefundPause } from "@/lib/refunds/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RefundPauseForm({ eventId, paused }: { eventId?: string; paused: boolean }) {
  return (
    <form action={setRefundPause} className="space-y-3">
      {eventId && <input type="hidden" name="event_id" value={eventId} />}
      <input type="hidden" name="pause" value={paused ? "no" : "yes"} />
      <Input
        label={paused ? "Reason for resuming" : "Reason for pausing"}
        name="reason"
        required
        maxLength={300}
      />
      <p className="text-sm text-muted">Refunds already sent to Cashfree can’t be stopped.</p>
      <Button type="submit" variant="primary">
        {eventId
          ? paused
            ? "Resume refunds for this event"
            : "Pause refunds for this event"
          : paused
            ? "Resume refunds on Tikatero"
            : "Pause all refunds on Tikatero"}
      </Button>
    </form>
  );
}
