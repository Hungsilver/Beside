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
