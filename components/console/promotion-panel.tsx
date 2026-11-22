"use client";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { requestSmartPromotion } from "@/app/console/events/[id]/marketing/promotions/actions";

export function PromotionPanel({
  eventId,
  audience,
  status,
}: {
  eventId: string; audience: number; status: string | null;
}) {
  const [result, action, pending] = useActionState(requestSmartPromotion, {});
  return (
    <Card className="space-y-3" id="smart-promotions">
      <h2 className="text-xl font-bold">Smart Promotions</h2>
      <p className="text-sm text-muted">
        Announce a published public event to previous customers who explicitly opted in.
        Customer email addresses and phone numbers are never shared with hosts.
      </p>
      <p className="font-semibold">{audience} eligible past {audience === 1 ? "customer" : "customers"} for email</p>
      <p className="text-sm">Campaign: {status?.replaceAll("_", " ") ?? "Not requested"}</p>
      {!status && (
        <form action={action}>
          <input name="event" value={eventId} type="hidden" />
          <button type="submit" disabled={pending}
            className="min-h-11 rounded-lg border border-line px-4 font-bold">
            Request campaign review
          </button>
        </form>
      )}
      {result.error && <p role="alert" className="text-sm text-danger">{result.error}</p>}
      {result.success && <p role="status" className="text-sm text-teal">{result.success}</p>}
      <p className="text-xs text-muted">
        Tikatero Instagram and Facebook auto-posts are managed separately.
        WhatsApp campaigns need an approved WhatsApp Business API and template; they are not sent yet.
      </p>
    </Card>
  );
}
