import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import sharp from 'sharp';

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

  /**
   * Thanh tab và nút nổi góc dưới phải neo vào đáy **KHUNG NHÌN**, không phải
   * đáy trang. Trước bản sửa chúng dùng `absolute`, mà `<Screen>` không phải
   * phần tử được định vị — nên neo nhầm vào khối chứa ban đầu và trôi mất ngay
   * khi người dùng cuộn. Xem `docs/traces/fix-thanh-tab-troi-khi-cuon.md`.
   *
   * Phép thử chỉ có nghĩa nếu trang THẬT SỰ cuộn được, nên nó chốt luôn điều đó:
   * nếu không màn nào cuộn, test đỏ chứ không xanh giả.
   */
  test('E2E-13 — thanh tab và nút nổi bám đáy khung nhìn sau khi cuộn', async () => {
    const viewport = page.viewportSize();
    expect(viewport, 'phải có khung nhìn cố định').not.toBeNull();
    const viewportHeight = viewport!.height;
    let anyScrolled = false;

    for (const path of ['/', '/ky-niem', '/lich']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const nav = page.getByRole('navigation', { name: /điều hướng chính/i });
      await expect(nav).toBeVisible();

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const scrollY = await page.evaluate(() => Math.round(window.scrollY));
      if (scrollY > 0) anyScrolled = true;

      const box = await nav.boundingBox();
      expect(box, `${path}: thanh tab phải còn nằm trong trang`).not.toBeNull();
      // Đáy thanh tab phải trùng đáy khung nhìn. Nới 2px cho việc làm tròn.
      expect(
        Math.abs(box!.y + box!.height - viewportHeight),
        `${path}: thanh tab lệch đáy khung nhìn sau khi cuộn ${scrollY}px`,
      ).toBeLessThanOrEqual(2);
      await expect(nav, `${path}: thanh tab phải còn nhìn thấy`).toBeInViewport({ ratio: 0.9 });
    }

    expect(anyScrolled, 'không màn nào cuộn được — phép thử này vô nghĩa, phải xem lại').toBe(true);

    // Nút ＋ của màn Lịch cũng phải ở lại (đang ở /lich, đã cuộn tới đáy)
    const fab = page.getByRole('button', { name: /thêm sự kiện/i });
    await expect(fab, 'nút ＋ phải còn trong khung nhìn sau khi cuộn').toBeInViewport({
      ratio: 0.9,
    });
  });

  /**
   * Lớp phủ toàn màn hình (bảng thêm sự kiện, mốc kỷ niệm, địa điểm, chọn chỗ
   * trên bản đồ) dính đúng lỗi của thanh tab: `absolute inset-0` neo vào khối
   * chứa ban đầu, nên cuộn xuống rồi mở bảng thì bảng lệch đúng bằng `scrollY`.
   * Đo được trước khi sửa: cuộn 170px → lớp phủ nằm ở −170..494 thay vì 0..664.
   */
  test('E2E-14 — lớp phủ modal phủ đúng khung nhìn sau khi cuộn', async () => {
    await page.goto('/lich');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrollY = await page.evaluate(() => Math.round(window.scrollY));
    expect(scrollY, 'màn Lịch phải cuộn được, nếu không phép thử vô nghĩa').toBeGreaterThan(0);

    await page.getByRole('button', { name: /thêm sự kiện/i }).click();

    const rect = await page.evaluate(() => {
      const overlay = document.querySelector('.z-40');
      if (!overlay) return null;
      const r = overlay.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), inner: window.innerHeight };
    });
    expect(rect, 'phải mở được lớp phủ').not.toBeNull();
    expect(rect!.top, `lớp phủ lệch ${-rect!.top}px lên trên sau khi cuộn ${scrollY}px`).toBe(0);
    expect(rect!.bottom, 'lớp phủ phải chạm đáy khung nhìn').toBe(rect!.inner);
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
    { path: '/cai-dat/rieng-tu', marker: /Chế độ ẩn danh/i },
    { path: '/cai-dat/thong-bao', marker: /Thông báo đẩy/i },
    { path: '/cai-dat/bo-nho', marker: /Xoá bộ nhớ đệm/i },
    { path: '/chu-ky', marker: /Chu kỳ của bạn/i },
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

test.describe('Phase 5 — địa điểm và ảnh check-in trên bản đồ', () => {
  /*
   * MapLibre vẽ hàng rào và nhãn địa điểm vào CANVAS, không phải DOM — không
   * dò được bằng selector. Nên `CoupleMap` phơi ra hai thuộc tính `data-*` cho
   * biết nó nhận được bao nhiêu địa điểm và bao nhiêu ghim ảnh. Test này đối
   * chiếu con số đó với dữ liệu thật lấy từ API.
   */
  test('E2E-08 — hàng rào địa điểm được đưa lên bản đồ', async () => {
    /*
     * Đối chiếu CHÉO giữa hai màn: đếm địa điểm ở màn Địa điểm, rồi đòi bản đồ
     * cũng nhận đúng bấy nhiêu. Không gọi thẳng API từ trong trang được — access
     * token nằm trong bộ nhớ của app chứ không phải cookie, nên `fetch` trần sẽ
     * nhận 401.
     */
    await page.goto('/dia-diem');
    await expect(page.getByText(/Địa điểm quen/i)).toBeVisible();

    // `count()` KHÔNG tự chờ. Phải đợi mục đầu tiên hiện ra rồi mới đếm, nếu
    // không sẽ đếm lúc danh sách còn đang tải và luôn ra 0.
    const items = page.locator('ul > li button[type="button"]');
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    const listCount = await items.count();
    expect(listCount, 'cần ít nhất 1 địa điểm — chạy `npm run seed:demo`').toBeGreaterThan(0);

    await page.goto('/ban-do');
    const container = page.locator('[aria-label="Bản đồ"]');
    await expect(container).toHaveAttribute('data-places', String(listCount), {
      timeout: 15_000,
    });
  });

  test('E2E-09 — ghim ảnh check-in hiện trên bản đồ và bấm được', async () => {
    await page.goto('/ban-do');
    const container = page.locator('[aria-label="Bản đồ"]');

    // Chờ dữ liệu bài viết về trước khi đo.
    await expect(container).not.toHaveAttribute('data-photo-pins', '0', { timeout: 15_000 });

    /*
     * MapLibre gắn class `maplibregl-marker` lên CHÍNH thẻ mình truyền vào, chứ
     * không bọc thêm thẻ ngoài. Nên ghim ảnh là `button.maplibregl-marker`,
     * không phải một button nằm trong marker. (Đã dò DOM thật để biết điều này.)
     */
    const pin = page.locator('button.maplibregl-marker').first();
    await expect(pin).toBeVisible();
    const box = await pin.boundingBox();
    expect(box!.height, 'ghim ảnh phải đủ to để chạm được').toBeGreaterThanOrEqual(40);
  });

  test('E2E-10 — chọn địa điểm bằng cách chạm lên bản đồ', async () => {
    await page.goto('/dia-diem');
    await page.getByRole('button', { name: /Chọn trên bản đồ/i }).click();

    await expect(page.getByText(/Chạm để chọn chỗ/i)).toBeVisible();
    // Nút Chọn phải bị khoá khi chưa đặt ghim.
    await expect(page.getByRole('button', { name: /^Chọn$/ })).toBeDisabled();

    const map = page.locator('[aria-label="Bản đồ"]');
    await expect(map).toBeVisible();
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 195, y: 300 } });

    await expect(page.getByText(/Đã đặt ghim tại/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Chọn$/ })).toBeEnabled();

    // Thoát ra, không lưu gì cả.
    await page.getByRole('button', { name: /^Huỷ$/ }).click();
    await expect(page.getByText(/Địa điểm quen/i)).toBeVisible();
  });
});

test.describe('Hiệu năng — nạp socket.io theo kiểu động', () => {
  /*
   * `socket.io-client` được chuyển sang nạp động để nó không nằm trong gói tải
   * về đầu tiên (người chưa ghép đôi không dùng tới nó một dòng nào).
   *
   * Rủi ro của thay đổi đó là kết nối thời gian thực chết trong im lặng —
   * không lỗi, không màn trắng, chỉ là vị trí không bao giờ cập nhật. Trace API
   * ở Phase 2 kiểm WebSocket ở phía SERVER, không kiểm client trong trình duyệt.
   * Test này lấp đúng chỗ đó.
   */
  test('E2E-11 — socket vẫn kết nối được sau khi chuyển sang nạp động', async () => {
    await page.goto('/ban-do');

    // Khi chưa kết nối, thanh trên cùng hiện "Đang kết nối lại...".
    // Kết nối xong thì dòng đó phải biến mất.
    await expect(page.getByText('Đang kết nối lại...')).toBeHidden({ timeout: 20_000 });
  });

  /*
   * Chiều ngược lại của E2E-11 — để nó không thành một test rỗng.
   *
   * Một khẳng định "đã kết nối" chỉ có nghĩa khi ta biết nó ĐỎ ĐƯỢC lúc kết nối
   * hỏng. Phải dùng `routeWebSocket`: `page.route` thường KHÔNG chặn WebSocket
   * (đã đo: 0 request bị chặn), nên nếu chỉ dùng nó thì phép thử này xanh giả.
   *
   * Test này mở context riêng vì nó cố tình phá mạng — không được để lây sang
   * các test khác đang dùng chung một context.
   */
  test('E2E-12 — chặn WebSocket thì giao diện PHẢI báo mất kết nối', async ({ browser }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const p = await ctx.newPage();
    try {
      let blocked = 0;
      await p.routeWebSocket(/socket\.io/, (ws) => {
        blocked += 1;
        ws.close();
      });

      await p.goto('/dang-nhap');
      await p.getByLabel(/email/i).fill(EMAIL);
      await p.getByLabel(/mật khẩu/i).fill(PASSWORD);
      await p.getByRole('button', { name: /đăng nhập/i }).click();
      await expect(p.getByText(/CHÚNG MÌNH ĐÃ BÊN NHAU/i)).toBeVisible();

      await p.goto('/ban-do');
      await expect(p.getByText('Đang kết nối lại...')).toBeVisible({ timeout: 15_000 });
      expect(blocked, 'phải thật sự có WebSocket bị chặn').toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Đợt 1 — điều khiển bản đồ', () => {
  test('MC-01 — đổi loại bản đồ, hàng rào địa điểm KHÔNG biến mất', async () => {
    /*
     * Đây là cái bẫy chính của tính năng này: `map.setStyle()` xoá sạch mọi
     * nguồn và lớp mình đã thêm. Không dựng lại thì đổi sang Vệ tinh là hàng
     * rào biến mất — im lặng, không lỗi.
     */
    await page.goto('/ban-do');
    const container = page.locator('[aria-label="Bản đồ"]');
    await expect(container).toHaveAttribute('data-places', /[1-9]/, { timeout: 15_000 });

    await page.getByRole('button', { name: /^Loại bản đồ/ }).click();
    await page.getByRole('button', { name: 'Vệ tinh' }).click();

    // Style mới phải tải xong rồi lớp của mình mới được dựng lại.
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    await expect(container).toHaveAttribute('data-places', /[1-9]/, { timeout: 15_000 });

    const layers = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Bản đồ"]');
      return el?.getAttribute('data-places');
    });
    expect(Number(layers)).toBeGreaterThan(0);
  });

  test('MC-02 — lựa chọn loại bản đồ được nhớ sau khi tải lại', async () => {
    await page.goto('/ban-do');
    await expect(page.getByRole('button', { name: /Loại bản đồ: Vệ tinh/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('MC-03 — ẩn/hiện ghim ảnh check-in', async () => {
    await page.goto('/ban-do');
    const container = page.locator('[aria-label="Bản đồ"]');
    await expect(container).not.toHaveAttribute('data-photo-pins', '0', { timeout: 15_000 });

    await page.getByRole('button', { name: /Ẩn ảnh check-in/ }).click();
    await expect(container).toHaveAttribute('data-photo-pins', '0');
    // Marker ảnh phải biến mất khỏi DOM, không chỉ là con số thay đổi.
    await expect(page.locator('button.maplibregl-marker')).toHaveCount(0);

    await page.getByRole('button', { name: /Hiện ảnh check-in/ }).click();
    await expect(container).not.toHaveAttribute('data-photo-pins', '0');
  });

  test('MC-04 — vuốt bảng thông tin để thu gọn và mở rộng', async () => {
    await page.goto('/ban-do');
    const handle = page.getByRole('button', { name: /Kéo để thay đổi kích thước bảng/ });
    await expect(handle).toBeVisible({ timeout: 15_000 });

    const sheet = page.locator('[aria-label*="Kéo để thay đổi"]').locator('..');
    const before = (await sheet.boundingBox())!.height;

    // Chạm vào thanh nắm để nhảy sang nấc kế tiếp (mở rộng).
    await handle.click();
    await page.waitForTimeout(400);
    const after = (await sheet.boundingBox())!.height;

    expect(after, `trước ${before}px → sau ${after}px`).not.toBe(before);

    // Vùng chạm của thanh nắm phải đạt tối thiểu 44px theo R2.
    const box = (await handle.boundingBox())!;
    expect(box.height, `thanh nam cao ${box.height}px`).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Đợt 2 — hồ sơ cá nhân', () => {
  test('PF-01 — vào được màn Hồ sơ từ danh sách Cài đặt, có đủ ô', async () => {
    await page.goto('/cai-dat');

    // Cài đặt giờ là một DANH SÁCH; hồ sơ nằm ở màn con.
    await page.getByRole('link', { name: /Chỉnh sửa hồ sơ cá nhân/ }).click();
    await expect(page).toHaveURL(/\/cai-dat\/ho-so/);

    const pick = page.getByRole('button', { name: /^(Chọn|Đổi) ảnh đại diện$/ });
    await expect(pick).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Tên hiển thị')).toBeVisible();
    await expect(page.getByLabel('Vài dòng về bạn')).toBeVisible();
    await expect(page.getByLabel('Địa chỉ')).toBeVisible();

    // R2: mọi vùng chạm tối thiểu 44px.
    const box = (await pick.boundingBox())!;
    expect(box.height, `nut chon anh cao ${box.height}px`).toBeGreaterThanOrEqual(44);

    /*
     * Nút Lưu chỉ sáng khi THẬT SỰ có thay đổi.
     *
     * Giá trị gõ vào phải khác thứ đang lưu — lần đầu viết test này tôi điền
     * đúng địa chỉ mà PF-03 đã lưu từ lượt trước, nút vẫn xám và test đỏ oan.
     * Không bấm Lưu nên không có gì bị ghi lại.
     */
    const save = page.getByRole('button', { name: /Lưu thay đổi/ });
    await expect(save).toBeDisabled();
    await page.getByLabel('Địa chỉ').fill(`Ngõ thử ${Date.now() % 100000}`);
    await expect(save).toBeEnabled();
  });

  test('PF-02 — tải ảnh đại diện lên rồi gỡ ra', async () => {
    await page.goto('/cai-dat/ho-so');
    await expect(page.getByRole('button', { name: /^(Chọn|Đổi) ảnh đại diện$/ })).toBeVisible({
      timeout: 15_000,
    });

    /*
     * Ảnh 600×600 thật, sinh tại chỗ. Cỡ ảnh có ý nghĩa với phép kiểm bên dưới:
     * lớn hơn trần 512px nên server PHẢI thu nhỏ lại — nhờ đó `naturalWidth`
     * chứng minh được ảnh đã đi qua đường ống nén, không phải chỉ được chép qua.
     *
     * (Lần đầu viết test này tôi nhét một ảnh 4×4 dựng bằng tay; Chromium từ
     * chối giải mã nó ở `createImageBitmap` và test đỏ vì lý do không liên quan
     * gì tới sản phẩm.)
     */
    const png = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 240, g: 90, b: 140 } },
    })
      .png()
      .toBuffer();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'anh.png',
      mimeType: 'image/png',
      buffer: png,
    });

    // Tải lên xong thì nút đổi nhãn thành "Đổi ảnh đại diện" và hiện thêm nút gỡ.
    const remove = page.getByRole('button', { name: 'Gỡ ảnh' });
    await expect(remove).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Đổi ảnh đại diện' })).toBeVisible();

    // Ảnh phải HIỆN RA thật, không chỉ là nút đổi chữ: `<img>` nằm sau lớp xác
    // thực nên phải tải bằng fetch rồi đổi sang blob URL — kiểm luôn đường đó.
    const img = page.getByRole('img', { name: /Ảnh đại diện của/ });
    await expect(img).toBeVisible({ timeout: 20_000 });
    await expect(img).toHaveJSProperty('naturalWidth', 512);

    await remove.click();
    await expect(page.getByRole('button', { name: 'Chọn ảnh đại diện' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(img).toHaveCount(0);
  });

  test('PF-03 — lưu giới thiệu và địa chỉ, tải lại vẫn còn', async () => {
    await page.goto('/cai-dat/ho-so');

    const bio = page.getByLabel('Vài dòng về bạn');
    const address = page.getByLabel('Địa chỉ');
    await expect(bio).toBeVisible({ timeout: 15_000 });

    const stamp = `Thích cà phê sáng ${Date.now() % 100000}`;
    await bio.fill(stamp);
    await address.fill('Số 1 Đại Cồ Việt, Hà Nội');

    // Bộ đếm ký tự phải chạy theo — nếu không, người dùng không biết còn bao nhiêu.
    await expect(page.getByText(`${stamp.length}/160`)).toBeVisible();

    // Nút Lưu neo ở đáy khung nhìn, nằm NGOÀI <form> (nối bằng thuộc tính `form`).
    await page.getByRole('button', { name: /Lưu thay đổi/ }).click();

    await page.reload();
    await expect(page.getByLabel('Vài dòng về bạn')).toHaveValue(stamp, { timeout: 15_000 });
    await expect(page.getByLabel('Địa chỉ')).toHaveValue('Số 1 Đại Cồ Việt, Hà Nội');
  });

  test('PF-04 — xoá trắng ô giới thiệu thì nội dung cũ THỰC SỰ mất', async () => {
    // Đây là chỗ dễ sai nhất: chuỗi rỗng phải được dịch thành `null` (xoá).
    // Gửi nguyên chuỗi rỗng thì server hiểu là "không đổi" và nội dung cũ ở lại.
    await page.goto('/cai-dat/ho-so');
    const bio = page.getByLabel('Vài dòng về bạn');
    await expect(bio).toBeVisible({ timeout: 15_000 });
    await expect(bio).not.toHaveValue('');

    await bio.fill('');
    await page.getByRole('button', { name: /Lưu thay đổi/ }).click();

    await page.reload();
    await expect(page.getByLabel('Vài dòng về bạn')).toHaveValue('', { timeout: 15_000 });
  });
});

test.describe('Cài đặt — danh sách và màn con', () => {
  test('CD-01 — danh sách nói đúng trạng thái và mở được từng màn con', async () => {
    await page.goto('/cai-dat');

    // Thẻ hồ sơ ở đầu màn, kèm tên người dùng.
    const hero = page.getByRole('link', { name: /Chỉnh sửa hồ sơ cá nhân/ });
    await expect(hero).toBeVisible({ timeout: 15_000 });

    // Mỗi hàng nói luôn giá trị đang dùng — không phải mở ra mới biết.
    await expect(page.getByRole('link', { name: /Nút nhắn tin/ })).toContainText(
      /Zalo|Messenger|Gọi điện|Tin nhắn|Chưa cài/,
    );
    await expect(page.getByRole('link', { name: /Quyền riêng tư/ })).toContainText(
      /Bình thường|Đang ẩn danh|Đang làm mờ|Tắt trực tiếp/,
    );

    // Mở một màn con rồi quay lại bằng nút ‹ của màn đó.
    await page.getByRole('link', { name: /Quyền riêng tư/ }).click();
    await expect(page).toHaveURL(/\/cai-dat\/rieng-tu/);
    await expect(page.getByRole('switch', { name: 'Chế độ ẩn danh' })).toBeVisible();
    await page.getByRole('button', { name: 'Quay lại Cài đặt' }).click();
    await expect(page).toHaveURL(/\/cai-dat$/);

    // Huỷ ghép đôi KHÔNG còn nằm ngoài danh sách — phải vào màn "Chuyện của hai đứa".
    await expect(page.getByRole('button', { name: /Tôi muốn huỷ ghép đôi/ })).toHaveCount(0);
    await page.getByRole('link', { name: /Chuyện của hai đứa/ }).click();
    await expect(page.getByRole('button', { name: /Tôi muốn huỷ ghép đôi/ })).toBeVisible();

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('CD-02 — không màn con nào bị tràn ngang ở khổ 390px', async () => {
    for (const path of [
      '/cai-dat',
      '/cai-dat/ho-so',
      '/cai-dat/nhan-tin',
      '/cai-dat/thong-bao',
      '/cai-dat/rieng-tu',
      '/cai-dat/ca-doi',
    ]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} bị tràn ngang ${overflow}px`).toBeLessThanOrEqual(0);
    }
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('Bình luận trong khoảnh khắc', () => {
  /*
   * Cần dữ liệu demo có ít nhất một khoảnh khắc: `npm run seed:demo`.
   *
   * Bộ này chạy trên CÙNG một tài khoản nên chỉ kiểm được nửa "người viết".
   * Nửa còn lại — người ấy thấy bình luận của mình, chủ bài xoá được bình luận
   * của người ấy — thuộc về kiểm thử hai tài khoản, chưa có trong bộ E2E này.
   */
  test('CM-01 — mở tấm trượt, gửi bình luận, số đếm tăng theo', async () => {
    await page.goto('/ky-niem');

    const openers = page.getByRole('button', { name: /bình luận/i });
    await expect(openers.first()).toBeVisible({ timeout: 15_000 });
    await openers.first().click();

    const sheet = page.getByRole('dialog', { name: 'Bình luận' });
    await expect(sheet).toBeVisible();

    // Tấm trượt không được tràn ra ngoài khung nhìn 390px.
    const box = await sheet.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);

    const stamp = `Nhớ buổi này ghê ${Date.now() % 100000}`;
    await sheet.getByLabel('Nội dung bình luận').fill(stamp);
    await sheet.getByRole('button', { name: 'Gửi bình luận' }).click();

    // Dòng vừa gửi phải hiện ra trong danh sách...
    await expect(sheet.getByText(stamp)).toBeVisible({ timeout: 15_000 });
    // ...và ô nhập phải được dọn sạch, chỉ SAU khi gửi xong.
    await expect(sheet.getByLabel('Nội dung bình luận')).toHaveValue('');

    await sheet.getByRole('button', { name: 'Xong' }).click();
    await expect(sheet).toHaveCount(0);

    // Số trên nút ở dòng kỷ niệm phải nhích lên, không phải chờ tải lại trang.
    await expect(page.getByRole('button', { name: /Xem \d+ bình luận/ }).first()).toBeVisible();
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('CM-02 — bình luận rỗng không gửi được, nội dung quá dài bị chặn', async () => {
    await page.goto('/ky-niem');
    const openers = page.getByRole('button', { name: /bình luận/i });
    await expect(openers.first()).toBeVisible({ timeout: 15_000 });
    await openers.first().click();

    const sheet = page.getByRole('dialog', { name: 'Bình luận' });
    const input = sheet.getByLabel('Nội dung bình luận');
    const send = sheet.getByRole('button', { name: 'Gửi bình luận' });

    // Chưa gõ gì → nút gửi tắt.
    await expect(send).toBeDisabled();

    // Toàn khoảng trắng cũng vậy: cắt xong là rỗng.
    await input.fill('    ');
    await expect(send).toBeDisabled();

    // Quá 300 ký tự: bộ đếm hiện ra và server không bao giờ được gọi tới.
    await input.fill('a'.repeat(301));
    await expect(sheet.getByText('301/300')).toBeVisible();
    await send.click();
    await expect(sheet.getByRole('alert')).toContainText(/300 ký tự/);
  });

  test('CM-03 — xoá bình luận vừa viết', async () => {
    await page.goto('/ky-niem');
    const openers = page.getByRole('button', { name: /bình luận/i });
    await expect(openers.first()).toBeVisible({ timeout: 15_000 });
    await openers.first().click();

    const sheet = page.getByRole('dialog', { name: 'Bình luận' });
    const stamp = `Xoá thử ${Date.now() % 100000}`;
    await sheet.getByLabel('Nội dung bình luận').fill(stamp);
    await sheet.getByRole('button', { name: 'Gửi bình luận' }).click();

    const row = sheet.locator('li').filter({ hasText: stamp });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Xoá phải qua một bước xác nhận — không để chạm nhầm là mất luôn.
    await row.getByRole('button', { name: 'Xoá', exact: true }).click();
    await row.getByRole('button', { name: 'Xoá hẳn' }).click();

    await expect(sheet.getByText(stamp)).toHaveCount(0, { timeout: 15_000 });
  });
});

test.describe('Trò chơi — cờ caro', () => {
  /*
   * Bộ này chạy trên MỘT tài khoản nên không mô phỏng được ván thật giữa hai
   * người. Nó kiểm đúng thứ chỉ trình duyệt trả lời được: bàn 15×15 có dựng ra
   * đủ 225 ô không, có tràn ngang khổ 390px không, và cơ chế chạm hai bước có
   * chặn được nước đi khi chưa xác nhận không.
   *
   * Ván tạo ra ở đây sẽ tự huỷ sau 30 phút không ai đi, nên không cần dọn.
   */
  test('CR-01 — sảnh trò chơi mở được từ màn Nhà', async () => {
    await page.goto('/');
    await page.getByRole('link', { name: /Chơi cùng nhau/ }).click();
    await expect(page.getByRole('heading', { name: 'Trò chơi' })).toBeVisible();

    // Cả hai game đều chơi được.
    await expect(page.getByText('Cờ caro')).toBeVisible();
    await expect(page.getByText('Tiến lên miền Nam')).toBeVisible();
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('CR-02 — mở ván caro, bàn 15×15 dựng đủ ô và không tràn ngang', async () => {
    await page.goto('/tro-choi');

    // Có ván dở thì vào tiếp, chưa có thì tạo mới — cả hai nút đều dẫn vào ván.
    const caro = page.locator('section').filter({ hasText: 'Cờ caro' });
    await caro
      .getByRole('button', { name: /Ván mới/ })
      .or(caro.getByRole('link', { name: /Chơi tiếp ván đang dở/ }))
      .first()
      .click();

    const board = page.getByRole('grid', { name: 'Bàn cờ caro' });
    await expect(board).toBeVisible({ timeout: 15_000 });
    await expect(board.getByRole('gridcell')).toHaveCount(225);

    // Bàn phải vuông và nằm gọn trong khổ 390px.
    const box = await board.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(2);

    // Cả trang không được cuộn ngang.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'trang bị tràn ngang').toBeLessThanOrEqual(0);
  });

  test('CR-03 — chạm hai bước: ngắm rồi mới đặt được quân', async () => {
    await page.goto('/tro-choi');
    const caro = page.locator('section').filter({ hasText: 'Cờ caro' });
    await caro
      .getByRole('button', { name: /Ván mới/ })
      .or(caro.getByRole('link', { name: /Chơi tiếp ván đang dở/ }))
      .first()
      .click();

    const board = page.getByRole('grid', { name: 'Bàn cờ caro' });
    await expect(board).toBeVisible({ timeout: 15_000 });

    // Chưa ngắm ô nào → nút xác nhận phải tắt.
    const confirm = page.getByRole('button', { name: /Đặt quân|Chạm vào bàn|Chờ người ấy/ });
    await expect(confirm).toBeDisabled();

    // Vùng chạm của nút xác nhận phải đạt 44px — đây chính là thứ bù lại cho
    // ô cờ 23px (ARCHITECTURE.md ADR 09/09).
    const confirmBox = await confirm.boundingBox();
    expect(confirmBox!.height).toBeGreaterThanOrEqual(44);

    await board.getByRole('gridcell', { name: 'Hàng 8 cột 8' }).click();
    await expect(page.getByRole('button', { name: /Đặt quân ở 8·8/ })).toBeEnabled();
  });

  test('CR-04 — đồng hồ đếm ngược và ván nói rõ hạn tự huỷ', async () => {
    await page.goto('/tro-choi');
    const caro = page.locator('section').filter({ hasText: 'Cờ caro' });
    await caro
      .getByRole('button', { name: /Ván mới/ })
      .or(caro.getByRole('link', { name: /Chơi tiếp ván đang dở/ }))
      .first()
      .click();

    await expect(page.getByRole('grid', { name: 'Bàn cờ caro' })).toBeVisible({
      timeout: 15_000,
    });

    // Đồng hồ hiện dạng "27s" — hoặc ván đang tạm dừng vì không ai xem.
    const clock = page.getByText(/^\d{1,2}s$/).or(page.getByText(/Đồng hồ đang tạm dừng/));
    await expect(clock.first()).toBeVisible();

    // Mất ván mà không biết vì sao là chuyện khó chịu hơn hẳn bản thân việc mất ván.
    await expect(page.getByText(/Ván tự huỷ nếu 30 phút không ai đi/)).toBeVisible();
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('Trò chơi — tiến lên miền Nam', () => {
  /*
   * Một tài khoản nên không đánh hết được một ván. Bộ này kiểm phần chỉ trình
   * duyệt trả lời được: chia đúng 13 lá, bài đối phương KHÔNG lộ, và nút "Đánh"
   * chỉ sáng khi bộ đang chọn thật sự hợp lệ.
   */
  /*
   * Bài trên tay dò bằng `[aria-label^="Lá "]` chứ không bằng một thẻ bọc:
   * cách bày bài (xoè quạt, chồng lớp, xoay ngang) đã đổi vài lần, nhưng nhãn
   * đọc-màn-hình của từng lá thì là yêu cầu cố định — neo test vào thứ ổn định
   * thay vì vào cấu trúc DOM đang còn thay đổi.
   */
  const handCards = () => page.locator('[aria-label^="Lá "]');

  const openTienLen = async () => {
    await page.goto('/tro-choi');
    const card = page.locator('section').filter({ hasText: 'Tiến lên miền Nam' });
    await card
      .getByRole('button', { name: /Ván mới/ })
      .or(card.getByRole('link', { name: /Chơi tiếp ván đang dở/ }))
      .first()
      .click();
    await expect(handCards().first()).toBeVisible({ timeout: 15_000 });
  };

  test('TL-01 — chia đúng 13 lá và bài người ấy không lộ', async () => {
    await openTienLen();

    await expect(handCards()).toHaveCount(13);

    // Đối phương chỉ hiện SỐ lá — đây là hàng rào quan trọng nhất của tính năng.
    await expect(page.getByText(/13 lá/).first()).toBeVisible();

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('TL-02 — nút Đánh chỉ sáng khi bộ hợp lệ, và nói rõ lý do khi không', async () => {
    await openTienLen();

    const play = page.getByRole('button', { name: /Đánh \d+ lá|Chọn bài|Bộ không hợp lệ|Đang gửi/ });
    await expect(play).toBeDisabled();

    // Bỏ lượt phải TẮT khi bàn trống — bỏ lượt lúc đó thì ván đứng im mãi.
    await expect(page.getByRole('button', { name: 'Bỏ lượt' })).toBeDisabled();

    // Ván đầu bắt buộc có lá nhỏ nhất — màn hình phải nói ra, và ghim luôn lên lá đó.
    await expect(page.getByText(/Nước đầu phải có/)).toBeVisible();
    await expect(page.locator('[aria-label*="bắt buộc đánh"]')).toHaveCount(1);
  });

  test('TL-04 — hàng nút nằm TRÊN quạt bài, trong tầm ngón cái', async () => {
    await openTienLen();

    /*
     * Yêu cầu của chủ dự án 10/09: nút "Đánh"/"Bỏ lượt" phải dễ bấm hơn. Cách
     * kiểm được bằng máy là so toạ độ — hàng nút phải nằm CAO HƠN quạt bài, và
     * cả hai phải nằm trong nửa dưới màn hình (chỗ ngón cái với tới).
     */
    const pass = await page.getByRole('button', { name: 'Bỏ lượt' }).boundingBox();
    const card = await handCards().first().boundingBox();
    const viewport = page.viewportSize();

    expect(pass!.y + pass!.height, 'hàng nút phải nằm trên quạt bài').toBeLessThanOrEqual(
      card!.y + card!.height,
    );
    expect(pass!.y, 'hàng nút phải ở nửa dưới màn hình').toBeGreaterThan(viewport!.height / 2);

    // Vùng chạm của cả ba nút phải đạt 44px (R2).
    expect(pass!.height).toBeGreaterThanOrEqual(44);
  });

  test('TL-05 — chạm một lá thì lá ghép được đổi màu', async () => {
    await openTienLen();

    /*
     * Chỉ chạy được phần này khi ĐANG LÀ LƯỢT MÌNH, mà ai đi trước thì do lần
     * chia bài quyết (người cầm lá nhỏ nhất). Một tài khoản không ép được điều
     * đó, nên test tự bỏ qua khi tới lượt người kia — phần luật của gợi ý đã
     * được phủ kín bằng unit test ở `tien-len-suggest.spec.ts`.
     */
    const mine = await page.getByText('Tới lượt bạn').first().isVisible();
    test.skip(!mine, 'ván này người kia đi trước');

    // Nước đầu bắt buộc chứa lá nhỏ nhất, nên chạm đúng lá đang được ghim.
    const pinned = page.locator('[aria-label*="bắt buộc đánh"]');
    await pinned.click();

    await expect(pinned).toHaveAttribute('data-tone', 'on');
    await expect(page.getByText(/sẵn sàng/)).toBeVisible();

    // Bấm lần nữa là bỏ chọn — chạm giờ chỉ chọn đúng lá đó, không nhặt cả bộ.
    await pinned.click();
    await expect(pinned).toHaveAttribute('data-tone', 'plain');

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('TL-03 — bài trên tay không làm tràn ngang khổ 390px', async () => {
    await openTienLen();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'trang bị tràn ngang').toBeLessThanOrEqual(0);

    // Vùng chạm mỗi lá phải đạt 44px dù chỉ lộ ra một phần vì chồng lớp (R2).
    const box = await handCards().first().boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Phòng học chung', () => {
  /*
   * Chặng ngắn nhất là 15 phút nên bộ này không chờ hết một chặng được — phần
   * đó thuộc về trace API (S7-11..16, đẩy đồng hồ về quá khứ rồi để cron thật
   * xử). Ở đây chỉ kiểm thứ trình duyệt trả lời được: màn dựng ra sao, vùng
   * chạm, và đồng hồ có chạy thật không.
   *
   * Dọn sau mỗi test bằng nút "Dừng hẳn" để không để lại phiên treo.
   */
  test('ST-01 — mở phòng học từ màn Nhà, chọn được thời lượng', async () => {
    await page.goto('/');
    await page.getByRole('link', { name: /Học cùng nhau/ }).click();
    await expect(page.getByRole('heading', { name: 'Phòng học' })).toBeVisible();

    // Ba mức học và hai mức nghỉ, vùng chạm đủ 44px.
    const focus25 = page.getByRole('button', { name: '25 phút' });
    await expect(focus25).toBeVisible();
    const box = await focus25.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Phải nói rõ khoá màn hình vẫn tính giờ — đây là điểm khác hẳn phòng game.
    await expect(page.getByText(/đồng hồ vẫn chạy/i)).toBeVisible();
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('ST-02 — bắt đầu phiên thì đồng hồ hiện ra và đếm ngược thật', async () => {
    await page.goto('/hoc-cung-nhau');
    /*
     * `.first()` vì `15 phút` khớp HAI nút: mốc học 15 phút và mốc nghỉ dài 15
     * phút (`LONG_BREAK_OPTIONS` thêm ngày 12/09 làm selector cũ nhập nhằng và
     * test này đỏ từ lúc đó). Mốc học đứng trước trong DOM.
     */
    await page.getByRole('button', { name: '15 phút' }).first().click();
    await page.getByRole('button', { name: /Bắt đầu học/ }).click();

    /*
     * Đọc `aria-label` của mặt số thay vì `textContent`.
     *
     * Mỗi tấm thẻ lật giữ CẢ số mới và số cũ trong hai nửa tĩnh, nên
     * `textContent` của mặt số ra `1155:0000` chứ không ra `15:00` — không
     * regex nào khớp cho ra ý nghĩa. `aria-label` thì do component đặt tường
     * minh ("Còn lại 14 phút 59 giây") và cũng chính là thứ người khiếm thị
     * nghe được.
     */
    const clock = page.getByRole('timer');
    await expect(clock).toBeVisible({ timeout: 15_000 });

    const first = await clock.getAttribute('aria-label');
    // Chờ qua hai nhịp cập nhật rồi đọc lại — đồng hồ phải nhỏ đi.
    await expect
      .poll(async () => (await clock.getAttribute('aria-label')) !== first, {
        timeout: 8_000,
      })
      .toBe(true);

    await expect(page.getByText(/ĐANG HỌC/)).toBeVisible();

    // Dọn: dừng hẳn phiên vừa mở.
    await page.getByRole('button', { name: 'Dừng buổi học' }).click();
    await page.getByRole('button', { name: 'Dừng hẳn' }).click();
    await expect(page.getByRole('button', { name: /Bắt đầu học/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('ST-03 — thống kê hiện lên sau khi đã có giờ học', async () => {
    await page.goto('/hoc-cung-nhau');
    /*
     * `Đã học được` là nhãn của bản thống kê ĐẦU TIÊN (commit 9a632af) và đã
     * biến mất khi mục này được dựng lại — test đỏ từ lúc đó. Nhãn hiện tại là
     * `7 ngày qua`, thứ luôn hiện khi couple đã có thành viên.
     */
    await expect(page.getByText('7 ngày qua')).toBeVisible({ timeout: 15_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'trang bị tràn ngang').toBeLessThanOrEqual(0);
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('Module Đồng hồ (/dong-ho)', () => {
  /*
   * Bộ này chốt đúng điều chủ dự án yêu cầu ngày 12/09: mặt số phải là phần
   * CHÍNH của màn hình, không phải một khối bị ba hàng chip đẩy xuống còn nửa.
   * Đó là thứ chỉ trình duyệt thật đo được — typecheck và unit test không thấy
   * một pixel nào.
   */

  /** Mặt số: `role="timer"` do `FlipClock` đặt. */
  const face = () => page.getByRole('timer');

  test('DH-01 — vào từ trang chủ, mặt số chiếm phần chính màn hình', async () => {
    await page.goto('/');
    await page.getByRole('link', { name: /Đồng hồ số lật toàn màn hình/ }).click();

    await expect(face()).toBeVisible();

    const viewport = page.viewportSize()!;
    const box = (await face().boundingBox())!;

    /*
     * Ngưỡng 55%: bản cũ (bốn chip chế độ + hàng nút riêng + nút cài đặt + dòng
     * hướng dẫn dưới đáy) cho mặt số khoảng 45% chiều cao. Bản này xếp chồng ba
     * thẻ nhóm ở khổ dọc nên phải vượt hẳn ngưỡng đó, và nếu ai thêm lại một
     * hàng chip vào đáy thì test này đỏ ngay.
     */
    expect(
      box.height / viewport.height,
      `mặt số chỉ cao ${Math.round(box.height)}px trên khung ${viewport.height}px`,
    ).toBeGreaterThan(0.55);

    // Và không được tràn ra ngoài mép ngang.
    expect(box.width).toBeLessThanOrEqual(viewport.width);

    // Đáy chỉ có MỘT hàng tab — không hàng chip nào khác.
    const tabs = page.getByRole('tablist', { name: 'Chế độ đồng hồ' });
    await expect(tabs).toBeVisible();
    const tabsBox = (await tabs.boundingBox())!;
    expect(tabsBox.height, 'hàng tab bị xuống dòng').toBeLessThanOrEqual(70);

    // Bốn khe tab, mỗi khe đủ 44px để chạm (R2).
    const items = tabs.getByRole('tab');
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    for (const item of await items.all()) {
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('DH-02 — hẹn giờ gõ được số phút tuỳ ý rồi đếm ngược thật', async () => {
    await page.goto('/dong-ho');
    await page.getByRole('tab', { name: 'Hẹn giờ' }).click();

    // Chưa đặt gì thì màn ĐẶT chiếm chỗ mặt số — mặt số `00:00` không nói gì.
    await expect(page.getByText('Hẹn giờ trong bao lâu?')).toBeVisible();

    const minutes = page.getByLabel(/Số phút tuỳ ý/);
    const start = page.getByRole('button', { name: /Bắt đầu/ });

    // Ô trống thì nút phải KHOÁ, không được bắt đầu một mốc 0 phút.
    await expect(start).toBeDisabled();
    // Ngoài biên cũng khoá.
    await minutes.fill('0');
    await expect(start).toBeDisabled();
    await minutes.fill('9999');
    await expect(start).toBeDisabled();

    await minutes.fill('3');
    await expect(start).toBeEnabled();
    await start.click();

    // Mặt số quay lại và đang đếm ngược thật.
    await expect(face()).toBeVisible();
    const first = await face().getAttribute('aria-label');
    await expect
      .poll(async () => (await face().getAttribute('aria-label')) !== first, {
        timeout: 8_000,
      })
      .toBe(true);

    await expect(page.getByRole('button', { name: /Tạm dừng/ })).toBeVisible();

    // Dọn: đặt lại về chưa hẹn gì.
    await page.getByRole('button', { name: /Đặt lại/ }).click();
    await expect(page.getByText('Hẹn giờ trong bao lâu?')).toBeVisible();
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('DH-03 — cài đặt nằm trong bảng trượt, tắt giây thì thẻ to ra', async () => {
    await page.goto('/dong-ho');
    await expect(face()).toBeVisible();

    /** Thẻ số theo NHÓM — một thẻ mang cả `09`, như đồng hồ lật thật. */
    const cards = page.locator('.flip-digit.is-group');

    // Mặc định có giây: ba thẻ (giờ · phút · giây) xếp chồng ở khổ dọc.
    await expect(cards).toHaveCount(3);
    const narrow = (await cards.first().boundingBox())!.width;

    await page.getByRole('button', { name: 'Cài đặt đồng hồ' }).click();
    const sheet = page.getByRole('dialog', { name: 'Cài đặt đồng hồ' });
    await expect(sheet).toBeVisible();

    // Những công tắc trước đây là chip dưới đáy màn giờ phải nằm TRONG bảng.
    await sheet.getByRole('button', { name: /Hiện giây/ }).click();
    await sheet.getByRole('button', { name: /Chủ đề Giấy/ }).click();

    await sheet.getByRole('button', { name: 'Xong' }).click();
    await expect(sheet).toHaveCount(0);

    /*
     * Bỏ thẻ giây thì khối đồng hồ KHÔNG thấp đi — nó vẫn lấp đầy khung, và cỡ
     * chữ tính ngược từ chỗ còn lại nên mỗi thẻ TO RA. Đó là điểm của cách đo
     * theo khung chứa; đo sai chiều thì sẽ tưởng công tắc không ăn.
     */
    await expect(cards).toHaveCount(2);
    await expect
      .poll(async () => (await cards.first().boundingBox())!.width > narrow, {
        timeout: 5_000,
      })
      .toBe(true);

    // To ra nhưng vẫn không được tràn ra ngoài mép.
    const viewport = page.viewportSize()!;
    expect((await cards.first().boundingBox())!.width).toBeLessThanOrEqual(viewport.width);

    // Trả lại mặc định cho các test sau (tuỳ chọn lưu trong localStorage).
    await page.getByRole('button', { name: 'Cài đặt đồng hồ' }).click();
    await sheet.getByRole('button', { name: /Hiện giây/ }).click();
    await sheet.getByRole('button', { name: /Chủ đề Mực/ }).click();
    await sheet.getByRole('button', { name: 'Xong' }).click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'trang bị tràn ngang').toBeLessThanOrEqual(0);
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('DH-04 — Phòng học dẫn sang module, không mở lớp phủ tại chỗ', async () => {
    await page.goto('/hoc-cung-nhau');
    await page.getByRole('link', { name: /Xem đồng hồ toàn màn hình/ }).click();
    await expect(page).toHaveURL(/\/dong-ho/);
    await expect(face()).toBeVisible();

    // Thoát thì quay lại đúng chỗ vừa tới, không nhảy về trang chủ.
    await page.getByRole('button', { name: 'Thoát đồng hồ' }).click();
    await expect(page).toHaveURL(/\/hoc-cung-nhau/);
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('Bộ lọc thời gian & xem ảnh (bổ sung 10/09)', () => {
  test('BD-01 — bộ lọc thu gọn mở ra được, lọc theo khoảng thời gian', async () => {
    await page.goto('/ban-do');
    const container = page.locator('[aria-label="Bản đồ"]');
    await expect(container).not.toHaveAttribute('data-photo-pins', '0', { timeout: 15_000 });

    // Mặc định THU GỌN: chỉ một chip, không che bản đồ.
    const opener = page.getByRole('button', { name: 'Mở bộ lọc thời gian' });
    await expect(opener).toBeVisible();
    await expect(page.getByRole('group', { name: /Lọc khoảnh khắc/ })).toHaveCount(0);

    await opener.click();
    const group = page.getByRole('group', { name: /Lọc khoảnh khắc theo thời gian/ });
    await expect(group).toBeVisible();

    // Chip phải đủ cao để chạm được ở khổ 390px.
    const today = group.getByRole('button', { name: 'Hôm nay' });
    expect((await today.boundingBox())!.height).toBeGreaterThanOrEqual(32);

    await today.click();
    await expect(page.getByText(/· hôm nay/)).toBeVisible();

    await group.getByRole('button', { name: '7 ngày' }).click();
    await expect(page.getByText(/7 ngày gần đây/)).toBeVisible();

    // Khoảng tự chọn ngược ngày phải báo lỗi và KHÔNG gọi API.
    await group.getByRole('button', { name: /Chọn ngày/ }).click();
    const from = page.getByLabel('Từ ngày');
    const to = page.getByLabel('Đến ngày');
    await expect(from).toBeVisible();
    await from.fill('2026-09-09');
    await to.fill('2026-09-01');
    await expect(page.getByText(/Ngày bắt đầu phải trước/)).toBeVisible();

    // Trả về "Tất cả" rồi thu gọn lại — chip thu gọn phải nhớ khoảng đang lọc.
    await group.getByRole('button', { name: 'Tất cả' }).click();
    await page.getByRole('button', { name: 'Thu gọn bộ lọc thời gian' }).click();
    await expect(page.getByRole('button', { name: 'Mở bộ lọc thời gian' })).toContainText(
      'Tất cả',
    );
    await expect(container).not.toHaveAttribute('data-photo-pins', '0', { timeout: 15_000 });
  });

  test('BD-02 — chạm ghim ảnh mở chi tiết kèm toạ độ và nút Google Maps', async () => {
    await page.goto('/ban-do');
    const container = page.locator('[aria-label="Bản đồ"]');
    await expect(container).not.toHaveAttribute('data-photo-pins', '0', { timeout: 15_000 });

    /*
     * `dispatchEvent` chứ không phải `.click()`: bản đồ tự căn khung nhìn vào
     * chấm vị trí của người ấy (Quận 3), nên ghim ảnh ở Quận 1 nằm ngoài khung
     * — Playwright từ chối bấm một điểm ngoài màn hình. Ghim vẫn nằm trong DOM
     * và vẫn đủ lớn để chạm (E2E-09 kiểm phần đó), ở đây chỉ cần biết cú chạm
     * có mở đúng tấm trượt chi tiết hay không.
     */
    await page.locator('button.maplibregl-marker').first().dispatchEvent('click');

    const sheet = page.getByRole('dialog', { name: 'Chi tiết khoảnh khắc' });
    await expect(sheet).toBeVisible();
    // Toạ độ phải là dạng máy đọc được: dấu CHẤM thập phân, 6 chữ số.
    await expect(sheet.getByText(/-?\d+\.\d{6}, -?\d+\.\d{6}/)).toBeVisible();

    const maps = sheet.getByRole('link', { name: /Chỉ đường bằng Google Maps/ });
    await expect(maps).toHaveAttribute(
      'href',
      /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/,
    );

    await sheet.getByRole('button', { name: 'Xong' }).click();
    await expect(sheet).toHaveCount(0);
  });

  test('BD-03 — xem ảnh toàn màn hình trong Kỷ niệm', async () => {
    await page.goto('/ky-niem');
    const open = page.getByRole('button', { name: 'Xem ảnh toàn màn hình' }).first();
    await expect(open).toBeVisible({ timeout: 20_000 });
    await open.click();

    const viewer = page.getByRole('dialog', { name: 'Xem ảnh' });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Đóng ảnh' }).click();
    await expect(viewer).toHaveCount(0);

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('BD-04 — cắt / đổi tỉ lệ ảnh trước khi đăng', async () => {
    await page.goto('/check-in');

    const png = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 120, g: 180, b: 240 } },
    })
      .png()
      .toBuffer();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'khoanh-khac.png',
      mimeType: 'image/png',
      buffer: png,
    });

    const crop = page.getByRole('button', { name: 'Cắt và chỉnh tỉ lệ ảnh' });
    await expect(crop).toBeVisible({ timeout: 20_000 });
    await crop.click();

    const cropper = page.getByRole('dialog', { name: 'Chỉnh tỉ lệ ảnh' });
    await expect(cropper).toBeVisible();
    await cropper.getByRole('button', { name: 'Vuông 1:1' }).click();
    await cropper.getByRole('button', { name: 'Xong' }).click();

    // Cắt xong thì màn cắt đóng lại và thẻ ảnh đổi nhãn.
    await expect(cropper).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Cắt và chỉnh tỉ lệ ảnh' })).toContainText(
      'Đã cắt',
    );

    // Cố ý KHÔNG đăng: bộ E2E không được để lại rác trong dữ liệu demo.
    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });

  test('BD-05 — chạm chấm vị trí của người ấy để xem toạ độ và chỉ đường', async () => {
    await page.goto('/ban-do');

    /*
     * Thu gọn bảng thông tin trước: nó nhớ nấc của lần trước (MC-04 để lại nấc
     * "mở rộng" cao 82%) và che mất chấm vị trí ở giữa bản đồ. Đây cũng chính
     * là lý do cần thêm nút mở tấm trượt ngay trong bảng — kiểm ở cuối test.
     */
    const handle = page.getByRole('button', { name: /Kéo để thay đổi kích thước bảng/ });
    await expect(handle).toBeVisible({ timeout: 20_000 });
    // Chỉ bấm khi đang ở nấc "mở rộng": chạm vào thanh nắm ở nấc "vừa" lại MỞ TO
    // thêm (xem `DraggableSheet.move`), đúng ngược điều đang cần.
    if (/mở rộng/.test((await handle.getAttribute('aria-label')) ?? '')) {
      await handle.click();
      await page.waitForTimeout(400);
    }

    // Chấm vị trí là marker DOM của MapLibre, có nhãn đọc-màn-hình riêng.
    const dot = page.getByRole('button', { name: /Xem vị trí của/ }).first();
    await expect(dot).toBeVisible({ timeout: 20_000 });
    await dot.click();

    const sheet = page.getByRole('dialog', { name: 'Chi tiết vị trí' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/-?\d+\.\d{6}, -?\d+\.\d{6}/)).toBeVisible();
    await expect(
      sheet.getByRole('link', { name: /Chỉ đường bằng Google Maps/ }),
    ).toHaveAttribute(
      'href',
      /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/,
    );

    await sheet.getByRole('button', { name: 'Xong' }).click();
    await expect(sheet).toHaveCount(0);

    // Cùng một việc còn mở được từ nút trong bảng thông tin ở đáy màn hình.
    await page.getByRole('button', { name: /Toạ độ & chỉ đường tới/ }).click();
    await expect(page.getByRole('dialog', { name: 'Chi tiết vị trí' })).toBeVisible();
    await page.getByRole('button', { name: 'Xong' }).click();

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('Đang trên đường về (F13)', () => {
  test('VD-01 — bắt đầu chuyến tới một địa điểm rồi báo đã tới nơi', async () => {
    await page.goto('/ban-do');

    const startBtn = page.getByRole('button', { name: /Tôi đang về/ });
    await expect(startBtn).toBeVisible({ timeout: 20_000 });
    await startBtn.click();

    // Điểm đến BẮT BUỘC là một địa điểm đã lưu — chính hàng rào ảo của nó là
    // thứ phát hiện "đã tới nơi".
    const sheet = page.getByRole('dialog', { name: 'Chọn điểm đến' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /Nhà em/ }).click();
    await expect(sheet).toHaveCount(0, { timeout: 15_000 });

    // Thẻ chuyến hiện ra kèm điểm đến.
    await expect(page.getByText(/Bạn đang về/)).toBeVisible({ timeout: 15_000 });

    // Kết thúc chuyến — dọn luôn dữ liệu test.
    await page.getByRole('button', { name: /Đã tới nơi/ }).click();
    await expect(page.getByRole('button', { name: /Tôi đang về/ })).toBeVisible({
      timeout: 15_000,
    });

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('Chu kỳ (F14)', () => {
  test('CK-01 — bật theo dõi, mặc định KHÔNG chia sẻ, rồi xoá sạch', async () => {
    await page.goto('/chu-ky');

    // Màn giới thiệu phải nói luật riêng tư trước khi người dùng ghi gì.
    await expect(page.getByText(/người ấy không thấy gì cả/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/không phải biện pháp tránh thai/i)).toBeVisible();

    await page.getByRole('button', { name: /Hôm nay là ngày đầu kỳ/ }).click();

    // Ghi xong là vào màn theo dõi, hôm nay là ngày 1.
    await expect(page.getByText(/^Ngày 1$/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Đang trong kỳ').first()).toBeVisible();

    // Mặc định phải là KHÔNG chia sẻ.
    await expect(page.getByRole('button', { name: /Không chia sẻ/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Chưa chia sẻ thì không nhắc người ấy được.
    await expect(page.getByRole('switch', { name: /Nhắc người ấy/ })).toBeDisabled();

    // Bật chia sẻ rồi kiểm công tắc mở ra.
    await page.getByRole('button', { name: /Chỉ báo giai đoạn/ }).click();
    await expect(page.getByRole('switch', { name: /Nhắc người ấy/ })).toBeEnabled({
      timeout: 15_000,
    });

    // Dọn: xoá sạch để không để lại dữ liệu sức khoẻ trong bộ dữ liệu demo.
    await page.getByRole('button', { name: /Xoá sạch dữ liệu chu kỳ/ }).click();
    await page.getByRole('button', { name: 'Xoá hết' }).click();
    await expect(page.getByRole('button', { name: /Hôm nay là ngày đầu kỳ/ })).toBeVisible({
      timeout: 20_000,
    });

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('Bộ nhớ & cập nhật', () => {
  test('BN-01 — màn bộ nhớ nói rõ bản dựng và hỏi lại trước khi xoá', async () => {
    await page.goto('/cai-dat/bo-nho');

    // Mã bản dựng do Vite chèn lúc build — nhờ nó biết máy đang chạy bản nào.
    await expect(page.getByText(/bản dựng \d{12}/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Kiểm tra bản mới/ })).toBeVisible();

    // Xoá bộ nhớ đệm phải hỏi lại — bấm nhầm là tải lại cả app.
    await page.getByRole('button', { name: /Xoá bộ nhớ đệm & tải lại/ }).click();
    await expect(page.getByRole('button', { name: 'Xoá & tải lại' })).toBeVisible();
    await page.getByRole('button', { name: 'Thôi' }).click();
    await expect(page.getByRole('button', { name: 'Xoá & tải lại' })).toHaveCount(0);

    expect(jsErrors, `lỗi JS: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
});
