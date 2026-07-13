"use client";

import { useEffect, useState } from "react";

/**
 * Terminal theme switch: default green terminal ⇄ Bloomberg amber. Writes
 * data-theme on <html> (CSS variables in globals.css do the rest) and persists
 * to localStorage. A tiny inline script in the layout applies the stored theme
 * before paint so there's no flash.
 */
type Theme = "green" | "amber";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("green");

  useEffect(() => {
    const stored = (localStorage.getItem("axiom-theme") as Theme) || "green";
    setTheme(stored === "amber" ? "amber" : "green");
  }, []);

  const apply = (t: Theme) => {
    setTheme(t);
    if (t === "amber") document.documentElement.setAttribute("data-theme", "amber");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("axiom-theme", t); } catch { /* private mode */ }
  };

  return (
    <button
      type="button"
      onClick={() => apply(theme === "green" ? "amber" : "green")}
      title={theme === "green" ? "Switch to Bloomberg amber" : "Switch to green terminal"}
      aria-label="Toggle terminal color theme"
      className="inline-flex items-center gap-1.5 rounded-[5px] border border-line px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-mut transition-colors hover:text-ink"
    >
      <span className="h-2 w-2 rounded-full" style={{ background: "rgb(var(--c-volt))" }} />
      {theme === "green" ? "GRN" : "AMB"}
    </button>
  );
}
