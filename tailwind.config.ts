import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        medflow: {
          50: "#f0f9fb",
          100: "#d9f0f5",
          200: "#b7e2eb",
          300: "#85ccd9",
          400: "#4cadc0",
          500: "#3291a8",
          600: "#2b748c",
          700: "#285f73",
          800: "#274f60",
          900: "#254352",
          950: "#142b36",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
