import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070a12",
          900: "#0b0f1a",
          850: "#0f1422",
          800: "#141a2b",
          700: "#1c2438",
          600: "#28324b",
        },
        flash: {
          DEFAULT: "#6ee7ff",
          400: "#38d3f5",
          500: "#12b6e0",
        },
        pop: {
          DEFAULT: "#b794ff",
          500: "#9b6dff",
        },
        win: "#34d399",
        lose: "#fb7185",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(110,231,255,0.18), 0 12px 40px -12px rgba(110,231,255,0.35)",
      },
    },
  },
  plugins: [],
} satisfies Config;
