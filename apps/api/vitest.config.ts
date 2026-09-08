import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * NestJS dùng decorator + emitDecoratorMetadata, mà esbuild (mặc định của Vitest)
 * KHÔNG sinh metadata này → dependency injection sẽ hỏng trong test.
 * Vì vậy phải biên dịch bằng SWC.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    root: './',

    /*
     * Chạy trong MỘT tiến trình fork, không chia nhiều worker.
     *
     * Ngày 08/09, `npm run verify:local` báo đỏ mục unit test với
     * `ERR_IPC_CHANNEL_CLOSED` — một worker của Vitest chết giữa chừng. Chạy
     * lại ngay sau đó thì 277/277 xanh. Nguyên nhân là tải: mục này chạy ngay
     * sau Playwright và một loạt lần khởi động lại container, nên nhiều worker
     * tranh nhau tài nguyên và kênh IPC đứt.
     *
     * Một chốt chất lượng đỏ vì lý do không liên quan tới sản phẩm thì tệ hơn
     * là không có chốt: lần sau người ta sẽ chạy lại cho tới khi xanh thay vì
     * đọc kỹ. Phần chạy test ở đây chỉ tốn ~1 giây (68 giây còn lại là biên
     * dịch NestJS), nên bỏ song song hoá gần như không mất gì.
     */
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
