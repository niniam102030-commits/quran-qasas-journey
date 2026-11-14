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
          bg: "#FAF7F2",
          card: "#FFFFFF",
          border: "#E5DEC9",
        },
        lapis: {
          bg: "#0B132B",
          card: "#1C2541",
          border: "#3A506B",
        },
        brand: {
          primary: "#00A896",
          primaryDark: "#028090",
          success: "#10B981",
          successDark: "#047857",
          amber: "#F59E0B",
          amberDark: "#B45309",
          ruby: "#EF4444",
          rubyDark: "#B91C1C",
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
