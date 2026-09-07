# Beside — App check-in & theo dõi lịch trình cho cặp đôi

PWA cho 2 người: xem vị trí nhau theo thời gian thực, check-in bằng ảnh, lịch trình chung,
đếm ngày yêu. Chạy trên iPhone & Android **không cần App Store / CH Play**.
Self-host bằng Docker trên VPS riêng.

- **Domain:** `easytech.io.vn` (tạm — sẽ đổi sang domain `beside`, chỉ cần sửa `.env`)
- **Trạng thái:** Phase 2 xong — thêm bản đồ vị trí thời gian thực, vệt đường, quyền riêng tư

---

## Bắt đầu

Dùng **PostgreSQL cài sẵn trên máy** — không cần Docker khi dev:

```bash
# Tạo user + database, chạy MỘT LẦN bằng tài khoản superuser
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f infra/postgres/local-setup.sql

cp .env.example .env       # file mẫu dành cho MÁY DEV
npm install
npm run db:migrate         # tạo bảng
npm run dev:api            # http://localhost:3000/api/v1
npm run dev:web            # http://localhost:5173
```

> **PostGIS** không đi kèm bản cài PostgreSQL mặc định và chỉ cần từ Phase 2 —
> script tự bỏ qua nếu chưa có.
>
> Muốn dùng Docker cho tầng dữ liệu thì chạy `npm run infra:up`, nhớ đổi `DATABASE_URL`
> sang cổng `55432` vì PostgreSQL cài sẵn đang giữ 5432.
>
> **Lệnh Prisma phải chạy từ gốc repo** (`npm run db:*`), vì Prisma tìm `.env` theo
> thư mục hiện tại.

## Hai môi trường

| | Dev trên máy | Dev qua Docker | Production |
|---|---|---|---|
| Lệnh | `npm run dev:api` + `dev:web` | `npm run docker:up` | `docker compose up -d --build` |
| `NODE_ENV` | development | production | production |
| Địa chỉ | `http://localhost:5173` | `https://localhost` | domain thật |
| File cấu hình | `.env.example` | `.env.example` | **`.env.production.example`** |

Hai file mẫu tách hẳn nhau. Nếu lỡ copy `.env` của máy dev lên máy chủ, API sẽ
**từ chối khởi động** và in ra đúng biến nào còn là giá trị dev.

## Tài khoản để bấm thử

Dự án **không cắm sẵn tài khoản nào vào code** — hai người tự đăng ký trong app.
Riêng ở máy dev, tạo nhanh 2 tài khoản đã ghép đôi bằng:

```bash
npm run seed:demo
```

| | Email | Mật khẩu |
|---|---|---|
| An | `an@beside.vn` | `beside2026` |
| Bình | `binh@beside.vn` | `beside2026` |

Đã ghép đôi sẵn, ngày yêu 14/02/2023. Bình có số Zalo (để thấy nút "Nhắn Zalo" hoạt động),
An để trống (để thấy lời nhắc "còn thiếu một chút" ở trang chủ).

Script **từ chối chạy** nếu địa chỉ không phải `localhost`. Chạy lại nhiều lần không sao.

## Kiểm tra trước khi lên production

```bash
npm run verify:local
```

Chạy 28 mục qua **đúng đường mà production sẽ chạy** (Docker + Caddy HTTPS + PostGIS +
Redis thật, không mock): hạ tầng · HTTPS & header bảo mật · Socket.IO qua Caddy ·
103 case nghiệp vụ · typecheck · 140 unit test. Kết thúc bằng kết luận rõ ràng
"đã sẵn sàng hay còn thiếu gì", và tự dọn dữ liệu test.

Ba thứ script không thay người được, phải bấm tay trên trình duyệt:
quyền vị trí + chấm di chuyển (F12 › Sensors › Location) · Wake Lock · cài PWA.

## Kiểm thử lẻ

```bash
npm run typecheck    # shared + api + web
npm test             # 140 unit test
npm run trace:phase1 # 53 case  — auth & ghép đôi
npm run trace:phase2 # 29 case  — vị trí thời gian thực (REST + WebSocket)
npm run trace:review # 21 case  — rà soát: cache Redis, biên, huỷ ghép đôi
```

Hai lệnh trace cần API + PostgreSQL đang chạy. Kết quả ghi ở `docs/traces/`.

## Chạy toàn bộ bằng Docker trên máy

```bash
npm run docker:up      # build + chạy cả 5 service
npm run docker:ps      # xem trạng thái
npm run docker:logs    # xem log
npm run docker:down    # dừng
```

Mở **https://localhost** — Caddy cấp chứng chỉ bằng CA nội bộ nên trình duyệt sẽ
cảnh báo "không tin cậy", bấm qua là được. Vẫn là HTTPS thật nên **Geolocation API
hoạt động**, thử được tính năng bản đồ.

API cũng được mở ở `http://localhost:3001` (chỉ khi chạy local) để chạy kịch bản trace
mà không phải xử lý chứng chỉ tự ký:

```bash
TRACE_BASE_URL=http://localhost:3001/api/v1 TRACE_WS_ORIGIN=http://localhost:3001 npm run trace:phase2
```

## Triển khai lên VPS

Hướng dẫn đầy đủ: **`docs/DEPLOY.md`**. Tóm tắt:

```bash
# Trên VPS, sau khi trỏ bản ghi A của easytech.io.vn về IP máy
cp .env.production.example .env    # file mẫu dành cho MÁY CHỦ — khác với .env.example
docker compose up -d --build
```

Caddy tự xin chứng chỉ Let's Encrypt. API tự chạy `prisma migrate deploy` khi khởi động.

---

## Cấu trúc

```
ARCHITECTURE.md          ← kiến trúc đầy đủ (ĐỌC FILE NÀY TRƯỚC TIÊN)
CLAUDE.md                ← quy tắc dự án (R1: bắt buộc review + trace sau khi code)
docker-compose.yml       ← db · redis · api · web · caddy · minio
docker-compose.local.yml ← lớp phủ chạy full stack trên máy (domain localhost)
infra/
  caddy/Caddyfile        ← TLS tự động + reverse proxy + header bảo mật
  nginx/web.conf         ← phục vụ file tĩnh PWA, SPA fallback
  postgres/init/         ← bật PostGIS, unaccent, ép timezone UTC
packages/shared/         ← Zod schema + logic ngày tháng dùng CHUNG cho API và web
apps/api/                ← NestJS + Prisma  (auth, me, couples, locations + WebSocket, posts)
apps/web/                ← React 19 + Vite + Tailwind v4 + PWA
mockup/
  index.html             ← phác thảo Phase 0 (9 màn, để duyệt hướng thiết kế)
  app.html               ← giao diện CHỨC NĂNG đã dựng thật, bấm thử được
  app-gallery.html       ← 11 màn chức năng xem cùng lúc
docs/traces/             ← bảng trace bắt buộc cho từng feature
docs/DEPLOY.md           ← hướng dẫn triển khai lên VPS
docs/BACKLOG.md          ← ý tưởng & việc chờ quyết định
```

## Đã có gì (Phase 1 → 3)

| | |
|---|---|
| Đăng ký / đăng nhập | scrypt (`node:crypto`), không dùng native addon |
| Phiên đăng nhập | JWT 15 phút + refresh cookie httpOnly 30 ngày, xoay vòng + phát hiện token bị đánh cắp |
| Ghép đôi | mã 6 ký tự (bỏ 0/1/O/I), hết hạn 24h, chống race khi 2 người bấm cùng lúc |
| Đếm ngày yêu | tính theo ngày lịch giờ VN, có mốc kế tiếp + tiến độ |
| Huỷ ghép đôi | phải xác nhận, xoá couple + toàn bộ dữ liệu chung |
| Nút nhắn tin | deep-link Zalo / Messenger / gọi / SMS — **không có chat trong app** |
| Sửa hồ sơ | màn `/cai-dat`: tên, ngày sinh, app nhắn tin + số, ngày kỷ niệm, huỷ ghép đôi |
| **Bản đồ thời gian thực** | MapLibre GL + tile OpenFreeMap. Chấm vị trí, vòng sai số, vệt đường 12 giờ, khoảng cách tính bằng PostGIS |
| **Chia sẻ trực tiếp** | `watchPosition` + lọc nhiễu Kalman + lấy mẫu thích ứng (đứng yên 60s → đi xe 8s) + giữ màn hình sáng, tự dừng sau 60 phút |
| **Quyền riêng tư** | Ẩn danh (không ghi, không phát, giấu cả khoảng cách) · tắt chia sẻ trực tiếp · làm mờ vị trí 500m |
| Dọn lịch sử vị trí | 7 ngày đầy đủ → 90 ngày rút gọn → xoá. Chạy tự động 03:00 hằng ngày |
| **Check-in bằng ảnh** | tối đa 3 ảnh/bài, nén ở trình duyệt rồi nén lại ở server thành 3 cỡ WebP, có lời nhắn + tâm trạng + ghim toạ độ |
| **Xoá EXIF** | ảnh được xoay theo thẻ EXIF rồi **xoá sạch metadata** (toạ độ GPS, model máy) trước khi lưu |
| **Dòng kỷ niệm** | cuộn vô hạn bằng con trỏ, lọc (tất cả / của tôi / của người ấy / có ghim), thả cảm xúc, xoá bài của chính mình |
| Ảnh riêng tư | ảnh **không** phát bằng link công khai — mỗi lượt xem đều kiểm tra quyền theo cặp đôi |
| PWA | cài lên màn hình chính, manifest + icon + service worker, cache tile bản đồ |

## Chưa có

Lịch trình + thông báo đẩy + geofence (Phase 4), giao diện PC (Phase 5).
Ảnh check-in đã lưu được toạ độ nhưng **chưa hiện lên bản đồ** — để ở Phase 4.
Xem lộ trình ở `ARCHITECTURE.md §9`.

## Điều cần biết trước khi kỳ vọng

Trình duyệt **không** lấy được vị trí khi app đã đóng hoặc màn hình đã khoá — nhất là trên
iPhone. Vì vậy app dùng mô hình **“Chia sẻ trực tiếp” (khi app đang mở) + “vị trí lần cuối”**,
chứ không phải theo dõi ngầm 24/7 như Life360. Muốn 24/7 thì cần bản Android APK
(Phase 6, tuỳ chọn). Chi tiết ở `ARCHITECTURE.md §1.3` và `§2`.
