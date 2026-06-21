import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// `base: './'` keeps asset URLs relative so the built app works from any
// sub-path on a static host (GitHub Pages / Netlify / Cloudflare) in Phase 6.
//
// vite-plugin-pwa generates the web manifest + a Workbox service worker that
// precaches the app shell (for offline). The service worker is DISABLED in dev
// (devOptions.enabled: false) so it never serves stale code while working; it
// only activates in `build` / `preview`.
export default defineConfig({
  base: './',
  server: {
    host: true, // also serve on the LAN so the dev build can be opened on a phone's browser
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Blackjack Trainer',
        short_name: 'Blackjack',
        description: 'Offline blackjack trainer — practice optimal play.',
        theme_color: '#0b6b3a',
        background_color: '#094f2b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
