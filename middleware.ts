import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { assertProductionEnv } from "@/lib/server/env";

const SESSION_COOKIE = "axiom_session";
const OFFLINE_COOKIE = "axiom_offline";

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") throw new Error("[Axiom] SESSION_SECRET is missing — refusing to verify sessions.");
  return new TextEncoder().encode("axiom-dev-secret-not-for-production");
}

export async function middleware(req: NextRequest) {
  assertProductionEnv(); // throws on a misconfigured production boot
  const { pathname } = req.nextUrl;

  // CSRF defence in depth: a state-changing API call must originate from this site.
  // (Cookies are SameSite=Lax, so this mainly guards against odd client/proxy behaviour.)
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("host");
      let sameSite = false;
      try { sameSite = new URL(origin).host === host; } catch { sameSite = false; }
      if (!sameSite) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }

  const offline = req.cookies.get(OFFLINE_COOKIE)?.value === "1";
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let authed = false;
  if (token) {
    try {
      await jwtVerify(token, secret());
      authed = true;
    } catch {
      authed = false;
    }
  }

  const isPublicPage = pathname === "/login" || pathname === "/join";

  // Already signed in → keep out of the auth pages.
  if (isPublicPage && authed) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (isPublicPage) return NextResponse.next();

  // API: return 401 rather than redirecting.
  if (pathname.startsWith("/api/")) {
    if (authed || offline) return NextResponse.next();
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authed || offline) return NextResponse.next();

  const login = new URL("/login", req.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except Next internals, static assets, auth endpoints, and the
    // bot's cron tick (which authenticates itself with BOT_CRON_TOKEN, not a session).
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|api/health|api/auth/|api/bot/tick|terms|privacy|reset).*)",
  ],
};
