import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/types";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { readAccount } from "@/lib/auth/account";
import { routeRedirect } from "@/lib/auth/routing";

// Next.js 16 calls middleware "Proxy". All decisions are checked against the DB.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const finish = (destination?: string, status?: number) => {
    if (destination) {
      const url = request.nextUrl.clone();
      url.pathname = destination;
      url.search = "";
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
    const account = await readAccount(client);
    if (!account) return finish(request.nextUrl.pathname === "/login" ? undefined : "/login");
    return finish(routeRedirect(account, request.nextUrl.pathname) ?? undefined);
  } catch {
    // No provider errors, tokens, keys or personal data in logs or responses.
    return finish(undefined, 503);
  }
}

export const config = {
  matcher: [
    "/console/:path*",
    "/admin/:path*",
    "/me/:path*",
    "/blocked",
    "/login",
    "/auth/complete",
  ],
};
