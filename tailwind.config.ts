import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#182232",
        panel: "#ffffff",
        chrome: "#f4f4f5",
        violet: "#9f7aea",
        acid: "#a7ff22",
        lemon: "#ffcf2f",
        muted: "#6d7380",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "Arial", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 30px rgba(24, 34, 50, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
