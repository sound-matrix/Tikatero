import { categories } from "@/lib/events/model";
import { countries } from "@/lib/discovery/countries";
import { cities } from "@/lib/cities";
import type { Filters } from "@/lib/discovery/model";
const input = "mt-1 min-h-12 w-full rounded-xl border border-line bg-white px-3 text-base";
export function DiscoveryFilters({
  value,
  compact = false,
}: {
  value: Filters;
  compact?: boolean;
}) {
  return (
    <form
      action="/events"
      method="get"
      role="search"
      aria-label="Find events"
      className={`grid gap-3 ${compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4"}`}
    >
      <label className="text-sm font-semibold">
        Search events
        <input
          className={input}
          name="q"
          defaultValue={value.q}
          placeholder="Music, comedy, a night out…"
          maxLength={100}
        />
      </label>
      <label className="text-sm font-semibold">
        City
        <input
          className={input}
          name="city"
          defaultValue={value.city}
          list="event-cities"
          placeholder="Any city"
          maxLength={100}
        />
      </label>
      <datalist id="event-cities">
        {cities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      <label className="text-sm font-semibold">
        Country
        <select aria-label="Country" className={input} name="country" defaultValue={value.country}>
          <option value="">Anywhere in the world</option>
          {countries.map((code) => (
            <option key={code} value={code}>
              {new Intl.DisplayNames(["en"], { type: "region" }).of(code)}
            </option>
          ))}
        </select>
      </label>
      {!compact && (
        <>
          <label className="text-sm font-semibold">
            Category
            <select
              aria-label="Category"
              name="category"
              defaultValue={value.category}
              className={input}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            From (IST)
            <input type="date" name="from" defaultValue={value.from} className={input} />
          </label>
          <label className="text-sm font-semibold">
            To (IST)
            <input type="date" name="to" defaultValue={value.to} className={input} />
          </label>
          <label className="text-sm font-semibold">
            Ticket price
            <select
              aria-label="Ticket price"
              name="price"
              defaultValue={value.price}
              className={input}
            >
              <option value="">Free and paid</option>
              <option value="free">Free — RSVP</option>
              <option value="paid">Paid</option>
            </select>
          </label>
        </>
      )}
      <button className="min-h-12 self-end rounded-xl bg-[linear-gradient(135deg,var(--coral),var(--orange))] px-6 py-3 text-xl font-bold text-ink">
        Find events
      </button>
    </form>
  );
}
