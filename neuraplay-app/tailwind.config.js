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
            DEFAULT: "#4F46E5", // match your Next.js app's blue
            dark: "#3730A3",
          },
          secondary: {
            DEFAULT: "#9333EA", // purple
            dark: "#6B21A8",
          },
        },
      },
    },
    plugins: [],
  };
  