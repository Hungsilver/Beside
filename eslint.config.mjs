import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

/**
 * ESLint cho cả monorepo — một file cấu hình, ba workspace.
 *
 * Vì sao chỉ một file: ba workspace dùng chung `packages/shared` và chung quy
 * ước code (CLAUDE.md R2). Ba file cấu hình riêng là ba chỗ để lệch nhau.
 *
 * Bộ quy tắc được chọn theo đúng những lỗi dự án này ĐÃ THẬT SỰ mắc phải, ghi
 * trong `docs/traces/`:
 *   - `no-floating-promises` — L11: quên `await` làm đọc trúng dữ liệu cũ
 *   - `require-await` / `no-misused-promises` — nhánh async lặng lẽ trôi qua
 *   - `react-hooks/exhaustive-deps` — L20/L21: mảng phụ thuộc sai làm thu hồi
 *     nhầm blob và dựng lại observer sau mỗi lần render
 *   - `no-explicit-any` — R2 cấm `any`
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '**/coverage/**',
      'apps/web/dev-dist/**',
      'mockup/**',
      '**/*.d.ts',
      /*
       * File cấu hình của công cụ build. KHÔNG đưa chúng vào `include` của
       * tsconfig chỉ để ESLint parse được: thêm một file nằm ngoài `src` làm
       * tsc suy ra `rootDir` khác, và bản build của API sẽ ra
       * `dist/src/main.js` thay vì `dist/main.js` — container chết ngay khi
       * khởi động. Đã dính đúng lỗi này ngày 08/09.
       */
      '**/vite.config.ts',
      '**/vitest.config.ts',
    ],
  },

  js.configs.recommended,

  // ------------------------------------------------------------------
  // TypeScript — có kiểu, để bắt được lỗi Promise bị bỏ quên
  // ------------------------------------------------------------------
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // R2: không được có `any`.
      '@typescript-eslint/no-explicit-any': 'error',

      // Promise bị bỏ quên là nguồn của L11 (đọc trúng dữ liệu cũ vì chưa flush).
      // Chỗ nào CỐ Ý không chờ thì phải viết `void ...` cho người đọc thấy rõ.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': [
        'error',
        // onClick={() => void doSomething()} là mẫu dùng khắp nơi trong web.
        { checksVoidReturn: { attributes: false } },
      ],

      // Biến thừa: cho phép đặt tên bắt đầu bằng _ để cố ý bỏ qua.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Mấy quy tắc này bắt nhiều chỗ vô hại trong code Prisma/Nest, và bật lên
      // sẽ đẻ ra một rừng cảnh báo che mất lỗi thật. Tắt có chủ đích.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',

      // R2: không có console.log trong code commit. Cảnh báo lỗi, cho phép
      // console.warn/error vì đó là đường báo lỗi thật.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // ------------------------------------------------------------------
  // Web — React
  // ------------------------------------------------------------------
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Đây là quy tắc bắt được đúng loại lỗi L20 (thu hồi blob của ảnh đang
      // hiển thị) và L21 (dựng lại observer mỗi lần render).
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Service worker chạy trong ngữ cảnh riêng, không phải cửa sổ trình duyệt.
  {
    files: ['apps/web/src/sw.ts'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },

  // ------------------------------------------------------------------
  // API — Node
  // ------------------------------------------------------------------
  {
    files: ['apps/api/src/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      /*
       * `HttpStatus` của NestJS là enum số thuần, còn `exception.getStatus()`
       * trả `number` — so sánh hai thứ đó là cách dùng bình thường và an toàn
       * trong Nest. Bật quy tắc này lên chỉ đẻ ra tiếng ồn ở filter xử lý lỗi.
       */
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    },
  },

  // ------------------------------------------------------------------
  // Kịch bản trace & script: JavaScript thuần, chạy bằng Node
  // ------------------------------------------------------------------
  {
    files: ['**/*.mjs', 'scripts/**/*.js', 'apps/api/test/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
    rules: {
      // Bộ trace CỐ TÌNH in ra màn hình — đó là đầu ra của nó.
      'no-console': 'off',
      // Đây là JavaScript thuần, không có plugin TypeScript ở khối này nên
      // dùng quy tắc lõi.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // File test: nới vài quy tắc cho đỡ vướng khi dựng dữ liệu giả.
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Hàm giả lập thường phải `async` để khớp chữ ký thật, dù bên trong
      // không có gì để chờ.
      '@typescript-eslint/require-await': 'off',
    },
  },
);
