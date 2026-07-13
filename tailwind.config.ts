import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Broker terminal: cooler near-black surfaces, hairline grid, volt accent.
        bg:      "#080A09",
        panel:   "#101512",
        panel2:  "#171D19",
        line:    "#2A342D",
        ink:     "#EFF6F1",
        mut:     "#9BACA2",
        faint:   "#63736A",
        volt:    "#B4F03C",
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
