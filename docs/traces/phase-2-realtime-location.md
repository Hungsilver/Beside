# Trace: Phase 2 — Vị trí thời gian thực

- **Ngày:** 2026-09-07
- **Phạm vi:** WebSocket `/rt`, `/locations/*`, `/me/privacy`, cột PostGIS, lọc nhiễu GPS
- **File liên quan:**
  `apps/api/src/locations/*`, `apps/api/src/common/redis/*`,
  `packages/shared/src/{geo,kalman,sampling,location.schema}.ts`,
  `apps/web/src/lib/{realtime.tsx,use-live-location.ts}`, `apps/web/src/components/CoupleMap.tsx`
- **Cách chạy:** API thật + PostgreSQL 18 + PostGIS 3.6 trên máy.
  `npm run trace:phase2` — 29 case, dùng **cả REST lẫn WebSocket** như client thật.

## Dữ liệu giả định

| | |
|---|---|
| Couple | An ❤ Bình, anniversary 14/02/2023 |
| Tuyến đường | Quận 1 → Thủ Đức, mỗi bước +0,0009° vĩ / +0,0011° kinh (~140 m) |
| Nhà An | 10.7769, 106.7009 |
| Công ty Bình | 10.8231, 106.6297 (PostGIS: cách nhà An 9.313,7 m) |
| Trường hợp bẩn | toạ độ `lat: 999`, đồng hồ máy lệch +3 giờ, bắn 12 điểm/giây, token rác |

---

## Kết quả

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| TC-50 | Quyền riêng tư mặc định khi vừa đăng ký | không ẩn danh, có chia sẻ trực tiếp, không làm mờ | `{ghostMode:false, shareLive:true, fuzzRadiusM:0}` | ✅ |
| TC-51 | Kết nối WebSocket bằng token rác | bị từ chối **ngay ở bước bắt tay** | `connect_error: UNAUTHENTICATED` | ✅ |
| TC-52 | Hai người cùng vào phòng `couple:{id}` | cả hai kết nối được | An ✓ Bình ✓ | ✅ |
| TC-53 | Bật chia sẻ trực tiếp | đối phương nhận `presence {live:true}` | đúng | ✅ |
| TC-54 | **Happy path** — An gửi vị trí | Bình nhận `loc:partner` đúng toạ độ, kèm pin | lat/lng khớp, pin 62%, `fuzzed:false` | ✅ |
| TC-55 | Chiều ngược lại | An nhận vị trí của Bình | đúng | ✅ |
| TC-56 | Người gửi không nhận lại điểm của chính mình | 0 sự kiện | 0 | ✅ |
| TC-57 | Toạ độ `lat: 999` | `rt:error VALIDATION_FAILED`, **socket vẫn sống** | đúng, `connected=true` | ✅ |
| TC-58 | Bắn 12 điểm trong 1 giây từ cửa sổ trống | chỉ 2 điểm lọt (hạn mức 2 điểm/3 giây) | Bình nhận 2 | ✅ |
| TC-59 | Bật làm mờ vị trí 500 m | 200 + `fuzzRadiusM: 500` | đúng | ✅ |
| TC-60 | Làm mờ: điểm gửi cho đối phương | `fuzzed:true`, lệch < 500 m, `accuracyM` báo đúng 500, **ẩn hướng & tốc độ** | lệch 185 m, acc 500, heading/speed `null` | ✅ |
| TC-61 | Làm mờ ổn định: 2 điểm cách nhau 6 m | ra **cùng một** toạ độ → không lấy trung bình để suy ngược được | `10.775243,106.700774` cả hai lần | ✅ |
| TC-61b | Làm mờ: khoảng cách cũng bị làm thô | `distanceM` là bội số của 500 | 9.500 m | ✅ |
| TC-62 | **Chế độ ẩn danh** — server không phát vị trí | Bình nhận 0 điểm | 0 | ✅ |
| TC-63 | Ẩn danh: REST cũng không trả vị trí | `location: null` | `null` | ✅ |
| TC-63b | Ẩn danh: **không được lộ cả khoảng cách** | `distanceM: null` | `null` | ✅ |
| TC-64 | Ẩn danh: vệt đường cũng rỗng | `points: []` | 0 điểm | ✅ |
| TC-65 | Tắt ẩn danh | có hiệu lực **ngay** ở điểm kế tiếp | Bình nhận được ngay | ✅ |
| TC-66 | Tắt "chia sẻ trực tiếp" | chặn luồng LIVE | Bình nhận 0 điểm | ✅ |
| TC-67 | ...nhưng ping bị động vẫn được lưu | `accepted:true` — để còn thấy "lần cuối ở đâu" | đúng | ✅ |
| TC-68 | Ẩn danh chặn cả ping bị động | `accepted:false, reason:GHOST_MODE` | đúng | ✅ |
| TC-69 | `GET /locations/partner/latest` | trả đúng điểm vừa gửi, `source:LIVE` | 10.81290, 106.74490 | ✅ |
| TC-70 | Khoảng cách tính bằng PostGIS | số dương hợp lý | 12.648 m | ✅ |
| TC-71 | Vệt đường | nhiều điểm dạng `[lng, lat, ts]` + tổng quãng đường | 9 điểm, 8.824 m | ✅ |
| TC-72 | Khoảng thời gian ngược (`from > to`) | 422 | 422 VALIDATION_FAILED | ✅ |
| TC-73 | Đồng hồ máy lệch +3 giờ | server kẹp `ts` về giờ hiện tại | lệch −1 giây | ✅ |
| TC-74 | Tắt chia sẻ trực tiếp | đối phương nhận `presence {live:false}` | đúng | ✅ |
| TC-75 | Đóng app | đối phương thấy `online:false` | đúng | ✅ |
| TC-76 | Đóng 1 trong 2 tab | **không** được báo offline oan | 0 sự kiện offline | ✅ |

**Tổng: 29/29 ✅**

Kèm **124 unit test** (89 shared · 25 api · 10 web) và typecheck sạch cả 3 workspace.

---

## Lỗi phát hiện được và đã sửa

### L8 — Hàm làm mờ vị trí không thực sự làm mờ

- **Phát hiện:** unit test `geo.spec.ts` — hai điểm cách nhau 6 m ra hai toạ độ khác nhau.
- **Nguyên nhân:** `snapToGrid` tính bước lưới kinh độ theo `cos(vĩ độ GỐC)`. Vĩ độ gốc
  đổi theo từng phép đo nên bước lưới cũng đổi → lưới "trôi" theo dữ liệu vào.
- **Vì sao nghiêm trọng:** kẻ quan sát chỉ cần lấy trung bình nhiều mẫu là hội tụ về
  vị trí thật. Tức là tính năng bảo vệ quyền riêng tư **không bảo vệ gì cả**.
- **Sửa:** tính bước lưới kinh độ theo **vĩ độ đã làm tròn**. Thêm test mô phỏng
  200 phép đo quanh một điểm — tất cả phải rơi vào tối đa 2 ô lưới.

### L9 — WebSocket cho kết nối rồi mới ngắt, thay vì từ chối từ đầu

- **Phát hiện:** TC-51.
- **Sai:** xác thực nằm trong `handleConnection`, nên client vẫn nhận sự kiện `connect`
  rồi mới bị ngắt. Socket chưa xác thực đã kịp tồn tại trong server, và client
  tưởng mình đã vào được.
- **Sửa:** chuyển sang middleware `server.use()` trong `afterInit` — chặn ngay ở bước
  bắt tay, client nhận `connect_error` và không bao giờ ở trạng thái đã kết nối.

### L10 — Không có hạn mức nào cho luồng vị trí khi Redis chết

- **Phát hiện:** TC-58 — bắn 12 điểm/giây thì cả 12 đều lọt.
- **Nguyên nhân:** `RedisService` cố tình "mở" khi Redis hỏng (trả 0 = không chặn),
  để mất cache không làm sập bản đồ của người dùng thật. Nhưng khi đó **không còn
  hàng rào nào**, một client lỗi có thể làm ngập đệm ghi DB.
- **Sửa:** thêm `SlidingWindowRateLimiter` chạy **trong tiến trình**, luôn hoạt động,
  không phụ thuộc hạ tầng ngoài. Redis chỉ còn là lớp bổ sung cho trường hợp nhiều
  instance. Kèm 6 unit test, trong đó có test chống rò rỉ bộ nhớ.

### L11 — Race condition: đọc vị trí ra kết quả cũ

- **Phát hiện:** TC-69 — vừa gửi điểm mới nhưng API trả về điểm của 30 giây trước.
- **Nguyên nhân:** controller gọi `getPartnerLatest` và `distanceBetween` song song
  bằng `Promise.all`. Cả hai đều gọi `flush()`. Lời gọi đầu lấy hết đệm rồi bắt đầu
  ghi; lời gọi thứ hai thấy đệm **đã rỗng**, tưởng xong, đi đọc DB ngay trong lúc
  lệnh ghi kia còn đang bay → đọc phải dữ liệu cũ.
- **Sửa:** nối tiếp hoá `flush()` bằng một `Promise` dùng chung —
  `while (this.flushing) await this.flushing;` — rồi mới xét đệm hiện tại.

### L12 — Chế độ ẩn danh chỉ có tác dụng một nửa

- **Phát hiện:** TC-63 — `location: null` nhưng `distanceM: 9314` vẫn được trả về.
- **Vì sao nghiêm trọng:** người dùng bật ẩn danh vì **không muốn bị biết mình ở đâu**.
  Biết khoảng cách chính xác cộng với vị trí của chính mình là khoanh được đối phương
  vào một đường tròn; góp vài mẫu theo thời gian là ra vị trí thật. Ẩn danh mà vẫn
  lộ khoảng cách thì gần như vô nghĩa.
- **Sửa:** `distanceBetween` đọc quyền riêng tư của đối phương:
  ẩn danh → `null`; đang làm mờ → làm tròn khoảng cách theo đúng bán kính mờ,
  để con số này không bao giờ chính xác hơn toạ độ được phép nhìn thấy.
- **Bài học:** mọi endpoint **suy ra** được thông tin vị trí đều phải qua cùng một
  cửa kiểm tra quyền riêng tư, không chỉ endpoint trả thẳng toạ độ.

### L13 — Cột generated làm vỡ migration kế tiếp

- **Phát hiện:** `prisma migrate diff` ngay sau khi thêm cột `geog`.
- **Sai:** cột tạo bằng `GENERATED ALWAYS ... STORED`. Prisma đọc biểu thức sinh cột
  như một DEFAULT nên lần `migrate dev` sau sinh ra `ALTER COLUMN geog DROP DEFAULT`
  — câu lệnh này **thất bại** trên cột generated, làm vỡ migration.
- **Sửa:** migration `20260907170000_location_geog_use_trigger` gỡ tính generated,
  thay bằng **trigger** (Prisma không nhìn thấy trigger nên không sinh drift), và
  khai báo hai chỉ mục vào `schema.prisma` để Prisma không đòi xoá.
  `prisma migrate diff` sau đó trả về "empty migration".

---

## Còn thiếu / để lại

- **Chưa test với Redis đang chạy.** Máy dev không có Redis nên toàn bộ trace chạy ở
  nhánh "không có cache" — đây là nhánh nguy hiểm hơn nên test nó là đúng, nhưng
  nhánh có Redis (cache vị trí gần nhất, hạn mức chia sẻ giữa nhiều instance)
  vẫn chưa được chạy thử.
- **Chưa bấm thử trên trình duyệt thật** — `watchPosition`, Wake Lock và MapLibre
  chỉ chạy được trong trình duyệt. Logic lọc nhiễu/lấy mẫu đã có 33 unit test,
  nhưng phần ghép nối vào giao diện thì chưa.
- **Chưa test job dọn lịch sử vị trí** trên dữ liệu thật quá 7/90 ngày
  (cần dữ liệu cũ hoặc tách được đồng hồ ra khỏi service).
- Chưa test kịch bản mất kết nối rồi nối lại giữa chừng chuyến đi.

## Thay đổi đã ghi vào ARCHITECTURE.md

§4 (Redis, @nestjs/schedule thay BullMQ cho việc lặp), §6 (cột `geog` + trigger),
§6.2 (quy tắc quyền riêng tư), §7.1 (`/locations/*`, `/me/privacy`), §7.2 (sự kiện
WebSocket đã triển khai), §9 (Phase 2 xong), §10 (ADR mới).
