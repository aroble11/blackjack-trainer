import { defineConfig } from 'vite';

// Phase 1 scaffold. The PWA plugin (manifest + service worker) is wired in
// Step 6 with `vite-plugin-pwa`, configured so the service worker is DISABLED
// in dev (devOptions.enabled: false) to avoid serving stale code while working.
//
// `base: './'` keeps asset URLs relative so the built app works from any
// sub-path on a static host (GitHub Pages / Netlify / Cloudflare) in Phase 6.
export default defineConfig({
  base: './',
  server: {
    host: true, // also serve on the LAN so the dev build can be opened on a phone's browser
  },
});
