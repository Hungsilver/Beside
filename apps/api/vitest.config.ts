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
