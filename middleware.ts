import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "axiom_session";
const OFFLINE_COOKIE = "axiom_offline";

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  return new TextEncoder().encode(s && s.length >= 16 ? s : "axiom-dev-secret-not-for-production");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    // Everything except Next internals, static assets, and auth endpoints.
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|api/health|api/auth/|terms|privacy|reset).*)",
  ],
};
