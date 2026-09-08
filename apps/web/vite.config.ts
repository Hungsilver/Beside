import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      /*
       * injectManifest thay vì generateSW: thông báo đẩy cần
       * addEventListener('push') do mình viết, mà bản service worker sinh tự
       * động thì không chèn code riêng vào được. Giờ plugin chỉ chèn danh sách
       * file nạp sẵn vào self.__WB_MANIFEST, phần còn lại nằm ở src/sw.ts.
       */
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt', // Không tự nạp lại giữa chừng khi người dùng đang xem bản đồ
      injectRegister: 'auto',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // KHÔNG nạp sẵn MapLibre khi cài app: gần 1MB mà đa số lần mở app
        // người dùng chỉ xem trang chủ. Nó được cache ở lần mở bản đồ đầu tiên.
        globIgnores: ['**/maplibre-*.js', '**/MapScreen-*.css'],
      },
      manifest: {
        name: 'Beside — Bên cạnh nhau',
        short_name: 'Beside',
        description:
          'Check-in, theo dõi lịch trình và đếm ngày yêu dành cho các cặp đôi',
        lang: 'vi',
        dir: 'ltr',
        theme_color: '#FF4D7D',
        background_color: '#FFF7FA',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],

  // Khi dev, gọi /api sẽ được chuyển sang API chạy ở cổng 3000
  // → frontend luôn dùng đường dẫn tương đối, không bao giờ hardcode domain.
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },

  // `vite preview` KHÔNG dùng chung cấu hình proxy với `server`, phải khai báo
  // riêng — nếu thiếu thì kiểm thử bản build sẽ nhận 404 ở mọi lời gọi /api.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },

  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Tách riêng để lần cập nhật app sau không bắt tải lại toàn bộ React
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // MapLibre nặng ~800KB. Tách ra để người dùng chỉ tải khi thật sự
          // mở bản đồ — quan trọng với mạng di động ở Việt Nam.
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
