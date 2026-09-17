module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          950: "#07150C",
          900: "#0B2414",
          800: "#0F5C2E",
          700: "#167A3C",
          600: "#1B8A3E",
          500: "#2AA24F",
        },
        gold: {
          400: "#E0C15A",
          500: "#C9A227",
          600: "#A6841B",
        },
        cream: "#F4EFE2",
        paper: "#FBF7EE",
        ink: "#1A241C",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Figtree", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        ticket: "0 18px 50px rgba(11, 36, 20, 0.16)",
      },
    },
  },
  plugins: [],
};
