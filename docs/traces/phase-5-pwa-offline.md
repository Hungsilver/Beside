# Trace: Phase 5 — PWA offline

- **Ngày:** 2026-09-08
- **Phạm vi:** điều hướng dự phòng, cache dữ liệu đọc, xoá cache khi đăng xuất
- **File liên quan:** `apps/web/src/sw.ts`, `apps/web/src/lib/auth-context.tsx`,
  `apps/web/playwright.config.ts`, `apps/web/e2e/offline.spec.ts`
- **Cách chạy:** `npx playwright test -c apps/web/playwright.config.ts --project=offline`
  — 4 test

---

## 1. Ba mức offline, và mức nào đã làm

| Mức | Nghĩa là | Trạng thái |
|---|---|---|
| **1. Vỏ app** | mất mạng vẫn mở được app, kể cả đường dẫn con | ✅ **xong** |
| **2. Dữ liệu đã xem** | thấy lại số ngày yêu, lịch, kỷ niệm | ❌ **chưa làm được** — §4 |
| **3. Hàng đợi ghi** | viết offline, có mạng thì tự gửi | ⛔ cố tình không làm |

Mức 3 bị loại có chủ ý: check-in có ảnh, phải giữ file trong IndexedDB, gửi lại,
xử lý trùng lặp — nhiều việc, mà tình huống "đăng ảnh giữa lúc mất mạng" hiếm
hơn hẳn "mở app xem người ấy ở đâu".

---

## 2. Đã làm gì

### 2.1 Điều hướng dự phòng — một lỗi thật đã có sẵn trong code

Đây là SPA: mọi đường dẫn phải trả về `index.html`. Khi còn dùng `generateSW`,
plugin tự lo phần này. Chuyển sang `injectManifest` ở Phase 4 (để viết được
handler `push`) thì **mất luôn** — nghĩa là mở thẳng `/lich` lúc offline sẽ trả
về lỗi của trình duyệt.

Lỗi này **im lặng suốt từ Phase 4**: online không lộ ra vì nginx đã lo SPA
fallback. Chỉ mất mạng mới thấy.

### 2.2 Cache dữ liệu đọc

`NetworkFirst` cho `GET /api/v1/*`, **trừ ba nhóm**:

| Loại trừ | Lý do |
|---|---|
| `/locations/*` | ARCHITECTURE.md chốt từ Phase 2: vị trí phải luôn mới nhất. Hiện vị trí cũ khi mất mạng dễ làm người ta tin nhầm "người ấy đang ở đó" — thứ nguy hiểm nhất để hiểu sai trong app này |
| `/auth/*` | token lấy từ kho cũ thì vô nghĩa |
| `/push/*` | đăng ký thiết bị cũng vậy |

### 2.3 Đăng xuất thì xoá sạch kho cache

Dữ liệu riêng tư của một cặp đôi không nên nằm lại trên máy sau khi họ chủ động
thoát. App gửi `CLEAR_API_CACHE` cho service worker; mọi lỗi đều bị nuốt để máy
không có service worker vẫn đăng xuất được.

---

## 3. Kết quả

| Mã | Tình huống | Kết quả |
|---|---|---|
| OF-01 | Service worker thật sự điều khiển trang | ✅ |
| OF-02 | **Mất mạng: mở thẳng `/lich` vẫn ra HTML của app** | ✅ |
| OF-03 | Kho cache **có** dữ liệu đọc và **không** có `/locations/*` hay `/auth/*` | ✅ |
| OF-04 | Đăng xuất → kho `beside-api` rỗng | ✅ |

**4/4** · Toàn bộ E2E: **21/21** (17 mobile + 4 offline).

### Kiểm chứng OF-02 có đỏ được không

Gỡ `NavigationRoute` khỏi `sw.ts`, build lại, dựng lại container → **OF-02 đỏ**.
Khôi phục → 4/4.

### Một rào cản của môi trường, đã vượt được

Chromium **từ chối đăng ký service worker** trên chứng chỉ CA nội bộ của Caddy
(đo được: `hasSW = false`). Nghĩa là mọi bộ E2E trước đây chạy **không có service
worker** — phần offline không kiểm được ở local.

Cách vượt: nhóm `offline` trong `playwright.config.ts` khởi động Chromium với
`--ignore-certificate-errors`. Chỉ bật cho nhóm này; các nhóm khác vẫn chạy
không có service worker để cache không làm chúng thấy dữ liệu cũ.

---

## 4. Mức 2 CHƯA LÀM ĐƯỢC — và vì sao

Mở app khi mất mạng vẫn ra **màn đăng nhập**, không phải dữ liệu.

**Nguyên nhân gốc:** access token nằm trong RAM, mất khi tải lại trang. Khôi phục
phiên phải gọi `/auth/refresh` — một request mạng. Mất mạng thì nó hỏng, app coi
như chưa đăng nhập và đá về `/dang-nhap`. Vỏ app tải được nhưng chẳng vào tới đâu.

### Đã thử, và đã gỡ bỏ

Tôi có làm một bản: phân biệt **lỗi mạng** với **lỗi xác thực**, và khi là lỗi
mạng thì dựng lại giao diện từ hồ sơ lưu trong `localStorage` (chỉ hồ sơ, không
có token — mọi thao tác ghi vẫn hỏng).

Nó **không chạy được** trong môi trường kiểm thử, vì một chi tiết đo được:

> `context.setOffline()` của Playwright **không chặn fetch do service worker phát
> ra**. Request vẫn tới server thật, mà lúc đó app không có access token, nên
> `/couples/me` trả **401** — và 401 là một phán quyết xác thực thật, khiến app
> tự đăng xuất. Đây là tình huống không bao giờ xảy ra khi mất mạng thật.

Tôi thử vòng thứ hai: tắt hẳn container API để Caddy trả 502 thay vì 401, và mở
rộng phép nhận diện lỗi mạng sang 502/503/504. Vẫn chưa xanh.

**Quyết định: gỡ bỏ phần đó.** Lý do:

1. Nó **đụng tới mô hình xác thực** — thứ nhạy cảm nhất trong dự án này.
2. Tôi **không chứng minh được nó chạy**. Cả phiên làm việc này xây trên nguyên
   tắc "không tin một chốt cho tới khi thấy nó đỏ được"; ship một thay đổi liên
   quan bảo mật mà chưa kiểm chứng thì đi ngược lại chính nguyên tắc đó.
3. Nó là một **quyết định của chủ dự án**, không phải của tôi: "người cầm được
   máy đang mở khoá thì thấy được dữ liệu đã cache" là một đánh đổi cần được
   đồng ý tường minh.

Phần đã giữ lại (điều hướng dự phòng, cache, xoá khi đăng xuất) **độc lập** với
thay đổi đó và tự nó đã đúng.

---

## 5. Ba lần dính bẫy trong lượt này

### L35 — Giấu output build nên không biết build đã hỏng

Tôi chèn một dòng log gỡ rối có **ký tự xuống dòng thật** trong chuỗi JS → lỗi
cú pháp → `npm run build` chết. Nhưng tôi chạy `npm run build >/dev/null 2>&1`,
nên container nhận **bản build cũ**, và tôi ngồi phân tích log của một bản mã
không phải bản mình vừa sửa. Mất ba vòng lặp vì chuyện này.

Đây là lần thứ hai trong ngày (lần trước: phá `MapScreen` để thử chốt E2E, `tsc`
báo lỗi biến thừa, build không chạy, test xanh trên image cũ).

**Quy tắc rút ra: không bao giờ nén output của lệnh build.** Phải nhìn thấy dòng
`✓ built in ...` rồi mới tin bất kỳ kết quả nào sau đó.

### L36 — Sửa file bằng `replace` mà không `assert`

Hai dòng log tôi tưởng đã chèn thực ra không khớp chuỗi và bị bỏ qua im lặng, nên
tôi kết luận sai về nhánh nào đã chạy. Mọi phép sửa file bằng script từ nay đều
phải `assert` là chuỗi cần thay có tồn tại.

### L37 — Hạn mức đăng nhập lại chặn chính bộ test

Chạy quá nhiều lượt probe làm cạn hạn mức 10 lần/5 phút, khiến hai bộ E2E đỏ
oan. Giống hệt L27 và đúng thứ đã ghi trong chú thích đầu `app.spec.ts` — vậy mà
vẫn dính, vì lần này thủ phạm là các lượt probe tạm chứ không phải bản thân bộ
test. Khắc phục: khởi động lại API trước mỗi lượt chạy sạch.

---

## 6. Còn thiếu

- **Mức 2 (xem dữ liệu khi offline)** — xem §4. Cần chủ dự án quyết định về đánh
  đổi bảo mật trước khi làm lại.
- **Chưa thử trên máy thật.** Toàn bộ đo đạc ở đây chạy trên Chromium với cờ bỏ
  qua lỗi chứng chỉ. Trên production có Let's Encrypt thật thì service worker
  đăng ký bình thường, nhưng chưa ai kiểm chứng.
- **Chưa có màn hình báo "đang xem bản offline"** — người dùng không biết dữ liệu
  mình thấy là cũ hay mới.
- **Chưa xử lý cập nhật service worker.** `registerType: 'prompt'` nghĩa là bản
  mới chờ người dùng đồng ý, nhưng chưa có giao diện nào hỏi câu đó.
