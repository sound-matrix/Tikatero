"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveKycStep } from "@/app/console/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ImageUpload } from "@/components/image-upload";
import {
  canEdit,
  editableSteps,
  nextStep,
  stepNames,
  type CheckStep,
  type FlowState,
  type Step,
} from "@/lib/kyc/model";

export function Onboarding({ initial }: { initial: FlowState }) {
  const [state, setState] = useState(initial);
  const [country, setCountry] = useState(initial.application ? "IN" : "");
  const [current, setCurrent] = useState(() => nextStep(initial.application));
  const [method, setMethod] = useState("digilocker");
  const [uploadKey, setUploadKey] = useState("");
  const [busy, startTransition] = useTransition();
  const router = useRouter();
  const application = state.application;
  const progress = application?.step_progress ?? {};
  const details = progress.details;
  const step = editableSteps[current] as Step | undefined;
  const check = step && step !== "details" ? progress[step] : undefined;
  const editable = step ? canEdit(application, step) : false;
  const completed = current === 0 ? !!details : !!check?.completed;
  const furthest = nextStep(application ? { ...application, status: "draft" } : null);
  const reviewing = !!application && !["draft", "needs_docs"].includes(application.status);
  function move(index: number) {
    setCurrent(index);
    setUploadKey("");
    setMethod("digilocker");
    setState((old) => ({ ...old, error: undefined, success: undefined }));
  }
  async function save(data: FormData) {
    data.set("organiserId", initial.organiserId);
    data.set("step", step ?? "submit");
    startTransition(async () => {
      const result = await saveKycStep(state, data);
      setState(result);
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      if (result.success) {
        // Raw IDs exist only in this form until verification; remove them immediately.
        document.querySelector<HTMLFormElement>("#kyc-step-form")?.reset();
        if (current === 6) router.push("/console/pending");
        if (current === 0) move(1);
      }
    });
  }
  if (reviewing)
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-3xl font-extrabold">Your details are with our team</h1>
        <p className="my-5">We’re checking your details — usually within 1 working day.</p>
        <Button href="/console/pending">View your status</Button>
      </main>
    );
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-12">
      <p className="mb-2 text-sm font-bold tracking-wide text-teal">ORGANISER VERIFICATION</p>
      <h1 className="text-3xl font-extrabold text-ink md:text-4xl">Let’s get you verified</h1>
      <p className="mt-4 rounded-xl bg-teal/5 p-4 text-sm leading-relaxed text-ink">
        Takes about 5 minutes. Your documents are encrypted and seen only by Tikatero&apos;s
        verification team.
      </p>
      {initial.mode === "mock" && (
        <p className="mt-3 rounded-xl bg-soft p-4 text-sm text-ink">
          <strong>Mock mode.</strong> These are sample checks. Use made-up details. We won’t check
          government records or send money. Our team still needs to approve your account.
        </p>
      )}
      <div className="my-6">
        <Select
          label="Where is your organiser based?"
          value={country}
          disabled={busy}
          onChange={(event) => setCountry(event.target.value)}
          options={[
            { value: "", label: "Choose your country" },
            { value: "IN", label: "India" },
            { value: "INTL", label: "Outside India" },
          ]}
        />
      </div>
      {country === "INTL" && (
        <Card>
          <h2 className="text-xl font-bold">Coming soon — please contact support</h2>
          <Button className="mt-4" href="/help">
            Contact support
          </Button>
        </Card>
      )}
      {country === "IN" && (
        <>
          {application?.status === "needs_docs" && (
            <Card className="mb-6 border-teal">
              <h2 className="font-bold">A few details need a check</h2>
              <p className="mt-2 text-sm">
                Only the marked steps can be changed. Your other details are saved.
              </p>
              {application.reviewer_note && (
                <p className="mt-2 text-sm">{application.reviewer_note}</p>
              )}
            </Card>
          )}
          <div className="mb-5">
            <div className="mb-2 flex justify-between text-sm font-semibold">
              <span>Step {current + 1} of 7</span>
              <span className="text-teal">Saved as you go</span>
            </div>
            <div
              role="progressbar"
              aria-label="Verification progress"
              aria-valuenow={current + 1}
              aria-valuemin={0}
              aria-valuemax={7}
              className="h-2.5 overflow-hidden rounded-full bg-soft"
            >
              <div
                className="h-full rounded-full bg-teal"
                style={{ width: `${((current + 1) / 7) * 100}%` }}
              />
            </div>
          </div>
          <nav aria-label="Verification steps" className="mb-6 flex flex-wrap gap-2">
            {stepNames.map((name, index) => (
              <button
                key={name}
                type="button"
                disabled={busy || (index > furthest && index > current)}
                onClick={() => move(index)}
                aria-current={current === index ? "step" : undefined}
                className={`min-h-11 rounded-full px-3 py-2 text-sm font-semibold disabled:opacity-40 ${current === index ? "bg-ink text-white" : "bg-soft text-ink"}`}
              >
                {index + 1}
                {application?.flagged_steps.includes(editableSteps[index]) ? " · Check" : ""}
                <span className="sr-only"> {name}</span>
              </button>
            ))}
          </nav>
          <Card>
            <h2 className="mb-2 text-2xl font-bold">{stepNames[current]}</h2>
            <p className="mb-6 text-sm text-muted">
              {current === 0
                ? "Tell us who will organise your events."
                : current === 6
                  ? "Check your saved details before sending them to our team."
                  : "We save only masked numbers and the result of each check."}
            </p>
            <form
              id="kyc-step-form"
              action={save}
              key={`${current}-${application?.revision ?? 0}`}
              className="space-y-5"
            >
              <fieldset disabled={busy || (current !== 6 && !editable)} className="space-y-5">
                {current === 0 && (
                  <>
                    <Input
                      label="Organiser display name"
                      name="displayName"
                      required
                      maxLength={100}
                      defaultValue={details?.displayName ?? initial.displayName}
                    />
                    <Input
                      label="Legal name"
                      name="legalName"
                      required
                      maxLength={150}
                      defaultValue={details?.legalName}
                      hint="Use the name on your PAN and bank account."
                    />
                    <Select
                      label="Organiser type"
                      name="type"
                      defaultValue={details?.type ?? "individual"}
                      options={[
                        { value: "individual", label: "Individual" },
                        { value: "business", label: "Business" },
                      ]}
                    />
                    <Input
                      label="Contact phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      defaultValue={details?.phone}
                    />
                    <Input
                      label="City"
                      name="city"
                      autoComplete="address-level2"
                      required
                      maxLength={80}
                      defaultValue={details?.city}
                    />
                  </>
                )}
                {current === 1 && (
                  <Input
                    label="PAN"
                    name="number"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    maxLength={10}
                    hint={
                      check?.last4
                        ? `Saved PAN ending ${check.last4}. Enter it again only to change it.`
                        : "Your 10-character PAN. We keep only the last 4 characters."
                    }
                  />
                )}
                {current === 2 && (
                  <>
                    <Select
                      label="How would you like to share Aadhaar?"
                      name="method"
                      value={method}
                      onChange={(event) => {
                        setMethod(event.target.value);
                        setUploadKey("");
                      }}
                      options={[
                        {
                          value: "digilocker",
                          label:
                            initial.mode === "mock"
                              ? "Try mock DigiLocker"
                              : "Continue with DigiLocker",
                        },
                        { value: "check", label: "I finished DigiLocker — check result" },
                        { value: "xml", label: "Use offline XML" },
                        { value: "upload", label: "Upload a masked QR document" },
                      ]}
                    />
                    {(method === "digilocker" || method === "check") && (
                      <p className="text-sm text-muted">
                        {initial.mode === "mock"
                          ? "This sample DigiLocker check uses a made-up Aadhaar ending 1234. No Aadhaar number is needed."
                          : "You’ll enter Aadhaar and give consent on the secure provider page. Return here and check the result when you finish."}
                      </p>
                    )}
                    {method === "xml" && (
                      <Input
                        label="Offline Aadhaar XML"
                        name="xml"
                        type="file"
                        accept=".xml,text/xml,application/xml"
                        required
                        hint="Up to 1 MB. We read the last 4 digits only, then discard the file. This needs manual review."
                      />
                    )}
                    {method === "upload" && (
                      <>
                        <Input
                          label="Last 4 digits of Aadhaar"
                          name="last4"
                          inputMode="numeric"
                          pattern="[0-9]{4}"
                          required
                          maxLength={4}
                        />
                        <p className="text-sm text-muted">
                          Use a masked document. This will be checked by our team.
                        </p>
                        <ImageUpload
                          kind="kyc_doc"
                          entityId={initial.organiserId}
                          label="Upload a masked Aadhaar QR document"
                          onUpload={({ key }) => setUploadKey(key)}
                        />
                        <input type="hidden" name="docKey" value={uploadKey} />
                      </>
                    )}
                  </>
                )}
                {current === 3 && (
                  <Input
                    label="GSTIN (optional)"
                    name="number"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={15}
                    hint={
                      check?.last4
                        ? `Saved GSTIN ending ${check.last4}. Leave empty if you don’t have one.`
                        : "No GSTIN? Leave this empty and continue."
                    }
                  />
                )}
                {current === 4 && (
                  <>
                    <Input
                      label="Bank account number"
                      name="number"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      minLength={6}
                      maxLength={20}
                      hint={
                        check?.last4
                          ? `Saved account ending ${check.last4}.`
                          : "We keep only the last 4 digits."
                      }
                    />
                    <Input
                      label="IFSC"
                      name="ifsc"
                      autoComplete="off"
                      required
                      maxLength={11}
                      defaultValue={check?.ifsc}
                    />
                    <p className="text-sm text-muted">
                      {initial.mode === "mock"
                        ? "The mock penny-drop checks a sample result. No money is moved."
                        : "A small verification deposit checks the account and returns the holder’s name."}
                    </p>
                  </>
                )}
                {current === 5 && (
                  <>
                    <Select
                      label="Selfie check"
                      name="method"
                      value={method}
                      onChange={(event) => setMethod(event.target.value)}
                      options={
                        initial.mode === "mock"
                          ? [
                              { value: "digilocker", label: "Try mock liveness and face match" },
                              { value: "upload", label: "Upload a selfie for manual review" },
                            ]
                          : [{ value: "upload", label: "Upload a selfie for manual review" }]
                      }
                    />
                    {(method === "upload" || initial.mode === "cashfree") && (
                      <>
                        <input type="hidden" name="method" value="upload" />
                        <ImageUpload
                          kind="kyc_doc"
                          entityId={initial.organiserId}
                          label="Upload your selfie"
                          onUpload={({ key }) => setUploadKey(key)}
                        />
                        <input type="hidden" name="docKey" value={uploadKey} />
                        <p className="text-sm text-muted">
                          A photo cannot prove liveness. Our team will review it before approval.
                        </p>
                      </>
                    )}
                  </>
                )}
                {current === 6 && (
                  <dl className="space-y-4">
                    {details && (
                      <div>
                        <dt className="text-sm text-muted">Organiser</dt>
                        <dd className="font-semibold">
                          {details.displayName} · {details.legalName}
                        </dd>
                        <dd className="text-sm">
                          {details.type} · {details.city} · {details.phone}
                        </dd>
                      </div>
                    )}
                    {(["pan", "aadhaar", "gstin", "bank", "selfie"] as CheckStep[]).map((key) => {
                      const result = progress[key];
                      return (
                        <div
                          key={key}
                          className="flex flex-wrap justify-between gap-2 border-t border-line pt-3"
                        >
                          <dt className="font-semibold">{stepNames[editableSteps.indexOf(key)]}</dt>
                          <dd className="text-sm text-ink">
                            {result?.skipped
                              ? "Not provided (optional)"
                              : result?.completed
                                ? `${result.last4 ? `Ending ${result.last4} · ` : ""}${result.mode === "mock" ? "Mock check" : result.passed ? "Check complete" : "Team review needed"}${result.score !== undefined ? ` · ${result.score}% match` : ""}`
                                : "Not finished"}
                          </dd>
                        </div>
                      );
                    })}
                    <p className="rounded-xl bg-teal/5 p-4 text-sm">
                      Our verification team reviews every application. Publishing stays locked until
                      they approve your account.
                    </p>
                  </dl>
                )}
                {current < 6 && editable && (
                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : current === 0
                        ? "Save and continue"
                        : current === 3
                          ? "Save GSTIN or skip"
                          : current === 2
                            ? method === "digilocker"
                              ? initial.mode === "mock"
                                ? "Run mock DigiLocker check"
                                : "Open DigiLocker"
                              : "Save Aadhaar check"
                            : current === 5
                              ? "Save selfie check"
                              : "Verify"}
                  </Button>
                )}
                {current === 6 && (
                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy ? "Submitting…" : "Submit for verification"}
                  </Button>
                )}
              </fieldset>
              {check?.completed && (
                <div className="rounded-xl bg-teal/5 p-4 text-sm" role="status">
                  <p className="font-bold text-teal">
                    {check.mode === "mock"
                      ? "Mock check complete"
                      : check.passed
                        ? "Check complete"
                        : "Saved for team review"}
                  </p>
                  {check.name && (
                    <p className="mt-2">
                      {current === 1 ? "Name on Income Tax records" : "Account holder name"}:{" "}
                      <strong>{check.name}</strong>
                    </p>
                  )}
                  {check.score !== undefined && (
                    <p className="mt-1">
                      {current === 5 ? "Liveness" : "Name match"}: {check.score}%
                      {check.faceScore !== undefined ? ` · Face match: ${check.faceScore}%` : ""}
                    </p>
                  )}
                  {check.last4 && <p className="mt-1">Saved ending {check.last4}</p>}
                </div>
              )}
              <p
                role="status"
                aria-live="polite"
                className={`text-sm ${state.error ? "text-danger" : "text-teal"}`}
              >
                {state.error ||
                  state.success ||
                  (!editable && current !== 6 ? "This step is saved. No change is needed." : "")}
              </p>
              <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-5">
                <Button
                  onClick={() => move(Math.max(0, current - 1))}
                  disabled={busy || current === 0}
                >
                  Back
                </Button>
                {current < 6 && (
                  <Button onClick={() => move(current + 1)} disabled={busy || !completed}>
                    Continue
                  </Button>
                )}
              </div>
            </form>
          </Card>
          <p className="mt-5 text-sm text-muted">
            You can leave at any time after saving a step and come back here.
          </p>
        </>
      )}
    </main>
  );
}
