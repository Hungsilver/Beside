# BACKLOG — ý tưởng & việc phát sinh

Nơi ghi lại những thứ nghĩ ra trong lúc làm nhưng **không** thuộc phạm vi việc đang làm.
Không tự ý làm những việc ở đây khi chưa được duyệt.

## Đã chốt (07/09/2026)

- [x] Tên app: **Beside**
- [x] Domain: `easytech.io.vn` (tạm) → sau đổi sang domain `beside`. Mọi URL đọc từ ENV.
- [x] Không làm chat trong app — chỉ nút deep-link Zalo / Messenger / gọi điện
- [x] Tab bar 5 khe: Nhà · Bản đồ · [＋] · Lịch · Kỷ niệm
- [x] Bảng màu hồng–tím giữ nguyên

## Đã chốt (07/09/2026 — đợt 2)

- [x] **Chủ dự án tự deploy lên VPS** → không cần IP/SSH. Hướng dẫn ở `docs/DEPLOY.md`
- [x] Tài khoản demo chỉ tạo bằng `npm run seed:demo` ở máy dev, không nằm trong code
- [x] **Không seed dữ liệu cá nhân trong code.** Tên, ngày sinh, ngày kỷ niệm, số Zalo…
      do hai người tự nhập trong app → đã làm màn hình `/cai-dat` + `GET|PATCH /me`
- [x] Dev dùng PostgreSQL cài sẵn trên máy (cổng 5432), Docker chỉ dùng lúc build/deploy
- [x] **Đã cài PostGIS 3.6.2** vào PostgreSQL 18 trên máy dev → Phase 2 không còn bị chặn

## Cần quyết định (chờ chủ dự án)

- [ ] Có cần bản Android APK (Phase 6) để tracking nền 24/7 không?
- [ ] Có muốn đổi ảnh đại diện (avatar) không? Hiện chỉ hiện chữ cái đầu của tên.
      MinIO và đường xử lý ảnh đã có sẵn từ Phase 3 nên giờ chỉ là việc nhỏ

## Ý tưởng chưa xếp lịch

- [ ] Chế độ "Cùng nghe nhạc" — đồng bộ 1 playlist
- [ ] Widget iOS qua Shortcuts (chỉ hiện số ngày yêu)
- [ ] Xuất album kỷ niệm ra PDF theo năm
- [ ] "Hộp thư tương lai" — viết thư hẹn mở vào ngày kỷ niệm
- [ ] Heatmap những nơi hai đứa hay đi
- [ ] SOS: giữ nút 3 giây → gửi vị trí + báo động cho đối phương
- [ ] Chế độ du lịch: giảm tần suất GPS khi roaming để tiết kiệm data

## Đã chốt (07/09/2026 — đợt 3)

- [x] **Toàn bộ stack đã chạy thật trên Docker** (db · redis · api · web · caddy), 5/5 healthy
- [x] Caddy cấp HTTPS bằng CA nội bộ cho `localhost` → thử được Geolocation trên máy dev
- [x] API tự chạy `prisma migrate deploy` khi khởi động — đã kiểm chứng
- [x] **Redis đã được test thật** — trace Phase 2 chạy lại trên Docker, có key `loc:last:*`
- [x] Trace lại trên Docker: Phase 1 53/53, Phase 2 29/29
- [x] **WebSocket đã kiểm chứng chạy xuyên Caddy HTTPS** — 29/29 qua `https://localhost`
      (lần đầu tưởng lỗi Caddy, hoá ra thư viện `ws` trong kịch bản test không nhận
      chứng chỉ tự ký; đã thêm cờ `TRACE_INSECURE_TLS=1`)

## Đã chốt (07/09/2026 — đợt 4, Phase 3)

- [x] **Ảnh phát qua API, không dùng URL ký sẵn của S3** — chữ ký SigV4 gắn với
      hostname nội bộ Docker, và link ký sẵn không kiểm tra được quyền theo cặp đôi
- [x] Nén ảnh **hai lần**: trình duyệt (2048px) để tiết kiệm data, server (3 cỡ WebP)
      làm chốt chặn thật
- [x] Cảm xúc lưu trong cột `Json` của `Post` — mỗi couple chỉ 2 người nên không tách bảng
- [x] Phân trang bằng **con trỏ** `(createdAt, id)` thay vì offset
- [x] `verify:local` khởi động lại API trước **mỗi** bộ trace (bộ đếm chống spam nằm
      trong bộ nhớ tiến trình, chạy nối tiếp làm case sau báo hỏng oan — xem L19)

## Đã chốt (08/09/2026 — Phase 4, F4 Lịch trình)

- [x] **Sự kiện cả ngày dùng "ngày trôi nổi"** (00:00 UTC, đọc theo UTC) —
      tách hẳn khỏi mốc thời gian thật. Xem ARCHITECTURE §6.3
- [x] Sự kiện **chung** thì cả hai đều thấy, chỉ người tạo mới sửa/xoá
- [x] Việc riêng của người kia trả **404** chứ không phải 403
- [x] Truy vấn lịch dùng điều kiện **giao khoảng**, không lọc theo mỗi `startAt`
- [x] Thêm migration bật PostGIS chạy đầu tiên, để shadow DB replay được

## Đã chốt (08/09/2026 — Phase 4, F7 Thông báo đẩy)

- [x] Dùng **`web-push` + VAPID** trực tiếp, không qua Firebase hay dịch vụ bên thứ ba
- [x] Khoá công khai trả qua `GET /push/public-key`, **không nhúng lúc build**
- [x] Service worker chuyển sang **`injectManifest`** để tự viết được handler `push`
- [x] Nhắc lịch bằng **vòng quét mỗi phút**, đánh dấu `reminderSentAt` TRƯỚC khi gửi
- [x] Thiếu khoá VAPID = tắt tính năng (app vẫn chạy); khai báo nửa vời = từ chối boot
- [x] Đăng ký đẩy trùng endpoint thì **chuyển chủ** — chống việc hai người dùng
      chung một máy nhận thông báo của nhau

## Đã chốt (08/09/2026 — Phase 4, F6 Địa điểm & Geofence)

- [x] Geofence chạy ở **server** (lớp L3), không tốn pin máy người dùng
- [x] **Ba chốt chặn** chống báo sai: sai số GPS · khoảng chênh 30m · ở đủ 60 giây
- [x] Trạng thái để ở bảng riêng `GeofenceState`, không suy từ sự kiện gần nhất
- [x] Địa điểm là của **cả cặp đôi** — khác sự kiện trên lịch (chỉ người tạo mới sửa)
- [x] Làm mờ vị trí rộng hơn hàng rào ⇒ vẫn ghi cho chính chủ nhưng **không báo** cho người kia
- [x] Dùng lại hằng số Phase 0 (`GEOFENCE_EXIT_HYSTERESIS_M`, `PLACE_RADIUS_*`)

## Nợ kỹ thuật (ghi khi phát sinh)

| Ngày | Mô tả | Mức độ | File |
|---|---|---|---|
| 07/09 | Chưa test hành vi khi **Redis chết giữa chừng** (đang chạy rồi mất kết nối). Đã test nhánh "không có Redis từ đầu" và nhánh "có Redis", chưa test lúc chuyển trạng thái | Trung bình | `apps/api/src/common/redis/redis.service.ts` |
| 07/09 | Chưa test hai instance API dùng chung một Redis — hạn mức và cache lúc đó mới thật sự cần Redis | Thấp (đang chạy 1 instance) | `apps/api/src/locations/` |
| 07/09 | Icon PWA đang là hình trái tim sinh bằng script, cần bộ icon thật | Thấp | `apps/web/public/icons/` |
| 07/09 | Chưa có E2E Playwright ở viewport 390×844. `api-client` đã có 10 test, nhưng **render React chưa được test** (cần jsdom + Testing Library) | Trung bình | `apps/web/src/` |
| 07/09 | Chưa test job dọn lịch sử vị trí trên dữ liệu quá 7/90 ngày (cần tách đồng hồ ra khỏi service) | Trung bình | `apps/api/src/locations/location-retention.job.ts` |
| 07/09 | Chưa test kịch bản rớt mạng giữa chuyến đi rồi nối lại | Trung bình | `apps/web/src/lib/realtime.tsx` |
| 07/09 | `watchPosition` / Wake Lock / MapLibre chỉ chạy được trong trình duyệt thật — phần ghép nối giao diện chưa được bấm thử. Đã có `https://localhost` nên thử được | Cao | `apps/web/src/lib/use-live-location.ts` |
| 07/09 | **Chưa thử được trên điện thoại thật qua LAN**: chứng chỉ Caddy chỉ cấp cho `localhost`, điện thoại vào `https://192.168.x.x` sẽ lỗi TLS. Cách làm: deploy lên VPS, hoặc dùng tunnel (ngrok/cloudflared) | Trung bình | `docker-compose.local.yml` |
| 07/09 | Chưa test được mã mời **hết hạn** (cần tách đồng hồ ra khỏi service để giả lập thời gian) | Trung bình | `apps/api/src/couples/couples.service.ts` |
| 07/09 | Luồng đăng ký → ghép đôi → cài đặt chưa bấm thử trên trình duyệt thật (đã test đầy đủ qua API: 53 case) | Trung bình | `apps/web/src/screens/` |
| 07/09 | Ảnh check-in **chưa hiện lên bản đồ**. Toạ độ đã lưu đúng và lọc được (`filter=pinned`), chỉ còn thiếu phần vẽ điểm ghim | Trung bình | `apps/web/src/screens/MapScreen.tsx` |
| 07/09 | Chưa test **ảnh 12MB thật từ điện thoại** và ảnh HEIC của iPhone — mới test ảnh sinh bằng sharp | Cao | `apps/web/src/lib/image-compress.ts` |
| 07/09 | Chưa test **mất mạng giữa chừng lúc upload** (case bắt buộc của R1 nhóm check-in ảnh) — cần chặn mạng ở tầng trình duyệt | Trung bình | `apps/web/src/screens/CheckinScreen.tsx` |
| 07/09 | Xoá bài xoá bản ghi DB trước, xoá tệp MinIO sau. Nếu tiến trình chết ở giữa thì còn **tệp mồ côi** trong kho — vô hại nhưng tốn chỗ, chưa có job dọn | Thấp | `apps/api/src/posts/posts.service.ts` |
| 07/09 | Chưa có E2E Playwright cho hai màn mới `/check-in` và `/ky-niem` ở 390×844 | Trung bình | `apps/web/src/screens/` |
| 08/09 | **`prisma migrate dev` vẫn không chạy được** dù đã thêm migration bật PostGIS và đã kiểm chứng cả 6 migration replay sạch vào DB trắng. Đang đi đường vòng: `migrate diff` → viết tay thư mục migration → `migrate deploy`. Cần tìm ra nguyên nhân thật | Trung bình | `apps/api/prisma/migrations/` |
| 08/09 | **Chuỗi hiển thị vẫn nằm rải rác trong component**, chưa gom về `src/i18n/vi.ts` như CLAUDE.md R2 yêu cầu. Lệch từ Phase 1, mỗi phase lại thêm — càng để lâu càng khó gom | Trung bình | `apps/web/src/` |
| 08/09 | Nhắc lịch chưa chạy: `remindMinBefore` đã lưu và chọn được nhưng chưa có job gửi thông báo (cần Web Push trước) | Cao | `apps/api/src/events/` |
| 08/09 | Chưa gắn được địa điểm vào sự kiện — `placeId` đã có và đã kiểm quyền, nhưng chưa có màn quản lý Địa điểm (F6) | Trung bình | `apps/web/src/screens/CalendarScreen.tsx` |
| 08/09 | Lịch mới có chế độ xem tháng + danh sách theo ngày; chưa có xem tuần / xem danh sách dài | Thấp | `apps/web/src/screens/CalendarScreen.tsx` |
| 08/09 | `<input type="date">` và `type="time"` hiển thị rất khác nhau giữa iOS Safari và Chrome Android — chưa bấm thử trên máy thật | Cao | `apps/web/src/components/EventSheet.tsx` |
| 08/09 | **Chưa bấm thử thông báo trên máy thật.** Trace và unit test phủ hết phần server, nhưng "thông báo có hiện lên khay hay không" thì chỉ bấm tay mới biết. Trên iPhone phải cài lên màn hình chính trước | Cao | `apps/web/src/sw.ts` |
| 08/09 | Chưa có màn quản lý thiết bị nhận thông báo — API `/push/devices` đã có nhưng giao diện mới chỉ bật/tắt cho máy hiện tại | Thấp | `apps/web/src/screens/SettingsScreen.tsx` |
| 08/09 | Chưa tách được từng loại thông báo (nhắc lịch / check-in / geofence) — hiện bật là nhận hết | Trung bình | `apps/api/src/push/` |
| 08/09 | Job nhắc lịch chưa chạy thật qua một mốc thời gian thật, mới kiểm bằng unit test với đồng hồ giả | Trung bình | `apps/api/src/events/event-reminder.job.ts` |
| 08/09 | `PARTNER_ARRIVED` / `PARTNER_LEFT` đã khai báo trong `PUSH_KINDS` nhưng chưa có nơi nào gửi — chờ F6 Geofence | Trung bình | `packages/shared/src/push.schema.ts` |
| 08/09 | **Chưa chọn được địa điểm trên bản đồ** — mới lưu được "chỗ tôi đang đứng". Muốn lưu nhà người yêu khi đang ngồi ở quán thì chưa làm được | Cao | `apps/web/src/screens/PlacesScreen.tsx` |
| 08/09 | Hàng rào và ghim địa điểm **chưa vẽ lên `MapScreen`** | Trung bình | `apps/web/src/screens/MapScreen.tsx` |
| 08/09 | Bảng `geofence_events` ghi đầy đủ nhưng **chưa có API đọc** — chưa hiện được "hôm nay người ấy tới những đâu" | Trung bình | `apps/api/src/places/` |
| 08/09 | Chưa có case hai người cùng ở trong một hàng rào (logic tách theo `userId` nên về lý là đúng) | Thấp | `apps/api/test/trace-phase4-places.mjs` |
| 08/09 | Geofence dùng `haversineMeters` trong RAM, chưa dùng `ST_DWithin` của PostGIS — đủ cho 20 địa điểm, cần đổi nếu tăng nhiều | Thấp | `apps/api/src/places/geofence.service.ts` |
| 08/09 | `npm run verify:local` giờ mất ~2,5 phút chỉ riêng bộ trace địa điểm (phải chờ thật 2×65 giây vì ngưỡng "ở đủ lâu") | Thấp | `apps/api/test/trace-phase4-places.mjs` |
