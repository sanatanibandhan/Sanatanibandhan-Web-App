import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', 
      injectRegister: 'auto',
      // ✨ We explicitly tell the offline engine to cache EVERY icon size you provided
      includeAssets: [
        'favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 
        'icon-72x72.png', 'icon-96x96.png', 'icon-128x128.png', 
        'icon-144x144.png', 'icon-152x152.png', 'icon-192x192.png', 
        'icon-384x384.png', 'icon-512x512.png'
      ],
      manifest: {
        name: 'Sanatani Bandhan Community Portal',
        short_name: 'Sanatani',
        description: 'The Universal Digital Mandir & Devotee Management Portal.',
        theme_color: '#E65100', 
        background_color: '#FFFDF8', 
        display: 'standalone', 
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // ✨ FIXED: Increased limit to 4 MiB to accommodate the 2.13 MB production bundle
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

        // ✨ Pre-caches ALL interface files (CSS, JS, HTML, Images) instantly
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

        // ✨ YOUR REACT ROUTER FIX: Forces offline navigation back to index.html
        navigateFallback: '/index.html',

        // ✨ YOUR FIREBASE BYPASS: Never cache Firebase database or Google Auth
        navigateFallbackDenylist: [
          /^\/__/, 
          /firebaseio\.com/, 
          /googleapis\.com/, 
          /identitytoolkit/
        ],

        runtimeCaching: [
          {
            // Caches external fonts locally for 1 year
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
});
