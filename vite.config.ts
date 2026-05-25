import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' lets the user opt into the update via the
      // PwaUpdateBanner ("New version available · Update now").
      // useRegisterSW's onNeedRefresh / needRefresh state only
      // fires in prompt mode — 'autoUpdate' silently swaps the SW
      // and reloads, which made shipped fixes invisible to the
      // user mid-session.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Musical Journey',
        short_name: 'Musical',
        description: 'Personal practice and ear training companion',
        theme_color: '#1D9E75',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-1024.png',
            sizes: '1024x1024',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Workbox defaults to a 2 MiB per-asset precache ceiling.
        // Bumping to 4 MiB so the main bundle precaches as the app
        // grows; revisit with code-splitting if it crosses that.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
