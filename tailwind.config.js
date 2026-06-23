/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd3ff',
          300: '#8db5ff',
          400: '#578cff',
          500: '#3563ff',
          600: '#1f43f5',
          700: '#1832e1',
          800: '#1a2bb6',
          900: '#1c2b8f',
          950: '#151a57',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e2',
          300: '#b0b8c9',
          400: '#8591aa',
          500: '#66728e',
          600: '#515b75',
          700: '#424a5f',
          800: '#3a4051',
          900: '#1f2433',
          950: '#13161f',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.08)',
        'card-lg': '0 8px 24px -4px rgba(16,24,40,0.12), 0 2px 6px -2px rgba(16,24,40,0.06)',
        glow: '0 0 0 4px rgba(53,99,255,0.12)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'slide-in': 'slide-in 0.3s ease-out both',
      },
    },
  },
  plugins: [],
}
