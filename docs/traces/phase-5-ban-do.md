# Trace: Phase 5 — Địa điểm & ảnh check-in trên bản đồ

- **Ngày:** 2026-09-08
- **Phạm vi:** vẽ hàng rào địa điểm, ghim ảnh check-in, chọn toạ độ bằng cách
  chạm lên bản đồ
- **File liên quan:**
  `packages/shared/src/geo.ts` (`circlePolygon`),
  `apps/web/src/components/CoupleMap.tsx`,
  `apps/web/src/components/PlacePicker.tsx`,
  `apps/web/src/screens/MapScreen.tsx`, `apps/web/src/screens/PlacesScreen.tsx`,
  `scripts/seed-demo.mjs`
- **Cách chạy:** `npm run e2e` — 15 test (3 test mới). Kèm **7 unit test** cho
  `circlePolygon`.

---

## 1. Ba mục BACKLOG được đóng

| Mục | Mức | Trạng thái |
|---|---|---|
| Ảnh check-in đã lưu toạ độ nhưng **chưa hiện lên bản đồ** | Trung bình | ✅ |
| Hàng rào và ghim địa điểm **chưa vẽ lên `MapScreen`** | Trung bình | ✅ |
| **Chưa chọn được địa điểm trên bản đồ** — mới lưu được "chỗ tôi đang đứng" | Cao | ✅ |

---

## 2. Vòng tròn hàng rào phải là ĐA GIÁC, không phải lớp `circle`

Lớp `circle` của MapLibre nhận bán kính tính bằng **pixel**. Hàng rào 150 m là
một khoảng cách **thật ngoài đời** — phóng to thu nhỏ mà vòng tròn giữ nguyên
kích thước trên màn hình thì nó sai hoàn toàn.

Cách đúng: dựng một đa giác theo toạ độ địa lý. `circlePolygon` trong
`packages/shared/src/geo.ts` tính theo công thức "điểm đến từ một điểm, một
hướng và một khoảng cách" trên hình cầu — hàm **thuần**, 7 unit test:

| Test | Bắt được điều gì |
|---|---|
| Mọi điểm trên vành cách tâm đúng bán kính (sai lệch < 0,5 m) | công thức đúng |
| **Đúng cả ở vĩ độ cao** (thử ở Hà Nội, sai lệch < 1 m) | ai đó "làm cho nhanh" bằng cách cộng thẳng độ vào lat/lng sẽ làm vòng tròn méo thành elip |
| Vành khép kín | GeoJSON Polygon bắt buộc điểm cuối trùng điểm đầu |
| Kinh độ luôn trong `[-180, 180]` | vòng tròn vắt qua kinh tuyến 180 sẽ vẽ ra một vệt vòng quanh Trái Đất nếu không chuẩn hoá |
| Số cạnh bị kẹp `[8, 256]` | quá ít thì thô, quá nhiều thì tốn công vẽ |
| Bán kính 0 / âm / `NaN`, toạ độ vô nghĩa | trả mảng rỗng, không ném lỗi |

Lớp hàng rào được chèn **ngay dưới** lớp vệt đường, để đường đi không bị nền
hàng rào che.

---

## 3. Làm sao kiểm được thứ MapLibre vẽ vào canvas

Hàng rào và nhãn địa điểm được vẽ vào **canvas**, không phải DOM — không có
selector nào chạm tới được. Nếu chỉ kiểm "khung bản đồ có tồn tại không" thì
gỡ sạch dữ liệu địa điểm đi test vẫn xanh.

Cách giải: `CoupleMap` phơi ra hai thuộc tính trên thẻ chứa —
`data-places` và `data-photo-pins` — nói ra nó **nhận được** bao nhiêu. E2E đối
chiếu con số đó với dữ liệu thật, và tiện cả lúc gỡ lỗi bằng DevTools.

**E2E-08 đối chiếu chéo giữa hai màn**: đếm địa điểm ở màn Địa điểm, rồi đòi
bản đồ nhận đúng bấy nhiêu. Không gọi API thẳng từ trong trang được — access
token nằm trong bộ nhớ của app chứ không phải cookie, `fetch` trần sẽ nhận 401.

---

## 4. Kết quả

| Mã | Tình huống | Kết quả |
|---|---|---|
| E2E-08 | Số hàng rào trên bản đồ **khớp** với danh sách ở màn Địa điểm | ✅ |
| E2E-09 | Ghim ảnh check-in hiện trên bản đồ, đủ to để chạm (≥ 40px) | ✅ |
| E2E-10 | Chọn địa điểm bằng cách chạm bản đồ: nút **Chọn** khoá khi chưa đặt ghim → chạm → hiện toạ độ → mở khoá → Huỷ thì không lưu gì | ✅ |

**15/15 E2E** · **7 unit test mới** cho `circlePolygon` · typecheck + ESLint sạch
· 277 unit test toàn dự án.

### Kiểm chứng ba chốt mới có ĐỎ được không

Gỡ `places` và `photoPins` khỏi lời gọi `CoupleMap`, build lại, dựng lại container:

| | Bản đúng | Bản đã gỡ dữ liệu |
|---|---|---|
| E2E-08 | ✅ | ❌ **bắt được** |
| E2E-09 *(chạy riêng, vì serial mode bỏ qua sau khi E2E-08 hỏng)* | ✅ | ❌ **bắt được** |

Khôi phục → 15/15, `git diff` rỗng.

> **Lần thử đầu tiên KHÔNG hợp lệ.** Tôi gỡ dữ liệu bằng cách đổi tên biến thành
> `_unusedPlaces`, làm `tsc` báo lỗi biến thừa → `npm run build` chết → image web
> **không được dựng lại** → E2E vẫn chạy trên bản cũ và báo 15/15 xanh. Suýt nữa
> thì kết luận "chốt không đỏ được" trong khi thật ra chốt chưa hề được thử.
> Phải nhìn dòng `✓ built in ...` rồi mới tin kết quả.

---

## 5. Lỗi & bẫy trong lượt này

### L32 — Ref dùng làm điều kiện của effect (bắt được ở bước tự rà, chưa từng lộ ra)

> Nói rõ: lỗi này **không** quan sát thấy trên màn hình. Tôi nhận ra lúc đang
> viết chính đoạn code đó — đây là bước 1 của R1 (đọc lại code), không phải phát
> hiện từ chạy thử. Ghi lại vì cái bẫy này lặp lại được.

- **Sai:** effect vẽ hàng rào bắt đầu bằng `if (!map || !readyRef.current) return`.
  `readyRef` là một **ref**, đổi giá trị không làm React chạy lại effect. Nếu dữ
  liệu địa điểm về **trước** khi MapLibre bắn sự kiện `load` — chuyện hoàn toàn
  bình thường với cache của TanStack Query — thì effect sẽ thoát ra im lặng và
  không bao giờ chạy lại. Hàng rào không hiện, không lỗi, không dấu vết.
- **Sửa:** thêm `mapReadyTick` (state, tăng lúc `load`) vào mảng phụ thuộc của
  cả effect hàng rào lẫn effect vệt đường. Ref dùng để **đọc** trong callback,
  state dùng để **kích hoạt** render — lẫn hai vai trò là mầm lỗi.

### L33 — Selector marker sai vì đoán sai cấu trúc DOM của MapLibre

- **Sai:** E2E tìm `.maplibregl-marker button[aria-label]`.
- **Thật:** MapLibre gắn class `maplibregl-marker` lên **chính thẻ mình truyền
  vào**, không bọc thêm thẻ ngoài. Ghim ảnh là `button.maplibregl-marker`.
- **Sửa:** viết một test dò tạm để in ra `tagName + className` thật của mọi
  marker, đọc kết quả rồi mới sửa selector. Đoán thì nhanh nhưng sai; dò thì
  mất 30 giây và đúng.

### L34 — `count()` của Playwright không tự chờ

- **Sai:** `await page.locator(...).count()` ngay sau `goto` luôn trả 0 vì danh
  sách còn đang tải. Khác với `expect(...)`, `count()` **không** có auto-wait.
- **Sửa:** `await expect(items.first()).toBeVisible()` trước rồi mới đếm.

---

## 6. Đã tự rà (checklist R1 bước 1)

- **Null/undefined:** `places` và `photoPins` đều tuỳ chọn; bài không có ảnh
  hoặc không có toạ độ bị lọc ra trước khi dựng ghim.
- **Kiểu dữ liệu:** không có `any`.
- **Biên:** `circlePolygon` xử lý bán kính 0/âm/`NaN`, toạ độ vô nghĩa, và kinh
  tuyến 180. Ghim ảnh **giới hạn 40 cái** — nhiều hơn thì bản đồ rối và tốn data.
- **Async:** ảnh ghim tải bằng `fetch` + blob URL (như `AuthedImage`); kiểm
  `el.isConnected` trước khi gán, phòng trường hợp marker đã bị gỡ lúc đang chờ mạng.
- **Dọn dẹp:** blob URL của ghim ảnh được thu hồi qua `MutationObserver` theo dõi
  lúc marker rời DOM — MapLibre không báo sự kiện nào khi gỡ marker. Marker ảnh
  cũng được xoá trong hàm dọn dẹp của effect khởi tạo.
- **Callback cũ:** `onPickPoint` và `onPhotoPinClick` giữ trong ref, vì listener
  của MapLibre chỉ gắn **một lần** — bắt thẳng prop vào đó sẽ đóng băng ở giá trị
  của lần render đầu (đúng bẫy L21).
- **Bấm nhầm:** cú bấm vào ghim ảnh gọi `stopPropagation`, nếu không thì ở chế độ
  chọn toạ độ sẽ vừa mở ảnh vừa đặt một điểm mới.
- **Quyền:** không thêm đường ra dữ liệu nào; ảnh vẫn đi qua `/posts/photos/...`
  và bị kiểm quyền từng lượt như Phase 3.

---

## 7. Dữ liệu demo

`npm run seed:demo` giờ tạo thêm **2 địa điểm** (Nhà em 150 m · Công ty anh
200 m) và **1 khoảnh khắc có ghim toạ độ** với ảnh sinh tại chỗ bằng sharp. Mở
tab Bản đồ là thấy ngay, không phải tự nhập. Chạy lại nhiều lần không đẻ ra bản
trùng.

---

## 8. Còn thiếu

- **Chưa xem được ảnh ngay trên bản đồ.** Bấm ghim hiện đưa sang màn Kỷ niệm chứ
  chưa mở ảnh tại chỗ.
- **Chưa lọc được ghim ảnh theo thời gian.** Đang lấy 40 bài mới nhất có toạ độ;
  chưa có "chỉ xem tháng này".
- **Chưa chỉnh bán kính ngay trên bản đồ** — phải sang bước đặt tên mới kéo được
  thanh trượt, nên không thấy trước hàng rào rộng cỡ nào so với con đường thật.
- **Chưa chạy `npm run verify:local` sau lượt này.** Thay đổi nằm ở web và một
  hàm thuần **cộng thêm** vào `shared` (không sửa hàm cũ), và đã chạy typecheck +
  ESLint + 277 unit test + 15 E2E. Nhưng 8 bộ trace API thì chưa chạy lại.
