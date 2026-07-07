import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#b3ccff",
          300: "#80abff",
          400: "#4d82ff",
          500: "#2b5bf5",
          600: "#1e44d1",
          700: "#1a37a8",
          800: "#182f85",
          900: "#182a6b",
        },
      },
    },
  },
  plugins: [],
};
export default config;
