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
        // Structural green scale for the restyle (hero band, accents,
        // tints). Distinct from the functional status colours above —
        // these carry no encoded meaning.
        'green-deep': '#0f3d2e',
        'green-mid': '#1a6b4a',
        'green-bright': '#22c37e',
        'green-tint': '#edf7f2',
        // Production module accent (deep indigo) + variants used for
        // hover, subtle backgrounds, dark-mode shifts. `DEFAULT` lets
        // Tailwind resolve bare `production` as the base.
        production: {
          DEFAULT: '#3a4875',
          50:  '#eef0f6',
          100: '#d4d9e7',
          200: '#aab4cf',
          400: '#6b78a2',
          500: '#3a4875',
          600: '#303c62',
          700: '#25304e',
          800: '#1a2238',
        },
        // Repertoire's own module accent (#a8556b, the sidebar's), as
        // SURFACE steps for chrome that belongs to this module. Not a
        // new hue — the strip wearing its module's colour is the most
        // explainable choice available, and it is already licensed as
        // navigation chrome elsewhere.
        //
        // Deliberately NOT any chord family hue and not indigo: at
        // 344°/33% it sits 16° off the alert reds (needswork 0°/72%,
        // family dim 0°/84%) but at under half their saturation, which
        // is what keeps a dusty plum from reading as a warning. Steps
        // are flat values with no alpha modifiers, so Tailwind cannot
        // silently emit nothing the way an off-scale opacity does.
        repertoire: {
          50: '#eedde2',  // light surface — 1.31:1 against the white page
          200: '#c9a3ae', // light edge    — 1.72:1 against that surface
          500: '#a8556b', // the accent itself
          600: '#6d4a53', // dark edge     — 1.71:1 against its surface
          800: '#402b31', // dark surface  — 1.52:1 against the near-black page
        },
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
        sans: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
