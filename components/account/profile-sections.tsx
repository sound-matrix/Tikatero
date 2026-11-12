"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCountries, getCountryCallingCode } from "libphonenumber-js/min";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maskedUpi, paymentMethods, platforms } from "@/lib/account/profile";
import type { Tables } from "@/lib/db/types";
import type { FormState } from "@/app/(public)/me/actions";
import {
  changePhone,
  removeAvatar,
  saveAbout,
  saveCheckoutPreferences,
  saveEmail,
  savePrivacy,
  saveSocial,
  verifyPhone,
} from "@/app/(public)/me/profile/actions";

const control = "mt-2 block min-h-12 w-full rounded-xl border border-line bg-white px-3";
const names = new Intl.DisplayNames(["en-IN"], { type: "region" });
const countries = getCountries()
  .map((code) => ({
    code,
    name: names.of(code) ?? code,
    dial: getCountryCallingCode(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

function Status({ state }: { state: FormState }) {
  return state.error ? (
    <p className="text-sm font-semibold text-danger" role="alert">
      {state.error}
    </p>
  ) : state.success ? (
    <p className="text-sm font-semibold text-teal" role="status">
      {state.success}
    </p>
  ) : null;
}

function ProfileForm({
  action,
  label,
  children,
  inline = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  label: string;
  children: ReactNode;
  inline?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className={inline ? "flex flex-wrap items-center gap-2" : "space-y-4"}>
      {children}
      <Button variant={inline ? "secondary" : "primary"} disabled={pending} type="submit">
        {pending ? "Saving…" : label}
      </Button>
      <Status state={state} />
    </form>
  );
}

export function AboutForm({
  profile,
}: {
  profile: Pick<
    Tables<"profiles">,
    "full_name" | "display_name" | "city" | "date_of_birth" | "gender"
  >;
}) {
  return (
    <ProfileForm action={saveAbout} label="Save about you">
      <Input
        label="Full name"
        name="full_name"
        defaultValue={profile.full_name ?? ""}
        maxLength={120}
        autoComplete="name"
        required
      />
      <Input
        label="Display name (optional)"
        name="display_name"
        defaultValue={profile.display_name ?? ""}
        maxLength={100}
        autoComplete="nickname"
      />
      <Input
        label="City"
        name="city"
        defaultValue={profile.city ?? ""}
        maxLength={100}
        autoComplete="address-level2"
      />
      <Input
        label="Date of birth (optional)"
        name="date_of_birth"
        type="date"
        defaultValue={profile.date_of_birth ?? ""}
        autoComplete="bday"
      />
      <label className="block font-semibold">
        Gender (optional)
        <select name="gender" defaultValue={profile.gender ?? ""} className={control}>
          <option value="">Choose if you want to</option>
          <option value="woman">Woman</option>
          <option value="man">Man</option>
          <option value="other">Other</option>
          <option value="prefer_not">Prefer not to say</option>
        </select>
      </label>
    </ProfileForm>
  );
}

const types = new Set(["image/jpeg", "image/png", "image/webp"]);
const photoLimit = 2 * 1024 * 1024;

async function cropPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error();
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((photo) => (photo ? resolve(photo) : reject(new Error())), "image/webp", 0.92),
    );
  } finally {
    bitmap.close();
  }
}

export function PhotoForm({ avatar }: { avatar: string | null }) {
  const [state, setState] = useState<FormState>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("photo");
    if (!(file instanceof File) || !file.size || file.size > photoLimit || !types.has(file.type)) {
      setState({ error: "Choose a JPG, PNG or WebP photo up to 2 MB." });
      return;
    }
    setBusy(true);
    setState({});
    try {
      const photo = await cropPhoto(file);
      const result = await fetch("/api/account/avatar", { method: "POST", body: photo });
      if (!result.ok) throw new Error();
      form.reset();
      setState({ success: "Saved" });
      router.refresh();
    } catch {
      setState({ error: "Your photo could not be uploaded. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {avatar && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt="Your profile photo"
          width={96}
          height={96}
          className="size-24 rounded-full border border-line object-cover"
        />
      )}
      <form onSubmit={upload} className="space-y-3">
        <Input
          name="photo"
          label="Choose a photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
        />
        <p className="text-sm text-muted">JPG, PNG or WebP, up to 2 MB. We crop it to a square.</p>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Uploading…" : "Save photo"}
        </Button>
        <Status state={state} />
      </form>
      {avatar && (
        <ProfileForm action={removeAvatar} label="Remove photo" inline>
          <input type="hidden" name="remove" value="yes" />
        </ProfileForm>
      )}
    </div>
  );
}

function PhoneVerify({ id }: { id: string }) {
  return (
    <div className="mt-3 space-y-2">
      <ProfileForm action={verifyPhone} label="Send verification code" inline>
        <input type="hidden" name="id" value={id} />
      </ProfileForm>
      <ProfileForm action={verifyPhone} label="Verify code" inline>
        <input type="hidden" name="id" value={id} />
        <Input
          label="Code from your text message"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{4,10}"
          required
        />
      </ProfileForm>
    </div>
  );
}

export function PhoneForms({ phones, otp }: { phones: Tables<"user_phones">[]; otp: boolean }) {
  return (
    <div className="space-y-4">
      {phones.map((phone) => (
        <div key={phone.id} className="rounded-xl border border-line p-4">
          <p className="font-semibold">
            {phone.phone_e164}{" "}
            <span className="text-sm font-normal text-muted">
              {phone.is_primary && "· Main number "}
              {phone.verified_at ? "· Verified" : "· Unverified"}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["primary", "remove"] as const)
              .filter((op) => op === "remove" || !phone.is_primary)
              .map((op) => (
                <ProfileForm
                  key={op}
                  action={changePhone}
                  label={op === "remove" ? "Remove number" : "Make main number"}
                  inline
                >
                  <input type="hidden" name="id" value={phone.id} />
                  <input type="hidden" name="operation" value={op} />
                </ProfileForm>
              ))}
          </div>
          {otp && !phone.verified_at && <PhoneVerify id={phone.id} />}
        </div>
      ))}
      <ProfileForm action={changePhone} label="Add number">
        <input type="hidden" name="operation" value="add" />
        <label className="block font-semibold">
          Country code
          <select name="region" defaultValue="IN" className={control}>
            {countries.map(({ code, name, dial }) => (
              <option key={code} value={code}>
                {name} (+{dial})
              </option>
            ))}
          </select>
        </label>
        <Input
          name="phone"
          label="Phone number"
          type="tel"
          autoComplete="tel-national"
          maxLength={30}
          required
        />
      </ProfileForm>
    </div>
  );
}

export function EmailForms({
  emails,
}: {
  emails: Pick<Tables<"user_emails">, "id" | "email" | "is_login" | "verified_at">[];
}) {
  return (
    <div className="space-y-4">
      {emails.map((email) => (
        <div key={email.id} className="space-y-2 rounded-xl border border-line p-4">
          <p className="break-all font-semibold">{email.email}</p>
          <p className="text-sm text-muted">
            {email.is_login ? "Sign-in email · " : "Backup email · "}
            {email.verified_at ? "Verified" : "Awaiting verification"}
          </p>
          {!email.is_login && !email.verified_at && (
            <ProfileForm action={saveEmail} label="Resend link" inline>
              <input type="hidden" name="email" value={email.email} />
            </ProfileForm>
          )}
          {!email.is_login && (
            <ProfileForm action={saveEmail} label="Remove backup email" inline>
              <input type="hidden" name="id" value={email.id} />
              <input type="hidden" name="operation" value="remove" />
            </ProfileForm>
          )}
        </div>
      ))}
      <ProfileForm action={saveEmail} label="Send verification link">
        <Input label="Backup email" name="email" type="email" maxLength={254} required />
      </ProfileForm>
    </div>
  );
}

export function SocialForms({ links }: { links: Tables<"user_social_links">[] }) {
  return (
    <div className="divide-y divide-line">
      {Object.entries(platforms).map(([platform, [label]]) => {
        const link = links.find((item) => item.platform === platform);
        return (
          <details key={platform} className="py-3">
            <summary className="cursor-pointer py-2 font-semibold">
              {label}
              {link ? " · Saved" : ""}
            </summary>
            <div className="space-y-3 pb-2 pt-2">
              <ProfileForm action={saveSocial} label={`Save ${label}`}>
                <input type="hidden" name="platform" value={platform} />
                <Input
                  label={platform === "website" ? "Website link" : `${label} handle or link`}
                  name="link"
                  defaultValue={link?.handle ?? link?.url ?? ""}
                  maxLength={300}
                  required
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="is_public"
                    defaultChecked={link?.is_public ?? false}
                  />
                  Show on my public host page
                </label>
              </ProfileForm>
              {link && (
                <ProfileForm action={saveSocial} label={`Remove ${label}`} inline>
                  <input type="hidden" name="platform" value={platform} />
                  <input type="hidden" name="operation" value="remove" />
                </ProfileForm>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

type Preferences = Pick<
  Tables<"user_checkout_preferences">,
  "ticket_name" | "ticket_email" | "ticket_phone_e164" | "preferred_method" | "upi_id"
>;
export function BookingForm({
  preferences,
  defaults,
}: {
  preferences: Preferences | null;
  defaults: { name: string; email: string; phone: string };
}) {
  return (
    <ProfileForm action={saveCheckoutPreferences} label="Save booking details">
      <Input
        label="Name on tickets"
        name="ticket_name"
        defaultValue={preferences?.ticket_name ?? defaults.name}
        maxLength={120}
      />
      <Input
        label="Email for tickets"
        name="ticket_email"
        type="email"
        defaultValue={preferences?.ticket_email ?? defaults.email}
        maxLength={254}
      />
      <Input
        label="Phone for tickets"
        name="ticket_phone"
        type="tel"
        defaultValue={preferences?.ticket_phone_e164 ?? defaults.phone}
        maxLength={30}
      />
      <label className="block font-semibold">
        How you like to pay
        <select
          name="preferred_method"
          defaultValue={preferences?.preferred_method ?? "ask"}
          className={control}
        >
          {Object.entries(paymentMethods).map(([method, label]) => (
            <option key={method} value={method}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {preferences?.upi_id && (
        <p className="text-sm text-muted">Saved UPI ID {maskedUpi(preferences.upi_id)}</p>
      )}
      <Input
        label="UPI ID (optional)"
        name="upi_id"
        defaultValue={preferences?.upi_id ?? ""}
        placeholder="name@bank"
        maxLength={100}
        autoComplete="off"
      />
      <p className="text-sm text-muted">
        Your cards are saved safely by our payment partner Cashfree, not by Tikatero.
      </p>
    </ProfileForm>
  );
}

export function PrivacyForm({ email, phone }: { email: boolean; phone: boolean }) {
  return (
    <ProfileForm action={savePrivacy} label="Save privacy choices">
      <label className="flex gap-2">
        <input name="email_marketing" type="checkbox" defaultChecked={email} />
        Send me event news by email
      </label>
      <label className="flex gap-2">
        <input name="whatsapp_sms_marketing" type="checkbox" defaultChecked={phone} />
        Send me event news by WhatsApp/SMS
      </label>
    </ProfileForm>
  );
}
