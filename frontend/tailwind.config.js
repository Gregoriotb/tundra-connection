/** @type {import('tailwindcss').Config} */
// Tundra Connection — Tech-Gold Luxury palette (Orquestor.md §Sistema de Diseño).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tundra: {
          bg: '#050505',
          surface: '#0a0a0a',
          gold: '#C5A059',
          goldBright: '#FACC15',
          danger: '#DC3545',
          success: '#198754',
          warning: '#FFC107',
          border: 'rgba(197, 160, 89, 0.2)',
        },
      },
      fontFamily: {
        display: ['"Archivo Black"', 'sans-serif'],
        body: ['Outfit', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
