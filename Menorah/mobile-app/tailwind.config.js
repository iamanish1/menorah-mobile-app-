/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#314830',   // main green
          secondary: '#83834c', // olive
          sand: '#fbf3e4',      // light sand
          bg: '#f1f1f1',        // app background (light)
        },
        text: { base: '#151a16' },
        border: '#E5E7EB',
      },
      borderRadius: { xl: '28px' },
    },
  },
  plugins: [],
};
