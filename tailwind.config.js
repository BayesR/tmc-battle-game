/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // TMC Legacy theme colors（公式カラー・既存シミュレーターと共通）
        legacy: {
          babylon: '#F4C542', // 制
          love: '#FF5FA2',    // 愛
          nature: '#4CAF50',  // 環
          darkness: '#2B2B2B',// 邪
          saint: '#F5F5F5',   // 聖
        },
      },
      fontFamily: {
        game: ['"Arial"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
