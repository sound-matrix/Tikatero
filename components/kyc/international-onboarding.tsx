"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInternationalKycStep } from "@/app/console/onboarding/international-actions";
import { ImageUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { countryName, internationalCountries } from "@/lib/kyc/countries";
import {
  canEdit,
  COUNTRY_LOCKED,
  documentTypes,
  INTERNATIONAL_PENDING,
  internationalStepComplete,
  internationalStepLabels,
  internationalSteps,
  type FlowState,
} from "@/lib/kyc/model";

const review = internationalSteps.length;
const names = [
  ...internationalSteps.map((step) => internationalStepLabels[step]),
  "Review & submit",
];

function firstIncomplete(application: FlowState["application"]) {
  const index = internationalSteps.findIndex(
    (step) => !internationalStepComplete(application, step),
  );
  return index === -1 ? review : index;
}

function CountryPicker({ saved }: { saved?: string }) {
  const [filter, setFilter] = useState("");
  return (
    <>
      {!saved && (
        <Input
          label="Search countries"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      )}
      <Select
        label="Country"
        name={saved ? undefined : "country"}
        disabled={!!saved}
        defaultValue={saved ?? ""}
        required
        hint={saved ? COUNTRY_LOCKED : undefined}
        options={[
          { value: "", label: "Choose your country" },
          ...internationalCountries
            .filter(({ name, code }) =>
              `${name} ${code}`.toLowerCase().includes(filter.trim().toLowerCase()),
            )
            .map(({ code, name }) => ({ value: code, label: name })),
        ]}
      />
      {saved && <input type="hidden" name="country" value={saved} />}
    </>
  );
}

export function InternationalOnboarding({
  initial,
  onLock,
  onSaving,
}: {
  initial: FlowState;
  onLock: () => void;
  onSaving: (saving: boolean) => void;
}) {
  const router = useRouter();
  const [application, setApplication] = useState(initial.application);
  const [current, setCurrent] = useState(() => firstIncomplete(initial.application));
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const [files, setFiles] = useState({ idFront: "", idBack: "", selfie: "" });
  const progress = application?.step_progress;
  const details = progress?.intlDetails;
  const id = progress?.idDocument;
  const [type, setType] = useState(id?.type ?? "passport");
  const step = internationalSteps[current];
  const furthest = firstIncomplete(application);
  const editable = step && canEdit(application, step);
  const reupload = !!(
    step &&
    application?.flagged_steps.includes(step) &&
    !progress?.intlUpdatedSteps?.includes(step)
  );
  const editing = !application || ["draft", "needs_docs"].includes(application.status);

  function move(index: number) {
    setCurrent(index);
    setError("");
    setFiles({ idFront: "", idBack: "", selfie: "" });
    setType(id?.type ?? "passport");
  }

  function save(data: FormData) {
    data.set("organiserId", initial.organiserId);
    data.set("revision", String(application?.revision ?? 0));
    data.set("step", step ?? "submit");
    for (const [name, key] of Object.entries(files)) data.set(name, key);
    onSaving(true);
    startTransition(async () => {
      try {
        const result = await saveInternationalKycStep(data);
        if (result.application?.region === "INTL") {
          setApplication(result.application);
          onLock();
        }
        if (result.error) {
          setError(result.error);
          return;
        }
        if (step) {
          move(firstIncomplete(result.application));
          setType(result.application?.step_progress.idDocument?.type ?? "passport");
        } else router.push(`/console/pending?organiser=${initial.organiserId}`);
      } catch {
        setError("We could not save your changes. Check your connection and try again.");
      } finally {
        onSaving(false);
      }
    });
  }

  function upload(slot: keyof typeof files, label: string) {
    if (!application) return null;
    return (
      <section aria-label={label}>
        <ImageUpload
          kind={slot === "selfie" ? "intl_selfie" : "intl_id"}
          entityId={initial.organiserId}
          applicationId={application.id}
          label={label}
          onSelect={() => setFiles((old) => ({ ...old, [slot]: "" }))}
          onUpload={({ key }) => setFiles((old) => ({ ...old, [slot]: key }))}
        />
      </section>
    );
  }

  if (!editing)
    return (
      <Card>
        <h2 className="text-xl font-bold">Your details are with our team</h2>
        <p className="my-4">{INTERNATIONAL_PENDING}</p>
        <Button href={`/console/pending?organiser=${initial.organiserId}`}>View your status</Button>
      </Card>
    );
  return (
    <>
      {application?.status === "needs_docs" && (
        <Card className="mb-6 border-teal">
          <h2 className="font-bold">A few details need a check</h2>
          <p className="mt-2 text-sm">
            Only the marked steps can be changed. Your other details are saved.
          </p>
          {application.reviewer_note && <p className="mt-2 text-sm">{application.reviewer_note}</p>}
        </Card>
      )}
      <div className="mb-5">
        <div className="mb-2 flex justify-between text-sm font-semibold">
          <span>{current === review ? "Review & submit" : `Step ${current + 1} of ${review}`}</span>
          <span className="text-teal">Saved as you go</span>
        </div>
        <div
          role="progressbar"
          aria-label="Verification progress"
          aria-valuemin={0}
          aria-valuenow={Math.min(current + 1, review)}
          aria-valuemax={review}
          className="h-2.5 overflow-hidden rounded-full bg-soft"
        >
          <div
            className="h-full rounded-full bg-teal"
            style={{ width: `${(Math.min(current + 1, review) / review) * 100}%` }}
          />
        </div>
      </div>
      <nav aria-label="Verification steps" className="mb-6 flex flex-wrap gap-2">
        {names.map((name, index) => (
          <button
            key={name}
            type="button"
            disabled={
              busy ||
              (index > furthest && !(application?.status === "needs_docs" && index < review))
            }
            onClick={() => move(index)}
            aria-current={current === index ? "step" : undefined}
            className={`min-h-11 rounded-full px-3 py-2 text-sm font-semibold disabled:opacity-40 ${current === index ? "bg-ink text-white" : "bg-soft text-ink"}`}
          >
            {name}
            {application?.flagged_steps.includes(internationalSteps[index]) ? " · Check" : ""}
          </button>
        ))}
      </nav>
      <Card>
        <h2 className="mb-5 text-2xl font-bold">{names[current]}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(new FormData(event.currentTarget));
          }}
          key={`${current}-${application?.revision ?? 0}`}
          className="space-y-5"
        >
          <fieldset disabled={busy || (!!step && !editable)} className="space-y-5">
            {step === "details" && (
              <>
                <Input
                  label="Organiser name"
                  name="displayName"
                  defaultValue={details?.displayName ?? initial.displayName}
                  required
                  maxLength={100}
                  hint="This name appears on your public event pages."
                />
                <Input
                  label="Legal full name"
                  name="legalName"
                  defaultValue={details?.legalName}
                  required
                  maxLength={150}
                  hint="Use the name as it appears on your ID."
                />
                <CountryPicker saved={details?.country} />
                <Input
                  label="City"
                  name="city"
                  defaultValue={details?.city}
                  autoComplete="address-level2"
                  required
                  maxLength={80}
                />
                <Input
                  label="Phone with country code"
                  name="phone"
                  type="tel"
                  defaultValue={details?.phone}
                  autoComplete="tel"
                  required
                  hint="For example, +442079460123."
                />
              </>
            )}
            {step === "id" && (
              <>
                <Select
                  label="Document type"
                  name="documentType"
                  value={type}
                  onChange={(event) => setType(event.target.value as typeof type)}
                  options={Object.entries(documentTypes).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                <Input
                  label="Document number"
                  name="number"
                  autoComplete="off"
                  spellCheck={false}
                  required={!id || id.type !== type}
                  maxLength={80}
                  hint={
                    id?.type === type
                      ? `Saved ending ${id.last4}. Enter a number to update it.`
                      : "We keep only the last 4 characters."
                  }
                />
                <Input
                  label="Expiry date"
                  name="expiry"
                  type="date"
                  defaultValue={id?.expiry}
                  required
                />
                <p className="text-sm text-muted">
                  Make sure all four corners and your photo are clear.
                </p>
                {progress?.idFront && !reupload && (
                  <p className="text-sm text-teal">
                    Front saved{progress.idBack ? " · Back saved" : ""}
                  </p>
                )}
                {editable && upload("idFront", "Upload the front of your ID")}
                {editable && type !== "passport" && upload("idBack", "Upload the back of your ID")}
              </>
            )}
            {step === "selfie" && (
              <>
                <p className="text-sm text-muted">Hold your ID next to your face.</p>
                {progress?.selfie?.docKey && !reupload && (
                  <p className="text-sm text-teal">Selfie saved</p>
                )}
                {editable && upload("selfie", "Upload your selfie")}
              </>
            )}
            {current === review && details && id && (
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-muted">Organiser</dt>
                  <dd className="font-semibold">
                    {details.displayName} · {details.legalName}
                  </dd>
                  <dd>
                    {details.city} · {countryName(details.country)} · {details.phone}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Your ID</dt>
                  <dd>
                    {documentTypes[id.type]} ending {id.last4} · Expires {id.expiry}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Selfie with your ID</dt>
                  <dd>Uploaded</dd>
                </div>
              </dl>
            )}
            {editable || current === review ? (
              <Button variant="primary" type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : current === review
                    ? "Submit for verification"
                    : "Save and continue"}
              </Button>
            ) : (
              <p className="text-sm text-muted">This step is saved.</p>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </form>
      </Card>
    </>
  );
}
