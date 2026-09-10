/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        line: "#d9e2ec",
        panel: "#f7fafc",
        brand: "#0f766e",
        danger: "#b91c1c"
      }
    }
  },
  plugins: []
};
