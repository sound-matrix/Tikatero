import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createAnonClient } from "@/lib/supabase/anon";
import { cleanSocialLink, platforms } from "@/lib/account/profile";
import type { SocialPlatform } from "@/lib/db/account-schema";
import { Button } from "@/components/ui/button";

type Host = { name: string; verified: boolean; links: { platform: SocialPlatform; url: string }[] };

async function HostProfile({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,159}$/i.test(slug)) notFound();
  const { data, error } = await createAnonClient().rpc("public_host_profile", { p_slug: slug });
  if (error) throw new Error("This host could not be loaded.");
  if (!data) notFound();
  const host = data as unknown as Host;
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-10">
      <h1 className="text-3xl font-extrabold">{host.name}</h1>
      {host.verified && <p className="font-semibold text-teal">Verified organiser</p>}
      {host.links.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {host.links.map(({ platform, url }) => {
            const clean = cleanSocialLink(platform, url);
            return (
              clean && (
                <a
                  key={platform}
                  href={clean.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="inline-flex min-h-12 items-center rounded-xl border border-line px-4 font-semibold"
                >
                  {platforms[platform][0]}
                </a>
              )
            );
          })}
        </div>
      )}
      <Button href="/events">Find events</Button>
    </main>
  );
}

export default function Page(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading host…</p>}>
      <HostProfile {...props} />
    </Suspense>
  );
}
