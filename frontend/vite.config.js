import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Caches only the app shell (HTML/CSS/JS/icons) for instant offline loading.
// Live data (sales, inventory, staff) still comes from the Laravel API, so
// the tablet needs to reach the API server (same Wi-Fi / LAN is enough —
// no public internet required) whenever it actually rings up a sale.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'TindaPOS — Point of Sale',
        short_name: 'TindaPOS',
        description: 'Point of sale with unlimited sales history, employee management, and advanced inventory.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F7F6F2',
        theme_color: '#1F6E4E',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only — API calls (/api/*) are always network, never cached,
        // so the POS never shows stale sales/inventory data.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    host: true, // expose to LAN so a tablet can reach the dev server by IP
    port: 5173,
  },
});
