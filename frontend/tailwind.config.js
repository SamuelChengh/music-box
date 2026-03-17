/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        dark: {
          bg: '#1a1a2e',
          card: '#16213e',
          text: '#ffffff',
          muted: '#a0a0a0'
        },
        light: {
          bg: '#f5f5f5',
          card: '#ffffff',
          text: '#333333',
          muted: '#666666'
        }
      }
    },
  },
  plugins: [],
}
