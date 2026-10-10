import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF8F5",
        surface: "#FFFFFF",
        ink: "#1E2227",
        muted: "#6B7079",
        faint: "#A3A7AE",
        line: "rgba(30,34,39,.08)",
        accent: "#3B9EFF",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(30,34,39,.04), 0 8px 24px -8px rgba(30,34,39,.12)",
        lift: "0 2px 4px rgba(30,34,39,.05), 0 16px 40px -12px rgba(30,34,39,.18)",
      },
      keyframes: {
        "spring-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(.94)" },
          "60%": { opacity: "1", transform: "translateY(-2px) scale(1.02)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        pop: {
          "0%": { transform: "scale(.6)", opacity: "0" },
          "55%": { transform: "scale(1.12)", opacity: "1" },
          "80%": { transform: "scale(.96)" },
          "100%": { transform: "scale(1)" },
        },
        nudge: {
          "0%, 100%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.06)" },
          "70%": { transform: "scale(.98)" },
        },
      },
      animation: {
        "spring-in": "spring-in .55s cubic-bezier(.34,1.56,.64,1) both",
        pop: "pop .5s cubic-bezier(.34,1.56,.64,1) both",
        nudge: "nudge .7s ease-out 1.1s 2 both",
      },
    },
  },
  plugins: [],
};
export default config;
