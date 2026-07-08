import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:      "#F4F1EA",
        panel:   "#FFFEFA",
        panel2:  "#ECE8DE",
        line:    "#DED7CA",
        ink:     "#1E2A24",
        mut:     "#68716B",
        faint:   "#979D96",
        allowed: "#2F6B52",
        reduced: "#A8732F",
        closed:  "#A84D45",
        steel:   "#526D79",
        accent:  "#B86749",
      },
      fontFamily: {
        sans: ['"DM Sans"', "Inter", "-apple-system", "system-ui", "sans-serif"],
        display: ['"Newsreader"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem", "1"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(30,42,36,0.04), 0 12px 30px rgba(30,42,36,0.055)",
        "card-hover": "0 1px 0 rgba(30,42,36,0.04), 0 18px 42px rgba(30,42,36,0.085)",
        lg: "0 24px 60px rgba(30,42,36,0.16)",
      },
      borderRadius: {
        DEFAULT: "12px",
        sm: "8px",
        lg: "18px",
        xl: "24px",
      },
    },
  },
  plugins: [],
};
export default config;
