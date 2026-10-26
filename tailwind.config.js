/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'lu-gold-standard': '#B5A36A',
        'lu-gold-accessible': '#857542',
        'lu-black': '#000000',
        'lu-canvas': '#F8F7F4',
        'lu-gold-tint': '#F7F5EE',
      },
      fontFamily: {
        sans: ['"Trade Gothic Next"', '"Trade Gothic"', 'Arial', 'sans-serif'],
        display: ['Obviously', '"Trade Gothic Next"', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
