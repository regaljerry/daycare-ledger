import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const basePath = (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '');
const base = basePath ? `/${basePath}/` : '/';

export default defineConfig({
  base,
  plugins: [VitePWA({
    scope: base,
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'icons/*.png'],
    manifest: {
      name: '托班小记 · 出勤与账单',
      short_name: '托班小记',
      description: '孩子的托班出勤与每日费用账本',
      lang: 'zh-CN',
      id: base,
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color: '#f6f8f6',
      theme_color: '#f6f8f6',
      icons: [
        { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], navigateFallback: `${base}index.html` },
  })],
});