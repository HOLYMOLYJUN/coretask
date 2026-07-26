import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'core_task',
        short_name: 'core_task',
        description: '소규모 개발팀을 위한 업무 관리',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#2563EB',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // D-019b: 앱 셸만 캐시한다.
        // ⚠️ woff2 는 제외한다 (D-056).
        // Pretendard 다이나믹 서브셋은 92개 조각(합계 ~2.8MB)이다.
        // 전부 precache 하면 첫 방문 SW 설치가 2.8MB 를 받게 되는데,
        // 실제로 필요한 조각은 보통 1~3개(~90KB)뿐이다.
        // 파일명에 해시가 붙으므로 HTTP 캐시로 충분하다.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // ⚠️ 비어 있는 것이 의도다.
        // Supabase 응답을 하나라도 캐시하면 오래된 보드를 보여주게 된다.
        // 업무 도구에서 틀린 데이터는 없는 데이터보다 나쁘다 (US-802 AC-7).
        runtimeCaching: [],
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 3000 },
})
