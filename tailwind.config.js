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
        // Repertoire's own module accent (#a8556b, the sidebar's),
        // kept as EDGE steps only. It was briefly the lyric strip's
        // fill too; that was withdrawn because the strip reports
        // success states ("9 of 9 lines placed") and a pink surface
        // reads as a warning no matter how far its saturation sits
        // from the alert reds. The edge keeps the module's identity
        // without the surface making a claim about state.
        //
        // The former 50 / 800 surface steps are gone rather than left
        // declared-but-unused — a token named "light surface" that
        // nothing may use as a surface is a trap for the next reader.
        repertoire: {
          200: '#c9a3ae', // light edge — 1.71:1 against the strip surface
          500: '#a8556b', // the accent itself
          600: '#6d4a53', // dark edge  — 1.68:1 against its surface
        },
        // NEUTRAL CHROME SURFACE — for chrome that must be findable
        // against the page without encoding a state. Warm-neutral
        // rather than pure grey so it sits with the stone type it
        // carries, and NOT indigo: indigo is spoken for by transient
        // placement feedback on armed cells, and reusing it would
        // make "this cell is armed" and "this is the drawer"
        // visually indistinguishable.
        //
        // Measured against the surfaces they actually sit on, and
        // chosen to BEAT the accent fill they replace rather than
        // merely approach it — findability was the whole point of
        // colouring the strip and must not go backwards:
        //   light 1.32:1 vs the white page (accent fill was 1.31:1)
        //   dark  1.55:1 vs neutral-950    (accent fill was 1.52:1)
        // Flat values with no alpha modifiers, so Tailwind cannot
        // silently emit nothing the way an off-scale opacity does.
        chrome: {
          50: '#e2e0de',  // light surface — 1.32:1 against the white page
          800: '#34322f', // dark surface  — 1.55:1 against the near-black page
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
