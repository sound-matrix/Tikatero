import { requestBuyerRefund } from "@/lib/refunds/actions";
import { Button } from "@/components/ui/button";

export function CancelBooking({
  orderId,
  message,
  canRequest,
  paused,
  fromOrder,
}: {
  orderId: string;
  message: string;
  canRequest: boolean;
  paused?: boolean;
  fromOrder?: boolean;
}) {
  if (!canRequest) return message ? <p className="mt-3 text-sm text-muted">{message}</p> : null;
  return (
    <form action={requestBuyerRefund} className="mt-4 space-y-2">
      <input type="hidden" name="order_id" value={orderId} />
      {fromOrder && <input type="hidden" name="from_order" value="yes" />}
      <p className="text-sm text-muted">{message}</p>
      {paused && (
        <p className="text-sm text-muted">
          Refunds are on hold for this event right now. You can still save your request.
        </p>
      )}
      <Button type="submit" variant="primary">
        Cancel my booking
      </Button>
    </form>
  );
}
