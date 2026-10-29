"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImageUpload } from "@/components/image-upload";
import { saveEvent } from "@/app/console/events/actions";
import {
  steps,
  categories,
  themes,
  emptyValues,
  mapsCoordinates,
  openMaps,
  toPaise,
  fromIstInput,
  type Values,
  type Tier,
} from "@/lib/events/model";
import type { Draft } from "@/lib/events/store";
import { previewPricing, organiserFeeWording, type PricingVersion } from "@/lib/pricing";
import { formatInr, formatIst } from "@/lib/format";
import { VenueMap } from "./venue-map";
import { TicketPreview } from "./ticket-preview";
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const fieldClass =
  "min-h-12 w-full rounded-xl border border-line bg-white px-3 text-ink outline-none";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 font-semibold text-ink">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-muted">{description}</p>
      </header>
      {children}
    </section>
  );
}
function price(value: string) {
  try {
    return `${formatInr(toPaise(value))} incl. GST`;
  } catch {
    return "Price to be confirmed";
  }
}
function when(value: string) {
  try {
    const instant = fromIstInput(value);
    return instant ? formatIst(instant) : "Not set";
  } catch {
    return "Not set";
  }
}
export type WizardProps = {
  id: string;
  organiserId: string;
  organiserName: string;
  approved: boolean;
  paused: boolean;
  initial: Draft | null;
  initialStep: number;
  origin: string;
  mediaBase: string | null;
  uploadsConfigured: boolean;
  pricingVersion: PricingVersion;
};
export function EventWizard({
  id: initialId,
  organiserId,
  organiserName,
  approved,
  paused,
  initial,
  initialStep,
  origin,
  mediaBase,
  uploadsConfigured,
  pricingVersion,
}: WizardProps) {
  const router = useRouter();
  const [id] = useState(initialId);
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [values, setValues] = useState<Values>(initial?.values ?? emptyValues()),
    [draft, setDraft] = useState(initial),
    [step, setStep] = useState(initialStep),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false);
  const canPublish = approved && !paused,
    complete = draft?.completed ?? [],
    alreadyPublished = draft?.status === "published";
  const preview = previewPricing(
    { ticketPaise: 100000, feePayer: values.feePayer },
    pricingVersion,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setMessage("");
  }
  function imageUrl(key: string) {
    if (
      !mediaBase ||
      !new RegExp(`^(poster|guest_photo)/${id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i").test(key)
    )
      return null;
    return new URL(key, mediaBase).href;
  }
  async function save(next: number, publish = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await saveEvent({
        eventId: id,
        organiserId,
        revision: draft?.revision ?? 0,
        step,
        nextStep: next,
        values,
        publish,
        advance: next > step,
      });
      if (result.error || !result.draft) {
        setError(result.error ?? "Your draft could not be saved. Please try again.");
        return;
      }
      setDraft(result.draft);
      setValues(result.draft.values);
      setStep(next);
      setDirty(false);
      setMessage(
        publish ? "Your event is published." : alreadyPublished ? "Changes saved." : "Draft saved.",
      );
      router.replace(`/console/events/${id}/edit?step=${next + 1}`, { scroll: false });
    } catch {
      setError("We could not save your event. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  function addTier() {
    update("tiers", [
      ...values.tiers,
      {
        id: crypto.randomUUID(),
        name: values.free ? "RSVP" : "General admission",
        price: values.free ? "0" : "1000",
        quantity: "100",
        perOrderMax: "10",
        salesStart: "",
        salesEnd: "",
        vip: false,
      },
    ]);
  }
  function changeTier(index: number, key: keyof Tier, value: string | boolean) {
    update(
      "tiers",
      values.tiers.map((t, i) => (i === index ? { ...t, [key]: value } : t)),
    );
  }
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">
            {organiserName}
          </p>
          <h1 className="text-3xl font-extrabold text-ink">
            {alreadyPublished ? "Edit event" : "Create event"}
          </h1>
          <p className="mt-2 text-muted">
            One step at a time. Save your draft and return whenever you like.
          </p>
        </div>
        <Button href="/console/events">Your events</Button>
      </header>
      <nav aria-label="Event creation steps" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {steps.map((name, index) => (
          <button
            key={name}
            type="button"
            disabled={
              !hydrated || busy || (index > step && !complete.includes(index) && index !== step + 1)
            }
            aria-current={index === step ? "step" : undefined}
            onClick={() => {
              if (index !== step) void save(index);
            }}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${index === step ? "border-coral bg-soft" : "border-line bg-white"}`}
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${index === step ? "bg-coral text-white" : complete.includes(index) ? "bg-teal-soft text-teal" : "bg-soft text-muted"}`}
            >
              {complete.includes(index) && index !== step ? "✓" : index + 1}
            </span>
            {name}
          </button>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-muted">
          Step {step + 1} of 8 · {steps[step]}
        </span>
        <span className={dirty ? "text-muted" : "text-teal"}>
          {dirty
            ? "Unsaved changes"
            : draft
              ? "Saved to your account"
              : "Start with the event basics"}
        </span>
      </div>
      <form
        aria-busy={busy || !hydrated}
        onSubmit={(e) => {
          e.preventDefault();
          void save(Math.min(7, step + 1));
        }}
      >
        <Card className="p-5! md:p-7!">
          <fieldset disabled={busy || !hydrated} className="min-w-0 space-y-5">
            {step === 0 && (
              <Section
                title="Tell people about your event"
                description="A clear name and description help people know what to expect."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["diwali", "christmas", "new_year"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setValues((v) => ({
                          ...v,
                          title: themes[key].title,
                          description: themes[key].description,
                          theme: key,
                        }));
                        setDirty(true);
                      }}
                      className="rounded-xl border border-line p-4 text-left"
                    >
                      <span
                        className="mb-3 block h-2 rounded-full"
                        style={{
                          background: `linear-gradient(90deg,${themes[key].color},${themes[key].accent})`,
                        }}
                      />
                      <strong>{themes[key].name}</strong>
                      <span className="mt-1 block text-sm text-muted">
                        Prefill copy and colours only
                      </span>
                    </button>
                  ))}
                </div>
                <Field label="Event name">
                  <input
                    className={fieldClass}
                    value={values.title}
                    maxLength={150}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="Sample Music Night"
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Category">
                    <select
                      className={fieldClass}
                      value={values.category}
                      onChange={(e) => update("category", e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Event theme">
                    <select
                      className={fieldClass}
                      value={values.theme}
                      onChange={(e) => update("theme", e.target.value as Values["theme"])}
                    >
                      {Object.entries(themes).map(([key, t]) => (
                        <option key={key} value={key}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    className={`${fieldClass} py-3`}
                    rows={5}
                    value={values.description}
                    maxLength={2000}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="Tell people what is happening, who it is for and what is included."
                  />
                </Field>
                <label className="flex items-center gap-3 rounded-xl bg-soft p-4 font-semibold">
                  <input
                    type="checkbox"
                    className="size-5 accent-teal"
                    checked={values.free}
                    onChange={(e) => {
                      update("free", e.target.checked);
                      if (e.target.checked)
                        update(
                          "tiers",
                          values.tiers.map((t) => ({ ...t, price: "0" })),
                        );
                    }}
                  />
                  Free event — RSVP only
                </label>
              </Section>
            )}
            {step === 1 && (
              <Section
                title="When is your event?"
                description="All dates and times are in India Standard Time (IST), including sales windows."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Starts (IST)">
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      value={values.startsAt}
                      onChange={(e) => update("startsAt", e.target.value)}
                    />
                  </Field>
                  <Field label="Ends (IST, optional)">
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      value={values.endsAt}
                      onChange={(e) => update("endsAt", e.target.value)}
                    />
                  </Field>
                  <Field label="Gates open (IST, optional)">
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      value={values.gatesAt}
                      onChange={(e) => update("gatesAt", e.target.value)}
                    />
                  </Field>
                </div>
                <p className="rounded-xl bg-teal-soft p-4 text-sm text-ink">
                  {values.startsAt
                    ? `People will see: ${when(values.startsAt)}`
                    : "Choose the event start time. Gates can open earlier for entry."}
                </p>
              </Section>
            )}
            {step === 2 && (
              <Section
                title="Where will people meet?"
                description="Add a clear address and a map pin so guests can find the entrance."
              >
                <Field label="Venue name">
                  <input
                    className={fieldClass}
                    value={values.venue}
                    maxLength={150}
                    onChange={(e) => update("venue", e.target.value)}
                  />
                </Field>
                <Field label="Address">
                  <input
                    className={fieldClass}
                    value={values.address}
                    maxLength={500}
                    onChange={(e) => update("address", e.target.value)}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="City">
                    <input
                      className={fieldClass}
                      value={values.city}
                      maxLength={100}
                      onChange={(e) => update("city", e.target.value)}
                    />
                  </Field>
                  <Field label="Country">
                    <select
                      className={fieldClass}
                      value={values.country}
                      onChange={(e) => update("country", e.target.value)}
                    >
                      {[
                        ["IN", "India"],
                        ["AE", "United Arab Emirates"],
                        ["GB", "United Kingdom"],
                        ["US", "United States"],
                        ["CA", "Canada"],
                        ["AU", "Australia"],
                        ["SG", "Singapore"],
                      ].map(([key, name]) => (
                        <option key={key} value={key}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Google Maps link (optional)">
                  <input
                    type="url"
                    className={fieldClass}
                    value={values.mapsUrl}
                    onChange={(e) => {
                      const link = e.target.value;
                      update("mapsUrl", link);
                      const point = mapsCoordinates(link);
                      if (point) {
                        update("lat", String(point.lat));
                        update("lng", String(point.lng));
                      }
                    }}
                    placeholder="Paste a Google Maps link"
                  />
                </Field>
                {values.mapsUrl && !mapsCoordinates(values.mapsUrl) && (
                  <p className="text-sm text-muted">
                    Short links are saved as directions. To place a pin, paste a full Maps link with
                    coordinates or tap the map.
                  </p>
                )}
                <VenueMap
                  lat={values.lat}
                  lng={values.lng}
                  onPick={(lat, lng) => {
                    update("lat", lat);
                    update("lng", lng);
                  }}
                />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Latitude (optional)">
                    <input
                      inputMode="decimal"
                      className={fieldClass}
                      value={values.lat}
                      onChange={(e) => update("lat", e.target.value)}
                    />
                  </Field>
                  <Field label="Longitude (optional)">
                    <input
                      inputMode="decimal"
                      className={fieldClass}
                      value={values.lng}
                      onChange={(e) => update("lng", e.target.value)}
                    />
                  </Field>
                </div>
                <a
                  className="inline-flex min-h-12 items-center font-semibold text-teal underline"
                  href={openMaps(values)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Maps ↗
                </a>
              </Section>
            )}
            {step === 3 && (
              <Section
                title="Give your event a poster"
                description="A clear JPG, PNG or WebP image helps your event stand out. Up to 5 MB."
              >
                {imageUrl(values.posterKey) && (
                  <Image
                    unoptimized
                    src={imageUrl(values.posterKey)!}
                    alt={`${values.title} poster`}
                    width={640}
                    height={400}
                    className="max-h-96 w-full rounded-xl object-contain"
                  />
                )}
                {uploadsConfigured ? (
                  <ImageUpload
                    kind="poster"
                    entityId={id}
                    label="Upload event poster"
                    onUpload={(result) => update("posterKey", result.key)}
                  />
                ) : (
                  <div role="status" className="rounded-xl bg-soft p-5">
                    <p className="font-semibold">Poster uploads are not available yet.</p>
                    <p className="mt-2 text-muted">
                      Your draft is safe. Save this step and add the poster when uploads are ready.
                    </p>
                  </div>
                )}
                {values.posterKey && (
                  <Button onClick={() => update("posterKey", "")}>Remove poster</Button>
                )}
                <p className="text-sm text-muted">
                  A poster is optional while you prepare your event.
                </p>
              </Section>
            )}
            {step === 4 && (
              <Section
                title="VIPs & chief guests"
                description="Introduce your special guests. This step is optional."
              >
                {values.guests.map((g, index) => (
                  <div
                    key={g.id}
                    className="space-y-4 rounded-2xl border border-gold bg-gold-soft p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold">Guest {index + 1}</h3>
                      <Button
                        onClick={() =>
                          update(
                            "guests",
                            values.guests.filter((guest) => guest.id !== g.id),
                          )
                        }
                      >
                        Remove guest
                      </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={`Guest ${index + 1} name`}>
                        <input
                          className={fieldClass}
                          value={g.name}
                          maxLength={120}
                          onChange={(e) =>
                            update(
                              "guests",
                              values.guests.map((x, i) =>
                                i === index ? { ...x, name: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label={`Guest ${index + 1} title`}>
                        <input
                          className={fieldClass}
                          value={g.title}
                          maxLength={150}
                          placeholder="Chief guest, artist or speaker"
                          onChange={(e) =>
                            update(
                              "guests",
                              values.guests.map((x, i) =>
                                i === index ? { ...x, title: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-5 accent-gold"
                        checked={g.vip}
                        onChange={(e) =>
                          update(
                            "guests",
                            values.guests.map((x, i) =>
                              i === index ? { ...x, vip: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      Highlight as VIP
                    </label>
                    {imageUrl(g.photoKey) && (
                      <Image
                        unoptimized
                        src={imageUrl(g.photoKey)!}
                        width={100}
                        height={100}
                        alt={g.name || "Guest photo"}
                        className="rounded-xl"
                      />
                    )}
                    {uploadsConfigured ? (
                      <ImageUpload
                        kind="guest_photo"
                        entityId={id}
                        label={`Upload guest ${index + 1} photo`}
                        onUpload={(result) =>
                          update(
                            "guests",
                            values.guests.map((x, i) =>
                              i === index ? { ...x, photoKey: result.key } : x,
                            ),
                          )
                        }
                      />
                    ) : (
                      <p className="text-sm text-muted">
                        Photo uploads are not available yet. You can add a photo later.
                      </p>
                    )}
                  </div>
                ))}
                {!values.guests.length && (
                  <p className="rounded-xl bg-soft p-5 text-muted">
                    No special guests added. Continue if you do not need any.
                  </p>
                )}
                <Button
                  onClick={() =>
                    update("guests", [
                      ...values.guests,
                      { id: crypto.randomUUID(), name: "", title: "", photoKey: "", vip: true },
                    ])
                  }
                  disabled={values.guests.length >= 20}
                >
                  Add special guest
                </Button>
              </Section>
            )}
            {step === 5 && (
              <Section
                title={values.free ? "RSVP groups" : "Build your ticket tiers"}
                description={
                  values.free
                    ? "Choose how many people can RSVP. There is no ticket charge."
                    : "Prices include GST. Add a tier for each type of entry and check its design preview."
                }
              >
                {values.tiers.map((tier, index) => (
                  <div
                    key={tier.id}
                    className="grid gap-5 rounded-2xl border border-line p-4 xl:grid-cols-[1.25fr_1fr]"
                  >
                    <fieldset className="min-w-0 space-y-4">
                      <legend className="mb-3 text-lg font-bold">
                        {values.free ? "RSVP group" : "Tier"} {index + 1}
                      </legend>
                      <Field label={`Tier ${index + 1} name`}>
                        <input
                          className={fieldClass}
                          value={tier.name}
                          maxLength={100}
                          onChange={(e) => changeTier(index, "name", e.target.value)}
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {!values.free && (
                          <Field label={`Tier ${index + 1} price incl. GST (₹)`}>
                            <input
                              inputMode="decimal"
                              className={fieldClass}
                              value={tier.price}
                              onChange={(e) => changeTier(index, "price", e.target.value)}
                            />
                          </Field>
                        )}
                        <Field label={`Tier ${index + 1} quantity`}>
                          <input
                            type="number"
                            min="1"
                            max="1000000"
                            className={fieldClass}
                            value={tier.quantity}
                            onChange={(e) => changeTier(index, "quantity", e.target.value)}
                          />
                        </Field>
                        <Field label={`Tier ${index + 1} per-order max (optional)`}>
                          <input
                            type="number"
                            min="1"
                            className={fieldClass}
                            value={tier.perOrderMax}
                            onChange={(e) => changeTier(index, "perOrderMax", e.target.value)}
                          />
                        </Field>
                      </div>
                      <Field label={`Tier ${index + 1} sales open (IST, optional)`}>
                        <input
                          type="datetime-local"
                          className={fieldClass}
                          value={tier.salesStart}
                          onChange={(e) => changeTier(index, "salesStart", e.target.value)}
                        />
                      </Field>
                      <Field label={`Tier ${index + 1} sales close (IST, optional)`}>
                        <input
                          type="datetime-local"
                          className={fieldClass}
                          value={tier.salesEnd}
                          onChange={(e) => changeTier(index, "salesEnd", e.target.value)}
                        />
                      </Field>
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-5 accent-gold"
                          checked={tier.vip}
                          onChange={(e) => changeTier(index, "vip", e.target.checked)}
                        />
                        VIP tier
                      </label>
                      <Button
                        onClick={() =>
                          update(
                            "tiers",
                            values.tiers.filter((t) => t.id !== tier.id),
                          )
                        }
                      >
                        Remove tier
                      </Button>
                    </fieldset>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted">
                        Live ticket design preview
                      </h3>
                      <TicketPreview values={values} tier={tier} />
                    </div>
                  </div>
                ))}
                <Button onClick={addTier} disabled={values.tiers.length >= 20}>
                  {values.free ? "Add RSVP group" : "Add ticket tier"}
                </Button>
              </Section>
            )}
            {step === 6 && (
              <Section
                title="Fees & refunds"
                description="Choose who pays the platform fee and make your refund policy clear."
              >
                <fieldset>
                  <legend className="mb-3 font-semibold">Who pays the platform fee?</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["organiser", "I pay the platform fee", "The fee comes from your payout."],
                        [
                          "buyer",
                          "The buyer pays the platform fee",
                          "The fee is added to the buyer’s total.",
                        ],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${values.feePayer === value ? "border-teal bg-teal-soft" : "border-line"}`}
                      >
                        <input
                          type="radio"
                          name="feePayer"
                          value={value}
                          checked={values.feePayer === value}
                          onChange={() => update("feePayer", value)}
                          className="mt-1 size-5 accent-teal"
                        />
                        <span>
                          <strong className="block">{label}</strong>
                          <span className="mt-1 block text-sm text-muted">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div
                  className="rounded-2xl border border-line bg-soft p-5"
                  data-testid="wizard-pricing-example"
                  data-pricing-version={pricingVersion.id}
                >
                  <h3 className="text-lg font-bold">Example for a ₹1,000 ticket incl. GST</h3>
                  {values.free && (
                    <p className="mt-2 text-sm text-muted">
                      Your event is free. This example explains fees for a paid event.
                    </p>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <dt>Ticket price</dt>
                    <dd className="text-right font-semibold">₹1,000 incl. GST</dd>
                    <dt>Platform fee + GST</dt>
                    <dd className="text-right">
                      {formatInr(preview.platformFeePaise + preview.feeGstPaise)} incl. GST
                    </dd>
                    <dt>Gateway incl. GST</dt>
                    <dd className="text-right">{formatInr(preview.gatewayFeePaise)} incl. GST</dd>
                    <dt>Buyer pays</dt>
                    <dd className="text-right font-bold">
                      {formatInr(preview.buyerTotalPaise)} incl. GST
                    </dd>
                    <dt>Your estimated payout</dt>
                    <dd className="text-right font-extrabold text-teal">
                      {formatInr(preview.organiserPayoutPaise)}
                    </dd>
                  </dl>
                  <p className="mt-4 text-xs text-muted">{organiserFeeWording(pricingVersion)}</p>
                </div>
                <Field label="Refund policy">
                  <select
                    className={fieldClass}
                    value={values.refundPolicy}
                    onChange={(e) =>
                      update("refundPolicy", e.target.value as Values["refundPolicy"])
                    }
                  >
                    <option value="72h">Full refund up to 72 hours before the event starts</option>
                    <option value="none">No refunds</option>
                    <option value="custom">Write my own refund policy</option>
                  </select>
                </Field>
                {values.refundPolicy === "custom" && (
                  <Field label="Your refund policy">
                    <textarea
                      className={`${fieldClass} py-3`}
                      rows={4}
                      value={values.refundText}
                      maxLength={2000}
                      onChange={(e) => update("refundText", e.target.value)}
                    />
                  </Field>
                )}
              </Section>
            )}
            {step === 7 && (
              <Section
                title="Review & publish"
                description="Check the details below. Your draft stays saved until you are ready."
              >
                <div
                  className={`rounded-xl border p-5 ${canPublish ? "border-teal bg-teal-soft" : "border-gold bg-gold-soft"}`}
                >
                  <h3 className="font-bold">
                    {canPublish ? "Your organiser account is approved" : "Publishing is locked"}
                  </h3>
                  <p className="mt-2">
                    {!approved
                      ? "You can keep working on your draft. Complete verification and wait for approval before publishing."
                      : paused
                        ? "Ticket sales have been paused for this organiser. Contact support before publishing."
                        : "You can publish after every step is saved."}
                  </p>
                  {!approved && (
                    <Link
                      href="/console/onboarding"
                      className="mt-3 inline-block font-semibold text-teal underline"
                    >
                      Check verification
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => router.refresh()}
                    className="ml-4 inline-flex min-h-12 items-center font-semibold text-teal underline"
                  >
                    Refresh status
                  </button>
                </div>
                <dl className="grid gap-4 rounded-xl border border-line p-5 sm:grid-cols-[160px_1fr]">
                  <dt className="font-semibold">Event</dt>
                  <dd>
                    {values.title} · {values.category}
                  </dd>
                  <dt className="font-semibold">Description</dt>
                  <dd className="whitespace-pre-wrap">{values.description}</dd>
                  <dt className="font-semibold">Starts</dt>
                  <dd>{when(values.startsAt)}</dd>
                  <dt className="font-semibold">Ends</dt>
                  <dd>{values.endsAt ? when(values.endsAt) : "Not set"}</dd>
                  <dt className="font-semibold">Gates open</dt>
                  <dd>{values.gatesAt ? when(values.gatesAt) : "Not set"}</dd>
                  <dt className="font-semibold">Venue</dt>
                  <dd>
                    {[values.venue, values.address, values.city, values.country]
                      .filter(Boolean)
                      .join(", ")}
                  </dd>
                  <dt className="font-semibold">Poster</dt>
                  <dd>{values.posterKey ? "Uploaded" : "Not added (optional)"}</dd>
                  <dt className="font-semibold">Special guests</dt>
                  <dd>{values.guests.map((g) => g.name).join(", ") || "None"}</dd>
                  <dt className="font-semibold">Entry</dt>
                  <dd>
                    {values.free ? "Free · RSVP only" : "Paid tickets"}
                    <ul className="mt-2 space-y-2">
                      {values.tiers.map((t) => (
                        <li key={t.id}>
                          {t.name} · {values.free ? "Free RSVP" : price(t.price)} · {t.quantity}{" "}
                          places {t.vip ? "· VIP" : ""}
                        </li>
                      ))}
                    </ul>
                  </dd>
                  <dt className="font-semibold">Platform fee</dt>
                  <dd>{values.feePayer === "organiser" ? "Paid by organiser" : "Paid by buyer"}</dd>
                  <dt className="font-semibold">Refund policy</dt>
                  <dd>
                    {values.refundPolicy === "72h"
                      ? "Full refund up to 72 hours before start"
                      : values.refundPolicy === "none"
                        ? "No refunds"
                        : values.refundText}
                  </dd>
                </dl>
                {draft?.slug && (
                  <div className="rounded-xl bg-soft p-4">
                    <p className="font-semibold">Event link</p>
                    <a
                      className="mt-2 block break-all text-teal underline"
                      href={`${origin}/e/${draft.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {origin}/e/{draft.slug}
                    </a>
                  </div>
                )}
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void save(7, true)}
                  disabled={
                    !canPublish ||
                    ![0, 1, 2, 3, 4, 5, 6].every((s) => complete.includes(s)) ||
                    alreadyPublished
                  }
                >
                  {alreadyPublished ? "Published" : "Publish event"}
                </Button>
                {![0, 1, 2, 3, 4, 5, 6].every((s) => complete.includes(s)) && (
                  <p className="text-sm text-muted">
                    Save each of the first seven steps to unlock publishing.
                  </p>
                )}
              </Section>
            )}
          </fieldset>
        </Card>
        <div aria-live="polite">
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-danger-soft p-4 text-danger">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="mt-4 font-semibold text-teal">
              {message}
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            disabled={step === 0 || busy || !hydrated}
            onClick={() => void save(Math.max(0, step - 1))}
          >
            Back
          </Button>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={busy || !hydrated} onClick={() => void save(step)}>
              {busy ? "Saving…" : alreadyPublished ? "Save changes" : "Save draft"}
            </Button>
            {step < 7 && (
              <Button type="submit" variant="primary" disabled={busy || !hydrated}>
                {busy ? "Saving…" : "Save and continue"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}
