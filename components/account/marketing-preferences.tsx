"use client";
import { useActionState } from "react";
import { changeMarketingPreference } from "@/app/(public)/me/actions";
import { Card } from "@/components/ui/card";

export function MarketingPreferences({
  emailOptIn,
  whatsappOptIn,
}: {
  emailOptIn: boolean;
  whatsappOptIn: boolean;
}) {
  const [state, action, pending] = useActionState(changeMarketingPreference, {});
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">Event promotions you choose</h2>
      <p className="text-sm text-muted">
        Optional updates about future public events from organisers you have booked before.
        Ticket receipts and essential booking messages are always separate.
      </p>
      <form action={action} className="space-y-3">
        <fieldset disabled={pending} className="flex flex-wrap gap-3">
          <button type="submit" name="channel" value="email" formAction={undefined}
            className="sr-only" aria-hidden="true" tabIndex={-1}>Unused</button>
          <button type="submit" name="email_choice" value="subscribe"
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (!form) return;
              (form.elements.namedItem("channel") as HTMLInputElement).value = "email";
              (form.elements.namedItem("enabled") as HTMLInputElement).value = emailOptIn ? "false" : "true";
            }}
            className="min-h-11 rounded-lg border border-line px-4 font-semibold">
            Email: {emailOptIn ? "On — turn off" : "Off — turn on"}
          </button>
          <button type="submit" name="whatsapp_choice" value="subscribe"
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (!form) return;
              (form.elements.namedItem("channel") as HTMLInputElement).value = "whatsapp";
              (form.elements.namedItem("enabled") as HTMLInputElement).value = whatsappOptIn ? "false" : "true";
            }}
            className="min-h-11 rounded-lg border border-line px-4 font-semibold">
            WhatsApp: {whatsappOptIn ? "On — turn off" : "Off — turn on"}
          </button>
        </fieldset>
        <input type="hidden" name="channel" defaultValue="email" />
        <input type="hidden" name="enabled" defaultValue="false" />
        {state.error && <p role="alert" className="text-danger">{state.error}</p>}
        {state.success && <p role="status" className="text-teal">{state.success}</p>}
      </form>
      <p className="text-xs text-muted">
        WhatsApp promotion delivery is not active yet. Turning on the preference does not send messages.
        You can withdraw either choice at any time.
      </p>
    </Card>
  );
}
