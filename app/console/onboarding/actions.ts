"use server";
import { KycError } from "@/lib/kyc/model";
import { requireAccount } from "@/lib/auth/account";
import { createServiceClient } from "@/lib/supabase/service";
import { requireKycMembership } from "@/lib/kyc/access";
import { kycProvider, mockNeedsManualReview } from "@/lib/kyc";
import {
  autoResult,
  canEdit,
  editableSteps,
  matchThreshold,
  type Application,
  type Check,
  type FlowState,
  type Step,
} from "@/lib/kyc/model";
import { applicationDto, loadApplication, progressJson } from "@/lib/kyc/store";
import { detailsInput, docKey, field, offlineLast4 } from "@/lib/kyc/validation";
import { notifyKycSubmitted } from "@/lib/kyc/notify";
import { revalidatePath } from "next/cache";

export async function saveKycStep(_previous: FlowState, data: FormData): Promise<FlowState> {
  // previous state is client input: identity, revision and progress are reloaded below.
  const { client, account } = await requireAccount();
  let application: Application | null = null;
  const provider = kycProvider();
  const organiserId =
    typeof data.get("organiserId") === "string" ? String(data.get("organiserId")) : "";
  try {
    requireKycMembership(account, organiserId);
    application = await loadApplication(client, organiserId);
    const base = { organiserId, displayName: "", application, mode: provider.mode };
    const org = account.organisers.find((org) => org.id === organiserId)!;
    if (["approved", "rejected"].includes(org.kyc_status))
      throw new KycError(
        "This application is locked. Please contact support if you need a change.",
      );
    const operation = field(data, "step");
    const submit = operation === "submit";
    if (application && !["draft", "needs_docs"].includes(application.status))
      throw new KycError("Your application is already with the verification team.");
    const progress = structuredClone(application?.step_progress ?? {});
    const threshold = matchThreshold(process.env.KYC_NAME_MATCH_THRESHOLD);
    let flagged = application?.flagged_steps ?? [];
    let status = application?.status ?? "draft";
    let redirectUrl: string | undefined;
    if (submit) {
      if (
        !progress.details ||
        editableSteps
          .slice(1)
          .some((step) => !progress[step as Exclude<Step, "details">]?.completed)
      )
        throw new KycError("Please finish each step before submitting.");
      const result = autoResult(progress, threshold);
      flagged = result.flagged;
      // Simulation results can never become live verification evidence.
      if (provider.mode === "cashfree" || (provider.mode === "mock" && mockNeedsManualReview()))
        for (const step of editableSteps.slice(1) as Exclude<Step, "details">[])
          if (
            progress[step]?.mode === "mock" &&
            !progress[step]?.skipped &&
            !flagged.includes(step)
          )
            flagged.push(step);
      status = flagged.length ? "needs_docs" : "auto_passed";
    } else {
      if (!editableSteps.includes(operation as Step))
        throw new KycError("Choose a verification step.");
      const step = operation as Step;
      if (!canEdit(application, step))
        throw new KycError("Only the steps marked for a change can be edited.");
      if (step === "details") {
        const details = detailsInput(data);
        const changed =
          progress.details &&
          (progress.details.legalName !== details.legalName ||
            progress.details.type !== details.type);
        progress.details = details;
        if (changed) {
          for (const check of ["pan", "aadhaar", "gstin", "bank", "selfie"] as const)
            delete progress[check];
          if (application?.status === "needs_docs") flagged = [...editableSteps];
        }
      } else {
        if (!progress.details) throw new KycError("Please save your organiser details first.");
        const index = editableSteps.indexOf(step);
        if (
          editableSteps
            .slice(1, index)
            .some((prior) => !progress[prior as Exclude<Step, "details">]?.completed)
        )
          throw new KycError("Please finish the earlier steps first.");
        const name = progress.details.legalName;
        let check: Check;
        if (step === "pan") {
          const number = field(data, "number").toUpperCase();
          if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(number))
            throw new KycError("Enter a valid 10-character PAN.");
          check = await provider.pan(number, name);
          check.passed = check.passed && (check.score ?? 0) >= threshold;
        } else if (step === "gstin") {
          const number = field(data, "number").toUpperCase();
          if (!number)
            check = {
              completed: true,
              passed: true,
              mode: provider.mode,
              ref: "not-provided",
              skipped: true,
            };
          else {
            if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(number))
              throw new KycError("Enter a valid 15-character GSTIN, or leave it empty.");
            check = await provider.gstin(number, name);
          }
        } else if (step === "bank") {
          const number = field(data, "number").replace(/\s/g, ""),
            ifsc = field(data, "ifsc").toUpperCase();
          if (!/^\d{6,20}$/.test(number) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))
            throw new KycError("Check your account number and 11-character IFSC.");
          check = await provider.bank(number, ifsc, name);
          check.passed = check.passed && (check.score ?? 0) >= threshold;
        } else if (step === "aadhaar") {
          const method = field(data, "method");
          if (method === "xml") {
            check = {
              completed: true,
              passed: false,
              mode: "manual",
              ref: `offline-${crypto.randomUUID()}`,
              last4: await offlineLast4(data.get("xml")),
            };
          } else if (method === "upload") {
            const last4 = field(data, "last4");
            if (!/^\d{4}$/.test(last4))
              throw new KycError("Enter only the last 4 digits of Aadhaar.");
            check = {
              completed: true,
              passed: false,
              mode: "manual",
              ref: `manual-${crypto.randomUUID()}`,
              last4,
              docKey: docKey(field(data, "docKey"), organiserId),
            };
          } else if (method === "digilocker") {
            const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
            if (
              provider.mode === "cashfree" &&
              (site.protocol !== "https:" || site.username || site.password)
            )
              throw new KycError("A secure site address is needed. Please contact support.");
            const result = await provider.startAadhaar(
              new URL(`/console/onboarding?organiser=${organiserId}`, site).toString(),
            );
            redirectUrl = result.url;
            check = result.url
              ? { completed: false, passed: false, mode: provider.mode, ref: result.ref }
              : await provider.aadhaar(result.ref);
          } else if (method === "check") {
            const ref = progress.aadhaar?.ref;
            if (!ref || progress.aadhaar?.mode !== provider.mode)
              throw new KycError("Please start DigiLocker again.");
            check = await provider.aadhaar(ref);
          } else throw new KycError("Choose DigiLocker or an offline document.");
        } else {
          const method = field(data, "method");
          check =
            method === "upload"
              ? {
                  completed: true,
                  passed: false,
                  mode: "manual",
                  ref: `manual-${crypto.randomUUID()}`,
                  docKey: docKey(field(data, "docKey"), organiserId, true),
                }
              : await provider.selfie();
        }
        progress[step] = check;
      }
    }
    const args = {
      p_user_id: account.profile.id,
      p_organiser_id: organiserId,
      p_revision: application?.revision ?? 0,
      p_progress: progressJson(progress),
      p_flagged: flagged,
      p_status: status as "draft" | "needs_docs" | "auto_passed",
      p_submit: submit,
    };
    const { data: saved, error } = await createServiceClient().rpc("save_kyc_progress", args);
    if (error || !saved?.[0])
      throw new KycError("Your changes could not be saved. Reload this page and try again.");
    application = applicationDto(saved[0]);
    if (submit) await notifyKycSubmitted(application).catch(() => undefined);
    revalidatePath("/console/onboarding");
    revalidatePath("/console/pending");
    return {
      ...base,
      application,
      redirectUrl,
      success: submit ? "Your details have been submitted." : "Your progress has been saved.",
    };
  } catch (error) {
    // Only our plain errors are returned. SDK exceptions are never printed or reflected.
    const message =
      error instanceof KycError
        ? error.message
        : "Your details could not be saved. Please try again.";
    return {
      organiserId,
      displayName: "",
      mode: provider.mode,
      application,
      error: message,
      ...(!account.organisers.some((org) => org.id === organiserId) ? { application: null } : {}),
    };
  }
}
