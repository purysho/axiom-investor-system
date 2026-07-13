import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Themeable via CSS vars (see globals.css :root and [data-theme]).
        // Default = green terminal; [data-theme="amber"] = Bloomberg amber.
        // Space-separated RGB triples so Tailwind's <alpha-value> keeps working.
        bg:      "rgb(var(--c-bg) / <alpha-value>)",
        panel:   "rgb(var(--c-panel) / <alpha-value>)",
        panel2:  "rgb(var(--c-panel2) / <alpha-value>)",
        line:    "rgb(var(--c-line) / <alpha-value>)",
        ink:     "rgb(var(--c-ink) / <alpha-value>)",
        mut:     "rgb(var(--c-mut) / <alpha-value>)",
        faint:   "rgb(var(--c-faint) / <alpha-value>)",
        volt:    "rgb(var(--c-volt) / <alpha-value>)",
        allowed: "#34D399",
        reduced: "#F0B429",
        closed:  "#F4645C",
        steel:   "#6FA8DC",
      },
      fontFamily: {
        // DM Sans / Space Grotesk / IBM Plex Mono are self-hosted (app/fonts.css).
        display: ['"Space Grotesk"', '"DM Sans"', "system-ui", "sans-serif"],
        sans: ['"DM Sans"', "-apple-system", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.02) inset, 0 1px 2px rgba(0,0,0,0.55)",
        "card-hover": "0 0 0 1px #33403700, 0 4px 16px rgba(0,0,0,0.5)",
        volt: "0 6px 18px rgba(180,240,60,0.14)",
        lg: "0 12px 40px rgba(0,0,0,0.62)",
      },
      // Terminals are boxy: tighter radii than the old editorial rounding.
      borderRadius: { DEFAULT: "7px", sm: "5px", lg: "9px", xl: "12px" },
    },
  },
  plugins: [],
};
export default config;
