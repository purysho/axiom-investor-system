"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Home, PieChart, Lightbulb, BookOpenText, CalendarCheck2, Library,
  Settings, LineChart, Users, ShieldCheck, MoreHorizontal, Bot,
} from "lucide-react";
import { SyncBadge } from "@/components/sync";
import { AxiomMark } from "@/components/logo";

type NavItem = { href: string; label: string; key: string; Icon: LucideIcon };

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Today", key: "0", Icon: Home },
  { href: "/portfolio", label: "My portfolio", key: "4", Icon: PieChart },
  { href: "/copilot", label: "Copilot", key: "c", Icon: Bot },
  { href: "/watchlist", label: "Trade ideas", key: "5", Icon: Lightbulb },
  { href: "/journal", label: "Journal", key: "3", Icon: BookOpenText },
  { href: "/monthly", label: "Review", key: "7", Icon: CalendarCheck2 },
  { href: "/guides", label: "Learn", key: "8", Icon: Library },
];

const MORE_NAV: NavItem[] = [
  { href: "/gate", label: "Risk check", key: "2", Icon: ShieldCheck },
  { href: "/charts", label: "Charts", key: "6", Icon: LineChart },
  { href: "/group", label: "Group", key: "9", Icon: Users },
  { href: "/settings", label: "Settings", key: "", Icon: Settings },
];

const NAV = [...PRIMARY_NAV, ...MORE_NAV, { href: "/daily", label: "Daily check", key: "1", Icon: Home }];

const TITLES: Record<string, string> = {
  "/": "Today", "/daily": "Daily check", "/gate": "Risk check",
  "/journal": "Journal", "/portfolio": "My portfolio", "/copilot": "Copilot",
  "/watchlist": "Trade ideas",
  "/charts": "Charts", "/monthly": "Monthly review", "/guides": "Learn", "/group": "Group",
  "/settings": "Settings", "/login": "Sign in", "/join": "Join",
};

const AUTH_PATHS = ["/login", "/join"];
const PAGE_CONTEXT: Record<string, { kicker: string; title: string; sub: string }> = {
  "/portfolio": { kicker: "Long-term investing", title: "My portfolio", sub: "See what you own, why you own it, and what genuinely needs a decision this week." },
  "/watchlist": { kicker: "Only when risk allows", title: "Trade ideas", sub: "Keep possible swing trades here. An idea is not a trade, and most ideas should stay ideas." },
  "/charts": { kicker: "Use only when needed", title: "Charts", sub: "Look at price structure to answer a specific question—not to find a reason to trade." },
  "/journal": { kicker: "Learn from real decisions", title: "Journal", sub: "Record what you planned, what happened, and the one lesson worth carrying forward." },
  "/monthly": { kicker: "Once a month", title: "Monthly review", sub: "Step back from individual trades and ask whether your process is actually improving." },
  "/guides": { kicker: "Plain-English lessons", title: "Learn the method", sub: "Short explanations for the ideas AXIOM uses, written for decisions rather than exams." },
  "/group": { kicker: "Optional", title: "Group", sub: "Share process context without turning investing into a leaderboard." },
  "/settings": { kicker: "Your starting rules", title: "Settings", sub: "Set the benchmark, portfolio value, and risk limits AXIOM uses in its checks." },
};

export function TitleSync() {
  const path = usePathname();
  useEffect(() => {
    document.title = TITLES[path] ? `${TITLES[path]} · AXIOM` : "AXIOM Investor System";
  }, [path]);
  return null;
}

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const onAuthPage = AUTH_PATHS.includes(path);
  const moreRef = useRef<HTMLDetailsElement>(null);

  // The More dropdown is a native <details>; close it on route change and outside clicks,
  // otherwise client-side navigation leaves it hanging open.
  useEffect(() => { moreRef.current?.removeAttribute("open"); }, [path]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (moreRef.current?.open && !moreRef.current.contains(e.target as Node)) moreRef.current.removeAttribute("open");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  useEffect(() => {
    if (onAuthPage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName ?? "") || el?.isContentEditable) return;
      const target = NAV.find((n) => n.key && n.key === e.key);
      if (target) { e.preventDefault(); router.push(target.href); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, onAuthPage]);

  if (onAuthPage) return <TitleSync />;

  const mobile = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[2], PRIMARY_NAV[3], PRIMARY_NAV[4]];
  const moreActive = MORE_NAV.some((n) => n.href === path) || path === "/daily";

  return (
    <>
      <TitleSync />
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="brand-mark" aria-label="AXIOM home">
            <span className="brand-icon"><AxiomMark size={26} /></span>
            <span className="brand-word">AXIOM</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {PRIMARY_NAV.map((n) => {
              const active = path === n.href || (n.href === "/" && path === "/daily");
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`top-link ${active ? "top-link-active" : ""}`}>
                  {n.label}
                </Link>
              );
            })}
            <details ref={moreRef} className="relative">
              <summary className={`top-link cursor-pointer list-none ${moreActive ? "top-link-active" : ""}`}>
                <MoreHorizontal size={18} /><span className="sr-only">More</span>
              </summary>
              <div className="more-menu">
                <div className="px-3 pb-2 pt-1 text-xs text-faint"><SyncBadge /></div>
                {MORE_NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="more-link" onClick={() => moreRef.current?.removeAttribute("open")}><n.Icon size={16} />{n.label}</Link>
                ))}
              </div>
            </details>
          </nav>

          <Link href="/settings" className="md:hidden" aria-label="Settings"><Settings size={20} /></Link>
        </div>
      </header>

      <nav className="mobile-nav md:hidden" aria-label="Mobile navigation">
        {mobile.map((n) => {
          const active = path === n.href || (n.href === "/" && path === "/daily");
          return (
            <Link key={n.href} href={n.href} className={`mobile-link ${active ? "mobile-link-active" : ""}`}>
              <n.Icon size={19} strokeWidth={active ? 2.1 : 1.7} />
              <span>{n.label.replace("My ", "")}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function PageContextHeader() {
  const path = usePathname();
  const ctx = PAGE_CONTEXT[path];
  if (!ctx) return null;
  return (
    <header className="page-intro">
      <div className="page-kicker">{ctx.kicker}</div>
      <h1>{ctx.title}</h1>
      <p>{ctx.sub}</p>
    </header>
  );
}

export function PageReveal({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <div key={path} className="reveal">{children}</div>;
}

export function Panel({
  eyebrow, title, children, className = "", right, flat, noPad,
}: {
  eyebrow?: string;
  title?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
  flat?: boolean;
  noPad?: boolean;
}) {
  return (
    <section className={`${flat ? "plain-section" : "paper-section"} ${className}`}>
      {(eyebrow || title || right) && (
        <header className="section-heading">
          <div className="min-w-0">
            {eyebrow && <div className="section-kicker">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={noPad ? "" : "section-body"}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone, sub }: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "gate";
  sub?: string;
}) {
  const color = tone === "good" ? "#34D399" : tone === "bad" ? "#F4645C" : tone === "gate" ? "var(--brand)" : undefined;
  return (
    <div className="stat-line">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      AXIOM is an educational process tool, not investment advice. Market figures may be delayed. Planned stop risk is not a guaranteed maximum loss.
    </footer>
  );
}

export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="page-intro mb-8">
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}

export const fmtN = (n: number | null | undefined, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) });
export const fmtUsd = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const fmtPct = (n: number | null | undefined, d = 1) =>
  n == null || Number.isNaN(n) ? "—" : `${n.toFixed(d)}%`;
export const fmtR = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}R`;
