# Trace: Dựng E2E trình duyệt thật ở 390×844

- **Ngày:** 2026-09-08
- **Vì sao làm:** lỗi khung bản đồ cao 0px (`fix-ban-do-khong-hien.md`) làm **cả
  tính năng bản đồ vô hình**, trong khi typecheck, ESLint, 270 unit test và 247
  case trace **đều xanh**. Không có công cụ nào trong dự án nhìn thấy bố cục thật.
- **File liên quan:** `apps/web/playwright.config.ts`, `apps/web/e2e/app.spec.ts`,
  `scripts/verify-local.mjs`
- **Cách chạy:** `npm run e2e` — 12 test, ~11 giây. Đã gắn vào `verify:local` mục 4.

---

## 1. Phạm vi — và cố ý KHÔNG làm gì

Bộ E2E này **không** kiểm nghiệp vụ. 247 case trace đã làm việc đó qua HTTP, và
làm kỹ hơn nhiều. Nó chỉ trả lời đúng những câu mà **chỉ trình duyệt mới trả lời
được**:

| Câu hỏi | Test |
|---|---|
| Khung bản đồ có kích thước thật không? | E2E-04, 05, 06 |
| Có màn nào tràn ngang ở 390px không? | E2E-02 |
| Vùng chạm có đủ 44px không (R2)? | E2E-03 |
| Màn nào dựng ra trang trắng vì lỗi JS không? | E2E-07 (6 màn) |

Chạy trên **Chromium**, không phải WebKit: câu hỏi ở đây là về bố cục, và
Chromium trả lời chính xác như nhau mà nhẹ hơn nhiều (91 MB thay vì thêm ~90 MB
nữa). Đổi lại, nó **không thay được** việc bấm thử trên Safari thật — Web Push
trên iOS, ô `<input type="date">`, thanh địa chỉ co giãn vẫn nằm trong danh sách
phải bấm tay.

---

## 2. Hai chốt bảo mật của app chống lại cách viết E2E thông thường

Đây là phần mất nhiều thời gian nhất, và cả hai đều là **hành vi đúng của sản
phẩm** — bộ test phải thích nghi, không phải ngược lại.

### 2.1 Hạn mức đăng nhập

`/auth/login` giới hạn **10 lần / 5 phút / IP**. Cách viết thông thường —
mỗi test tự đăng nhập — làm các test cuối nhận 429 và **báo đỏ oan**. Đúng loại
lỗi đã gặp ở trace L27 (hạn mức vị trí chặn ping của bộ trace).

### 2.2 Refresh token xoay vòng + phát hiện tái sử dụng

Cách khắc phục quen thuộc là `storageState`: đăng nhập một lần, lưu cookie, mỗi
test mở context mới dùng lại. **Không dùng được ở đây.**

Access token nằm trong bộ nhớ, phiên được khôi phục qua cookie refresh. Mỗi
context mới khởi động sẽ gọi `/auth/refresh`. Token refresh **xoay vòng**, và
dùng lại một token đã xoay bị coi là **token bị đánh cắp** → thu hồi **cả
family** (tính năng từ Phase 1, trace TC-24/TC-25).

Triệu chứng quan sát được: 3 test đầu xanh, **10 test sau mất phiên sạch**.

**Cách làm đúng:** một `beforeAll` đăng nhập đúng một lần, giữ **một context**
cho cả file, `mode: 'serial'`. Đơn giản hơn `storageState` và tôn trọng đúng mô
hình bảo mật của app.

### 2.3 Service worker và chứng chỉ nội bộ

Caddy cấp chứng chỉ bằng CA nội bộ cho `localhost`. `ignoreHTTPSErrors` của
Playwright áp cho request của trang nhưng **không** áp cho lượt tải script
service worker — trình duyệt kiểm chứng chỉ bằng đường riêng và từ chối.

Đây là chuyện của môi trường test, không phải lỗi sản phẩm (production dùng
Let's Encrypt thật). Đã lọc riêng lỗi đó bằng một regex hẹp kèm giải thích,
**không** tắt toàn bộ việc bắt lỗi JS.

---

## 3. Kiểm chứng: chốt này có ĐỎ được không

Đây là phần quan trọng nhất, và là bài học vừa rút ra ở L31 (`npm run lint`
thoát 0 suốt bốn phase mà không kiểm gì).

**Cách kiểm:** đưa `CoupleMap.tsx` trở lại đúng dạng có lỗi, build lại web,
dựng lại container, chạy E2E.

```tsx
// dạng CÓ LỖI, tạm đưa lại để thử
return <div ref={containerRef} className="absolute inset-0" aria-label="Bản đồ" />;
```

| | Bản đã sửa | Bản có lỗi |
|---|---|---|
| E2E-04 khung bản đồ | ✅ | ❌ **bắt được** |
| E2E-05 canvas | ✅ | ⏭ (bỏ qua, cùng nhóm serial) |
| E2E-06 computed style | ✅ | ⏭ |
| Các test khác | ✅ | ✅ |

Sau đó khôi phục nguyên trạng và chạy lại: **12/12 xanh**, `git diff` rỗng.

Vậy chốt này **không phải là một dòng chữ xanh vô nghĩa**.

---

## 4. Kết quả

| Mã | Tình huống | Kết quả |
|---|---|---|
| E2E-01 | Vào được app, trang chủ dựng đủ | ✅ |
| E2E-02 | Không tràn ngang ở cả 6 màn | ✅ |
| E2E-03 | Vùng chạm thanh tab ≥ 44px | ✅ |
| E2E-04 | **Khung bản đồ có kích thước thật** | ✅ |
| E2E-05 | MapLibre dựng được canvas | ✅ |
| E2E-06 | Computed style không phải `0px` | ✅ |
| E2E-07 | 6 màn dựng được nội dung thật, không lỗi JS | ✅ ×6 |

**Tổng: 12/12 ✅** trong ~11 giây.

`npm run verify:local` → **38/38 mục đạt** (thêm mục "E2E trình duyệt thật
390×844" vào phần 4).

---

## 5. Còn thiếu

- **Chưa chạy trên WebKit/Safari** — xem lý do ở §1. iPhone thật vẫn phải bấm tay.
- **Chưa test luồng có tương tác**: đăng ảnh, tạo sự kiện, bật thông báo. Bộ này
  mới chỉ mở màn và đo. Thêm được, nhưng mỗi luồng tương tác cần dữ liệu dọn dẹp
  sau đó — chưa làm.
- **Chưa test hai người cùng lúc** (An và Bình nhìn thấy nhau di chuyển). Cần hai
  context song song, mà điều đó lại đụng đúng vấn đề §2.2.
- **Chưa có CI** nên bộ này chỉ chạy khi ai đó gõ `npm run verify:local`.
- Ảnh chụp màn hình khi hỏng được lưu ở `apps/web/test-results/` (đã gitignore).
