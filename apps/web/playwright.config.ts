import { defineConfig, devices } from '@playwright/test';

/**
 * E2E chạy vào **bản build thật trong Docker**, qua Caddy HTTPS — đúng đường
 * trình duyệt thật đi, giống mọi bộ trace khác của dự án.
 *
 * Vì sao dự án cần bộ này: ngày 08/09 khung bản đồ co còn cao 0px và **cả tính
 * năng bản đồ vô hình**, trong khi typecheck, ESLint và 270 unit test đều xanh.
 * Đó là loại lỗi chỉ lộ ra khi trình duyệt tính bố cục thật (xem
 * `docs/traces/fix-ban-do-khong-hien.md`).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost',
    // Caddy dùng CA nội bộ cho localhost — không bỏ qua thì mọi request chết ở TLS.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      /*
       * 390×844 = iPhone 14. Toàn bộ giao diện được thiết kế cho khổ này (R2).
       *
       * Chạy trên **Chromium** chứ không phải WebKit: bộ này là chốt chặn về
       * BỐ CỤC (khung bản đồ có cao 0px không, có tràn ngang không), và Chromium
       * trả lời câu đó chính xác như nhau mà nhẹ hơn nhiều.
       *
       * Đổi lại: nó KHÔNG thay được việc bấm thử trên Safari thật. Những thứ
       * riêng của iOS — Web Push chỉ chạy khi đã cài lên màn hình chính, ô
       * <input type="date"> hiển thị khác hẳn, thanh địa chỉ co giãn làm đổi
       * chiều cao khung nhìn — vẫn nằm trong danh sách phải bấm tay.
       */
      name: 'mobile-390x844',
      // Nhóm offline cần trình duyệt có service worker (cờ riêng), nên loại ra
      // khỏi nhóm này — nếu không nó chạy lây và hỏng vì không có SW.
      grepInvert: /@offline/,
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      /*
       * Nhóm kiểm offline — chạy trong trình duyệt CÓ service worker.
       *
       * Caddy cấp chứng chỉ bằng CA nội bộ cho `localhost`, và Chromium từ chối
       * đăng ký service worker trên chứng chỉ đó (đã đo: `hasSW=false`). Cờ
       * `--ignore-certificate-errors` làm nó chịu đăng ký, nhờ vậy phần offline
       * kiểm được ngay ở máy dev thay vì phải chờ lên production.
       *
       * Chỉ bật cho nhóm này: các nhóm khác chạy KHÔNG có service worker, để
       * cache không làm chúng thấy dữ liệu cũ.
       */
      name: 'offline',
      grep: /@offline/,
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
        launchOptions: { args: ['--ignore-certificate-errors'] },
      },
    },
  ],
});
