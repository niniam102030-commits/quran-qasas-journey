/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Vazirmatn", "sans-serif"],
        quran: ["UthmanTaha", "serif"],
      },
      colors: {
        termeh: {
          bg: "rgb(var(--termeh-bg) / <alpha-value>)",
          card: "rgb(var(--termeh-card) / <alpha-value>)",
          border: "rgb(var(--termeh-border) / <alpha-value>)",
        },
        lapis: {
          bg: "rgb(var(--lapis-bg) / <alpha-value>)",
          card: "rgb(var(--lapis-card) / <alpha-value>)",
          border: "rgb(var(--lapis-border) / <alpha-value>)",
        },
        brand: {
          primary: "rgb(var(--brand-primary) / <alpha-value>)",
          primaryDark: "rgb(var(--brand-primary-dark) / <alpha-value>)",
          success: "rgb(var(--brand-success) / <alpha-value>)",
          successDark: "rgb(var(--brand-success-dark) / <alpha-value>)",
          amber: "rgb(var(--brand-amber) / <alpha-value>)",
          amberDark: "rgb(var(--brand-amber-dark) / <alpha-value>)",
          ruby: "rgb(var(--brand-ruby) / <alpha-value>)",
          rubyDark: "rgb(var(--brand-ruby-dark) / <alpha-value>)",
        },
        morph: {
          prefix: "#0284C7",
          prefixBg: "#E0F2FE",
          root: "#059669",
          rootBg: "#D1FAE5",
          pronoun: "#EA580C",
          pronounBg: "#FFEDD5",
        },
      },
    },
  },
  plugins: [],
};
