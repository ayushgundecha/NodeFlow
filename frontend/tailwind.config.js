/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          light: "#e8f4fd", // Light blue for background
          DEFAULT: "#007bff", // Blue for borders/highlights
          dark: "#0056b3", // Dark blue for hover
        },
      },
      animation: {
        wobble: "wobble 0.3s ease-in-out",
      },
      keyframes: {
        wobble: {
          "0%, 100%": { transform: "rotate(0)" },
          "25%": { transform: "rotate(-5deg)" },
          "50%": { transform: "rotate(5deg)" },
        },
      },
      fontFamily: {
        sans: ["Inter", "Arial", "sans-serif"], // Modern sans-serif font
      },
      boxShadow: {
        node: "0 4px 8px rgba(0, 0, 0, 0.1)", // Subtle shadow
      },
    },
  },
  plugins: [],
};


