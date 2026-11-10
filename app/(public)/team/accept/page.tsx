import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { INVITE_TOKEN } from "@/lib/scan/codes";
import { acceptMessage, previewInvite } from "@/lib/scan/team";
import { AcceptForm } from "./accept-form";
import { rememberInvite } from "./actions";

export const metadata: Metadata = { title: "Team invitation", referrer: "no-referrer" };

async function Invitation({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const preview = INVITE_TOKEN.test(token)
    ? await previewInvite(token, user?.email ?? null)
    : { error: acceptMessage("invalid") };

  return (
    <main className="mx-auto w-full max-w-lg bg-white px-4 py-10">
      <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">Team invitation</p>
      <h1 className="text-3xl font-extrabold text-ink">Join an event team</h1>
      {"title" in preview && preview.title ? (
        <Card className="mt-6">
          <p>
            You’ve been invited to <b>{preview.title}</b> as a{" "}
            {preview.role === "manager" ? "event manager" : "door scanner"}.
          </p>
          <p className="mt-3 text-muted">
            Door staff can scan this event. They cannot see payouts or ticket prices. This link
            works once.
          </p>
          <AcceptForm token={token} />
        </Card>
      ) : "already" in preview && preview.already ? (
        <Card className="mt-6">
          <p>You’re already on this team.</p>
          <Button
            className="mt-4"
            variant="primary"
            href={
              preview.role === "manager"
                ? `/console/events/${preview.eventId}/team`
                : `/console/events/${preview.eventId}/scan`
            }
          >
            Continue
          </Button>
        </Card>
      ) : (
        <Card className="mt-6">
          <p>{"error" in preview ? preview.error : acceptMessage("invalid")}</p>
          {!user &&
            INVITE_TOKEN.test(token) &&
            "error" in preview &&
            preview.error?.includes("Sign in") && (
              <form className="mt-4" action={rememberInvite.bind(null, token)}>
                <Button type="submit" variant="primary">
                  Sign in to join
                </Button>
              </form>
            )}
        </Card>
      )}
    </main>
  );
}

export default function AcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={<p className="px-4 py-10">Loading the invitation…</p>}>
      <Invitation searchParams={searchParams} />
    </Suspense>
  );
}
