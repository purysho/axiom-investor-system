import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Broker-dark: green-tinted near-black surfaces, volt accent
        bg:      "#0B0F0D",
        panel:   "#121714",
        panel2:  "#1A211D",
        line:    "#27312B",
        ink:     "#EFF6F1",
        mut:     "#9FB0A6",
        faint:   "#66766C",
        volt:    "#B4F03C",
        allowed: "#34D399",
        reduced: "#F0B429",
        closed:  "#F4645C",
        steel:   "#6FA8DC",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "-apple-system", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 3px rgba(0,0,0,0.5)",
        "card-hover": "0 0 0 1px #2C362F, 0 6px 20px rgba(0,0,0,0.45)",
        volt: "0 8px 24px rgba(180,240,60,0.18)",
        lg: "0 12px 40px rgba(0,0,0,0.6)",
      },
      borderRadius: { DEFAULT: "12px", sm: "8px", lg: "16px", xl: "20px" },
    },
  },
  plugins: [],
};
export default config;
