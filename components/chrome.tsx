"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { SyncBadge } from "@/components/sync";

const NAV = [
  { href: "/", label: "Dashboard", key: "0" },
  { href: "/daily", label: "Daily 15-min", key: "1" },
  { href: "/gate", label: "Risk gate", key: "2" },
  { href: "/journal", label: "Journal", key: "3" },
  { href: "/portfolio", label: "Portfolio", key: "4" },
  { href: "/watchlist", label: "Watchlist", key: "5" },
  { href: "/monthly", label: "Monthly", key: "6" },
  { href: "/guides", label: "Guides", key: "7" },
  { href: "/group", label: "Group", key: "8" },
  { href: "/settings", label: "Settings", key: "9" },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/daily": "Daily 15-min",
  "/gate": "Risk gate",
  "/journal": "Journal",
  "/portfolio": "Portfolio",
  "/watchlist": "Watchlist",
  "/monthly": "Monthly review",
  "/guides": "Guides",
  "/group": "Group",
  "/settings": "Settings",
  "/login": "Sign in",
  "/join": "Join",
};

/** Sets a meaningful browser-tab title per route (client pages can't export metadata). */
export function TitleSync() {
  const path = usePathname();
  useEffect(() => {
    const name = TITLES[path];
    document.title = name ? `${name} · Axiom` : "Axiom Investor System";
  }, [path]);
  return null;
}

const AUTH_PATHS = ["/login", "/join"];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const onAuthPage = AUTH_PATHS.includes(path);

  // Keyboard nav: press a digit to jump surfaces — but never while typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const target = NAV.find((n) => n.key === e.key);
      if (target) {
        e.preventDefault();
        router.push(target.href);
      }
    };
    if (!onAuthPage) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, onAuthPage]);

  if (onAuthPage) {
    return <TitleSync />;
  }

  return (
    <nav aria-label="Primary" className="flex gap-px overflow-x-auto border-b border-line bg-panel md:w-44 md:flex-col md:border-b-0 md:border-r">
      <TitleSync />
      <div className="hidden px-3 pb-1 pt-3 md:block">
        <div className="flex items-baseline gap-1.5 font-mono">
          <span className="text-sm font-semibold tracking-wide text-ink">Axiom</span>
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--gate)" }} />
        </div>
        <div className="eyebrow mt-0.5">Investor System</div>
      </div>
      {NAV.map((n) => {
        const active = path === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center justify-between gap-2 whitespace-nowrap px-3 py-2 font-mono text-xs transition-colors ${
              active ? "bg-panel2 text-ink" : "text-mut hover:text-ink"
            }`}
            style={active ? { boxShadow: "inset 2px 0 0 var(--gate)" } : undefined}
          >
            <span>{n.label}</span>
            <span aria-hidden className={`kbd hidden md:inline ${active ? "opacity-100" : "opacity-30 group-hover:opacity-70"}`}>
              {n.key}
            </span>
          </Link>
        );
      })}
      <div className="mt-auto hidden px-3 py-3 md:block">
        <div className="eyebrow">Risk first,</div>
        <div className="eyebrow">candidates second.</div>
        <div className="eyebrow mt-2 text-faint">Press 0–9 to jump</div>
        <div className="mt-2"><SyncBadge /></div>
      </div>
    </nav>
  );
}

/** Re-keys on route change so each surface settles in once. Reduced-motion safe via CSS. */
export function PageReveal({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="reveal">
      {children}
    </div>
  );
}

export function Panel({
  eyebrow,
  title,
  children,
  className = "",
  right,
}: {
  eyebrow?: string;
  title?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section className={`panel p-3 ${className}`}>
      {(eyebrow || title || right) && (
        <header className="mb-2 flex items-baseline justify-between gap-2">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className="mt-0.5 font-mono text-sm text-ink">{title}</h2>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "gate" }) {
  const color =
    tone === "good" ? "#2FBF8F" : tone === "bad" ? "#E5484D" : tone === "gate" ? "var(--gate)" : undefined;
  return (
    <div className="border border-line bg-panel2 px-2.5 py-2">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-mono text-base" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-6 border-t border-line pt-3 pb-6 text-[11px] leading-relaxed text-faint">
      Educational process tool, not individualized investment advice; the decisions and their consequences are
      yours. Figures are delayed/free-tier and should be verified before acting. Planned stop risk is not a
      guaranteed maximum loss — gaps, halts, and liquidity can make actual losses larger.
    </footer>
  );
}

export const fmtN = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? Math.min(digits, 2) : 0 });

export const fmtUsd = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const fmtPct = (n: number | null | undefined, digits = 1): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `${n.toFixed(digits)}%`;

export const fmtR = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}R`;
