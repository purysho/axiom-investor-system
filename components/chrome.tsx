"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  LayoutDashboard, Clock, ShieldCheck, BookOpen,
  PieChart, Eye, BarChart2, BookMarked, Users, Settings, LineChart,
} from "lucide-react";
import { SyncBadge } from "@/components/sync";

const NAV = [
  { href: "/",          label: "Dashboard",   key: "0", Icon: LayoutDashboard },
  { href: "/daily",     label: "Daily check", key: "1", Icon: Clock },
  { href: "/gate",      label: "Risk gate",   key: "2", Icon: ShieldCheck },
  { href: "/journal",   label: "Journal",     key: "3", Icon: BookOpen },
  { href: "/portfolio", label: "Portfolio",   key: "4", Icon: PieChart },
  { href: "/watchlist", label: "Watchlist",   key: "5", Icon: Eye },
  { href: "/charts",    label: "Charts",      key: "6", Icon: LineChart },
  { href: "/monthly",   label: "Monthly",     key: "7", Icon: BarChart2 },
  { href: "/guides",    label: "Guides",      key: "8", Icon: BookMarked },
  { href: "/group",     label: "Group",       key: "9", Icon: Users },
  { href: "/settings",  label: "Settings",    key: "0", Icon: Settings },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard", "/daily": "Daily check", "/gate": "Risk gate",
  "/journal": "Journal", "/portfolio": "Portfolio", "/watchlist": "Watchlist",
  "/charts":    "Charts",
  "/monthly": "Monthly review", "/guides": "Guides", "/group": "Group",
  "/settings": "Settings", "/login": "Sign in", "/join": "Join",
};

const AUTH_PATHS = ["/login", "/join"];

export function TitleSync() {
  const path = usePathname();
  useEffect(() => {
    document.title = TITLES[path] ? `${TITLES[path]} · Axiom` : "Axiom Investor System";
  }, [path]);
  return null;
}

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const onAuthPage = AUTH_PATHS.includes(path);

  useEffect(() => {
    if (onAuthPage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (["INPUT","TEXTAREA","SELECT"].includes(el?.tagName ?? "") || el?.isContentEditable) return;
      const t = NAV.find((n) => n.key === e.key);
      if (t) { e.preventDefault(); router.push(t.href); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, onAuthPage]);

  if (onAuthPage) return <TitleSync />;

  return (
    <>
      <TitleSync />

      {/* ── Desktop sidebar ─────────────────── */}
      <nav className="hidden md:flex md:w-56 md:flex-col md:shrink-0 md:border-r md:border-line md:bg-panel">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="text-lg font-bold tracking-tight text-ink">Axiom</div>
          <div className="text-xs text-faint mt-0.5">Investor System</div>
        </div>

        {/* Links */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                  active
                    ? "font-semibold text-ink"
                    : "text-mut hover:text-ink hover:bg-panel2"
                }`}
                style={active ? { background: "color-mix(in srgb, var(--gate) 10%, #F7F4EF)", color: "var(--gate)" } : {}}
              >
                <n.Icon
                  size={16}
                  style={active ? { color: "var(--gate)" } : {}}
                  className={active ? "" : "text-faint group-hover:text-mut transition-colors"}
                />
                <span className="flex-1">{n.label}</span>
                <span className="kbd opacity-0 group-hover:opacity-100 transition-opacity">{n.key}</span>
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-5 py-4">
          <SyncBadge />
        </div>
      </nav>

      {/* ── Mobile bottom nav ───────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-line bg-panel shadow-lg md:hidden">
        {[NAV[0], NAV[2], NAV[1], NAV[5], NAV[6]].map((n) => {
          const active = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className="flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors"
              style={active ? { color: "var(--gate)" } : { color: "#A99F96" }}
            >
              <n.Icon size={20} />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
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
    <section className={`${flat ? "panel-soft" : "panel"} overflow-hidden ${className}`}>
      {(eyebrow || title || right) && (
  <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-line">
          <div>
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          </div>
          {right && <div className="shrink-0 mt-0.5">{right}</div>}
        </header>
      )}
      <div className={noPad ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Stat({
  label, value, tone, sub,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "gate";
  sub?: string;
}) {
  const color =
    tone === "good" ? "#1A6B47" :
    tone === "bad"  ? "#C0252A" :
    tone === "gate" ? "var(--gate)" : undefined;
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-10 border-t border-line pt-5 pb-24 md:pb-10 text-xs text-faint leading-relaxed">
      Educational process tool — not investment advice. Figures are delayed; verify before acting.
      Planned stop risk is not a guaranteed maximum loss.
    </footer>
  );
}

export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      {sub && <p className="text-sm text-mut mt-1">{sub}</p>}
    </div>
  );
}

export const fmtN   = (n: number | null | undefined, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) });
export const fmtUsd = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const fmtPct = (n: number | null | undefined, d = 1) =>
  n == null || Number.isNaN(n) ? "—" : `${n.toFixed(d)}%`;
export const fmtR   = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}R`;
