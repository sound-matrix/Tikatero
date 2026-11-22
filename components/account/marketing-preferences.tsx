"use client";
import { useActionState } from "react";
import { changeMarketingPreference } from "@/app/(public)/me/actions";
import { Card } from "@/components/ui/card";

function ConsentToggle({ channel, enabled }: { channel: "email" | "whatsapp"; enabled: boolean }) {
  const [state, action, pending] = useActionState(changeMarketingPreference, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-lg border border-line px-4 font-semibold">
        {channel === "email" ? "Email" : "WhatsApp"}: {enabled ? "On — turn off" : "Off — turn on"}
      </button>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-teal">{state.success}</p>}
    </form>
  );
}

export function MarketingPreferences({
  emailOptIn,
  whatsappOptIn,
}: {
  emailOptIn: boolean;
  whatsappOptIn: boolean;
}) {
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">Event promotions you choose</h2>
      <p className="text-sm text-muted">
        Optional updates about future public events from organisers you have booked before.
        Ticket receipts and essential booking messages are separate.
      </p>
      <div className="flex flex-wrap gap-3">
        <ConsentToggle channel="email" enabled={emailOptIn} />
        <ConsentToggle channel="whatsapp" enabled={whatsappOptIn} />
      </div>
      <p className="text-xs text-muted">
        WhatsApp promotional delivery is not active yet. You can withdraw either choice at any time.
      </p>
    </Card>
  );
}
