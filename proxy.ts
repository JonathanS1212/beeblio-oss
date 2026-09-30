import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";

// Next.js 16 renamed middleware to Proxy. This refreshes the Neon Auth session
// cookie and redirects unauthenticated users to /login.
const neonAuthProxy = auth.middleware({ loginUrl: "/login" });

const publicPaths = new Set([
  "/",
  "/premise",
  "/pricing",
  "/analysis",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
  "/callback",
  "/forgot-password",
  "/reset-password",
  "/blog",
]);

// Prefixes for routes that must render without a session. Share links are
// intentionally public: the page and /api/share serve shared content
// anonymously, and login is only prompted when copying into a workspace.
// Blog pages are public marketing content (SEO/GEO: crawlers have no session).
const publicPathPrefixes = ["/share/", "/blog/"];

function isPublicPath(pathname: string) {
  return publicPaths.has(pathname) || publicPathPrefixes.some((prefix) => pathname.startsWith(prefix));
}

// The login page stashes the intended destination in this cookie right before
// starting the OAuth redirect (see AuthPanel). Neon Auth's post-OAuth redirect
// can drop the callbackURL path and land the freshly authenticated user on the
// marketing root instead; the proxy uses the cookie to recover the destination.
const POST_LOGIN_REDIRECT_COOKIE = "post_login_redirect";
// Cookie presence only — the destination page still enforces real auth.
const SESSION_COOKIE_MARKERS = ["session_token", "session_data"];

function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) =>
    SESSION_COOKIE_MARKERS.some((marker) => cookie.name.includes(marker)),
  );
}

// Mirrors the SDK's needsSessionVerification(): a verifier param plus the
// challenge cookie means the browser is returning from Neon Auth and the
// exchange can run server-side.
function carriesOAuthReturn(request: NextRequest) {
  return (
    request.method === "GET" &&
    request.nextUrl.searchParams.has("neon_auth_session_verifier") &&
    request.cookies.getAll().some((cookie) => cookie.name.includes("session_challange") || cookie.name.includes("session_challenge"))
  );
}

function isSafeRelativePath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && value.length <= 512;
}

function recoverPostLoginRedirect(request: NextRequest): NextResponse | null {
  // Never intercept Server Action / API POSTs; only browser navigations.
  if (request.method !== "GET") return null;
  const destination = request.cookies.get(POST_LOGIN_REDIRECT_COOKIE)?.value;
  if (!destination || !isSafeRelativePath(destination) || !hasSessionCookie(request)) return null;
  // The broken OAuth landing: authenticated, sitting on the marketing root with
  // a fresh intent cookie. Forward once and clear the cookie.
  if (request.nextUrl.pathname === "/") {
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.delete(POST_LOGIN_REDIRECT_COOKIE);
    return response;
  }
  // OAuth callback URLs cannot carry fragments. Restore the anchor from the
  // short-lived redirect cookie after the authenticated landing completes.
  const destinationPath = destination.split("#")[0];
  if (destination.includes("#") && request.nextUrl.pathname === destinationPath) {
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.delete(POST_LOGIN_REDIRECT_COOKIE);
    return response;
  }
  return null;
}

function clearPostLoginRedirect(response: NextResponse): NextResponse {
  response.cookies.delete(POST_LOGIN_REDIRECT_COOKIE);
  return response;
}

// The Neon Auth middleware bounces unauthenticated users to /login without the
// original path, so deep links (/account, /<projectId>) would be lost. Rewrite
// its redirect to carry the path; /login forwards it to the auth panel.
function preserveOriginalPath(response: NextResponse, request: NextRequest): NextResponse {
  if (request.method !== "GET") return response;
  const location = response.headers.get("location");
  if (!location || response.status < 300 || response.status >= 400) return response;
  const target = new URL(location, request.url);
  if (target.pathname !== "/login" || target.searchParams.has("redirect")) return response;
  // Never bounce through /login back to bare "/", and never echo the one-time
  // OAuth verifier into the redirect target.
  const original = new URL(request.url);
  original.searchParams.delete("neon_auth_session_verifier");
  if (original.pathname === "/") return response;
  target.searchParams.set("redirect", original.pathname + original.search);
  const rewritten = NextResponse.redirect(target);
  for (const cookie of response.headers.getSetCookie()) rewritten.headers.append("set-cookie", cookie);
  return rewritten;
}

export default async function proxy(request: NextRequest) {
  const recovery = recoverPostLoginRedirect(request);
  if (recovery) return recovery;

  // A return from Neon Auth carries the verifier + challenge cookie. The
  // exchange must run server-side even on public paths: Neon sometimes
  // redirects to the origin root instead of the stored callbackURL, and the
  // public short-circuit would defer session establishment to the client SDK,
  // stranding a signed-in user on the marketing root.
  if (!carriesOAuthReturn(request) && isPublicPath(request.nextUrl.pathname)) {
    // A successful landing on the intended destination consumes the intent
    // cookie so it cannot bounce a later marketing visit.
    const destination = request.cookies.get(POST_LOGIN_REDIRECT_COOKIE)?.value;
    if (destination && request.nextUrl.pathname === destination && hasSessionCookie(request)) {
      return clearPostLoginRedirect(NextResponse.next());
    }
    return NextResponse.next();
  }
  // Server Actions are POSTs that carry a `next-action` header. Each action
  // enforces its own auth via requireUser(), so they do not need the Neon Auth
  // route-protection pass. More importantly, the middleware's upstream
  // get-session check can redirect an action POST, which the browser surfaces
  // as "An unexpected response was received from the server." Let actions pass
  // straight through to the action handler.
  if (request.headers.get("next-action")) {
    return NextResponse.next();
  }
  const response = await neonAuthProxy(request);
  return preserveOriginalPath(response, request);
}

export const config = {
  // Run on application pages except public/static files, the API routes (which
  // handle their own auth/401), and the eve proxy (which forwards to the agent
  // backend).
  matcher: ["/((?!_next/static|_next/image|api/|eve/|.*\\.[^/]+$).*)"],
};
