import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0A0D10",
        panel: "#10151A",
        panel2: "#151C23",
        line: "#202A33",
        ink: "#DEE7EE",
        mut: "#7E8C99",
        faint: "#55636F",
        allowed: "#2FBF8F",
        reduced: "#E7A83E",
        closed: "#E5484D",
        steel: "#6CA0D8"
      },
      fontFamily: {
        mono: ["IBM Plex Mono", "ui-monospace", "SF Mono", "Cascadia Mono", "Consolas", "monospace"],
        sans: ["Inter", "-apple-system", "Segoe UI", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
