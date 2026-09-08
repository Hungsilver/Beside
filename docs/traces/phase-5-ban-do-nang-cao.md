# Trace: Bản đồ nâng cao — đổi loại bản đồ · ẩn/hiện ghim ảnh · bảng thông tin kéo được

Ngày: 2026-09-08 · File liên quan:
`apps/web/src/lib/map-styles.ts`, `apps/web/src/components/CoupleMap.tsx`,
`apps/web/src/components/MapControls.tsx`, `apps/web/src/components/DraggableSheet.tsx`,
`apps/web/src/screens/MapScreen.tsx`

Phạm vi: 3 trong 4 yêu cầu của chủ dự án. Hai chỗ vướng — **lớp giao thông** và
**chỉ đường thời gian thực** — chủ dự án yêu cầu bỏ qua, đã ghi vào `docs/BACKLOG.md`.

---

## TC-01 — Happy path: đổi từ Đường phố sang Vệ tinh, hàng rào địa điểm vẫn còn

Dữ liệu giả định: 2 địa điểm (`Nhà· r=150m`, `Công ty· r=200m`), 3 ảnh check-in.

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `readSavedStyle()` :103 | localStorage rỗng | `'street'` | mặc định |
| 2 | `new maplibregl.Map` :132 | `style: styleSourceFor('street')` | chuỗi URL demotiles | |
| 3 | `map.on('load')` :153 | — | `readyRef=true`, `installLayers(map,'street')`, tick `0→1` | |
| 4 | effect địa điểm :281 | `places.length=2` | `source('places').setData(2 feature)`, `paintedPlaces=2` | `data-places="2"` |
| 5 | bấm 🗺️ → `Vệ tinh` | `onStyleChange('satellite')` | `setStyleId`, `saveStyle('satellite')` | ghi localStorage |
| 6 | effect đổi style :250 | `styleId='satellite'` | `map.setStyle(<StyleSpecification Esri>)` | **xoá sạch source/layer của mình** |
| 7 | `map.on('styledata')` :166 | style mới nạp xong | `getSource('places')` → `undefined` ⇒ `installLayers(map,'satellite')`; tick `1→2` | |
| 8 | effect địa điểm :281 (chạy lại do tick) | `places.length=2` | `paintedPlaces=2` | `data-places="2"` |

**Kỳ vọng:** đổi nền sang ảnh vệ tinh, 2 hàng rào và vệt đường vẫn hiển thị,
nhãn địa điểm đổi sang chữ trắng viền đen (`isDarkStyle('satellite') === true`).
**Thực tế:** đúng như trên. E2E `MC-01` khẳng định `data-places` vẫn khác 0 sau khi đổi.
**Kết luận:** ✅ ĐẠT

---

## TC-02 — Edge: dữ liệu địa điểm về TRƯỚC khi bản đồ `load`

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | effect địa điểm :259 | `places=[2]`, `readyRef=false` | thoát sớm | chưa vẽ gì |
| 2 | `map.on('load')` :153 | — | `installLayers`, tick `0→1` | |
| 3 | effect địa điểm chạy lại | dep `mapReadyTick` đổi | `paintedPlaces=2` | |

**Kỳ vọng:** không mất hàng rào chỉ vì API nhanh hơn MapLibre.
**Thực tế:** đúng — đây chính là lý do `mapReadyTick` tồn tại từ Phase 5 đợt trước.
**Kết luận:** ✅ ĐẠT

---

## TC-03 — Edge: `styledata` bắn nhiều lần, không được `addSource` trùng

`styledata` không chỉ bắn khi đổi style — nó bắn cả khi dữ liệu một nguồn thay đổi.
Gọi `addSource('places')` lần hai ⇒ MapLibre ném lỗi *"There is already a source with ID"*.

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `styledata` lần 1 :166 | sau `setStyle` | `getSource('places')` `undefined` ⇒ dựng lại | |
| 2 | `source.setData(...)` :280 | 2 feature | MapLibre bắn `styledata` lần 2 | |
| 3 | `styledata` lần 2 :166 | — | `getSource('places')` **có** ⇒ **không** gọi `installLayers` | chỉ tăng tick |

**Kỳ vọng:** không ném lỗi, không dựng lớp chồng lớp.
**Thực tế:** đúng. Điều kiện `if (!map.getSource('places'))` chặn được.
**Kết luận:** ✅ ĐẠT

---

## TC-04 — Edge: chưa có ảnh check-in nào thì không hiện nút ẩn/hiện

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `MapControls` :67 | `photoPinCount=0` | `{photoPinCount > 0 && ...}` → không render | |
| 2 | — | — | cụm nút chỉ còn 🗺️ và 👥 | |

**Kỳ vọng:** cặp đôi mới dùng app, chưa check-in lần nào, không thấy một nút vô nghĩa.
**Thực tế:** đúng.
**Kết luận:** ✅ ĐẠT

---

## TC-05 — Edge: vuốt ngắn hơn ngưỡng thì KHÔNG đổi nấc

Vuốt 20px là run tay lúc chạm, không phải ý định đổi nấc.

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `onPointerDown` :69 | `clientY=600` | `startYRef=600` | bắt con trỏ |
| 2 | `onPointerMove` :75 | `clientY=620` | `dragOffset=20` | kẹp trong [-90, 90] |
| 3 | `onPointerUp` :81 | `delta=20` | `20 < 44` ⇒ `return` | nấc giữ nguyên |
| 4 | `onPointerMove` | `clientY=520` | `dragOffset=-80` | kéo LÊN |
| 5 | `onPointerUp` :85 | `delta=-80` | `|−80| ≥ 44` ⇒ `move(+1)`: `half → full` | |

**Kỳ vọng:** ngưỡng 44px lọc được chạm nhầm; kéo lên là mở rộng, kéo xuống là thu gọn.
**Thực tế:** đúng.
**Kết luận:** ✅ ĐẠT

---

## TC-06 — Edge: nấc `full` rồi bấm thanh nắm thì quay về `collapsed`

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `onClick` :113 | `snap='full'` | `move(-2)`: `i=2`, `2−2=0` → `'collapsed'` | vòng lại đầu |
| 2 | `onClick` :113 | `snap='collapsed'` | `move(+1)` → `'half'` | |
| 3 | `move(+1)` :65 | `snap='full'` | `min(2, 2+1)=2` → vẫn `'full'` | không tràn mảng |

**Kỳ vọng:** bấm liên tục không bao giờ ra `undefined` (chỉ số ngoài mảng).
**Thực tế:** đúng, `Math.min`/`Math.max` kẹp hai đầu, thêm `if (next)` chặn nốt.
**Kết luận:** ✅ ĐẠT

---

## TC-07 — Case lỗi: `localStorage` ném lỗi (chế độ ẩn danh / chặn dữ liệu trang)

Safari chế độ Riêng tư và Chrome khi chặn cookie bên thứ ba đều làm `localStorage`
**ném lỗi** chứ không trả `null`. Không bọc thì cả màn bản đồ trắng xoá.

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `readSavedStyle()` :107 | `getItem` ném `SecurityError` | `catch` → `'street'` | |
| 2 | `readSavedPhotoPins()` :124 | ném lỗi | `catch` → `true` | mặc định BẬT |
| 3 | `readSavedSnap()` :37 | ném lỗi | `catch` → `'half'` | |
| 4 | `saveStyle('satellite')` :115 | `setItem` ném lỗi | `catch` → bỏ qua | không nhớ được, nhưng **không sập** |
| 5 | người dùng đổi sang Vệ tinh | — | đổi ngay trong phiên | tải lại thì về Đường phố |

**Kỳ vọng:** mất tính năng ghi nhớ, không mất bản đồ.
**Thực tế:** đúng — cả 6 hàm đọc/ghi đều bọc `try/catch`.
**Kết luận:** ✅ ĐẠT

---

## Kiểm chứng test có ĐỎ được không

Quy tắc của dự án: một cái test chưa từng đỏ thì chưa chứng minh được điều gì.
Mỗi test mới đều bị phá có chủ đích một lần rồi mới tin.

| Test | Phá cái gì | Kết quả |
|---|---|---|
| MC-01 | bỏ `installLayers` trong `styledata` (lớp mất sau khi đổi style) | ✅ đỏ |
| MC-02 | `saveStyle()` không ghi localStorage | ✅ đỏ |
| MC-03 | `MapScreen` truyền `photoPins` bất kể công tắc | ✅ đỏ |
| MC-04 | `move()` không đổi nấc | ✅ đỏ |
| MC-04 | (đỏ thật, không phải phá thử) thanh nắm cao 22px < 44px | ✅ đỏ ⇒ đã sửa thành `min-h-11` |

### Một lỗi thật do vòng kiểm chứng này lôi ra

Lần phá đầu tiên, **MC-01 vẫn xanh** dù lớp đã biến mất khỏi bản đồ.
Nguyên nhân: `data-places` lấy thẳng `places?.length` từ prop — nó nói "API trả
về mấy địa điểm", không nói "bản đồ có vẽ không". Cái test đó vô dụng ngay từ đầu.

Đã sửa: `data-places` / `data-photo-pins` giờ lấy từ `paintedPlaces` :281 và
`paintedPins` :320 — chỉ được đặt sau khi đã thật sự chạm vào `getSource('places')`
và `photoMarkersRef`. Kèm theo, `styledata` :166 tăng `mapReadyTick` trong **mọi**
trường hợp (kể cả khi không dựng lại lớp) để effect chạy lại và báo ra con số thật.

---

## Kiểm thử tự động

```
npm run typecheck   → sạch (3 workspace)
npx eslint .        → 0 lỗi, 2 cảnh báo react-refresh (có sẵn từ trước)
npm run test        → 277 test xanh (173 + 71 + 33)
npm run e2e         → 27 test xanh @ 390×844
```
