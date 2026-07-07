import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm parchment light mode
        bg:      "#F7F4EF",
        panel:   "#FFFFFF",
        panel2:  "#F2EDE6",
        line:    "#E5DDD3",
        ink:     "#1C1714",
        mut:     "#7A7068",
        faint:   "#A99F96",
        // Gate states (dark, readable on light bg)
        allowed: "#1A6B47",
        reduced: "#9A6100",
        closed:  "#C0252A",
        steel:   "#3B6CB0",
        // Accent
        accent:  "#5B45E0",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "Inter", "-apple-system", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem", "1"],
      },
      boxShadow: {
        card:   "0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05)",
        lg:     "0 8px 32px rgba(0,0,0,0.12)",
      },
      borderRadius: {
        DEFAULT: "10px",
        sm: "6px",
        lg: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
