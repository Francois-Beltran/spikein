import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['apple-touch-icon.png'],
    manifest: {
      name: 'Spike In', short_name: 'Spike In', description: 'Volleyball team attendance, together.',
      start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
      theme_color: '#f6f6f2', background_color: '#f6f6f2',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'], runtimeCaching: [{ urlPattern: /^https:\/\/.*\.supabase\.co\/.*$/i, handler: 'NetworkOnly' }] },
  })],
})
