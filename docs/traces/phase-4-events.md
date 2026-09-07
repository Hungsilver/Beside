# Trace: Phase 4 (F4) — Lịch trình chung

- **Ngày:** 2026-09-08
- **Phạm vi:** `GET/POST/PATCH/DELETE /events`, quy ước thời gian cho sự kiện cả
  ngày, quyền xem việc riêng, lưới lịch tháng trên web
- **File liên quan:**
  `packages/shared/src/event.schema.ts`,
  `apps/api/src/events/{events.service.ts,events.controller.ts,events.module.ts}`,
  `apps/api/prisma/migrations/20260908010000_event_emoji/`,
  `apps/web/src/lib/{events-api.ts,event-display.ts}`,
  `apps/web/src/components/EventSheet.tsx`,
  `apps/web/src/screens/CalendarScreen.tsx`
- **Cách chạy:** hạ tầng thật trong Docker, qua Caddy HTTPS.
  `npm run trace:phase4` — 37 case. Kèm 29 unit test cho schema dùng chung và
  23 unit test cho lớp hiển thị lịch.

## Dữ liệu giả định

| | |
|---|---|
| Couple A | An ❤ Bình |
| Couple B | Dũng ❤ Em — thử rò rỉ chéo cặp đôi |
| Sự kiện có giờ | "Ăn tối kỷ niệm" 10/09 19:00–21:00 giờ VN (= 12:00–14:00 UTC) |
| Sự kiện cả ngày | "Sinh nhật Bình" 12/09 · "Đi Đà Lạt" 01→03/10 |
| Việc riêng | "Đi mua quà bí mật" 20/09, `visibility = PRIVATE` |
| Dữ liệu bẩn | 31/02, 29/02/2025, giờ kết thúc trước giờ bắt đầu, sự kiện dài 1 năm, `startAt: "hôm nào đó"`, khoảng truy vấn 26 năm, id không phải UUID |

---

## Quyết định quan trọng nhất: hai loại thời gian

Một cái lịch có hai loại "thời gian" hoàn toàn khác nhau, và trộn chúng vào một
kiểu dữ liệu là nguồn gốc của gần hết lỗi lệch ngày:

| Loại | Ví dụ | Lưu thế nào |
|---|---|---|
| **Mốc thời gian thật** (`allDay = false`) | "19:00 tối thứ năm" | UTC như mọi chỗ khác. Hiển thị thì đổi sang `Asia/Ho_Chi_Minh` |
| **Ngày trôi nổi** (`allDay = true`) | "sinh nhật 12/09" | 00:00 **UTC** của đúng ngày đó, và đọc lại cũng theo UTC — không mang múi giờ nào cả |

"Sinh nhật 12/09" không phải một khoảnh khắc, nó là một ô trên tờ lịch. Nếu lưu
nó thành 00:00 giờ VN thì mốc UTC là `2026-09-11T17:00Z`, và một truy vấn lịch
bắt đầu từ 00:00 UTC ngày 12 sẽ **bỏ sót** nó. Case **P4-04** và **P4-05** khoá
đúng hành vi này lại.

---

## Kết quả

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| P4-01 | **Happy path** — tạo sự kiện có giờ | 201 + tên đã cắt khoảng trắng + emoji + nhắc trước 60 phút | 201 · "Ăn tối kỷ niệm" · 🍽️ · remind=60 | ✅ |
| P4-02 | Đối phương thấy được sự kiện vừa tạo | có trong lịch của Bình, kèm tên người tạo | 200 · thấy · "An" | ✅ |
| P4-03 | `canEdit` đúng phía | Bình: false | false | ✅ |
| P4-04 | **Sự kiện cả ngày lưu đúng ngày lịch** | `startAt = 2026-09-12T00:00:00.000Z` + `allDay=true` | đúng | ✅ |
| P4-05 | **Sự kiện cả ngày nằm đúng ô ngày 12, không trôi về ngày 11** | tìm thấy khi lọc riêng ngày 12 | thấy | ✅ |
| P4-06 | Sự kiện cả ngày kéo dài nhiều ngày | 201 + `endAt = 2026-10-03T00:00:00.000Z` | đúng | ✅ |
| P4-07 | Ngày 31/02 không có thật | 422 — không được âm thầm trôi sang 03/03 | 422 | ✅ |
| P4-08 | Ngày 29/02 của năm nhuận | 201 | 201 · 2024-02-29T00:00:00.000Z | ✅ |
| P4-09 | Giờ kết thúc **trước** giờ bắt đầu | 422 + báo lỗi ở trường `endAt` | 422 + fieldErrors.endAt | ✅ |
| P4-10 | Giờ kết thúc **trùng** giờ bắt đầu | 422 — sự kiện 0 phút là gõ nhầm | 422 | ✅ |
| P4-11 | Sự kiện dài 1 năm | 422 — gần như chắc chắn gõ nhầm năm | 422 | ✅ |
| P4-12 | Thiếu giờ bắt đầu | 422 + lỗi ở `startAt` | 422 | ✅ |
| P4-13 | Tên rỗng | 422 | 422 | ✅ |
| P4-14 | Chuỗi thời gian vô nghĩa | 422, **không** được 500 | 422 | ✅ |
| P4-15 | Sự kiện trong **quá khứ** | 201 — người ta hay ghi lại việc đã xảy ra | 201 | ✅ |
| P4-16 | **Hai sự kiện trùng giờ** | cả hai đều lưu được, không cái nào bị chặn | 201/201 · cả hai có trong ngày | ✅ |
| P4-17 | Thứ tự trả về | tăng dần theo thời gian | đã sắp xếp | ✅ |
| P4-18 | **Sự kiện nhiều ngày vẫn hiện ở ngày GIỮA chuyến đi** | tìm thấy khi hỏi riêng ngày 02/10 | thấy | ✅ |
| P4-19 | Ngày không có sự kiện nào | 200 + mảng rỗng (không phải 404) | 200 · `[]` | ✅ |
| P4-20 | Khoảng thời gian ngược (`from > to`) | 422 | 422 | ✅ |
| P4-21 | Quét 26 năm một lần | 422 — chặn truy vấn kéo cả DB | 422 | ✅ |
| P4-22 | Tạo việc riêng | 201 + `visibility=PRIVATE` | đúng | ✅ |
| P4-23 | **Việc riêng: An thấy, Bình không thấy** | An=true, Bình=false | đúng | ✅ |
| P4-24 | Bình đọc thẳng việc riêng bằng id | 404 — không lộ là id đó có thật | 404 | ✅ |
| P4-25 | Bình xoá việc riêng của An | 404 | 404 | ✅ |
| P4-26 | Người tạo sửa sự kiện | 200 + tên và giờ mới | đúng | ✅ |
| P4-27 | Bình sửa sự kiện **chung** do An tạo | 403 — chung thì ai cũng THẤY, chỉ người tạo mới SỬA | 403 + FORBIDDEN | ✅ |
| P4-28 | Sửa bằng dữ liệu sai | 422 **và** bản cũ không bị ghi đè | 422 · giờ giữ nguyên | ✅ |
| P4-29 | Bình xoá sự kiện chung do An tạo | 403 | 403 | ✅ |
| P4-30 | Người tạo xoá được sự kiện của mình | 204, đọc lại 404 | 204 → 404 | ✅ |
| P4-31 | Xoá sự kiện không tồn tại | 404 | 404 | ✅ |
| P4-32 | Id không phải UUID | 400 — chặn ở pipe, không đâm vào DB | 400 | ✅ |
| P4-33 | Cặp đôi **khác** không thấy lịch của An và Bình | 0 sự kiện | 0 | ✅ |
| P4-34 | Người ngoài đọc sự kiện bằng đúng id | 404 | 404 | ✅ |
| P4-35 | Người ngoài xoá sự kiện của couple khác | 404 | 404 | ✅ |
| P4-36 | Xem lịch không kèm token | 401 | 401 | ✅ |
| P4-37 | Người chưa ghép đôi xem lịch | 404 + NOT_IN_COUPLE | đúng | ✅ |

**Tổng: 37/37 ✅**

### Unit test kèm theo

`packages/shared/src/event.schema.spec.ts` — **29 test**: ngày trôi nổi đi–về
không mất mát, 31/02 và 29/02 năm không nhuận bị chặn, mọi biên của
`createEventSchema`, khoảng truy vấn, và `eventsOverlap`.

`apps/web/src/lib/event-display.spec.ts` — **23 test**, tập trung vào bẫy múi giờ:

| Test | Vì sao quan trọng |
|---|---|
| `18:00 UTC` → ô ngày **09** | 01:00 sáng giờ VN là ngày hôm sau. Đọc theo UTC là sai ô. |
| `16:30 UTC` → ô ngày **08** | 23:30 giờ VN vẫn là ngày hôm đó. Đây là chiều ngược lại. |
| Sự kiện 23:30 → 01:30 phủ **hai** ô | vắt qua nửa đêm |
| Sự kiện cả ngày 12/09 → đúng ô 12 | khoá quy ước ngày trôi nổi |
| `vnWallToIso('2026-09-10','19:00') === '2026-09-10T12:00:00.000Z'` | không phụ thuộc múi giờ của máy |
| `monthGrid(2026,9)[0] === '2026-08-31'` | tuần bắt đầu thứ hai theo thói quen VN |

Toàn hệ thống: `npm run verify:local` → **33/33 mục đạt**
(5 bộ trace = 174 case · 192 unit test · typecheck sạch).

---

## Lỗi / vướng mắc đã xử lý trong lượt này

### L22 — `prisma migrate dev` không chạy được vì shadow database thiếu PostGIS

- **Phát hiện:** khi thêm cột `emoji` cho bảng `events`.
- **Sai:** `migrate dev` dựng một shadow database trắng rồi phát lại toàn bộ
  migration để kiểm tra. DB trắng đó **không có PostGIS**, nên migration
  `20260907160000_add_location_geography` chết với `type "geography" does not exist`.
  Extension chỉ được bật bởi `infra/postgres/init/01-extensions.sql`, mà script đó
  chỉ chạy một lần trên volume DB thật.
- **Sửa:** thêm migration `20260907000000_enable_postgis` — timestamp sớm nhất nên
  luôn chạy đầu tiên, toàn bộ câu lệnh đều `IF NOT EXISTS` nên áp lên DB thật
  (vốn đã có extension) là vô hại.
- **Đã kiểm chứng:** phát lại **cả 6 migration theo thứ tự vào một DB trắng** →
  chạy sạch. Đây là phép thử thật sự quan trọng, vì nó cũng chính là đường mà VPS
  sẽ đi khi deploy lần đầu.
- **Còn lại:** `migrate dev` vẫn báo lỗi cũ dù chuỗi migration đã đúng — chưa tìm
  ra vì sao. Đường vòng đang dùng là sinh SQL bằng
  `prisma migrate diff --from-schema-datasource --to-schema-datamodel` rồi viết tay
  thư mục migration và áp bằng `migrate deploy`, đúng cách dự án đã làm với
  migration trigger ở Phase 2. Đã ghi vào BACKLOG.

### L23 — Trạng thái form bị đóng băng khi mở tấm trượt lần thứ hai

- **Sai:** `EventSheet` khởi tạo `useState(initial)`. React chỉ dùng giá trị đó ở
  lần render đầu, nên bấm sang một sự kiện khác trong khi tấm trượt vẫn đang mở
  sẽ hiện lại nội dung của sự kiện **trước đó**.
- **Sửa:** thêm `useEffect` đồng bộ lại form theo `[event, dayKey]`, đồng thời xoá
  lỗi cũ và trạng thái xác nhận xoá.
- **Bắt được ở bước 1 của R1** (đọc lại code), không phải bởi trace — trace chỉ
  chạm tới API.

---

## Đã tự rà (checklist R1 bước 1)

- **Null/undefined:** `note`, `endAt`, `placeId`, `lat/lng`, `remindMinBefore` đều
  nullable; `EventResponse.endAt = null` được xử lý ở cả `dayKeysOf`, `timeLabel`
  và form.
- **Kiểu dữ liệu:** không có `any`. `noUncheckedIndexedAccess` bắt được một chỗ
  destructure mảng trong `longDayLabel` — đã đổi sang `slice` cố định.
- **Biên:** ngày không tồn tại, năm nhuận, sự kiện 0 phút, sự kiện 1 năm, khoảng
  truy vấn ngược, khoảng 26 năm, ngày trống, id không phải UUID.
- **Async:** nút Lưu chặn bấm hai lần bằng `busy`; sửa hỏng thì bản cũ nguyên vẹn
  (P4-28) vì validate xảy ra **trước** khi chạm DB.
- **Lỗi mạng:** `CalendarScreen` có nhánh `query.isError` riêng, không hiện lịch
  trống giả.
- **Quyền:** lọc theo `coupleId` **và** `visibility` ở tầng service. Việc riêng
  của người kia trả 404 chứ không phải 403 — 403 tự nó đã tiết lộ "có tồn tại".
  `placeId` gắn kèm cũng bị kiểm tra thuộc đúng couple.
- **Múi giờ:** xem bảng ở trên. Mọi phép đổi đi qua `event-display.ts`, không có
  `new Date(chuỗi-không-offset)` ở bất kỳ đâu.
- **Dọn dẹp:** `EventSheet` khôi phục `body.style.overflow` và gỡ listener `keydown`
  khi unmount.
- **Rò rỉ dữ liệu:** không log tiêu đề/ghi chú sự kiện.

---

## Còn thiếu / để lại

- **Nhắc lịch chưa chạy.** `remindMinBefore` đã lưu và chọn được, nhưng chưa có
  job gửi thông báo — cần Web Push (F7) làm trước. Giao diện nói thẳng điều này
  thay vì hứa suông.
- **Chưa gắn địa điểm vào sự kiện.** Trường `placeId` đã có và đã được kiểm tra
  quyền, nhưng chưa có màn quản lý Địa điểm (F6) để chọn.
- **Chưa bấm thử trên trình duyệt thật** — ô `<input type="date">` / `type="time"`
  hiển thị rất khác nhau giữa iOS Safari và Chrome Android.
- **Chưa có test Playwright ở 390×844** cho lưới lịch và tấm trượt.
- Chưa có chế độ xem tuần / xem danh sách; hiện chỉ có lịch tháng + danh sách theo
  ngày đang chọn.

## Thay đổi đã ghi vào ARCHITECTURE.md

§4 (không thêm thư viện mới), §6 (`Event.emoji`), §6.3 mới (quy ước hai loại thời
gian), §7.1 (`/events/*`), §9 (F4 xong), §10 (ADR ngày trôi nổi; ADR việc riêng
trả 404 thay vì 403; ADR migration bật extension).
