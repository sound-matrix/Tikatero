import { Logo } from "@/components/brand/logo";
import { formatInr, formatIst } from "@/lib/format";
import { themes, toPaise, fromIstInput, type Values, type Tier } from "@/lib/events/model";
export function TicketPreview({ values, tier }: { values: Values; tier: Tier }) {
  const theme = themes[values.theme];
  let price: number | null = null;
  try {
    price = toPaise(tier.price);
  } catch {
    /* Incomplete price stays neutral in the preview. */
  }
  let date = "Date to be confirmed";
  try {
    const instant = fromIstInput(values.startsAt);
    if (instant) date = formatIst(instant);
  } catch {
    /* The form will explain invalid dates on save. */
  }
  return (
    <div
      aria-label={`${tier.name || "Ticket"} design preview`}
      className={`overflow-hidden rounded-2xl border-2 ${tier.vip ? "border-gold" : "border-line"}`}
    >
      <div
        className="flex items-center justify-between gap-3 p-4 text-white"
        style={{ background: `linear-gradient(120deg,${theme.color},${theme.accent})` }}
      >
        <strong className="text-lg">{values.title || "Your event name"}</strong>
        {tier.vip && <span className="rounded-full bg-gold px-3 py-1 font-bold text-ink">VIP</span>}
      </div>
      <div className="space-y-2 bg-white p-4">
        <p className="font-bold">{tier.name || "Ticket tier"}</p>
        <p className="text-sm text-muted">{date}</p>
        <p className="text-sm text-muted">{values.venue || "Venue to be confirmed"}</p>
        <p className="text-xl font-extrabold">
          {values.free
            ? "Free entry · RSVP"
            : price === null
              ? "Price to be confirmed"
              : `${formatInr(price)} incl. GST`}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-dashed border-line pt-3">
          <Logo className="h-8" />
          <span className="text-xs text-muted">Design preview</span>
        </div>
      </div>
    </div>
  );
}
