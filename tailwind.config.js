/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* Teal/Cyan accent palette */
        accent: {
          DEFAULT: "rgb(20,184,166)",   /* teal-500 */
          light:   "rgb(34,211,238)",   /* cyan-400 */
          dark:    "rgb(13,148,136)",   /* teal-600 */
        },
        surface: {
          1: "rgb(12,16,28)",
          2: "rgb(16,22,40)",
          3: "rgb(20,28,50)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-glow": "pulse-glow 6s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.35s ease-out forwards",
        "blink":      "blink 1.2s step-start infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.5", transform: "scale(1)" },
          "50%":      { opacity: "1",   transform: "scale(1.03)" },
        },
        "fade-in-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "blink": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0" },
        },
      },
      backdropBlur: {
        xs: "4px",
      },
    },
  },
  plugins: [],
}
