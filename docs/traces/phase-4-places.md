# Trace: Phase 4 (F6) — Địa điểm & hàng rào ảo

- **Ngày:** 2026-09-08
- **Phạm vi:** `/places/*`, đối chiếu hàng rào ở lớp L3 (server), thông báo
  "vừa tới nơi / vừa rời đi", màn Địa điểm trên web
- **File liên quan:**
  `packages/shared/src/place.schema.ts`,
  `apps/api/src/places/{geofence.service.ts,places.service.ts,places.controller.ts,places.module.ts}`,
  `apps/api/src/locations/locations.service.ts` (chỗ gọi geofence),
  `apps/api/prisma/migrations/20260908030000_geofence_state/`,
  `apps/web/src/lib/places-api.ts`, `apps/web/src/screens/PlacesScreen.tsx`
- **Cách chạy:** `npm run trace:places` — 27 case, đi qua Caddy HTTPS.
  Kèm 22 unit test cho logic thuần.
  **Chậm ~2,5 phút** — lý do ở ngay dưới đây.

## Vì sao bộ trace này phải chờ thật

Hàng rào có ngưỡng "phải ở đủ 60 giây mới tính là đã tới nơi". Bộ trace **không
tua được thời gian**: server cố tình **kẹp** mốc `ts` do client gửi về quanh giờ
của chính nó, để đồng hồ máy lệch không làm vệt đường nhảy lung tung (trace
Phase 2, TC-73). Hai chốt chặn đúng đắn ấy cộng lại thành ra: muốn kiểm ngưỡng
thời gian thì phải **chờ thật**, hai lần 65 giây.

Đó là cái giá phải trả, và tôi chọn trả nó thay vì mở một cửa hậu "chế độ test"
vào mã production.

## Ba chốt chặn chống báo sai

Thông báo vị trí **sai** tệ hơn hẳn không có thông báo. Ba lớp, theo thứ tự
quan trọng:

| Lớp | Làm gì | Case kiểm |
|---|---|---|
| **1. Chặn theo sai số GPS** | điểm có sai số lớn hơn bán kính hàng rào thì **bỏ qua**, giữ nguyên trạng thái cũ | PL-12 + PL-13 (đối chứng) |
| **2. Khoảng chênh vào/ra** | vào khi ≤ bán kính, ra khi > bán kính + 30 m | PL-11 |
| **3. Phải ở đủ lâu** | 60 giây mới tính là "đã tới" | PL-08 → PL-10 |

Không có lớp 1, một điểm sai số 500 m sẽ khẳng định bừa "đang ở trong vòng 150 m
quanh nhà". Không có lớp 2, người ngồi ngay mép hàng rào nhận một tràng "vừa tới
/ vừa rời / vừa tới…". Không có lớp 3, đi xe ngang qua nhà cũng bị tính là về
tới nhà.

## Dữ liệu giả định

| | |
|---|---|
| Couple A | An ❤ Bình |
| Couple B | Dũng ❤ Em — thử rò rỉ chéo cặp đôi |
| Địa điểm | "Nhà em" 🏠 tại 10.7769, 106.7009 (Quận 1), bán kính 150 m |
| Chuyến đi | 800 m → 50 m → 40 m → *(chờ 65 s)* → 30 m → 170 m → 2 km |
| Dữ liệu bẩn | bán kính 20 m và 5 km, `lat: 999`, tên rỗng, id không phải UUID, 21 địa điểm |

---

## Kết quả

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| PL-01 | **Happy path** — lưu một địa điểm | 201 + tên đã cắt khoảng trắng + bán kính mặc định 150 m + báo khi tới | 201 · "Nhà em" · 150m · arrive=true leave=false | ✅ |
| PL-02 | Đối phương thấy được địa điểm | 1 — địa điểm là của **cả cặp đôi**, không của riêng ai | 1 | ✅ |
| PL-03 | Bán kính 20 m | 422 — nhỏ hơn sai số GPS thì hàng rào bật/tắt liên tục | 422 | ✅ |
| PL-04 | Bán kính 5 km | 422 | 422 | ✅ |
| PL-05 | Toạ độ ngoài dải Trái Đất | 422 | 422 | ✅ |
| PL-06 | Tên rỗng | 422 | 422 | ✅ |
| PL-07 | Đang ở xa nhà (800 m) | 200 + accepted, không ai trong hàng rào | đúng | ✅ |
| PL-08 | **Vừa bước vào hàng rào (điểm đầu tiên)** | **chưa** tính là đã tới — đi ngang qua nhà không phải về tới nhà | 0 người | ✅ |
| PL-09 | Điểm thứ hai, vẫn chưa đủ 60 giây | vẫn chưa tính là đã tới | 0 người | ✅ |
| PL-10 | **Ở trong hàng rào đủ 65 giây** | bây giờ mới tính là đã tới nơi | 1 người | ✅ |
| PL-11 | **Khoảng chênh** — GPS nhiễu đẩy ra 170 m (bán kính 150 m) | **vẫn** tính là đang trong hàng rào, không bắn "vừa rời đi" | 1 người | ✅ |
| PL-12 | **Điểm cách 2 km nhưng sai số 500 m** | **bỏ qua** điểm đó, vẫn "đang ở trong" | 1 người | ✅ |
| PL-13 | **Đối chứng:** đúng toạ độ đó nhưng sai số 15 m | lần này mới tính là đã rời đi | 0 người | ✅ |
| PL-14 | **Ẩn danh:** Bình đứng ngay trong nhà | điểm bị từ chối ngay ở cửa (`accepted=false` + `GHOST_MODE`) nên Bình không bao giờ lọt vào hàng rào | accepted=false · GHOST_MODE · không có Bình | ✅ |
| PL-15 | An vào lại hàng rào (chuẩn bị cho PL-16) | 1 người | 1 | ✅ |
| PL-16 | **Dời hàng rào đi 3 km trong khi An đang ở trong** | trạng thái cũ bị xoá — không được bắn "vừa rời đi" từ một nơi chưa từng tới | 200 · 0 người | ✅ |
| PL-17 | Bình sửa địa điểm do An tạo | 200 — địa điểm là của **chung**, khác với sự kiện trên lịch | 200 · "Bình đổi tên" | ✅ |
| PL-18 | Xoá địa điểm không tồn tại | 404 | 404 | ✅ |
| PL-19 | Đường dẫn không hợp lệ | 404 | 404 | ✅ |
| PL-20 | Cặp đôi **khác** không thấy địa điểm của An và Bình | 0 | 0 | ✅ |
| PL-21 | Người ngoài xoá địa điểm của couple khác | 404 | 404 | ✅ |
| PL-22 | Người ngoài sửa địa điểm của couple khác | 404 | 404 | ✅ |
| PL-23 | **Người ngoài dừng đúng toạ độ nhà An** | không lọt vào hàng rào của An — hàng rào chỉ đối chiếu trong phạm vi couple | không có Dũng | ✅ |
| PL-24 | Xem địa điểm không kèm token | 401 | 401 | ✅ |
| PL-25 | Người chưa ghép đôi xem địa điểm | 404 + NOT_IN_COUPLE | đúng | ✅ |
| PL-26 | Thêm quá trần 20 địa điểm | 400 | 400 | ✅ |
| PL-27 | Xoá địa điểm | 204 và biến mất khỏi danh sách | đúng | ✅ |

**Tổng: 27/27 ✅**

### Unit test cho logic thuần — 22 test

`packages/shared/src/place.schema.spec.ts`. Phần quyết định của hàng rào được
tách thành hai hàm thuần (`accuracyUsableFor`, `decideTransition`) để kiểm mọi
biên mà không cần DB hay GPS:

| Test | Vì sao quan trọng |
|---|---|
| sai số **bằng** bán kính vẫn dùng được | biên sát |
| sai số **lớn hơn** bán kính → không kết luận gì | chốt chặn số 1 |
| `NaN` / âm / `Infinity` → từ chối | dữ liệu GPS bẩn |
| đúng mép (= bán kính) tính là **đã vào** | biên vào |
| ra khỏi bán kính +30 m vẫn là **đang trong** | chốt chặn số 2 |
| **không đối xứng**: cùng khoảng cách, kết quả khác nhau tuỳ trạng thái trước | chính là bản chất của khoảng chênh |
| hàng rào nhỏ nhất (50 m) vẫn có chênh đủ rộng | 50 m → ra 80 m mới tính, nuốt được nhiễu 10–30 m |

Toàn hệ thống: `npm run verify:local` → **35/35 mục đạt**
(7 bộ trace = 222 case · 227 unit test · typecheck + lint sạch).

---

## Lỗi đã tìm ra và đã sửa

### L27 — Hạn mức vị trí làm ba case "xanh giả"

- **Phát hiện:** PL-13 báo đỏ trong khi engine chạy đúng. Đọc kỹ thì thấy vấn đề
  lớn hơn: PL-12 đang **xanh giả**.
- **Sai:** `POST /locations` giới hạn **2 điểm / 3 giây**. Bộ trace gửi các điểm
  cách nhau 500 ms, nên từ điểm thứ ba trở đi bị từ chối ngay ở cửa và **không
  bao giờ tới được phần đối chiếu hàng rào**. Case PL-12 kỳ vọng "vẫn đang ở
  trong" — mà một điểm chưa từng được xử lý thì cũng cho ra đúng kết quả đó.
  Nó xanh vì không có gì xảy ra cả.
- **Đã kiểm chứng:** gửi 4 điểm cách nhau 500 ms → `accepted: true, true, false
  (RATE_LIMITED), false`.
- **Sửa:** hàm `ping()` của bộ trace giờ **bắt buộc `accepted === true`**, gặp
  `RATE_LIMITED` thì chờ 1,6 s rồi thử lại (tối đa 5 lần), không được thì ném lỗi.
  Mọi case phụ thuộc vị trí từ nay không thể xanh giả nữa.
- **Bài học lặp lại lần thứ ba** (sau L18, L25): một case xanh chỉ có nghĩa khi
  ta biết chắc thứ mình định kiểm **đã thật sự chạy**. Case kỳ vọng "không có gì
  đổi" là loại dễ xanh giả nhất — phải xây thêm phép đối chứng bên cạnh (ở đây
  là PL-13, cùng toạ độ, chỉ khác độ chính xác).

### L28 — Hai case khẳng định sai vì đọc nhầm ý nghĩa của danh sách

- **Sai:** PL-14 (ẩn danh) và PL-23 (người ngoài) khẳng định `peopleInside.length === 0`.
  Nhưng lúc đó **An đang ở trong nhà một cách hợp lệ**, nên danh sách có 1 người
  là đúng. Case đang hỏi sai câu hỏi.
- **Sửa:** lấy id của Bình / Dũng qua `GET /me` rồi khẳng định
  `!inside.includes(id)`. Hỏi đúng câu: "người **này** có lọt vào không", chứ
  không phải "hàng rào có trống không".

### L29 — Trùng hằng số với bản kế hoạch Phase 0

- **Phát hiện:** build `@beside/shared` báo `PLACE_RADIUS_MIN_M has already been
  exported`.
- **Sai:** tôi đặt lại `PLACE_RADIUS_*` và thêm `GEOFENCE_EXIT_FACTOR = 1.35`
  trong `place.schema.ts`, trong khi `constants.ts` đã có sẵn từ Phase 0
  `PLACE_RADIUS_MIN_M/MAX_M/DEFAULT_M` và `GEOFENCE_EXIT_HYSTERESIS_M = 30`.
- **Sửa:** dùng lại hằng số cũ, xoá bản thứ hai. Khoảng chênh giờ là **cộng
  thêm 30 m** (theo bản kế hoạch) chứ không phải nhân 1,35 (ý tôi tự nghĩ ra).
  Đúng tinh thần R0: bản kế hoạch là nguồn sự thật, muốn đổi thì phải ghi lý do,
  không được lặng lẽ đặt núm thứ hai.

---

## Đã tự rà (checklist R1 bước 1)

- **Null/undefined:** `candidateSince` nullable và được xoá đúng lúc ở cả bốn
  nhánh chuyển trạng thái; `partnerId` có thể null (chưa ghép đôi).
- **Kiểu dữ liệu:** không có `any`. `radiusM` dùng `z.coerce` vì slider phía web
  trả chuỗi.
- **Biên:** bán kính nhỏ nhất/lớn nhất, đúng mép hàng rào, khoảng cách 0, sai số
  bằng bán kính, trần 20 địa điểm, sai số `NaN`/âm/`Infinity`.
- **Async:** `void this.geofence.evaluate(...)` — cố ý không chờ, để đối chiếu
  địa điểm không làm chậm đường vị trí thời gian thực. Hệ quả là bộ trace phải
  chờ một nhịp trước khi đọc `/places` (hàm `settle()`), và điều đó được ghi rõ
  ngay trong bộ trace.
- **Lỗi mạng:** `GeofenceService.evaluate` bọc toàn bộ trong try/catch — hàng rào
  hỏng không được làm hỏng luồng vị trí.
- **Quyền:** mọi thao tác lọc theo `coupleId` ở tầng service; hàng rào chỉ đối
  chiếu địa điểm **trong cùng couple** (PL-20 → PL-23).
- **Múi giờ:** không có xử lý ngày/giờ hiển thị ở tính năng này.
- **Dọn dẹp:** xoá địa điểm thì trạng thái và lịch sử cascade theo khoá ngoại;
  dời hàng rào thì trạng thái cũ bị xoá tường minh (PL-16).
- **Rò rỉ dữ liệu:** log không in toạ độ. **Làm mờ vị trí được tôn trọng**: khi
  bán kính làm mờ rộng bằng hoặc hơn hàng rào, sự kiện vẫn được ghi cho chính
  chủ nhưng **không** báo cho người kia — nếu không thì tên một địa điểm cụ thể
  còn tiết lộ chính xác hơn cả toạ độ đã làm mờ.

---

## Còn thiếu / để lại

- **Chưa chọn được địa điểm trên bản đồ.** Hiện chỉ lưu được "chỗ tôi đang
  đứng". Muốn lưu nhà người yêu khi đang ngồi ở quán thì chưa làm được — cần
  cho chạm lên bản đồ để đặt ghim.
- **Hàng rào chưa vẽ lên `MapScreen`.** Vòng tròn địa điểm và ghim chưa hiện.
- **Chưa kiểm chứng thông báo tới máy thật.** Trace chứng minh sự kiện được sinh
  đúng lúc, nhưng "điện thoại có rung lên không" thì vẫn thuộc nhóm phải bấm tay
  (giống F7).
- **Chưa có lịch sử ra/vào.** Bảng `geofence_events` đã ghi đầy đủ nhưng chưa có
  API nào đọc ra, nên chưa hiện được "hôm nay người ấy tới những đâu".
- **Chưa test khi hai người cùng ở trong một hàng rào** — logic tách theo
  `userId` nên về lý là đúng, nhưng chưa có case.
- Dùng `haversineMeters` (tính trong bộ nhớ) chứ chưa dùng `ST_DWithin` của
  PostGIS. Với 20 địa điểm mỗi couple thì chênh lệch không đáng kể, nhưng nếu
  sau này số địa điểm tăng thì nên chuyển sang truy vấn không gian.

## Thay đổi đã ghi vào ARCHITECTURE.md

§2 (lớp L3 đã triển khai), §6 (bảng `GeofenceState`), §6.2 (làm mờ vị trí ảnh
hưởng tới thông báo địa điểm), §7.1 (`/places/*`), §9 (F6 xong), §10 (ADR ba
chốt chặn chống báo sai; ADR bảng trạng thái riêng thay vì suy từ sự kiện gần
nhất; ADR dùng lại hằng số Phase 0).
