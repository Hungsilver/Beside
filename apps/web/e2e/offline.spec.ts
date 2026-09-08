import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * PWA offline (Phase 5) — phần **đã làm được**.
 *
 * Chạy riêng khỏi các bộ khác vì cần một trình duyệt **có service worker** —
 * xem lý do ở `playwright.config.ts`, nhóm `offline`.
 *
 * Ba mức offline:
 *   1. Vỏ app mở được, kể cả đường dẫn con → OF-01, OF-02
 *   2. Dữ liệu đã xem còn đó                → **CHƯA LÀM ĐƯỢC**, xem
 *      `docs/traces/phase-5-pwa-offline.md` §4
 *   3. Hàng đợi ghi                          → cố tình không làm
 *
 * Kèm một ranh giới quan trọng: vị trí KHÔNG bao giờ được lấy từ kho cũ (OF-03).
 */

const EMAIL = process.env.E2E_EMAIL ?? 'an@beside.vn';
const PASSWORD = process.env.E2E_PASSWORD ?? 'beside2026';

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ ignoreHTTPSErrors: true });
  page = await context.newPage();

  await page.goto('/dang-nhap');
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/mật khẩu/i).fill(PASSWORD);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page.getByText(/CHÚNG MÌNH ĐÃ BÊN NHAU/i)).toBeVisible();

  // Chờ service worker giành quyền điều khiển trang, nếu không thì mọi request
  // vẫn đi thẳng ra mạng và bộ test này chẳng kiểm được gì.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
    timeout: 20_000,
  });

  // Đi qua các màn khi CÒN mạng để kho cache có dữ liệu.
  for (const path of ['/', '/lich', '/ky-niem', '/ngay-yeu', '/dia-diem', '/ban-do']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
});

test.afterAll(async () => {
  await context.close();
});

test('OF-01 @offline — service worker thật sự điều khiển trang', async () => {
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  expect(controlled, 'không có service worker thì cả bộ test này vô nghĩa').toBe(true);
});

test('OF-02 @offline — MẤT MẠNG: mở thẳng đường dẫn con vẫn ra HTML của app', async () => {
  /*
   * Lỗi thật đã sửa trong lượt này: chuyển từ `generateSW` sang `injectManifest`
   * ở Phase 4 làm mất phần điều hướng dự phòng, nên mở thẳng `/lich` lúc offline
   * trả về lỗi của trình duyệt. Online không lộ ra vì nginx lo SPA fallback.
   *
   * Test này chỉ khẳng định **vỏ app tải được** — không khẳng định thấy được dữ
   * liệu, vì phần đó chưa làm (xem chú thích đầu file).
   */
  await context.setOffline(true);
  try {
    const res = await page.goto('/lich', { waitUntil: 'domcontentloaded' });
    expect(res, 'mất mạng mà vẫn phải có phản hồi từ service worker').not.toBeNull();

    // Có phần tử gốc của React và thương hiệu app ⇒ index.html đã được phục vụ.
    await expect(page.locator('#root')).toBeAttached();
    await expect(page.getByText(/Beside/i).first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.setOffline(false);
  }
});

test('OF-03 @offline — kho cache CÓ dữ liệu đọc, và KHÔNG có vị trí', async () => {
  /*
   * Ranh giới có chủ ý (ARCHITECTURE.md §6.2, quyết định từ Phase 2). Hiện một
   * vị trí cũ khi mất mạng dễ làm người ta tin nhầm "người ấy đang ở đó" — thứ
   * nguy hiểm nhất để hiểu sai trong app này.
   */
  const cached = await page.evaluate(async () => {
    const has = await caches.has('beside-api');
    if (!has) return null;
    const cache = await caches.open('beside-api');
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });

  expect(cached, 'kho beside-api phải tồn tại').not.toBeNull();
  expect(cached!.length, 'phải có dữ liệu API nào đó được lưu').toBeGreaterThan(0);
  expect(
    cached!.filter((p) => p.startsWith('/api/v1/locations/')),
    `KHÔNG được lưu vị trí, nhưng thấy: ${cached!.join(', ')}`,
  ).toHaveLength(0);
  expect(
    cached!.filter((p) => p.startsWith('/api/v1/auth/')),
    'KHÔNG được lưu phản hồi xác thực',
  ).toHaveLength(0);
});

test('OF-04 @offline — đăng xuất thì xoá sạch kho dữ liệu offline', async () => {
  await page.goto('/cai-dat');
  await page.getByRole('button', { name: /Đăng xuất/i }).click();
  await expect(page).toHaveURL(/dang-nhap/, { timeout: 15_000 });

  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const has = await caches.has('beside-api');
          if (!has) return 0;
          const cache = await caches.open('beside-api');
          return (await cache.keys()).length;
        }),
      { timeout: 10_000, message: 'kho beside-api phải rỗng sau khi đăng xuất' },
    )
    .toBe(0);
});
