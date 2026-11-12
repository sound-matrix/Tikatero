import { Suspense, type ReactNode } from "react";
import { requireAccount } from "@/lib/auth/account";
import { phoneOtpConfig } from "@/lib/account/phone-otp";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AboutForm,
  BookingForm,
  EmailForms,
  PhoneForms,
  PhotoForm,
  PrivacyForm,
  SocialForms,
} from "@/components/account/profile-sections";

export const metadata = { title: "My profile", robots: { index: false, follow: false } };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </Card>
  );
}

async function Profile({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { client, account } = await requireAccount();
  const id = account.profile.id;
  const [{ email }, profile, phones, emails, links, prefs, consents] = await Promise.all([
    searchParams,
    client
      .from("profiles")
      .select("full_name,display_name,phone,avatar_path,city,date_of_birth,gender")
      .eq("id", id)
      .single(),
    client
      .from("user_phones")
      .select("*")
      .eq("user_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at"),
    client
      .from("user_emails")
      .select("id,email,is_login,verified_at")
      .eq("user_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at"),
    client.from("user_social_links").select("*").eq("user_id", id),
    client
      .from("user_checkout_preferences")
      .select("ticket_name,ticket_email,ticket_phone_e164,preferred_method,upi_id")
      .eq("user_id", id)
      .maybeSingle(),
    Promise.all(
      (["email_marketing", "whatsapp_sms_marketing"] as const).map((kind) =>
        client
          .from("user_consents")
          .select("granted")
          .eq("user_id", id)
          .eq("kind", kind)
          .order("changed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    ),
  ]);
  if (
    profile.error ||
    phones.error ||
    emails.error ||
    links.error ||
    prefs.error ||
    consents.some(({ error }) => error)
  )
    throw new Error("Your profile could not be loaded.");
  const avatar = profile.data.avatar_path
    ? client.storage.from("avatars").getPublicUrl(profile.data.avatar_path).data.publicUrl
    : null;
  const defaults = {
    name: profile.data.full_name ?? "",
    email: emails.data.find((item) => item.is_login)?.email ?? "",
    phone: profile.data.phone ?? "",
  };
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">My profile</h1>
        <Button href="/me">My tickets</Button>
      </div>
      {email === "verified" && (
        <p role="status" className="rounded-xl bg-soft p-4 font-semibold text-teal">
          Backup email verified.
        </p>
      )}
      {email === "expired" && (
        <p role="alert" className="rounded-xl bg-soft p-4 text-danger">
          This verification link has expired or was already used. Request a new link below.
        </p>
      )}
      <Section title="Photo">
        <PhotoForm avatar={avatar} />
      </Section>
      <Section title="About you">
        <AboutForm profile={profile.data} />
      </Section>
      <Section title="Phone numbers">
        <PhoneForms phones={phones.data} otp={Boolean(phoneOtpConfig())} />
      </Section>
      <Section title="Emails">
        <EmailForms emails={emails.data} />
      </Section>
      <Section title="Social links">
        <p className="text-sm text-muted">
          Connecting accounts with a login button is coming later.
        </p>
        <SocialForms links={links.data} />
      </Section>
      <Section title="When you book">
        <BookingForm preferences={prefs.data} defaults={defaults} />
      </Section>
      <Section title="Privacy">
        <PrivacyForm email={!!consents[0].data?.granted} phone={!!consents[1].data?.granted} />
      </Section>
      <Button href="/me/settings">Your data and account settings</Button>
    </main>
  );
}

export default function Page(props: { searchParams: Promise<{ email?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading your profile…</p>}>
      <Profile {...props} />
    </Suspense>
  );
}
