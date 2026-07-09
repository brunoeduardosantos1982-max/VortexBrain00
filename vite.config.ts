/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serve o app em /VortexBrain00/, não na raiz do domínio.
  base: '/VortexBrain00/',
  plugins: [
    react(),
    // registerType 'prompt', NUNCA 'autoUpdate': autoUpdate pode recarregar
    // o app com um autosave pendente na janela de debounce → perda de dados.
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'VortexBrain',
        short_name: 'Vortex',
        description: 'Segundo cérebro local-first',
        start_url: '/VortexBrain00/',
        scope: '/VortexBrain00/',
        display: 'standalone',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        // Chrome exige 192 E 512; se algum der 404 a instalabilidade falha
        // silenciosamente (sem erro, só sem prompt de instalação).
        // src relativos resolvem contra a URL do manifest — já dentro da base.
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // GET (query params) e não POST multipart: muito mais simples e a
        // rota /share também funciona como URL normal no navegador.
        share_target: {
          action: '/VortexBrain00/share',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // O container roda em UTC; o teste de nota diária precisa de um fuso
    // real para provar que a chave de data é local e não UTC.
    env: { TZ: 'America/Sao_Paulo' },
  },
})
