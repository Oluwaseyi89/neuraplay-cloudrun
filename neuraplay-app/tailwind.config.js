/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          primary: {
            DEFAULT: "#4F46E5", 
            dark: "#3730A3",
          },
          secondary: {
            DEFAULT: "#9333EA",
            dark: "#6B21A8",
          },
        },
      },
    },
    plugins: [],
  };
  