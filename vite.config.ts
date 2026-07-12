import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// Local-first SPA. Static build to dist/ (Cloudflare Pages later, step 6).
export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // the bundled example world / reference are large lazy chunks — precache so the app
        // (and its optional demo) work fully offline.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Never let the app-shell fallback swallow API requests — /api/* must reach the network
        // (and, on /api/auth/login, Cloudflare Access) rather than being served the cached SPA shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: "Writer's Codex",
        short_name: 'Codex',
        description: 'A local-first, offline writing & worldbuilding organizer.',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // During `npm run dev`, proxy the sync API to a locally-running Worker (`npm run dev:api`, port 8788)
  // so the app and API share an origin. In production both are served by the same Worker deployment.
  server: {
    port: 5273,
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
});
