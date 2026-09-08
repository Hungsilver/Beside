# Trace: thanh tab & nút nổi góc dưới trôi mất khi cuộn dọc

Ngày: 2026-09-08 · File liên quan: `apps/web/src/components/ui.tsx`,
`apps/web/src/components/TabBar.tsx`, `apps/web/src/screens/CalendarScreen.tsx`,
`apps/web/e2e/app.spec.ts`

Báo lỗi từ chủ dự án: *"các nút chức năng góc dưới cùng màn hình chưa giữ cố định
khi scroll dọc"*.

---

## 0. Nguyên nhân

`TabBar` dùng `absolute inset-x-0 bottom-0`, nút ＋ của màn Lịch dùng
`absolute bottom-[calc(...)] right-5`.

`absolute` neo vào **phần tử tổ tiên gần nhất có `position` khác `static`**. Cả hai
nằm trong `<Screen>` (`ui.tsx`), mà `<Screen>` chỉ có `min-h-dvh` — **không được định
vị**. Không có tổ tiên nào được định vị, nên chúng neo vào **khối chứa ban đầu**:
một hình chữ nhật cao đúng một khung nhìn, đặt cố định ở **đầu tài liệu**.

Hệ quả: `bottom: 0` = đáy của khung nhìn **đầu tiên**, không phải đáy màn hình. Cuộn
xuống bao nhiêu pixel thì thanh tab trôi lên bấy nhiêu pixel.

Màn Bản đồ không dính lỗi vì nó không dùng `<Screen>`: khung ngoài là
`relative h-dvh overflow-hidden` — vừa được định vị, vừa không cuộn được.

**Cách sửa:** thêm `BottomLayer` ở `ui.tsx` — một lớp `fixed inset-x-0 bottom-0`
rộng tối đa 430px căn giữa (trùng cột nội dung của `<Screen>`), `pointer-events-none`
để không nuốt thao tác; `TabBar` và nút ＋ nằm trong lớp đó và tự bật
`pointer-events-auto`.

---

## 1. Trace tay — trước khi sửa

Khung nhìn đo thật: **390 × 664** (iPhone 14 trong Playwright; 664 là phần còn lại
sau thanh trình duyệt).

### TC-00 — Tái hiện lỗi: cuộn màn Trang chủ

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `Screen()` `ui.tsx:13` | — | khối `min-h-dvh`, `position: static` | không tạo khối chứa cho con `absolute` |
| 2 | `TabBar()` `TabBar.tsx:24` | — | `<nav absolute bottom-0>` neo vào **khối chứa ban đầu** | cao 664px, đặt tại đầu tài liệu |
| 3 | trình duyệt bố trí | nội dung cao 923px | đáy nav ở **y = 664** của tài liệu | đúng chỗ khi chưa cuộn |
| 4 | `window.scrollTo(0, 923)` | — | `scrollY = 259` | chạm đáy trang |
| 5 | đo `nav.getBoundingClientRect()` | — | đáy nav ở **y = 405** trong khung nhìn | 664 − 259 = 405 |

**Kỳ vọng:** đáy nav = 664 (đáy khung nhìn).
**Thực tế:** 405 — thanh tab nằm lửng giữa màn, hở 259px phía dưới.
**Kết luận:** ❌ ĐÚNG NHƯ BÁO CÁO.

Chốt lại bằng máy: viết `E2E-13` rồi chạy **trên bản build cũ chưa sửa** →
đỏ đúng ở dòng so sánh đáy nav với đáy khung nhìn (`app.spec.ts:330`).
Phép thử này đã được kiểm chứng là **đỏ được** trước khi được tin.

---

## 2. Trace sau khi sửa — số đo thật

Số dưới đây lấy bằng script đo trực tiếp trong Chromium 390×664, trên bản build
Docker thật qua Caddy HTTPS (không phải suy luận).

### TC-01 — Happy path: cuộn hết Trang chủ

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `BottomLayer()` `ui.tsx:37` | — | `div.fixed.inset-x-0.bottom-0`, `pointer-events-none` | neo vào khung nhìn, không phải tài liệu |
| 2 | `TabBar()` `TabBar.tsx:24` | — | `<nav>` `position: static` trong lớp đó, `pointer-events-auto` | phần tử `fixed` là **lớp bọc**, không phải nav |
| 3 | `window.scrollTo(0, 923)` | nội dung cao 923 | `scrollY = 259` | |
| 4 | đo | — | đáy nav = **664**, cao 75, rộng 390 | |

**Kỳ vọng:** đáy nav = 664. **Thực tế:** 664. **Kết luận:** ✅ ĐẠT

### TC-02 — Edge: trang cuộn ít (`/ky-niem`, cuộn 60px)

| Bước | Đầu vào | Trạng thái sau bước |
|---|---|---|
| 1 | nội dung cao 724, khung nhìn 664 | cuộn được 60px |
| 2 | cuộn hết | `scrollY = 60`, đáy nav = **664** |

**Kết luận:** ✅ ĐẠT

### TC-03 — Edge: màn KHÔNG cuộn được và có `overflow-hidden` (`/ban-do`)

Rủi ro thật: `MapScreen` bọc trong `relative h-dvh overflow-hidden`. Nếu tổ tiên có
`transform`/`filter`/`contain` thì nó sẽ trở thành khối chứa của phần tử `fixed`, và
`overflow-hidden` sẽ **cắt mất** thanh tab.

| Bước | Đầu vào | Trạng thái sau bước |
|---|---|---|
| 1 | mở `/ban-do` | `scrollHeight = 664 = innerHeight` → không cuộn được |
| 2 | đo | `scrollY = 0`, đáy nav = **664**, rộng 390 |

**Kỳ vọng:** không bị cắt, nằm đúng đáy. **Thực tế:** đúng — không tổ tiên nào có
`transform`. **Kết luận:** ✅ ĐẠT

### TC-04 — Edge: nút ＋ nổi của màn Lịch sau khi cuộn

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước |
|---|---|---|---|
| 1 | `CalendarScreen` `:194` | `<BottomLayer className="z-20">` | lớp `fixed`, z thấp hơn thanh tab (z-30) |
| 2 | cuộn hết `/lich` | `scrollY = 170` | |
| 3 | đo nút ＋ | — | đáy nút = **572** = 664 − 92 ✓; mép phải = **370** = 390 − 20 ✓ |
| 4 | bấm nút | — | mở được bảng thêm sự kiện |

**Kết luận:** ✅ ĐẠT — vẫn đúng khoảng cách 92px trên đáy như thiết kế cũ.

### TC-05 — Edge: màn hình rộng 1280×900 (cột 430px)

`fixed inset-x-0` mà không giới hạn bề rộng thì thanh tab sẽ kéo hết 1280px, lệch
hẳn với cột nội dung 430px của `<Screen>`.

| Bước | Đầu vào | Trạng thái sau bước |
|---|---|---|
| 1 | mở `/ky-niem` ở 1280×900, cuộn hết | |
| 2 | đo | `x = 425`, rộng **430**, đáy **900** |

425 = (1280 − 430) / 2 → căn giữa đúng cột. **Kết luận:** ✅ ĐẠT

*(Ghi chú: đây là thay đổi nhỏ về hình thức trên PC — trước kia thanh tab kéo hết
bề ngang. Ở khổ ≤430px thì không khác gì. Giao diện PC vẫn đang hoãn theo quyết
định ở `ARCHITECTURE.md` §10.)*

### TC-06 — Case lỗi: `pointer-events` chặn mất thao tác

Lớp `BottomLayer` phủ ngang toàn bộ đáy màn. Nếu quên `pointer-events-none` ở lớp
ngoài (hoặc quên `pointer-events-auto` ở con) thì thanh tab **không bấm được** —
một lỗi tệ hơn hẳn lỗi đang sửa.

| Bước | Đầu vào | Trạng thái sau bước |
|---|---|---|
| 1 | cuộn hết Trang chủ (`scrollY = 259`) | |
| 2 | bấm tab **Lịch** | điều hướng sang `/lich` ✓ |
| 3 | cuộn hết `/lich` rồi bấm nút ＋ | bảng thêm sự kiện mở ra ✓ |

**Kết luận:** ✅ ĐẠT — cả hai vẫn nhận thao tác sau khi cuộn.

### TC-07 — Edge: lớp phủ modal phải nằm TRÊN thanh tab

Thanh tab giờ là `fixed z-30`. Nếu bảng modal có z thấp hơn thì nó sẽ bị thanh tab
đè lên.

| Phần tử | z-index | Kết luận |
|---|---|---|
| `BottomLayer` mặc định (thanh tab) | 30 | |
| nút ＋ màn Lịch | 20 | dưới thanh tab ✓ (không chồng nhau trên thực tế) |
| `EventSheet`, lớp phủ của Mốc kỷ niệm & Địa điểm | 40 | trên thanh tab ✓ |
| `PlacePicker` | 50 | trên cùng ✓ |

**Kết luận:** ✅ ĐẠT — thứ tự chồng lớp không đổi so với trước khi sửa.

---

## 3. Cùng một lỗi ở bốn lớp phủ toàn màn hình — ĐÃ SỬA

Phát hiện trong lúc trace TC-07: `EventSheet.tsx:126`, `MilestonesScreen.tsx:208`,
`PlacesScreen.tsx:245`, `PlacePicker.tsx:30` đều là `absolute inset-0` — đúng gốc lỗi
của thanh tab, chỉ khác chỗ biểu hiện.

Chủ dự án yêu cầu sửa luôn. Sửa: `absolute` → `fixed`, và thêm
`mx-auto w-full max-w-[430px]` cho khung bảng để trùng cột nội dung khi màn rộng.

### TC-08 — Mở bảng thêm sự kiện sau khi đã cuộn

| Bước | Đầu vào | Trước khi sửa | Sau khi sửa |
|---|---|---|---|
| 1 | mở `/lich`, chưa cuộn | lớp phủ 0..664 ✓ | 0..664 ✓ |
| 2 | cuộn hết (`scrollY = 170`), bấm ＋ | lớp phủ **−170..494** ❌ | **0..664** ✅ |
| 3 | khung bảng | −90..494 (cắt đầu, hở 170px đáy) | 80..664, rộng 390 ✅ |

**Biểu hiện của lỗi cũ:** bảng lơ lửng giữa màn, hở một dải 170px ở đáy nhìn thấy
trang phía sau, phần đầu bảng bị đẩy lên khỏi khung nhìn.
**Kết luận:** ✅ ĐÃ SỬA

### TC-09 — Hai lớp phủ còn lại

| Màn | Thao tác | Kết quả sau khi sửa |
|---|---|---|
| `/ngay-yeu` (mốc kỷ niệm) | cuộn rồi mở bảng | lớp phủ **0..664**, khung 349..664 ✅ |
| `/dia-diem` (địa điểm) | mở bảng sửa một địa điểm | lớp phủ **0..664**, khung 80..664 ✅ |
| `PlacePicker` (chọn chỗ trên bản đồ) | — | cùng một dòng sửa; `E2E-10` vẫn xanh ✅ |

### TC-10 — Case lỗi: thứ tự chồng lớp sau khi đổi sang `fixed`

Rủi ro: `fixed` tách phần tử khỏi ngữ cảnh chồng lớp của khung cha. Nếu thanh tab
(`z-30`) nổi lên trên bảng modal thì người dùng bấm nhầm tab khi bảng đang mở.

| Phần tử | z-index | Sau khi sửa |
|---|---|---|
| thanh tab | 30 | dưới mọi bảng ✅ |
| `EventSheet` / mốc kỷ niệm / địa điểm | 40 | trên thanh tab ✅ |
| `PlacePicker` | 50 | trên cùng ✅ |

Không có tổ tiên nào của bốn lớp phủ có `transform`/`filter`/`contain` — đã kiểm —
nên `fixed` neo đúng vào khung nhìn. **Kết luận:** ✅ ĐẠT

Chốt bằng máy: **`E2E-14`** — cuộn hết màn Lịch, mở bảng, đòi lớp phủ phải nằm đúng
`0 .. innerHeight`. Nó cũng đòi trang thật sự cuộn được, để không xanh giả.

## 4. Bước 3 của R1 — kiểm thử tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | ✅ 3 workspace sạch |
| `npm run lint` | ✅ 0 lỗi (còn 2 cảnh báo `react-refresh` có từ trước, ở file không đụng tới) |
| `npm test` | ✅ 277 test (173 + 71 + 33) |
| `npm run e2e` | ✅ 22 test, gồm `E2E-13` mới |

`E2E-13` chạy trên **bản build cũ trước khi sửa → ĐỎ**, sau khi build lại với bản
sửa → **XANH**. Nó cũng tự chốt rằng trang thật sự cuộn được, để không xanh giả trên
một màn ngắn.

**Chưa làm được:** bấm thử trên iPhone/Android thật. `env(safe-area-inset-bottom)`
trong Chromium luôn bằng 0 nên phần đệm đáy đo được là `max(0, 20px) = 20px`; trên
iPhone có thanh gạt, giá trị thật sẽ lớn hơn và chỉ máy thật mới xác nhận được.
