import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { readAccount } from "@/lib/auth/account";
import { sessionClient } from "@/lib/supabase/server";
import { AccountMenu, type HeaderAccount } from "./account-menu";

export async function PublicHeader({ compact = false }: { compact?: boolean }) {
  const client = await sessionClient();
  const account = client ? await readAccount(client).catch(() => null) : null;
  const profile = account?.profile;
  const menu: HeaderAccount | null =
    account && profile
      ? {
          name: profile.display_name || profile.full_name || "Your account",
          avatar:
            profile.avatar_path && client
              ? client.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
              : null,
          host: account.organisers.length > 0,
          staff: profile.role === "admin" || profile.role === "staff",
          blocked: Boolean(profile.blocked_at),
        }
      : null;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[auto_1fr_auto] md:px-6">
        <Logo />
        <nav
          aria-label="Main navigation"
          className="col-span-2 row-start-2 flex items-center gap-5 text-sm font-semibold md:col-span-1 md:col-start-2 md:row-start-1 md:justify-end"
        >
          <Link href="/events">Find events</Link>
          {!compact && (
            <Link href={menu ? (menu.host ? "/console" : "/me") : "/login?as=host"}>
              Host an event
            </Link>
          )}
        </nav>
        <div className="col-start-2 row-start-1 md:col-start-3">
          <AccountMenu account={menu} />
        </div>
      </div>
    </header>
  );
}

export function PublicHeaderFallback() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto flex h-[76px] w-full max-w-6xl items-center px-4 md:px-6">
        <Logo />
      </div>
    </header>
  );
}
