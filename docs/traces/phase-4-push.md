# Trace: Phase 4 (F7) — Thông báo đẩy & nhắc lịch

- **Ngày:** 2026-09-08
- **Phạm vi:** `/push/*`, service worker tự viết, job nhắc lịch chạy mỗi phút,
  thông báo khi người ấy check-in
- **File liên quan:**
  `packages/shared/src/push.schema.ts`,
  `apps/api/src/push/{push.service.ts,push.controller.ts,push.module.ts}`,
  `apps/api/src/events/event-reminder.job.ts`,
  `apps/api/src/config/env.ts` (kiểm tra cặp khoá VAPID),
  `apps/web/src/sw.ts`, `apps/web/src/lib/push-api.ts`,
  `apps/web/src/screens/SettingsScreen.tsx`,
  `apps/api/prisma/migrations/20260908020000_event_reminder_sent/`
- **Cách chạy:** `npm run trace:push` — 21 case, đi qua Caddy HTTPS.
  Kèm 13 unit test cho logic chọn thời điểm nhắc.

## Kiểm được gì và không kiểm được gì

Đây là tính năng **không thể trace hết bằng máy**, nên nói thẳng ranh giới:

| | |
|---|---|
| ✅ Kiểm bằng trace | vòng đời đăng ký, quyền sở hữu đăng ký, dọn đăng ký chết, cấu hình VAPID, mọi biên của `remindMinBefore` |
| ✅ Kiểm bằng unit test | mốc gửi nhắc, chống gửi trùng, chống dội sau khi server chết, câu chữ thông báo |
| ❌ **Chỉ bấm tay được** | thông báo có thật sự **hiện lên khay của máy** hay không; service worker có chạy khi app đã đóng hay không; iOS có cấp quyền sau khi cài lên màn hình chính hay không |

Bộ trace gọi ra **FCM thật** bằng một token không tồn tại. Nhờ vậy request đi hết
đường thật — ký VAPID → mã hoá ECDH → gửi lên Google → Google trả `404 UNREGISTERED`
— mà không bắn thông báo lên máy của ai. Đó cũng chính là kịch bản "người dùng gỡ
app", nên nó kiểm luôn được nhánh dọn dẹp.

## Dữ liệu giả định

| | |
|---|---|
| Couple | An ❤ Bình |
| Thiết bị giả | endpoint FCM thật + **khoá P-256 sinh bằng `createECDH('prime256v1')`** |
| Sự kiện | "Hẹn cà phê" sau 30 phút, nhắc trước 60 phút |
| Dữ liệu bẩn | endpoint không phải URL, thiếu `keys`, nhắc trước 14 ngày, nhắc trước số âm, ảnh có header hợp lệ nhưng thân hỏng |

---

## Kết quả

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| PU-01 | Khoá công khai VAPID lấy được **không cần đăng nhập** | 200 + `enabled=true` (khoá công khai theo đúng thiết kế Web Push) | 200 · enabled=true · 87 ký tự | ✅ |
| PU-02 | Danh sách thiết bị thì **phải** đăng nhập | 401 | 401 | ✅ |
| PU-03 | **Happy path** — đăng ký một thiết bị | 204 | 204 | ✅ |
| PU-04 | Thiết bị hiện trong danh sách, đoán đúng tên máy | 1 thiết bị · "iPhone" · `current=true` | đúng | ✅ |
| PU-05 | **Endpoint đầy đủ không bị phô ra** | không trường nào chứa endpoint (đây là dữ liệu định danh thiết bị) | chỉ có id/device/createdAt/current | ✅ |
| PU-06 | Đăng ký **lại** cùng một thiết bị | 204 và vẫn chỉ 1 bản ghi | 1 | ✅ |
| PU-07 | Một người dùng nhiều thiết bị | 2 thiết bị | 2 | ✅ |
| PU-08 | Endpoint không phải URL | 422 | 422 | ✅ |
| PU-09 | Thiếu khoá mã hoá | 422 — không có `keys` thì không bao giờ gửi được | 422 | ✅ |
| PU-10 | Bình **không** thấy thiết bị của An | 0 | 0 | ✅ |
| PU-11 | Bình huỷ đăng ký bằng endpoint **của An** | không xoá được — An vẫn còn 2 thiết bị | 2 | ✅ |
| PU-12 | **Hai người dùng chung một máy** | đăng ký chuyển sang người mới: An 1, Bình 1 (không được để cả hai cùng nhận) | An=1 · Bình=1 | ✅ |
| PU-13 | Gửi tới một đăng ký **đã chết** | `sent=0` và đăng ký đó bị **dọn** khỏi DB (dịch vụ đẩy trả 404/410) | sent=0 · còn 0 thiết bị | ✅ |
| PU-14 | Gửi thử khi không có thiết bị nào | 200 + `sent=0`, **không** được lỗi | 200 · 0 | ✅ |
| PU-15 | Tạo sự kiện có nhắc trước | 201 + `remindMinBefore=60` | đúng | ✅ |
| PU-16 | Sự kiện không bật nhắc | 201 + `null` | đúng | ✅ |
| PU-17 | Nhắc trước quá 7 ngày | 422 | 422 | ✅ |
| PU-18 | Nhắc trước số âm | 422 | 422 | ✅ |
| PU-19 | Nhắc **"đúng giờ" (0 phút)** là hợp lệ | 201 — `0` khác `null`, phải phân biệt được | 201 · 0 | ✅ |
| PU-20 | Đăng check-in khi đối phương **không có thiết bị nào** | 201 — gửi thông báo thất bại không được làm hỏng việc đăng bài | 201 | ✅ |
| PU-21 | **Ảnh có header hợp lệ nhưng thân hỏng** | 400 + lỗi đọc được, **không** được 500 | 400 + "Tệp ảnh bị hỏng hoặc tải lên chưa xong…" | ✅ |

**Tổng: 21/21 ✅**

### Unit test cho job nhắc lịch — 13 test

`apps/api/src/events/event-reminder.job.spec.ts`. Logic này phụ thuộc vào "bây
giờ là mấy giờ", mà trace chạy qua HTTP thì không đổi được đồng hồ của server —
nên `sweep(now)` nhận mốc thời gian làm tham số để test được thẳng.

| Test | Vì sao quan trọng |
|---|---|
| gửi khi đã tới mốc nhắc | happy path |
| chưa tới mốc thì không gửi | sai chiều này là spam |
| sớm 1 phút thì chưa, đúng phút thì gửi | biên sát nhất |
| việc riêng chỉ nhắc người tạo | rò rỉ việc riêng qua thông báo cũng là rò rỉ |
| tiến trình khác đã giành được thì bỏ qua | chạy 2 instance API không được nhắc 2 lần |
| **đánh dấu TRƯỚC khi gửi** | đánh dấu sau thì cả hai tiến trình đều kịp gửi |
| gộp theo tag `event:<id>` | không xếp chồng trong khay |
| tắt thông báo thì không gửi gì | thiếu VAPID không được làm sập job |
| câu chữ: 10 phút / đúng giờ / 2 tiếng / cả ngày | nội dung người dùng đọc thật |

Toàn hệ thống: `npm run verify:local` → **34/34 mục đạt**
(6 bộ trace = 195 case · 205 unit test · typecheck + lint sạch).

---

## Lỗi đã tìm ra và đã sửa

### L24 — Ảnh hỏng giữa chừng làm API trả 500 (lỗi thật, do trace bắt được)

- **Phát hiện:** case PU-20 trả 500 thay vì 201. Ban đầu tưởng lỗi ở đồ nghề test
  (tôi tự gõ tay chuỗi hex PNG), nhưng đọc log ra `pngload_buffer: libspng read
  error` — và một tệp ảnh hỏng thì **phải** ra 400, không phải 500.
- **Sai:** `ImageProcessor.process()` gọi `sharp().metadata()` để kiểm định dạng.
  Hàm đó chỉ đọc phần **đầu** tệp, nên ảnh có header hợp lệ mà thân hỏng — upload
  dở dang, thẻ nhớ lỗi, tệp bị cắt — vẫn lọt qua và chỉ chết lúc giải mã thật
  trong `resize()`. Lỗi ấy thoát ra ngoài thành 500.
- **Sửa:** bọc cụm `Promise.all` resize trong try/catch, log nguyên nhân kỹ thuật
  cho mình và trả 400 với câu người dùng hiểu được. Thêm case **PU-21** khoá lại,
  dựng ảnh hỏng bằng cách cắt 40 byte đầu của một PNG thật rồi nối rác vào.
- **Đáng chú ý:** case P3-11 ở Phase 3 đã kiểm "tệp văn bản đổi đuôi `.jpg`" và
  đạt — nhưng nó chỉ chạm nhánh "không đọc nổi header". Nhánh "header đúng, thân
  hỏng" là một cửa khác, và nó mở toang tới tận 500.

### L25 — Đồ nghề test sai lần nữa: khoá P-256 bịa được

- **Phát hiện:** PU-13 báo `sent=0` nhưng đăng ký **không** bị dọn, log ghi
  `Gửi thông báo lỗi ? (TEST)` — mã trạng thái `undefined`.
- **Sai:** tôi bịa chuỗi `p256dh`. `web-push` dùng nó để thoả thuận khoá ECDH, nên
  chuỗi bịa làm hỏng ngay ở bước **mã hoá**, request chưa từng rời máy. Tôi chỉ
  đang test nhánh "mã hoá hỏng", trong khi tưởng mình test nhánh "gửi đi rồi bị
  từ chối".
- **Sửa:** sinh khoá thật bằng `createECDH('prime256v1')`. Giờ request đi hết
  đường tới FCM, nhận đúng 404, và nhánh dọn đăng ký chết được kiểm thật.
- **Lặp lại bài học của L18:** khi một case báo lỗi, xác minh đồ nghề trước — nhưng
  cũng đừng dừng ở đó, vì lần này đồ nghề sai **và** mã production cũng sai (L24),
  hai chuyện khác nhau trong cùng một lượt chạy.

### L26 — Chữ ngày tháng khác nhau giữa máy dev và container

- **Phát hiện:** unit test câu chữ thông báo ra `Cả ngày 09-09`, kỳ vọng `09/09`.
- **Sai:** `toLocaleDateString('vi-VN')` cho dấu ngăn cách phụ thuộc bộ dữ liệu
  ICU của từng bản Node. Cùng một dòng code, máy dev ra `09-09`, container ra
  `09/09` — nghĩa là **nội dung thông báo gửi cho người dùng đổi theo nơi chạy**.
- **Sửa:** ghép chuỗi ngày tay từ `getUTCDate()`/`getUTCMonth()`; giờ dùng
  `en-GB` (luôn cho `HH:mm` 24 giờ). `event-display.ts` phía web cũng đổi theo,
  để chữ trên màn hình và chữ trong thông báo không lệch nhau.
- Đây **không** phải sửa cho test xanh: định dạng đổi theo môi trường tự nó đã là lỗi.

---

## Đã tự rà (checklist R1 bước 1)

- **Null/undefined:** `userAgent` nullable; `event.data` trong service worker có
  thể rỗng → có `FALLBACK`; `remindMinBefore` nullable và `0` được phân biệt với `null`.
- **Kiểu dữ liệu:** `noUncheckedIndexedAccess` bắt một chỗ ở `SettingsScreen`.
  `applicationServerKey` cần `Uint8Array<ArrayBuffer>` thật (không nhận
  `ArrayBufferLike`) — đã cấp phát `new ArrayBuffer(n)` tường minh.
- **Biên:** nhắc trước 0 / âm / quá 7 ngày; 0 thiết bị; nhiều thiết bị; đăng ký
  trùng; hai người chung máy.
- **Async:** gửi thông báo khi check-in cố tình **không** `await` — việc phụ
  không được làm chậm việc chính. Job có cờ `running` chặn hai vòng chồng nhau.
- **Lỗi mạng:** mọi lỗi gửi đều bị nuốt và ghi log. 404/410 → dọn đăng ký;
  429/5xx → giữ lại thử sau (lỗi tạm thời).
- **Quyền:** chỉ xoá/liệt kê được đăng ký của **chính mình** (PU-10, PU-11).
  Đăng ký trùng endpoint thì **chuyển chủ**, không nhân đôi (PU-12) — không thì
  người đăng nhập sau nhận thông báo của người trước.
- **Múi giờ:** xem L26.
- **Dọn dẹp:** `usePush` không giữ timer nào; service worker gọi `clients.claim()`.
- **Rò rỉ dữ liệu:** endpoint không phô ra trong `/push/devices` (PU-05);
  service worker **chỉ nhận đường dẫn tương đối** trong `url` — không để dữ liệu
  đẩy điều hướng người dùng ra trang ngoài; log không in nội dung thông báo.

---

## Còn thiếu / để lại

- **Chưa bấm thử trên máy thật.** Đây là phần lớn nhất còn lại: bật thông báo →
  bấm "Gửi thử" → xem khay thông báo. Trên iPhone phải **cài lên màn hình chính
  trước** rồi mới bật được; màn Cài đặt đã nói rõ điều đó nhưng chưa ai thử.
- **Chưa thử trên iOS thật.** Web Push trên iOS chỉ chạy từ 16.4 và chỉ ở chế độ
  standalone. Code đã chặn trước và giải thích, nhưng chưa kiểm chứng.
- **Chưa có quản lý thiết bị trong giao diện.** API `/push/devices` đã có nhưng
  màn Cài đặt mới chỉ bật/tắt cho thiết bị hiện tại, chưa liệt kê và gỡ từng máy.
- **Chưa cho tuỳ chọn loại thông báo.** Hiện bật là nhận hết (nhắc lịch, check-in
  của người ấy). Nên tách thành từng công tắc.
- **Job nhắc lịch chưa chạy thật qua một mốc thời gian thật** — mới kiểm bằng
  unit test với đồng hồ giả.
- **Chưa có geofence** (F6): `PARTNER_ARRIVED` / `PARTNER_LEFT` đã khai báo trong
  `PUSH_KINDS` nhưng chưa có nơi nào gửi.

## Thay đổi đã ghi vào ARCHITECTURE.md

§4 (web-push, workbox runtime, chuyển service worker sang `injectManifest`),
§6 (`Event.reminderSentAt`), §7.1 (`/push/*`), §9 (F7 xong), §10 (ADR khoá công
khai trả qua API thay vì nhúng lúc build; ADR quét mỗi phút thay vì hẹn job từng
sự kiện; ADR đánh dấu trước khi gửi).
