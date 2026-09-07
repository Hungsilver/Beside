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
