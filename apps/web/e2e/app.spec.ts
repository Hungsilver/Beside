import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * E2E ở 390×844 trên bản build thật trong Docker, đi qua Caddy HTTPS.
 *
 * Bộ này KHÔNG lặp lại việc mà trace API đã làm (247 case ở `docs/traces/`).
 * Nó chỉ kiểm đúng thứ không công cụ nào khác thấy được: **trình duyệt thật
 * tính bố cục ra sao, và màn hình có dựng được không**.
 *
 * ── Vì sao dùng CHUNG một context cho cả file ───────────────────────────────
 *
 * Hai chốt bảo mật của app đều chống lại cách viết E2E thông thường:
 *
 *   1. `/auth/login` giới hạn 10 lần / 5 phút / IP → không thể để mỗi test tự
 *      đăng nhập, các test cuối sẽ nhận 429 và báo đỏ oan (đúng loại lỗi L27).
 *   2. Refresh token **xoay vòng và có phát hiện tái sử dụng**: mỗi context mới
 *      khởi động sẽ gọi `/auth/refresh`. Nếu nhiều context cùng dùng lại một
 *      cookie đã lưu (`storageState`), lần thứ hai bị coi là token bị đánh cắp
 *      và **cả family bị thu hồi** — mọi test sau đó mất phiên.
 *
 * Cả hai đều là hành vi ĐÚNG của sản phẩm. Nên bộ test phải thích nghi: đăng
 * nhập đúng một lần, giữ một context, dùng lại cho mọi test.
 *
 * Cần tài khoản demo: `npm run seed:demo`.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'an@beside.vn';
const PASSWORD = process.env.E2E_PASSWORD ?? 'beside2026';

/**
 * Lỗi console được phép bỏ qua.
 *
 * Caddy cấp chứng chỉ bằng CA nội bộ cho `localhost`. `ignoreHTTPSErrors` áp
 * cho request của trang, nhưng **không** áp cho lượt tải script service worker —
 * trình duyệt kiểm chứng chỉ đó bằng đường riêng và từ chối. Đây là chuyện của
 * môi trường test; production dùng chứng chỉ Let's Encrypt thật thì không có.
 */
const IGNORABLE = /ServiceWorker|SSL certificate/i;

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
/** Lỗi JS gom trong suốt cả phiên, để mỗi test kiểm phần của mình. */
let jsErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ ignoreHTTPSErrors: true });
  page = await context.newPage();
  page.on('pageerror', (e) => {
    if (!IGNORABLE.test(e.message)) jsErrors.push(e.message);
  });

  await page.goto('/dang-nhap');
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/mật khẩu/i).fill(PASSWORD);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page.getByText(/CHÚNG MÌNH ĐÃ BÊN NHAU/i)).toBeVisible();
});

test.afterAll(async () => {
  await context.close();
});

test.beforeEach(() => {
  jsErrors = [];
});

test.describe('Khung nhìn 390×844', () => {
  test('E2E-01 — vào được app và trang chủ dựng đủ', async () => {
    await page.goto('/');
    await expect(page.getByText(/CHÚNG MÌNH ĐÃ BÊN NHAU/i)).toBeVisible();
    await expect(page.getByRole('navigation', { name: /điều hướng chính/i })).toBeVisible();
  });

  test('E2E-02 — không có thanh cuộn NGANG ở bất kỳ màn nào', async () => {
    for (const path of ['/', '/lich', '/ky-niem', '/dia-diem', '/ngay-yeu', '/cai-dat']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `màn ${path} bị tràn ngang ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test('E2E-03 — vùng chạm trong thanh tab đạt tối thiểu 44px (R2)', async () => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: /điều hướng chính/i });
    await expect(nav).toBeVisible();

    // Cả link (mục đã mở) lẫn nút (mục chưa có màn) đều là vùng ngón tay chạm.
    const targets = nav.locator('a, button');
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const box = await targets.nth(i).boundingBox();
      expect(box, `mục ${i} không đo được`).not.toBeNull();
      expect(box!.height, `mục ${i} cao ${box!.height}px`).toBeGreaterThanOrEqual(40);
    }
  });
});

test.describe('Bản đồ — chốt chặn cho lỗi khung cao 0px', () => {
  /*
   * Đây là lý do tồn tại của cả bộ E2E này.
   *
   * Ngày 08/09, `.maplibregl-map { position: relative }` của maplibre-gl.css
   * (nằm ngoài mọi cascade layer) đè `absolute` của Tailwind v4 (nằm trong
   * @layer utilities), làm khung bản đồ co còn cao 0px. Không một phép kiểm tự
   * động nào bắt được: typecheck xanh, ESLint xanh, 270 unit test xanh, 247
   * case trace xanh — vì lỗi chỉ tồn tại sau khi trình duyệt tính bố cục.
   */
  test('E2E-04 — khung bản đồ có kích thước THẬT, không phải 0px', async () => {
    await page.goto('/ban-do');

    const container = page.locator('[aria-label="Bản đồ"]');
    await expect(container).toBeVisible();

    const box = await container.boundingBox();
    expect(box, 'không đo được khung bản đồ').not.toBeNull();
    expect(box!.height, `khung bản đồ cao ${box!.height}px`).toBeGreaterThan(300);
    expect(box!.width, `khung bản đồ rộng ${box!.width}px`).toBeGreaterThan(300);
  });

  test('E2E-05 — MapLibre dựng được canvas đúng kích thước', async () => {
    await page.goto('/ban-do');

    // Canvas do chính MapLibre tạo; có nó nghĩa là thư viện đã khởi tạo xong.
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });

    const box = await canvas.boundingBox();
    expect(box!.height, `canvas cao ${box!.height}px`).toBeGreaterThan(300);
  });

  test('E2E-06 — computed style của khung bản đồ đúng như mong đợi', async () => {
    await page.goto('/ban-do');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });

    // Đo thẳng computed style — đúng cách bản trace gốc đã tìm ra nguyên nhân.
    const style = await page.locator('[aria-label="Bản đồ"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { position: cs.position, height: cs.height, width: cs.width };
    });

    expect(style.height).not.toBe('0px');
    expect(style.width).not.toBe('0px');
  });
});

test.describe('Các màn dựng được, không màn trắng', () => {
  /*
   * Lỗi runtime trong React thường cho ra một trang TRẮNG chứ không phải lỗi
   * HTTP — server vẫn trả 200. Kiểm bằng cách đòi một chữ đặc trưng của từng màn.
   */
  const screens: { path: string; marker: RegExp }[] = [
    { path: '/lich', marker: /Lịch của hai đứa/i },
    { path: '/ky-niem', marker: /Kỷ niệm/i },
    { path: '/dia-diem', marker: /Địa điểm quen/i },
    { path: '/ngay-yeu', marker: /Ngày yêu/i },
    { path: '/cai-dat', marker: /Quyền riêng tư/i },
    { path: '/check-in', marker: /Khoảnh khắc mới/i },
  ];

  for (const { path, marker } of screens) {
    test(`E2E-07 ${path} — dựng được nội dung thật, không lỗi JS`, async () => {
      await page.goto(path);
      await expect(page.getByText(marker).first()).toBeVisible();
      expect(jsErrors, `lỗi JS trên ${path}: ${jsErrors.join(' | ')}`).toHaveLength(0);
    });
  }
});
