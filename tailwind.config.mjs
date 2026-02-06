/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        banana: {
          50: '#FFFEF0',
          100: '#FFFCDB',
          200: '#FFF7A8',
          300: '#FFF175',
          400: '#FFE942',
          500: '#FFE01F',
          600: '#E6C400',
          700: '#B39600',
          800: '#806B00',
          900: '#4D4000',
        },
        brand: {
          dark: '#1A1A2E',
          mid: '#16213E',
          accent: '#FFE01F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
