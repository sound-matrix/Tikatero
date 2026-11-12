"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/account";
import { requireKycMembership } from "@/lib/kyc/access";
import {
  assertVerificationRegion,
  canEdit,
  COUNTRY_LOCKED,
  internationalStepComplete,
  internationalSteps,
  KycError,
  type Application,
  type InternationalStep,
} from "@/lib/kyc/model";
import {
  futureDocumentDate,
  internationalDetailsInput,
  internationalDocumentInput,
  internationalIdFiles,
  internationalUploadKey,
} from "@/lib/kyc/international-validation";
import { notifyKycSubmitted } from "@/lib/kyc/notify";
import { applicationDto, loadApplication, progressJson } from "@/lib/kyc/store";
import { field } from "@/lib/kyc/validation";
import { PRIVATE_BUCKET } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";

export async function saveInternationalKycStep(data: FormData): Promise<{
  application: Application | null;
  error?: string;
}> {
  const { client, account } = await requireAccount();
  let application: Application | null = null;
  try {
    const organiserId = field(data, "organiserId");
    requireKycMembership(account, organiserId);
    application = await loadApplication(client, organiserId);
    assertVerificationRegion(application, "INTL");
    const org = account.organisers.find((item) => item.id === organiserId)!;
    if (["approved", "rejected"].includes(org.kyc_status))
      throw new KycError(
        "This application is locked. Please contact support if you need a change.",
      );
    if (application && !["draft", "needs_docs"].includes(application.status))
      throw new KycError("Your application is already with the verification team.");
    const revision = field(data, "revision");
    if (revision !== String(application?.revision ?? 0))
      throw new KycError("Your application changed. Review your saved progress and try again.");

    const progress = { ...application?.step_progress };
    const operation = field(data, "step");
    const submit = operation === "submit";
    const service = createServiceClient();
    if (submit) {
      if (!internationalSteps.every((step) => internationalStepComplete(application, step)))
        throw new KycError("Please finish each step before submitting.");
      if (!futureDocumentDate(progress.idDocument?.expiry ?? ""))
        throw new KycError("Your ID has expired. Use a current ID or contact support for help.");
      progress.intlUpdatedSteps = [];
    } else {
      const step = internationalSteps.find((item) => item === operation);
      if (!step || !canEdit(application, step))
        throw new KycError("Only the steps marked for a change can be edited.");
      if (step === "details") {
        progress.intlDetails = internationalDetailsInput(data, progress.intlDetails?.country);
      } else {
        if (!application || !progress.intlDetails)
          throw new KycError("Please save your organiser details first.");
        const verifyUpload = async (key: string) => {
          const { data, error } = await service.storage.from(PRIVATE_BUCKET).exists(key);
          if (error || !data) throw new KycError("Upload the requested file first.");
        };
        const replacing =
          application.status === "needs_docs" && !progress.intlUpdatedSteps?.includes(step);
        if (step === "id") {
          const document = internationalDocumentInput(data, progress.idDocument);
          const front = field(data, "idFront") || (replacing ? "" : (progress.idFront ?? ""));
          const back = field(data, "idBack") || (replacing ? "" : (progress.idBack ?? ""));
          if (
            replacing &&
            (front === progress.idFront ||
              (document.type !== "passport" && back === progress.idBack))
          )
            throw new KycError("Upload new images of the requested ID.");
          const files = internationalIdFiles(
            document.type,
            front,
            back,
            organiserId,
            application.id,
          );
          await Promise.all([
            verifyUpload(files.idFront),
            ...(files.idBack ? [verifyUpload(files.idBack)] : []),
          ]);
          Object.assign(progress, files, { idDocument: document });
        } else {
          if (!progress.idDocument) throw new KycError("Please save your ID first.");
          const key = internationalUploadKey(
            field(data, "selfie") || (replacing ? "" : (progress.selfie?.docKey ?? "")),
            organiserId,
            application.id,
            true,
          );
          if (replacing && key === progress.selfie?.docKey)
            throw new KycError("Upload a new selfie with your ID.");
          await verifyUpload(key);
          progress.selfie = {
            completed: true,
            passed: false,
            mode: "manual",
            ref: "",
            docKey: key,
          };
        }
      }
      if (application?.status === "needs_docs")
        progress.intlUpdatedSteps = [
          ...new Set<InternationalStep>([...(progress.intlUpdatedSteps ?? []), step]),
        ];
    }
    const { data: rows, error } = await service.rpc("save_kyc_progress", {
      p_user_id: account.profile.id,
      p_organiser_id: organiserId,
      p_revision: Number(revision),
      p_progress: progressJson(progress),
      p_flagged: submit ? [] : (application?.flagged_steps ?? []),
      p_status: submit
        ? "submitted"
        : application?.status === "needs_docs"
          ? "needs_docs"
          : "draft",
      p_submit: submit,
    });
    if (error?.message === COUNTRY_LOCKED) throw new KycError(COUNTRY_LOCKED);
    if (error || !rows?.[0])
      throw new KycError("Your changes could not be saved. Reload this page and try again.");
    application = applicationDto(rows[0]);
    if (submit) await notifyKycSubmitted(application).catch(() => undefined);
    revalidatePath("/console/onboarding");
    revalidatePath("/console/pending");
    return { application };
  } catch (error) {
    return {
      application,
      error:
        error instanceof KycError
          ? error.message
          : "Your details could not be saved. Please try again.",
    };
  }
}
