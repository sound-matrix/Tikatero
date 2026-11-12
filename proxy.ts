import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/types";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { readAccount } from "@/lib/auth/account";
import { isAuthCookie } from "@/lib/supabase/auth-cookie";
import { returnPath, withReturnPath } from "@/lib/auth/return-path";
import { routeRedirect } from "@/lib/auth/routing";

// Next.js 16 calls middleware "Proxy". All decisions are checked against the DB.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const guarded =
    /^\/(?:admin|console|me)(?:\/|$)/.test(path) ||
    ["/login", "/blocked", "/auth/complete"].includes(path);
  if (!guarded && !request.cookies.getAll().some(({ name }) => isAuthCookie(name))) {
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const finish = (destination?: string, status?: number) => {
    if (destination) {
      const url = new URL(destination, request.nextUrl.origin);
      const redirected = NextResponse.redirect(url, 303);
      response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie));
      response = redirected;
    } else if (status) {
      response = new NextResponse("Sign-in is temporarily unavailable. Please try again.", {
        status,
      });
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  try {
    const { url, key } = publicSupabaseEnv();
    const client = createServerClient<Database>(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          if (headers)
            Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    });
    if (!guarded) {
      await client.auth.getUser();
      return finish();
    }
    const account = await readAccount(client);
    if (!account) {
      if (path === "/login") return finish();
      return finish(
        withReturnPath(
          "/login",
          path === "/auth/complete"
            ? request.nextUrl.searchParams.get("next")
            : path + request.nextUrl.search,
        ),
      );
    }
    if (path === "/login" && !account.profile.blocked_at) {
      const next = returnPath(request.nextUrl.searchParams.get("next"));
      if (next && !routeRedirect(account, new URL(next, request.nextUrl.origin).pathname))
        return finish(next);
    }
    // Verification must reach its route handler before ordinary role routing.
    // It creates the first draft organiser and schedules the welcome email.
    if (request.nextUrl.pathname === "/auth/complete") return finish();
    return finish(routeRedirect(account, request.nextUrl.pathname) ?? undefined);
  } catch {
    // No provider errors, tokens, keys or personal data in logs or responses.
    return guarded ? finish(undefined, 503) : finish();
  }
}

export const config = {
  matcher: ["/((?!api/|_next/|auth/callback|.*\\.[^/]+$).*)"],
};
