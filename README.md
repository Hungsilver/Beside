<div align="center">

# 💞 Beside

**Ứng dụng cho hai người: thấy nhau trên bản đồ, chia sẻ lịch trình, lưu lại khoảnh khắc.**

Cài từ trình duyệt lên iPhone và Android — *không qua App Store hay CH Play*.
Tự chạy trên VPS của bạn, dữ liệu không đi đâu cả.

<br>

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_17_·_PostGIS_3.5-4169E1?logo=postgresql&logoColor=white)
![MapLibre](https://img.shields.io/badge/MapLibre_GL-000?logo=maplibre&logoColor=white)
![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?logo=docker&logoColor=white)

</div>

---

## Có gì

<table>
<tr><td width="50%" valign="top">

**📍 Vị trí thời gian thực**

Chấm vị trí, vòng sai số, vệt đường 12 giờ. Lọc nhiễu Kalman, lấy mẫu thích ứng
(đứng yên 60s → đi xe 8s), giữ màn hình sáng, tự dừng sau 60 phút.

**🏠 Địa điểm & hàng rào ảo**

Lưu Nhà, Công ty, quán quen. Tự báo khi người ấy tới nơi hoặc rời đi — không cần
nhắn *"về tới chưa"*.

**📸 Check-in bằng ảnh**

Tối đa 3 ảnh mỗi bài, nén hai lần, **xoá sạch EXIF** trước khi lưu. Dòng kỷ niệm
cuộn vô hạn, thả cảm xúc, ghim lên bản đồ.

</td><td width="50%" valign="top">

**🗓️ Lịch trình chung**

Sự kiện có giờ hoặc cả ngày, cảnh báo trùng giờ, việc riêng chỉ mình thấy.
Nhắc trước qua thông báo đẩy.

**💖 Đếm ngày yêu & mốc kỷ niệm**

Mốc ngày (100 / 365 / 1000…), kỷ niệm hằng năm, sinh nhật — tự tính. Thêm được
mốc riêng của hai người.

**🔒 Quyền riêng tư là mặc định**

Ẩn danh (không ghi, không phát, giấu cả khoảng cách) · tắt chia sẻ trực tiếp ·
làm mờ vị trí 500m · lịch sử tự xoá theo thời gian.

</td></tr>
</table>

> **Không có chat trong app.** Chỉ một nút deep-link mở Zalo / Messenger / gọi điện.
> Hai người đã có sẵn chỗ để nhắn cho nhau rồi.

---

## Bắt đầu

```bash
git clone https://github.com/Hungsilver/Beside.git beside && cd beside
cp .env.example .env          # file mẫu cho MÁY DEV
npm install
npm run docker:up             # dựng cả 6 service
npm run seed:demo             # 2 tài khoản đã ghép đôi + dữ liệu mẫu
```

Mở **https://localhost**. Caddy cấp chứng chỉ bằng CA nội bộ nên trình duyệt sẽ
cảnh báo — bấm qua là được. Vẫn là HTTPS thật nên **Geolocation hoạt động**.

| | Email | Mật khẩu |
|---|---|---|
| An | `an@beside.vn` | `beside2026` |
| Bình | `binh@beside.vn` | `beside2026` |

Đăng nhập An ở cửa sổ thường, Bình ở cửa sổ ẩn danh, rồi mở tab **Bản đồ**.

<details>
<summary>Chạy API/web trực tiếp trên máy (nạp lại nóng)</summary>

```bash
npm run docker:up      # vẫn cần db + redis + minio
npm run dev:api        # http://localhost:3000/api/v1
npm run dev:web        # http://localhost:5173
```

Lệnh Prisma phải chạy **từ gốc repo** (`npm run db:*`) vì Prisma tìm `.env` theo
thư mục hiện tại.

</details>

---

## Kiểm thử

Dự án này có một quy tắc bất di bất dịch (`CLAUDE.md` R1): **không tính năng nào
được coi là xong** nếu chưa qua tự rà soát → trace bằng dữ liệu giả định → kiểm
thử tự động.

```bash
npm run verify:local
```

Một lệnh, **38 mục**, chạy qua đúng con đường production sẽ đi — Docker + Caddy
HTTPS + PostGIS + Redis + MinIO thật, không mock gì cả:

| Tầng | Nội dung |
|---|---|
| Hạ tầng | 6 container, PostGIS, Redis, migration, bucket MinIO |
| HTTPS | header bảo mật, chuyển hướng, PWA manifest, Socket.IO qua Caddy |
| Nghiệp vụ | **8 bộ trace · 247 case** — auth, ghép đôi, vị trí, ảnh, lịch, thông báo, địa điểm, mốc kỷ niệm |
| Mã nguồn | typecheck · ESLint · **277 unit test** · **21 test E2E** trên trình duyệt thật ở 390×844 |

Kết thúc bằng một kết luận rõ ràng, và tự dọn dữ liệu test.

<details>
<summary>Chạy lẻ từng bộ</summary>

```bash
npm run typecheck                 # shared + api + web
npm run lint                      # ESLint cả 3 workspace
npm test                          # 277 unit test
npm run e2e                       # 21 test Playwright ở 390×844

npm run trace:phase1              # 53 case — auth & ghép đôi
npm run trace:phase2              # 29 case — vị trí thời gian thực (REST + WebSocket)
npm run trace:review              # 21 case — cache Redis, biên, huỷ ghép đôi
npm run trace:phase3              # 34 case — check-in ảnh & dòng kỷ niệm
npm run trace:phase4              # 37 case — lịch trình chung
npm run trace:push                # 21 case — thông báo đẩy & nhắc lịch
npm run trace:places              # 27 case — địa điểm & hàng rào ảo
npm run trace:milestones          # 25 case — mốc kỷ niệm
```

Bộ trace cần Docker đang chạy. Kết quả và phân tích lưu ở [`docs/traces/`](docs/traces).

</details>

> **Mọi chốt kiểm thử đều đã được kiểm chứng là *đỏ được*.** Mỗi lần thêm một
> phép kiểm mới, nó được thử trên một bản cố tình làm hỏng trước khi được tin.
> Lý do: `npm run lint` từng chạy suốt bốn phase mà **không kiểm gì cả** —
> xem [`docs/traces/fix-lint-khong-chay.md`](docs/traces/fix-lint-khong-chay.md).

---

## Triển khai

Hướng dẫn đầy đủ: **[`docs/DEPLOY.md`](docs/DEPLOY.md)**. Tóm tắt:

```bash
# Trên VPS, sau khi trỏ bản ghi A của domain về IP máy
cp .env.production.example .env    # KHÔNG dùng .env.example
docker compose up -d --build
```

Caddy tự xin chứng chỉ Let's Encrypt. API tự chạy `prisma migrate deploy` lúc
khởi động.

**Hai file mẫu `.env` tách hẳn nhau.** Lỡ mang `.env` của máy dev lên máy chủ thì
API **từ chối khởi động** và in ra đúng biến nào còn là giá trị dev — thà chết
lúc boot còn hơn chạy với secret ai cũng đoán được.

Yêu cầu tối thiểu: **2 vCPU · 4 GB RAM · 40 GB SSD**.

---

## Kiến trúc

```
apps/
  api/          NestJS 11 + Prisma 6 — auth · couples · locations (+WebSocket)
                posts · events · push · places · milestones
  web/          React 19 + Vite + Tailwind v4 + MapLibre GL + PWA
packages/
  shared/       Zod schema & logic ngày tháng dùng CHUNG cho cả hai phía
infra/
  caddy/        TLS tự động + reverse proxy + header bảo mật
  nginx/        phục vụ file tĩnh PWA, SPA fallback
  postgres/     PostGIS, unaccent, ép timezone UTC
mockup/         phác thảo giao diện Phase 0 — mở thẳng bằng trình duyệt, không cần build
docs/
  traces/       15 bảng trace — mỗi tính năng một bảng, kèm mọi lỗi đã tìm ra
  DEPLOY.md     triển khai lên VPS
  BACKLOG.md    ý tưởng & việc chờ quyết định
```

| Tầng | Chọn gì | Vì sao |
|---|---|---|
| Bản đồ | **MapLibre GL + OpenFreeMap** | Miễn phí, không cần API key, tuỳ biến được theo chủ đề |
| Vị trí | PostgreSQL + **PostGIS** | Khoảng cách và hàng rào tính bằng truy vấn không gian |
| Thời gian thực | **Socket.IO** | Safari trên iOS hay rớt WebSocket thuần, cần fallback |
| Ảnh | **MinIO** + sharp | Self-host; đổi sang S3 thật sau này không phải sửa code |
| Thông báo | **web-push + VAPID** | Không cần Firebase, không cần tài khoản bên thứ ba |
| Mật khẩu | **scrypt** của `node:crypto` | Không native addon → không vỡ khi cài, image Docker nhẹ |

Toàn bộ quyết định kiến trúc, mô hình dữ liệu và hợp đồng API nằm ở
**[`ARCHITECTURE.md`](ARCHITECTURE.md)** — đọc file đó trước khi viết code.

---

## Điều cần biết trước khi kỳ vọng

**Trình duyệt không lấy được vị trí khi app đã đóng hoặc màn hình đã khoá** — nhất
là trên iPhone. Đây là giới hạn của nền tảng, không phải thiếu sót của app.

Vì vậy Beside dùng mô hình **“Chia sẻ trực tiếp” (khi app đang mở) + “vị trí lần
cuối”**, chứ không theo dõi ngầm 24/7 như Life360. Muốn 24/7 thì cần bản Android
APK — nằm ở Phase 6 và là tuỳ chọn. Chi tiết: `ARCHITECTURE.md` §1.3 và §2.

Thông báo đẩy cần **khoá VAPID** trên server. Chưa cấu hình thì tính năng tự tắt
và app vẫn chạy bình thường.

---

## Trạng thái

**Phase 1 → 4 đã xong** — ghép đôi, vị trí thời gian thực, check-in ảnh, lịch
trình, thông báo đẩy, địa điểm & geofence, mốc kỷ niệm.

**Phase 5 đang làm.** Đã có: địa điểm và ảnh check-in trên bản đồ · tách
`socket.io-client` khỏi gói tải đầu · PWA offline mức 1 (mở được app khi mất mạng).

Còn lại: giao diện PC, PWA offline mức 2, và nhóm việc chỉ kiểm được trên máy
thật — thông báo đẩy tới khay hệ thống, chọn ảnh từ thư viện điện thoại, ô chọn
ngày giờ trên iOS Safari.

Lộ trình đầy đủ ở `ARCHITECTURE.md` §9; việc còn treo ở
[`docs/BACKLOG.md`](docs/BACKLOG.md).
