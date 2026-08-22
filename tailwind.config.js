/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sanatani-orange': '#E65100',
        'sanatani-bg': '#FFFDF8',
      }
    },
  },
  plugins: [],
}
