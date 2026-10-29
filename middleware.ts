import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { checkLimit } from "@/lib/ratelimit";
import { env } from "@/lib/env";
import { isApproved } from "@/lib/members/approval";
import {
  APPROVAL_COOKIE,
  APPROVAL_TTL_SECONDS,
  decideAccess,
  isStaticFile,
  requiresApproval,
  signApproval,
  verifyApproval,
} from "@/lib/auth/gate";

const PUBLIC_PREFIXES = ["/login", "/update-password", "/auth/callback", "/api/auth", "/_next", "/favicon.ico"];

// File extensions that should bypass auth (static assets under /public).
// Includes images, fonts, icons, and OG/manifest files.
const PUBLIC_FILE_EXT =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|css|js|map|webmanifest|txt|xml)$/i;

export function isPublicPath(pathname: string): boolean {
  // The home route is public: signed-out visitors see the landing page
  // (rendered by app/page.tsx, which loads no family data); the family data
  // itself stays behind auth + RLS.
  if (pathname === "/") return true;
  if (PUBLIC_FILE_EXT.test(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(p + "/") ||
      pathname.startsWith(p + "."),
  );
}

function applySecurityHeaders(res: NextResponse) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  res.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; img-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; font-src 'self' data:; worker-src blob:; frame-ancestors 'none'`,
  );
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files under /public need no session: skip every network call.
  if (isStaticFile(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith("/login") || pathname.startsWith("/auth/callback")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { success } = await checkLimit("auth", ip);
    if (!success) {
      return applySecurityHeaders(
        new NextResponse("Too many requests", {
          status: 429,
          headers: { "Retry-After": "60" },
        }),
      );
    }
  }

  const { response, user, supabase } = await updateSession(request);

  // Approval: only asked for signed-in users on app routes. A signed cookie
  // (5 minutes) means approved members cost zero extra queries; everyone else
  // costs one read of their own profile row.
  let approved: boolean | null = null;
  let cookieToSet: string | null = null;
  let clearCookie = false;
  if (user && requiresApproval(pathname)) {
    const secret = env().SUPABASE_SERVICE_ROLE_KEY;
    if (await verifyApproval(request.cookies.get(APPROVAL_COOKIE)?.value, user.id, secret)) {
      approved = true;
    } else {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, approved_at")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        // Routing is a convenience; RLS is the gate. Fail open, don't cache.
        console.error("[middleware] approval lookup failed:", error.message);
      } else {
        approved = isApproved(data);
        if (approved) cookieToSet = await signApproval(user.id, secret);
        else clearCookie = true;
      }
    }
  }

  const search = request.nextUrl.search;
  const decision = decideAccess({
    pathname,
    search,
    isPublic: isPublicPath(pathname),
    signedIn: !!user,
    approved,
  });

  if (decision.kind === "login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", decision.next);
    return applySecurityHeaders(NextResponse.redirect(url));
  }
  if (decision.kind === "welcome") {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Carry over any session cookies Supabase just refreshed.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    if (clearCookie) redirect.cookies.delete(APPROVAL_COOKIE);
    return applySecurityHeaders(redirect);
  }

  if (cookieToSet) {
    response.cookies.set(APPROVAL_COOKIE, cookieToSet, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: APPROVAL_TTL_SECONDS,
    });
  }
  if (clearCookie) response.cookies.delete(APPROVAL_COOKIE);
  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
