import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Cấu hình test riêng, KHÔNG dùng chung vite.config.ts:
 * plugin PWA và Tailwind không cần thiết khi chạy test và chỉ làm chậm.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    restoreMocks: true,
  },
});
