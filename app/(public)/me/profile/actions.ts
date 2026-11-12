"use server";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCountries, type CountryCode } from "libphonenumber-js/min";
import { requireAccount } from "@/lib/auth/account";
import { createServiceClient } from "@/lib/supabase/service";
import { allowRequest } from "@/lib/security/rate-limit";
import { tokenHash } from "@/lib/checkout/security";
import { send } from "@/lib/email/send";
import { sweepAvatarCleanup } from "@/lib/account/avatar-store";
import { phoneOtpConfig, profilePhoneOtp } from "@/lib/account/phone-otp";
import {
  cleanSocialLink,
  paymentMethods,
  phoneE164,
  platforms,
  validUpi,
} from "@/lib/account/profile";
import type { CheckoutMethod, SocialPlatform } from "@/lib/db/account-schema";
import type { FormState } from "../actions";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const failed = { error: "Your changes could not be saved. Please try again." };
const saved = { success: "Saved" };
const uuid = z.uuid();
const emailSchema = z.email().max(254);
const countries = new Set(getCountries());
const phoneFrom = (form: FormData, fieldName: string) => {
  const region = field(form, "region") || "IN";
  return countries.has(region as CountryCode)
    ? phoneE164(field(form, fieldName), region as CountryCode)
    : null;
};
function refreshProfile() {
  revalidatePath("/me/profile");
  revalidatePath("/me/settings");
  return saved;
}

export async function saveAbout(_state: FormState, form: FormData): Promise<FormState> {
  const { client, account } = await requireAccount();
  const full_name = field(form, "full_name");
  const display_name = field(form, "display_name") || null;
  const city = field(form, "city") || null;
  const date_of_birth = field(form, "date_of_birth") || null;
  const gender = field(form, "gender") || null;
  if (full_name.length < 2 || full_name.length > 120)
    return { error: "Enter your full name (2 to 120 characters)." };
  if ((display_name?.length ?? 0) > 100 || (city?.length ?? 0) > 100)
    return { error: "Use up to 100 characters for your display name and city." };
  if (
    date_of_birth &&
    (!z.iso.date().safeParse(date_of_birth).success ||
      date_of_birth > new Date().toISOString().slice(0, 10))
  )
    return { error: "Enter a valid date of birth." };
  if (gender && !["woman", "man", "other", "prefer_not"].includes(gender))
    return { error: "Choose a gender from the list." };
  const { error } = await client
    .from("profiles")
    .update({ full_name, display_name, city, date_of_birth, gender })
    .eq("id", account.profile.id);
  if (error) return failed;
  revalidatePath("/", "layout");
  return refreshProfile();
}

export async function changePhone(_state: FormState, form: FormData): Promise<FormState> {
  const { client } = await requireAccount();
  const operation = field(form, "operation");
  const value = operation === "add" ? phoneFrom(form, "phone") : field(form, "id");
  if (!["add", "primary", "remove"].includes(operation)) return failed;
  if (!value || (operation !== "add" && !uuid.safeParse(value).success))
    return { error: "Enter a valid phone number with its country code." };
  const { error } = await client.rpc("change_profile_phone", {
    p_action: operation,
    p_value: value,
  });
  return error ? (error.code === "P0001" ? { error: error.message } : failed) : refreshProfile();
}

export async function verifyPhone(_state: FormState, form: FormData): Promise<FormState> {
  const { client, account } = await requireAccount();
  const id = field(form, "id");
  if (!phoneOtpConfig() || !uuid.safeParse(id).success) return failed;
  const { data } = await client
    .from("user_phones")
    .select("phone_e164,verified_at")
    .eq("id", id)
    .eq("user_id", account.profile.id)
    .maybeSingle();
  if (!data || data.verified_at) return failed;
  const code = field(form, "code");
  if (code && !/^\d{4,10}$/.test(code)) return { error: "Enter the code from your text message." };
  const scope = code ? "profile-phone-check" : "profile-phone-send";
  const limits = await Promise.all([
    allowRequest(scope + "-user", account.profile.id, code ? 12 : 5, 600),
    allowRequest(scope + "-number", data.phone_e164, code ? 12 : 5, 600),
  ]);
  if (!limits.every(Boolean)) return { error: "Too many attempts. Wait 10 minutes and try again." };
  const approved = await profilePhoneOtp(data.phone_e164, code || undefined).catch(() => false);
  if (!approved)
    return {
      error: code
        ? "That code could not be verified. Try again."
        : "We could not send a code. Please try again.",
    };
  if (!code) return { success: "Code sent" };
  const result = await createServiceClient().rpc("mark_profile_phone_verified", {
    p_user_id: account.profile.id,
    p_id: id,
    p_phone: data.phone_e164,
  });
  return result.data ? refreshProfile() : failed;
}

export async function saveEmail(_state: FormState, form: FormData): Promise<FormState> {
  const { client, account } = await requireAccount();
  if (field(form, "operation") === "remove") {
    const id = field(form, "id");
    if (!uuid.safeParse(id).success) return failed;
    const { error } = await client.rpc("remove_backup_email", { p_id: id });
    return error ? failed : refreshProfile();
  }
  const email = field(form, "email").toLowerCase();
  if (!emailSchema.safeParse(email).success)
    return { error: "Enter a valid backup email address." };
  const limits = await Promise.all([
    allowRequest("backup-email-user", account.profile.id, 5, 600),
    allowRequest("backup-email-address", email, 5, 600),
  ]);
  if (!limits.every(Boolean)) return { error: "Too many attempts. Wait 10 minutes and try again." };
  const service = createServiceClient();
  const token = randomBytes(32).toString("base64url");
  const hash = tokenHash(token);
  const claim = await service.rpc("claim_backup_email", {
    p_user_id: account.profile.id,
    p_email: email,
    p_hash: hash,
  });
  if (!claim.data)
    return {
      error:
        "This address is already saved, or a link was sent recently. You can save up to five backup addresses.",
    };
  const result = await send({
    template: "backup_email_verification",
    to: email,
    entityRef: `backup:${hash}`,
    data: { actionPath: `/api/account/verify-email?token=${token}` },
  }).catch(() => null);
  if (result && ["sent", "sent_unlogged", "duplicate", "unknown"].includes(result.status)) {
    refreshProfile();
    return { success: "Check your inbox for a verification link." };
  }
  await service.rpc("release_backup_email", { p_user_id: account.profile.id, p_hash: hash });
  refreshProfile();
  return { error: "We could not send the verification email. Try again later." };
}

export async function saveSocial(_state: FormState, form: FormData): Promise<FormState> {
  const { client, account } = await requireAccount();
  const platform = field(form, "platform") as SocialPlatform;
  if (!Object.hasOwn(platforms, platform)) return { error: "Choose a social platform." };
  const table = client.from("user_social_links");
  if (field(form, "operation") === "remove") {
    const { error } = await table
      .delete()
      .eq("user_id", account.profile.id)
      .eq("platform", platform);
    return error ? failed : refreshProfile();
  }
  const link = cleanSocialLink(platform, field(form, "link"));
  if (!link) return { error: "Enter a handle or a valid link for that platform." };
  const { error } = await table.upsert(
    {
      user_id: account.profile.id,
      platform,
      ...link,
      is_public: form.get("is_public") === "on",
    },
    { onConflict: "user_id,platform" },
  );
  return error ? failed : refreshProfile();
}

export async function saveCheckoutPreferences(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { client, account } = await requireAccount();
  const ticket_name = field(form, "ticket_name") || null;
  const ticket_email = field(form, "ticket_email").toLowerCase() || null;
  const rawPhone = field(form, "ticket_phone");
  const ticket_phone_e164 = rawPhone ? phoneE164(rawPhone) : null;
  const preferred_method = field(form, "preferred_method") as CheckoutMethod;
  const upi_id = field(form, "upi_id") || null;
  if (ticket_name && (ticket_name.length < 2 || ticket_name.length > 120))
    return { error: "Enter a ticket name (2 to 120 characters)." };
  if (ticket_email && !emailSchema.safeParse(ticket_email).success)
    return { error: "Enter a valid ticket email." };
  if (rawPhone && !ticket_phone_e164) return { error: "Enter a valid ticket phone number." };
  if (!Object.hasOwn(paymentMethods, preferred_method))
    return { error: "Choose how you like to pay." };
  if (upi_id && !validUpi(upi_id)) return { error: "Enter a UPI ID in the form name@bank." };
  const { error } = await client.from("user_checkout_preferences").upsert({
    user_id: account.profile.id,
    ticket_name,
    ticket_email,
    ticket_phone_e164,
    preferred_method,
    upi_id,
  });
  return error ? failed : refreshProfile();
}

export async function savePrivacy(_state: FormState, form: FormData): Promise<FormState> {
  const { client } = await requireAccount();
  const { error } = await client.rpc("save_profile_consents", {
    p_email: form.get("email_marketing") === "on",
    p_phone: form.get("whatsapp_sms_marketing") === "on",
  });
  return error ? failed : refreshProfile();
}

export async function removeAvatar(_state: FormState, _form: FormData): Promise<FormState> {
  void _form;
  const { client, account } = await requireAccount();
  const { error } = await client
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", account.profile.id);
  if (error) return failed;
  after(() => sweepAvatarCleanup(account.profile.id).catch(() => {}));
  revalidatePath("/", "layout");
  return refreshProfile();
}
