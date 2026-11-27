/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
