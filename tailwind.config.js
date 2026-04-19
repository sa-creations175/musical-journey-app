/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fluent: '#1D9E75',
        mastered: '#0F5E47',
        developing: '#EF9F27',
        needswork: '#E24B4A',
        info: '#378ADD',
        family: {
          major: { 50: '#ecfdf5', 500: '#10b981', 600: '#059669', 700: '#047857' },
          minor: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
          dom:   { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
          sus:   { 50: '#faf5ff', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce' },
          dim:   { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
          aug:   { 50: '#f9fafb', 500: '#6b7280', 600: '#4b5563', 700: '#374151' },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
