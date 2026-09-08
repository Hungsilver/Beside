# ARCHITECTURE.md — Ứng dụng Check-in & Theo dõi lịch trình cho cặp đôi

> **File này là nguồn sự thật (source of truth) về kiến trúc.**
> Mọi thay đổi về stack, schema, API, luồng dữ liệu **phải** được ghi lại ở đây
> *trước hoặc ngay sau khi* code. Đọc file này trước khi viết code mới.

- **Tên app:** `Beside` (đã chốt)
- **Domain:** `https://easytech.io.vn` (tạm dùng — đã mua). Sẽ đổi sang domain `beside` sau
  ⇒ **mọi URL phải lấy từ biến môi trường, không hardcode domain ở bất kỳ đâu**
- **Cập nhật lần cuối:** 2026-09-08
- **Trạng thái:** `PHASE 4` — F4 Lịch trình ✅ · F7 Thông báo đẩy ✅ · còn F6 Geofence, F5 Milestone
  - Phase 1: `docs/traces/phase-1-auth-pairing.md` — 53/53 case
  - Phase 2: `docs/traces/phase-2-realtime-location.md` — 29/29 case
  - Rà soát: `docs/traces/phase-2-review.md` — 21/21 case (bắt được 2 lỗi rò rỉ quyền riêng tư)
  - Phase 3: `docs/traces/phase-3-posts.md` — 34/34 case (bắt được 4 lỗi, xem L16–L19)
  - Phase 4 (F4): `docs/traces/phase-4-events.md` — 37/37 case (bắt được 2 lỗi, L22–L23)
  - Phase 4 (F7): `docs/traces/phase-4-push.md` — 21/21 case (bắt được 3 lỗi, L24–L26)
  - Tổng: **205 unit test** + **195 case trace**, typecheck + lint sạch cả 3 workspace
  - ✅ `npm run verify:local` → **34/34 mục đạt** trên Docker thật
    (6/6 container healthy: db · redis · api · web · caddy · minio), đi qua Caddy HTTPS
- **Triển khai:** chủ dự án tự deploy — hướng dẫn ở `docs/DEPLOY.md`

---

## 1. Bài toán & Ràng buộc

### 1.1 Yêu cầu chức năng
| # | Chức năng | Mô tả |
|---|-----------|-------|
| F1 | Ghép đôi (Pairing) | 2 người ghép thành 1 `couple` qua mã mời 6 ký tự. 1 user chỉ thuộc 1 couple tại 1 thời điểm |
| F2 | Vị trí thời gian thực | Xem đối phương đang di chuyển trên bản đồ, có vệt đường đi (trail), độ chính xác, hướng, tốc độ |
| F3 | Check-in bằng ảnh | Chụp/chọn ảnh + caption + vị trí → ghim lên bản đồ + lên timeline |
| F4 | Lịch trình chung | Lịch hẹn, kế hoạch đi chơi, nhắc nhở; xem "hôm nay đối phương đi đâu" |
| F5 | Đếm ngày yêu | Số ngày bên nhau, đếm ngược mốc kỷ niệm (100/365/1000 ngày, sinh nhật) |
| F6 | Địa điểm & Geofence | Lưu "Nhà", "Công ty", "Quán quen" → tự động thông báo khi đến/rời |
| F7 | Thông báo đẩy | Web Push: đối phương đã đến nơi, vừa check-in, sắp tới ngày kỷ niệm |
| F8 | Quyền riêng tư | Ghost mode (tạm ẩn vị trí), làm mờ độ chính xác, hạn lưu lịch sử vị trí |
| F9 | Nhắn tin | **Không làm chat trong app.** Chỉ 1 nút deep-link mở Zalo / Messenger / gọi điện |

### 1.1b Ngoài phạm vi (không làm)

- Chat / nhắn tin trong app (đã chốt: chỉ deep-link ra app ngoài — xem F9)
- Gọi thoại / video trong app
- Hỗ trợ >2 người trong một `couple`
- Đưa lên App Store / CH Play

### 1.2 Ràng buộc kỹ thuật (quyết định toàn bộ kiến trúc)
| # | Ràng buộc | Hệ quả |
|---|-----------|--------|
| C1 | **Không đưa lên App Store / CH Play** | → Phải là **PWA** (cài qua trình duyệt "Thêm vào màn hình chính"). Android có thể bổ sung APK sideload |
| C2 | Chạy trên cả iPhone lẫn Android | → Web chuẩn, không dùng API chỉ có ở 1 nền tảng cho luồng chính |
| C3 | Mobile-first, PC làm sau | → Breakpoint gốc 390px, mở rộng lên ≥1024px ở Phase 5 |
| C4 | Có sẵn VPS + Docker | → Self-host toàn bộ bằng `docker compose`, không phụ thuộc PaaS |
| C5 | Quy mô cực nhỏ (2 user/couple) | → Không cần k8s/sharding. Ưu tiên **đơn giản + rẻ + ổn định** |

### 1.3 ⚠️ Giới hạn không thể vượt qua của Web (phải chấp nhận & thiết kế quanh nó)

> **Trình duyệt KHÔNG lấy được vị trí khi app đã đóng hoặc màn hình đã khoá.**

- iOS Safari: JS bị treo (suspend) ngay khi chuyển tab / khoá màn hình → `watchPosition` dừng.
- Service Worker **không** có quyền truy cập Geolocation API.
- Web Push đánh thức được SW (iOS 16.4+ với PWA đã cài) nhưng SW vẫn không lấy được GPS.
- `periodicSync` chỉ có trên Android Chrome, tần suất tối thiểu ~12h, không đảm bảo.

**⇒ Không thể làm "Life360 24/7" bằng web thuần.** Kiến trúc dưới đây dùng mô hình
**"Live Session + Last-known ping"** — phù hợp thực tế cặp đôi (xem nhau khi đang trên
đường tới gặp nhau) và tiết kiệm pin.

---

## 2. Phương án theo dõi vị trí (4 lớp)

```
┌─ L1 · LIVE SESSION (khi app đang mở) ──────────────────────────────┐
│ Kích hoạt: bấm "Chia sẻ trực tiếp" HOẶC đang ở tab Bản đồ           │
│ Cơ chế   : navigator.geolocation.watchPosition({enableHighAccuracy})│
│            + Screen Wake Lock API (giữ màn hình sáng)               │
│            + Socket.IO đẩy lên server                               │
│ Tần suất : thích ứng — xem §2.1                                     │
│ Độ trễ   : < 2 giây                                                 │
│ Nền tảng : iOS ✅  Android ✅  (chỉ khi app hiện trên màn hình)      │
└────────────────────────────────────────────────────────────────────┘
┌─ L2 · LAST-KNOWN PING (bị động) ───────────────────────────────────┐
│ Kích hoạt: mở app, visibilitychange→visible, ngay trước khi ẩn đi   │
│ Cơ chế   : getCurrentPosition() 1 lần → POST /locations             │
│ Hiển thị : "Đang ở Quận 1 · 12 phút trước"                          │
│ Nền tảng : iOS ✅  Android ✅                                        │
└────────────────────────────────────────────────────────────────────┘
┌─ L3 · GEOFENCE PHÍA SERVER ────────────────────────────────────────┐
│ Mỗi điểm nhận được → so với các Place đã lưu (PostGIS ST_DWithin)   │
│ → sinh event ARRIVED / LEFT → Web Push cho đối phương               │
│ Ưu điểm: không tốn pin client, logic tập trung, dễ viết test        │
└────────────────────────────────────────────────────────────────────┘
┌─ L4 · (TÙY CHỌN, PHASE 6) BỌC NATIVE ──────────────────────────────┐
│ Capacitor bọc chính codebase web + plugin background-geolocation    │
│ Android: build APK → cài trực tiếp (sideload), KHÔNG cần CH Play ✅  │
│ iOS    : cần Apple Developer 99$/năm → TestFlight internal tester,   │
│          hoặc AltStore/Sideloadly (phải ký lại mỗi 7 ngày)          │
│ ⇒ Chỉ làm khi thực sự cần tracking nền 24/7                         │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 Thuật toán lấy mẫu thích ứng (tiết kiệm pin) — chạy ở client

```
speed < 1 m/s   (đứng yên)  → gửi mỗi 60s HOẶC khi dịch chuyển > 50m
1–3 m/s         (đi bộ)     → gửi mỗi 20s HOẶC khi dịch chuyển > 30m
> 3 m/s         (xe máy/ô tô)→ gửi mỗi 8s  HOẶC khi dịch chuyển > 80m

accuracy > 100m               → LOẠI BỎ điểm (nhiễu), không gửi
delta_distance < accuracy / 2 → LOẠI BỎ (jitter GPS khi đứng yên)
```

Lọc nhiễu: **Kalman 1 chiều** trên (lat, lng) với `R = accuracy²`. Giúp vệt đường mượt,
không "nhảy" khi tín hiệu yếu. Chạy ở client **trước khi** gửi lên server.

---

## 3. Phương án bản đồ — Google Maps hay bản đồ riêng?

### 3.1 So sánh

| Tiêu chí | Google Maps JS API | **MapLibre GL + tile miễn phí** | MapLibre + tự host PMTiles |
|---|---|---|---|
| Chi phí | Trả theo lượt tải bản đồ, bắt buộc gắn thẻ | **0đ** | 0đ (tốn ~1GB ổ VPS) |
| Cần API key | Có (rủi ro lộ key) | **Không** | Không |
| Chất lượng POI ở VN | Rất tốt | Khá (OSM ở HN/HCM tốt) | Khá |
| Tuỳ biến giao diện bản đồ | Hạn chế (Cloud Styling) | **Toàn quyền** (style JSON) | Toàn quyền |
| Vẽ marker / animation | Tốt | **Rất tốt** (WebGL, layer tuỳ ý) | Rất tốt |
| Phụ thuộc bên thứ ba | Cao | Trung bình | **Không** |
| Khi mạng yếu | Kém | Kém | **Tốt** (tile cùng VPS) |

### 3.2 ✅ QUYẾT ĐỊNH

**Dùng `MapLibre GL JS` làm engine render, nguồn tile cấu hình qua biến môi trường.**

- **Phase 1–4:** nguồn tile = **OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`)
  — miễn phí, không cần key. Dự phòng: MapTiler free tier (100k tile/tháng).
- **Phase 6 (tuỳ chọn):** tự host tile Việt Nam bằng **PMTiles + protomaps**
  (1 file `.pmtiles` ~400MB cho toàn VN, Caddy serve tĩnh) → độc lập hoàn toàn.
- **Style bản đồ tự thiết kế** tông hồng pastel hợp chủ đề tình yêu — đây là điểm
  MapLibre thắng tuyệt đối so với Google Maps.
- **Tìm kiếm địa điểm:** **Photon** (self-host, nền OSM) hoặc Nominatim public.
  *Không* dùng Google Places để tránh ràng buộc billing.

> **Vì sao không Google Maps:** app chỉ có 2 người → lợi thế POI của Google không đáng để
> đánh đổi việc phải gắn thẻ tín dụng, quản lý key và mất quyền tuỳ biến giao diện — vốn
> là yêu cầu cốt lõi (chủ đề tình yêu, thiết kế riêng).
> MapLibre dùng chuẩn Mapbox Style Spec nên **đổi nguồn tile chỉ là đổi 1 URL** — không khoá cứng.

---

## 4. Technology Stack

| Tầng | Công nghệ | Lý do chọn |
|---|---|---|
| **Frontend** | React 19 + TypeScript + **Vite** | Nhanh, hệ sinh thái lớn, dễ maintain |
| PWA | `vite-plugin-pwa` (Workbox) | Cài lên màn hình chính, offline shell, Web Push |
| UI | **Tailwind CSS v4** + Radix UI primitives | Mobile-first thuần, không kéo theo theme nặng |
| Animation | `motion` (Framer Motion) | Chuyển cảnh mượt — quan trọng với app cảm xúc |
| State | **TanStack Query** (server state) + Zustand (UI state) | Cache/retry/invalidate tự động, tránh Redux cồng kềnh |
| Bản đồ | **MapLibre GL JS** | §3 |
| Form | React Hook Form + Zod | Schema Zod **dùng chung với backend** |
| **Backend** | **NestJS** (Node 22 + TypeScript) | Cấu trúc rõ, DI, module hoá, có sẵn WebSocket gateway |
| Realtime | **Socket.IO** (fallback long-polling) | iOS Safari hay rớt WS thuần; Socket.IO tự fallback |
| ORM | **Prisma** | Type-safe, migration tốt; PostGIS qua `$queryRaw` |
| Auth | JWT access 15p + refresh 30d (httpOnly cookie, rotation + phát hiện tái sử dụng) | Không cần bên thứ ba |
| Băm mật khẩu | **`scrypt` của `node:crypto`** (RFC 7914, N=16384 r=8 p=1) | Không thêm dependency, không phải biên dịch native như bcrypt/argon2 (hay vỡ trên Windows, phình image Docker) |
| Chống spam | `@nestjs/throttler` — đăng ký 20/giờ/IP, đăng nhập 10/5 phút/IP | Nới tay với IP dùng chung (CGNAT rất phổ biến ở VN) |
| **Database** | **PostgreSQL 17 + PostGIS 3.5** | Truy vấn không gian (geofence, khoảng cách) native |
| Cache / PubSub | **Redis 7** (tuỳ chọn) | Cache vị trí gần nhất, hạn mức chia sẻ giữa nhiều instance. **Hỏng thì app vẫn chạy** — chỉ chậm hơn một nhịp |
| Hạn mức vị trí | `SlidingWindowRateLimiter` trong tiến trình | Hàng rào CHÍNH, không phụ thuộc Redis (xem trace L10) |
| Thông báo đẩy | **`web-push`** (giao thức Web Push + VAPID) | Không cần Firebase, không cần tài khoản bên thứ ba. Thiếu khoá VAPID = tắt tính năng, app vẫn chạy |
| Service worker | `vite-plugin-pwa` chiến lược **`injectManifest`** + workbox runtime | Bản sinh tự động (`generateSW`) không chèn được `addEventListener('push')` của mình. Xem `apps/web/src/sw.ts` |
| Job định kỳ | **`@nestjs/schedule`** cho việc lặp cố định | Dọn lịch sử vị trí chỉ cần một cron, không cần hàng đợi. BullMQ để dành Phase 4 (nhắc lịch theo từng sự kiện — mỗi sự kiện một job hẹn giờ) |
| Lưu ảnh | **MinIO** (S3-compatible, `@aws-sdk/client-s3` với `forcePathStyle`) | Self-host; sau này đổi sang S3 thật không phải sửa code. **Không dùng URL ký sẵn** — xem §7.1b |
| Nhận tệp tải lên | `multer` qua `FilesInterceptor` — bộ nhớ, ≤3 tệp, ≤15MB/tệp | Không ghi tệp tạm ra đĩa; ảnh đi thẳng vào sharp |
| Xử lý ảnh | `sharp` — `.rotate()` theo EXIF → resize 3 mức → WebP, **không** `.withMetadata()` | Ảnh 5MB → ~200KB, và EXIF (kể cả toạ độ GPS) bị loại bỏ hoàn toàn (R3) |
| Nén phía trình duyệt | `createImageBitmap(file, {imageOrientation:'from-image'})` + canvas → WebP cạnh dài 2048px | Tiết kiệm data của người dùng. **Bắt buộc** truyền `imageOrientation`, nếu không ảnh dựng đứng của iPhone bị nằm ngang vĩnh viễn (trace L17) |
| **Reverse proxy** | **Caddy 2** | **Tự động cấp & gia hạn HTTPS** — bắt buộc vì Geolocation chỉ chạy trên HTTPS |
| Đóng gói | Docker + docker compose | C4 |
| Job nền | BullMQ (trên Redis) | Nhắc lịch, dọn vị trí cũ, push kỷ niệm |
| Log / Monitor | Pino → file + Uptime Kuma | Nhẹ, đủ cho VPS nhỏ |
| Test | Vitest (unit) + Supertest (API) + Playwright (E2E mobile viewport) | §8 |

### 4.1 Vì sao KHÔNG chọn phương án khác

- **Next.js:** app gần như 100% client-side + realtime, SSR/SEO vô dụng → thêm phức tạp.
- **Firebase / Supabase:** trái tinh thần C4 (đã có VPS), phụ thuộc vendor, chi phí realtime tăng theo số ping.
- **Flutter / React Native:** trái C1 (không lên store) — web là kênh phân phối duy nhất.
- **MongoDB:** cần cả truy vấn không gian lẫn quan hệ (couple/user/event) → Postgres + PostGIS mạnh hơn hẳn.

---

## 5. Sơ đồ hệ thống

```
                        Internet  (HTTPS bắt buộc)
                                  │
                    ┌─────────────▼──────────────┐
                    │   Caddy 2   (:80 / :443)   │  auto TLS Let's Encrypt
                    │   gzip / brotli / HSTS     │
                    └──┬────────┬────────┬───────┘
          /  , /assets │   /api │   /socket.io    │ /media
                       │        │        │        │
        ┌──────────────▼──┐  ┌──▼────────▼──────┐ │ ┌──────────┐
        │  web (static)   │  │  api (NestJS)    │ └►│  MinIO   │
        │  React PWA dist │  │  REST + Socket.IO│   │  ảnh     │
        └─────────────────┘  │  BullMQ worker   │   └──────────┘
                             └──┬─────────────┬─┘
                                │             │
                    ┌───────────▼──────┐  ┌───▼────────────┐
                    │ PostgreSQL 17    │  │  Redis 7       │
                    │ + PostGIS        │  │  presence      │
                    │ users / couples  │  │  pub/sub       │
                    │ locations / posts│  │  BullMQ queue  │
                    └──────────────────┘  └────────────────┘
```

### 5.1 Luồng vị trí thời gian thực

```
 Máy A (đang di chuyển)              Server                     Máy B (đang xem)
 ─────────────────────               ──────                     ────────────────
 watchPosition ─┐
                ├─ Kalman lọc nhiễu
                ├─ Kiểm tra ngưỡng §2.1
                └─► socket.emit('loc:update', {lat,lng,acc,spd,hdg,ts})
                                       │
                                       ├─ Xác thực JWT + kiểm tra thuộc couple
                                       ├─ Rate limit (tối đa 1 msg / 3s / user)
                                       ├─ Ghi Redis  loc:last:{userId}  (TTL 24h)
                                       ├─ Ghi Postgres (gộp 10 điểm hoặc 30s)
                                       ├─ Kiểm tra geofence (ST_DWithin)
                                       │     └─► vào/ra Place → Web Push
                                       └─► io.to('couple:{id}').emit('loc:partner', …)
                                                                    │
                                                    MapLibre cập nhật marker
                                                    (nội suy tuyến tính 1s cho mượt)
```

---

## 6. Mô hình dữ liệu (Prisma / PostgreSQL)

```prisma
model User {
  id           String   @id @default(uuid())
  email        String?  @unique
  phone        String?  @unique
  passwordHash String?
  displayName  String
  avatarUrl    String?
  birthday     DateTime?
  coupleId     String?
  couple       Couple?  @relation(fields: [coupleId], references: [id])
  privacy      Json     @default("{}")   // {ghostMode, shareLive, fuzzRadiusM}
  messagingApp    MessagingApp @default(ZALO)  // F9 — xem §7.3
  messagingHandle String?
  pushSubs     PushSubscription[]
  createdAt    DateTime @default(now())
}

model Couple {
  id               String    @id @default(uuid())
  inviteCode       String?   @unique     // 6 ký tự, hết hạn sau 24h. KHÔNG xoá sau khi dùng
  inviteExpiresAt  DateTime?
  inviteConsumedAt DateTime?             // chốt chặn chống race — xem §6.1
  anniversaryAt    DateTime              // F5 — mốc bắt đầu yêu
  members       User[]
  places        Place[]
  posts         Post[]
  events        Event[]
  milestones    Milestone[]
  createdAt     DateTime   @default(now())
}

model LocationPoint {                    // dữ liệu nóng, cắt tỉa định kỳ
  id         BigInt   @id @default(autoincrement())
  userId     String
  coupleId   String
  lat        Float
  lng        Float
  accuracyM  Float
  speedMps   Float?
  headingDeg Float?
  battery    Int?
  source     LocSource                   // LIVE | PING | CHECKIN
  recordedAt DateTime
  @@index([coupleId, recordedAt])
  @@index([userId, recordedAt])
  // + cột geography(Point,4326) tạo bằng migration SQL thuần + GIST index
}

model Place {                            // F6 — geofence
  id             String  @id @default(uuid())
  coupleId       String
  name           String                  // "Nhà em", "Công ty anh"
  emoji          String  @default("📍")
  lat            Float
  lng            Float
  radiusM        Int     @default(150)
  notifyOnArrive Boolean @default(true)
  notifyOnLeave  Boolean @default(false)
}

model Post {                             // F3 — check-in ảnh
  id        String   @id @default(uuid())
  coupleId  String
  authorId  String
  caption   String?
  mood      String?                      // emoji tâm trạng
  photos    Photo[]
  lat       Float?
  lng       Float?
  placeName String?
  reactions Json     @default("[]")
  createdAt DateTime @default(now())
  @@index([coupleId, createdAt])
}

model Photo {
  id          String @id @default(uuid())
  postId      String
  keyOrig     String                     // MinIO key — bản 2048px
  keyMd       String                     // 1080px webp
  keyThumb    String                     // 320px webp
  width       Int                        // kích thước SAU khi đã xoay theo EXIF
  height      Int
  placeholder String                     // ảnh 20px dạng data URI, hiện khi đang tải
  sortOrder   Int    @default(0)
}

model Event {                            // F4 — lịch trình
  id              String   @id @default(uuid())
  coupleId        String
  createdById     String
  title           String
  note            String?
  startAt         DateTime
  endAt           DateTime?
  allDay          Boolean  @default(false)
  placeId         String?
  lat             Float?
  lng             Float?
  remindMinBefore Int?     @default(60)
  visibility      EventVisibility @default(SHARED)  // SHARED | PRIVATE
  reminderSentAt  DateTime?                // đã nhắc lúc nào; NULL = chưa nhắc
  @@index([coupleId, startAt])
  @@index([reminderSentAt, startAt])       // chỉ mục cho job quét nhắc lịch
}

model Milestone {                        // F5 — mốc kỷ niệm (tự sinh + tự thêm)
  id       String @id @default(uuid())
  coupleId String
  title    String                        // "1000 ngày bên nhau"
  date     DateTime
  kind     MilestoneKind                 // AUTO_DAYS | ANNIVERSARY | BIRTHDAY | CUSTOM
  emoji    String @default("💖")
}
```

### 6.0 Cột không gian `geog` (đã triển khai & trace)

`location_points.geog` là `geography(Point, 4326)`, được **trigger** tự điền từ lat/lng.

```sql
CREATE TRIGGER location_points_set_geog
  BEFORE INSERT OR UPDATE OF "lat", "lng" ON "location_points"
  FOR EACH ROW EXECUTE FUNCTION beside_set_location_geog();
```

- **Không** dùng `GENERATED ALWAYS ... STORED`: đã thử và bị lỗi. Prisma đọc biểu thức
  sinh cột như một DEFAULT, nên lần `migrate dev` sau sinh ra
  `ALTER COLUMN geog DROP DEFAULT` — câu lệnh này thất bại trên cột generated và làm
  **vỡ migration kế tiếp** (trace Phase 2, L13).
- Trigger thì Prisma không nhìn thấy → không sinh drift, mà vẫn bảo đảm `geog` không
  bao giờ lệch với lat/lng kể cả khi ghi bằng Prisma Client.
- Kiểm chứng: `prisma migrate diff` trả về "empty migration".

### 6.3 Hai loại thời gian trên lịch (đã triển khai & trace)

Một cái lịch có hai loại "thời gian" khác hẳn nhau. Trộn chúng vào một kiểu dữ
liệu là nguồn gốc của gần hết lỗi lệch ngày, nên `Event` tách rõ:

| Loại | Ví dụ | Lưu thế nào | Đọc lại thế nào |
|---|---|---|---|
| **Mốc thời gian thật** (`allDay = false`) | "19:00 tối thứ năm" | UTC như mọi chỗ khác | đổi sang `Asia/Ho_Chi_Minh` rồi mới lấy ngày |
| **Ngày trôi nổi** (`allDay = true`) | "sinh nhật 12/09" | 00:00 **UTC** của đúng ngày đó | đọc Y/M/D theo **UTC**, KHÔNG đổi múi giờ |

"Sinh nhật 12/09" không phải một khoảnh khắc — nó là một ô trên tờ lịch. Lưu nó
theo 00:00 giờ VN sẽ ra mốc `2026-09-11T17:00Z`, và truy vấn lịch bắt đầu từ
00:00 UTC ngày 12 sẽ bỏ sót nó.

Mọi phép đổi đi qua `packages/shared/src/event.schema.ts` (server) và
`apps/web/src/lib/event-display.ts` (web). **Không được** dùng
`new Date("2026-09-10T19:00")` (chuỗi không có offset) ở bất cứ đâu — trình duyệt
hiểu nó theo múi giờ của MÁY, nên máy đang để múi giờ khác là lệch vài tiếng.

Truy vấn khoảng dùng điều kiện **giao**, không phải `startAt` nằm trong khoảng:
`startAt < to AND (endAt ?? startAt) >= from`. Nếu lọc theo mỗi `startAt` thì
chuyến đi 3 ngày bắt đầu từ hôm qua sẽ biến mất khỏi lịch hôm nay, đúng lúc cần
thấy nó nhất.

### 6.2 Quy tắc quyền riêng tư — áp dụng ở MỌI đường ra

| Cài đặt | Hiệu lực |
|---|---|
| `ghostMode: true` | **Không ghi, không phát, không trả về gì.** Kể cả ping bị động. Kể cả `distanceM`. |
| `shareLive: false` | Chặn luồng `LIVE`; ping bị động vẫn chạy để còn "lần cuối ở đâu" |
| `fuzzRadiusM > 0` | Toạ độ bắt vào lưới ô vuông; `accuracyM` báo đúng bán kính mờ; **ẩn hướng và tốc độ**; khoảng cách làm tròn theo bán kính mờ |

Ba nguyên tắc rút ra từ trace Phase 2:

1. **Lưu chính xác, chỉ làm mờ khi PHÁT RA.** Lịch sử của chính mình phải đúng; làm mờ
   là để bảo vệ trước đối phương, không phải để tự phá dữ liệu của mình.
2. **Không cache quyền riêng tư.** `LocationsService.getContext()` đọc DB mỗi lần —
   bật ẩn danh phải có hiệu lực ngay, không được chờ cache hết hạn (TC-65).
3. **Mọi endpoint SUY RA được vị trí đều phải qua cùng cửa kiểm tra.** Trace L12: khi
   ẩn danh, `location` đã là `null` nhưng `distanceM` vẫn lộ khoảng cách chính xác —
   đủ để khoanh đối phương vào một đường tròn.
4. **Cache lưu SỰ THẬT, quyền riêng tư áp ở ĐƯỜNG RA.** Trace L14: cache từng lưu
   payload đã làm mờ sẵn, nên người dùng bật "làm mờ vị trí" mà chưa gửi điểm mới thì
   đối phương vẫn nhận toạ độ chính xác suốt 24 giờ. Cache và DB phải dùng CHUNG một
   hàm áp quyền riêng tư, nếu không hai nhánh sẽ lệch nhau.
5. **Xoá dữ liệu phải xoá ở MỌI nơi nó từng được nhân bản.** Trace L15: huỷ ghép đôi
   xoá sạch Postgres theo cascade, nhưng Redis không biết và giữ `loc:last:*` thêm
   24 giờ — người yêu mới thấy được vị trí cuối từ mối quan hệ trước.

### 6.1 Chống race khi ghép đôi (đã triển khai & trace)

Hai người bấm “Kết đôi” cùng lúc với cùng một mã thì couple có thể thành 3 người.
Cách chặn: **atomic claim** trên `inviteConsumedAt`.

```sql
-- Chỉ ĐÚNG MỘT giao dịch đổi được cột này từ NULL sang có giá trị
UPDATE couples SET invite_consumed_at = now()
WHERE id = $1 AND invite_consumed_at IS NULL;
-- count = 1 → được vào;  count = 0 → 409 COUPLE_FULL
```

- Chạy ở isolation **Read Committed** mặc định → không có xung đột phải thử lại.
- **Không** dùng `Serializable`: đã thử, dữ liệu vẫn đúng nhưng giao dịch thua cuộc
  chết vì hết `maxWait` của Prisma và trả **500** cho người dùng (xem trace L4).
- **Không** xoá `inviteCode` sau khi ghép: giữ lại để người vào sau nhận thông báo
  đúng (“cặp đôi đã đủ 2 người”) thay vì “mã không tồn tại” (trace L5).
  API vẫn ẩn mã khi couple đã đủ người.

**Chính sách lưu trữ (privacy + dung lượng):**
- `LocationPoint` nguồn `LIVE`: giữ **7 ngày** ở độ phân giải đầy đủ.
- Sau 7 ngày: nén còn 1 điểm / 15 phút, giữ **90 ngày**, sau đó xoá.
- Job `location-retention` chạy 03:00 hằng ngày (BullMQ repeatable).

---

## 7. API (bản nháp — chốt ở Phase 1)

### 7.1 REST — tiền tố `/api/v1`

Dấu ✅ = đã triển khai và trace xong ở Phase 1.

```
POST   /auth/register              {displayName, email, password}      ✅
POST   /auth/login                 → {accessToken} + refresh cookie    ✅
POST   /auth/refresh               xoay vòng refresh token             ✅
POST   /auth/logout                                                    ✅
GET    /auth/me                                                        ✅
GET    /health                     dùng cho healthcheck Docker         ✅

GET    /me                         hồ sơ của chính mình                ✅
PATCH  /me                         {displayName?, birthday?,           ✅
                                    messagingApp?, messagingHandle?}
PATCH  /me/privacy                 {ghostMode, shareLive, fuzzRadiusM}   (Phase 2)

POST   /couples                    tạo couple + sinh inviteCode        ✅
POST   /couples/join               {inviteCode}                        ✅
GET    /couples/me                 → couple + thành viên + partner     ✅
PATCH  /couples/me                 {anniversaryAt}                     ✅
POST   /couples/me/invite          sinh lại mã khi mã cũ hết hạn       ✅
GET    /couples/me/love-summary    F5 — đếm ngày yêu + mốc kế tiếp     ✅
DELETE /couples/me                 {confirm:true} — huỷ ghép đôi,      ✅
                                   xoá couple + toàn bộ dữ liệu chung

POST   /locations                  L2 — ping bị động khi mở app          ✅
GET    /locations/partner/latest   vị trí gần nhất + khoảng cách          ✅
GET    /locations/partner/trail    ?from&to&limit → mảng [lng,lat,ts]     ✅

GET|POST /places     PATCH|DELETE /places/:id

POST   /posts                      multipart: photos[] + caption + mood + toạ độ  ✅
GET    /posts                      ?cursor&limit&filter=all|mine|partner|pinned   ✅
DELETE /posts/:id                  chỉ người đăng mới xoá được                    ✅
POST   /posts/:id/react            {emoji} — mỗi người 1 cảm xúc, bấm lại = bỏ    ✅
GET    /posts/photos/:photoId/:size   size = thumb | md | orig                    ✅

GET    /events?from&to             sự kiện GIAO với khoảng đó (§6.3)              ✅
POST   /events                     có giờ hoặc cả ngày, riêng tư hoặc chung        ✅
GET    /events/:id                                                                ✅
PATCH  /events/:id                 chỉ người tạo                                   ✅
DELETE /events/:id                 chỉ người tạo                                   ✅

GET    /love/summary               {daysTogether, nextMilestone, streak}
GET|POST /milestones

GET    /push/public-key            khoá công khai VAPID — endpoint PUBLIC        ✅
POST   /push/subscribe             {endpoint, keys, userAgent?}                  ✅
DELETE /push/subscribe             {endpoint} — chỉ gỡ được đăng ký của mình      ✅
GET    /push/devices               ?endpoint= để đánh dấu "máy hiện tại"          ✅
POST   /push/test                  gửi thử một thông báo cho chính mình           ✅
```

**Xác thực WebSocket:** kiểm tra token bằng middleware `server.use()` ngay ở bước
**bắt tay**, không phải trong `handleConnection`. Nếu để ở `handleConnection` thì client
vẫn nhận sự kiện `connect` rồi mới bị ngắt — một socket chưa xác thực đã kịp tồn tại
trong server (trace Phase 2, L9).

> **Không có endpoint đọc/sửa hồ sơ người khác.** Người ấy chỉ lộ ra qua
> `GET /couples/me` (trường `partner`) — tức là chỉ khi hai người thật sự đã ghép đôi.
>
> Cặp `(messagingApp, messagingHandle)` được kiểm tra **ở tầng service**, không phải
> ở schema: người dùng có thể chỉ đổi một trong hai, nên phải trộn với giá trị đang
> lưu trong DB rồi mới biết cặp đó có hợp lệ không.

### 7.1b Ảnh đi ra bằng đường nào (quyết định của Phase 3)

Ảnh **không** phát bằng URL ký sẵn (presigned) của S3, mà do API tự đọc luồng từ
MinIO và trả về. Hai lý do:

1. **Chữ ký SigV4 bao gồm cả hostname.** API ký bằng `http://minio:9000` — tên chỉ
   tồn tại trong mạng Docker. Trình duyệt không phân giải được, mà đổi host thì
   chữ ký sai.
2. **Link ký sẵn là "ai có link thì xem được".** Ảnh check-in là dữ liệu riêng tư
   của một cặp đôi (R3), nên **mỗi lượt xem ảnh phải kiểm tra quyền theo `coupleId`**.

Hệ quả bắt buộc ở phía web: thẻ `<img src>` không gửi được header `Authorization`,
nên ảnh phải tải bằng `fetch` rồi đổi sang blob URL (`components/AuthedImage.tsx`),
kèm `IntersectionObserver` để chỉ tải ảnh sắp lọt vào màn hình và `revokeObjectURL`
khi rời khỏi. Ảnh trả về kèm `Cache-Control: private, max-age=31536000, immutable`
— key trong MinIO không bao giờ đổi nội dung nên cache vĩnh viễn là an toàn.

### 7.2 WebSocket — namespace `/rt`, room `couple:{coupleId}`

| Hướng | Sự kiện | Payload |
|---|---|---|
| C→S | `loc:update` ✅ | `{lat,lng,accuracyM,speedMps,headingDeg,battery,ts}` |
| C→S | `live:start` / `live:stop` ✅ | `{}` |
| S→C | `loc:partner` ✅ | `{userId,lat,lng,accuracyM,headingDeg,speedMps,battery,fuzzed,ts}` |
| S→C | `presence` ✅ | `{userId, online, live, battery, lastSeenAt}` |
| S→C | `rt:error` ✅ | `{code, message}` |
| S→C | `geofence` | `{userId, placeId, placeName, type:'ARRIVED'\|'LEFT', ts}` |
| S→C | `post:new` | `{postId, authorId, thumbUrl}` |
| S→C | `event:changed` | `{eventId, action}` |

### 7.3 Nút nhắn tin — deep-link ra app ngoài (F9)

Không có chat trong app. Mỗi user khai báo `messagingApp` + `messagingHandle` trong hồ sơ;
nút "Nhắn tin" mở app tương ứng của **đối phương**.

| App | URL scheme | Ghi chú |
|---|---|---|
| Zalo | `https://zalo.me/<phone>` | Chạy trên cả iOS/Android, có fallback web |
| Messenger | `https://m.me/<username>` | Cần username Facebook, không phải số điện thoại |
| Gọi điện | `tel:<phone>` | Luôn có sẵn |
| SMS | `sms:<phone>` | Luôn có sẵn |

Dùng `https://` chứ **không** dùng `zalo://` — scheme riêng bị iOS Safari chặn im lặng khi
app chưa cài, còn link https tự rơi về trang web. Mở bằng `window.open(url, '_blank')`
kèm `rel="noopener"`.

Trường dữ liệu bổ sung vào `model User`:
```prisma
messagingApp    MessagingApp @default(ZALO)   // ZALO | MESSENGER | PHONE | SMS
messagingHandle String?                       // số điện thoại hoặc username
```

---

## 8. Quy trình chất lượng — BẮT BUỘC

> Chi tiết & checklist ở `CLAUDE.md`. Tóm tắt:
> **Viết code → Tự review → Trace bằng dữ liệu giả định → Cập nhật ARCHITECTURE.md**

Mỗi feature phải kèm **bảng trace** trong `docs/traces/<feature>.md`:
đầu vào giả định → từng bước xử lý → đầu ra kỳ vọng → đầu ra thực tế → kết luận.
Bắt buộc tối thiểu: 1 happy path + 3 edge case + 1 case lỗi.

**Bộ dữ liệu giả định chuẩn** (`packages/fixtures/`) — dùng lại cho mọi trace:
- Couple `An ❤ Bình`, anniversary `2023-02-14`
- Tuyến đường thật Quận 1 → Thủ Đức (42 điểm GPS, trong đó 3 điểm nhiễu accuracy > 200m)
- Place: `Nhà An (10.7769, 106.7009, r=150m)`, `Công ty Bình (10.8231, 106.6297, r=200m)`
- 12 post, 8 event (có 1 all-day, 1 quá khứ, 1 lặp lại)

---

## 9. Lộ trình

| Phase | Nội dung | Kết quả bàn giao |
|---|---|---|
| **0** | ✅ Thiết kế & Mockup HTML | `mockup/*.html`, ARCHITECTURE.md, CLAUDE.md |
| **1** | ✅ Hạ tầng: docker compose, Caddy+TLS, Postgres+PostGIS, NestJS, Auth, Pairing, đếm ngày yêu | Đăng nhập & ghép đôi chạy thật · 39/39 trace · 56 unit test |
| **2** | ✅ Vị trí realtime: Socket.IO, Kalman, MapLibre, trail, presence, ghost mode, làm mờ vị trí, dọn lịch sử | Xem nhau di chuyển trên bản đồ · 29/29 trace |
| **3** | ✅ Check-in ảnh + dòng kỷ niệm + MinIO + sharp (xoay & xoá EXIF), phân trang con trỏ, cảm xúc | Đăng & xem kỷ niệm · 34/34 trace |
| **4** | 🔸 F4 Lịch trình ✅ (37/37) · F7 Thông báo đẩy + nhắc lịch ✅ (21/21) · còn F6 Geofence, F5 Milestone, ghim ảnh check-in lên bản đồ *(đang làm)* | Đủ tính năng cốt lõi |
| **5** | Giao diện PC (≥1024px), tối ưu hiệu năng, PWA offline | Bản 1.0 |
| **6** | *(tuỳ chọn)* APK Android qua Capacitor cho tracking nền | File APK sideload |

---

## 10. Nhật ký quyết định (ADR rút gọn)

| Ngày | Quyết định | Lý do | Đánh đổi |
|---|---|---|---|
| 2026-09-07 | PWA thay vì native | C1: không lên store | Mất tracking nền trên iOS |
| 2026-09-07 | MapLibre GL + OpenFreeMap thay Google Maps | Miễn phí, không cần key, tuỳ biến style theo chủ đề | POI ở VN kém Google hơn |
| 2026-09-07 | Postgres + PostGIS thay MongoDB | Cần cả truy vấn không gian lẫn quan hệ | Nặng hơn chút trên VPS nhỏ |
| 2026-09-07 | Socket.IO thay WebSocket thuần | iOS Safari hay rớt WS, cần fallback | Payload lớn hơn ~10% |
| 2026-09-07 | Caddy thay Nginx | Tự động HTTPS — bắt buộc cho Geolocation | Ít tài liệu tiếng Việt hơn |
| 2026-09-07 | Mô hình "Live Session" thay tracking liên tục | Giới hạn nền tảng + tiết kiệm pin | Không thấy vị trí khi đối phương đóng app |
| 2026-09-07 | **Không làm chat trong app**, chỉ deep-link Zalo/Messenger | Chủ dự án chốt. Tiết kiệm phần lớn khối lượng Phase 3 (socket chat, lưu trữ, đã đọc, thông báo) | Rời app khi muốn nhắn tin |
| 2026-09-07 | Tên app **Beside**; domain tạm `easytech.io.vn`, đổi sau | Domain đã có sẵn, chưa cần mua thêm | Mọi URL phải đọc từ ENV, không hardcode |
| 2026-09-07 | Tab bar 5 khe: Nhà · Bản đồ · [＋] · Lịch · Kỷ niệm | Chủ dự án duyệt theo đề xuất | "Ngày yêu / Địa điểm / Cài đặt" thành màn con |
| 2026-09-07 | Bảng màu hồng–tím `#FF4D7D → #8B5CF6` | Chủ dự án duyệt theo đề xuất | — |
| 2026-09-07 | Băm mật khẩu bằng **scrypt** của `node:crypto`, không dùng bcrypt/argon2 | Không cần native addon → không vỡ khi cài trên Windows, image Docker nhẹ hơn. scrypt là chuẩn RFC 7914, OWASP khuyến nghị | Chậm hơn argon2id một chút; phải tự viết định dạng lưu trữ |
| 2026-09-07 | Ghép đôi dùng **atomic claim**, không dùng isolation Serializable | Serializable làm giao dịch thua cuộc trả 500 vì hết `maxWait` của Prisma (trace L4) | Phải thêm 1 cột `inviteConsumedAt` |
| 2026-09-07 | **Giữ lại** `inviteCode` sau khi ghép xong thay vì xoá | Để báo đúng “cặp đôi đã đủ 2 người” thay vì “mã không tồn tại” (trace L5) | Mã cũ tồn tại mãi trong DB (không gian mã 1,07 tỉ nên vô hại) |
| 2026-09-07 | Rate limit đăng ký **20/giờ/IP** (không phải 5/10 phút) | Người dùng di động ở VN đi qua CGNAT, dùng chung IP công cộng → siết quá tay chặn nhầm người thật | Cho phép nhiều lần thử hơn từ một IP |
| 2026-09-07 | `packages/shared` build **song song CJS + ESM** | API (NestJS) chạy CJS, web (Vite/Rollup) cần ESM để đọc được named export | Build hai lần, `package.json` phải khai báo `exports` map |
| 2026-09-07 | Mọi so sánh ngày dùng `datetime.ts` (ngày lịch giờ VN) | So bằng timestamp làm “hôm nay” bị coi là tương lai trong khoảng 00:00–07:00 giờ VN (trace L3) | Không được dùng `Date.now()` trực tiếp để so ngày |
| 2026-09-07 | **Không seed dữ liệu cá nhân trong code** — hai người tự nhập trong app | Chủ dự án chốt. Tên/ngày sinh/ngày kỷ niệm/số Zalo đều sửa được ở màn `/cai-dat` | Phải làm thêm `GET\|PATCH /me` và màn Cài đặt ngay ở Phase 1 |
| 2026-09-07 | Username Messenger phải **bắt đầu bằng chữ cái**, ≥5 ký tự | Regex cũ cho chuỗi toàn chữ số lọt qua → sinh link `m.me/0912345678` hỏng (trace L7) | Từ chối vài username cũ rất ngắn (hiếm) |
| 2026-09-07 | Dev dùng **PostgreSQL cài sẵn trên máy**, Docker chỉ để build/deploy | Nhanh hơn, không tốn RAM, và tránh xung đột cổng 5432 với PostgreSQL đã cài | PostGIS phải cài thủ công (đã cài xong 3.6.2) |
| 2026-09-07 | Cột `geog` dùng **trigger**, không dùng `GENERATED ALWAYS` | Cột generated làm `prisma migrate dev` sinh ra câu lệnh vỡ (trace L13) | Trigger không thể hiện trong schema.prisma, phải nhớ khi đọc code |
| 2026-09-07 | Xác thực WebSocket ở **middleware bắt tay** | Để ở `handleConnection` thì socket chưa xác thực vẫn kịp tồn tại (trace L9) | — |
| 2026-09-07 | Hạn mức vị trí đặt **trong tiến trình**, Redis chỉ là lớp phụ | Redis cố tình "mở khi hỏng", nên không được là hàng rào duy nhất (trace L10) | Hạn mức không dùng chung giữa nhiều instance — chấp nhận được vì đang chạy 1 instance |
| 2026-09-07 | Làm mờ vị trí bằng **bắt vào lưới**, không cộng nhiễu ngẫu nhiên | Nhiễu ngẫu nhiên bị triệt tiêu khi lấy trung bình nhiều mẫu; lưới thì không | Sai số cố định tới ~0,7× bán kính |
| 2026-09-07 | `@nestjs/schedule` cho job dọn lịch sử, chưa dùng BullMQ | Một cron cố định không cần hàng đợi | Phase 4 (nhắc lịch từng sự kiện) sẽ cần BullMQ thật |
| 2026-09-07 | MapLibre tách chunk + không nạp sẵn vào PWA | Gói bản đồ ~1MB; đa số lần mở app chỉ xem trang chủ | Lần đầu mở bản đồ phải chờ tải |
| 2026-09-07 | Ảnh phát **qua API**, không dùng URL ký sẵn của S3 | Chữ ký SigV4 gắn với hostname nội bộ Docker; và link ký sẵn không kiểm tra được quyền theo couple (§7.1b, trace L16) | API tốn băng thông trung chuyển; web phải có `AuthedImage` thay cho `<img src>` |
| 2026-09-07 | Nén ảnh **hai lần**: trình duyệt (2048px) rồi server (3 mức WebP) | Nén ở client tiết kiệm data 3G/4G của người dùng; nén ở server là chốt chặn thật vì client có thể bị bỏ qua | Ảnh qua hai lần mất mát chất lượng |
| 2026-09-07 | Server nhận diện ảnh bằng **nội dung tệp** (metadata của sharp), không tin `mimetype` | Đổi đuôi tệp là chuyện ai cũng làm được (trace P3-11) | Phải giải mã header ảnh trước khi từ chối |
| 2026-09-07 | Phân trang dòng kỷ niệm bằng **con trỏ** `(createdAt, id)`, không dùng offset | Có bài mới chèn vào giữa lúc đang cuộn thì offset sẽ lặp bài (trace P3-26) | Không nhảy thẳng tới trang N được — nhưng dòng thời gian không cần |
| 2026-09-07 | Cảm xúc lưu trong cột `Json` của `Post`, không tách bảng riêng | Đúng 2 người/couple nên tối đa 2 cảm xúc mỗi bài; tách bảng chỉ tốn thêm một lần join | Không truy vấn thống kê theo emoji được — chưa cần |
| 2026-09-07 | Ẩn danh (ghost mode) **chặn ghim toạ độ** nhưng vẫn cho đăng ảnh | Ẩn danh là về vị trí, không phải cấm dùng app (trace P3-16) | Người dùng có thể tưởng đã ghim mà thực ra không |
| 2026-09-07 | `verify:local` khởi động lại API **trước mỗi bộ trace** | Bộ đếm chống spam nằm trong bộ nhớ tiến trình; chạy nối tiếp làm case sau nhận 429 và báo hỏng oan (trace L19) | Mỗi lượt verify chậm thêm ~1 phút |
| 2026-09-08 | Sự kiện cả ngày lưu bằng **ngày trôi nổi** (00:00 UTC, đọc theo UTC) | "Sinh nhật 12/09" là ô trên tờ lịch, không phải khoảnh khắc — lưu theo giờ VN sẽ trôi về ngày 11 (§6.3) | Hai loại sự kiện đọc theo hai múi giờ khác nhau, phải nhớ khi sửa code |
| 2026-09-08 | Ô nhập ngày/giờ đổi sang UTC bằng **offset `+07:00` ghép tay** | `new Date("…T19:00")` không offset được trình duyệt hiểu theo múi giờ của MÁY — người dùng đi nước ngoài là lệch giờ hẹn | Sẽ phải sửa nếu sau này hỗ trợ múi giờ khác |
| 2026-09-08 | Sự kiện **chung** thì ai cũng THẤY nhưng chỉ người tạo mới SỬA/XOÁ | Lịch của hai người cần nhìn thấy nhau, nhưng sửa đồ của nhau thì dễ cãi nhau | Muốn sửa hộ thì phải nhắn nhau — chấp nhận được với 2 người |
| 2026-09-08 | Việc riêng của người kia trả **404**, không phải 403 | 403 tự nó đã tiết lộ "id này có tồn tại" | Người dùng không phân biệt được "không có" với "không được xem" — đúng ý đồ |
| 2026-09-08 | Khoá công khai VAPID trả qua **API** (`GET /push/public-key`), không nhúng lúc build | Web là file tĩnh; nhúng vào nghĩa là mỗi môi trường phải build một bản riêng. Khoá này công khai theo đúng thiết kế Web Push | Thêm một vòng gọi API trước khi bật thông báo |
| 2026-09-08 | Nhắc lịch bằng **vòng quét mỗi phút**, không hẹn job riêng cho từng sự kiện | Server tắt rồi bật lại thì job hẹn giờ mất, vòng quét vẫn thấy; đổi giờ sự kiện không phải đi huỷ job cũ; không cần BullMQ | Độ chính xác chỉ tới từng phút |
| 2026-09-08 | **Đánh dấu `reminderSentAt` TRƯỚC khi gửi**, bằng UPDATE có điều kiện | Đánh dấu sau thì hai tiến trình API cùng kịp gửi — người dùng nhận hai lần | Gửi hỏng thì mất lời nhắc đó; chấp nhận được, spam khó chịu hơn |
| 2026-09-08 | Service worker chuyển từ `generateSW` sang **`injectManifest`** | Cần `addEventListener('push')` do mình viết, bản sinh tự động không chèn code riêng vào được | Phải tự viết luôn phần runtime caching (MapLibre, tile bản đồ) |
| 2026-09-08 | Thiếu khoá VAPID = **tắt tính năng**, không phải lỗi boot; nhưng khai báo **một nửa** thì từ chối boot | Thông báo là tính năng phụ, không được làm sập API. Còn nửa vời là cấu hình sai rõ ràng | Người deploy có thể quên bật mà không biết — màn Cài đặt nói rõ "máy chủ chưa bật" |
| 2026-09-08 | Đăng ký đẩy trùng `endpoint` thì **chuyển chủ**, không nhân đôi | Hai người dùng chung một máy: người đăng nhập sau sẽ nhận thông báo của người trước | Người trước im lặng mất thông báo trên máy đó — đúng ý đồ |
| 2026-09-08 | Thêm migration `20260907000000_enable_postgis` chạy trước mọi migration khác | Shadow database của `migrate dev` là DB trắng, không có PostGIS nên migration cột `geog` chết (trace L22) | Trùng việc với `infra/postgres/init/01-extensions.sql`, nhưng mọi câu lệnh đều IF NOT EXISTS nên vô hại |

---

## 11. Ghi chú vận hành VPS

- **Cấu hình tối thiểu:** 2 vCPU / 4GB RAM / 40GB SSD
  (Postgres 1GB, Redis 256MB, MinIO 512MB, api 512MB).
- **Domain:** `easytech.io.vn` (đã mua) → trỏ bản ghi A về IP VPS.
  Caddy sẽ tự xin chứng chỉ Let's Encrypt cho domain này khi container khởi động.
  Khi đổi sang domain `beside` sau này: chỉ sửa `APP_DOMAIN` trong `.env` rồi
  `docker compose up -d caddy` — **không** phải sửa code.
  Các biến phụ thuộc domain: `APP_DOMAIN`, `APP_ORIGIN`, `VITE_API_BASE_URL`,
  `VITE_WS_URL`, `MEDIA_PUBLIC_BASE_URL`, `COOKIE_DOMAIN`.
- **Backup:** `pg_dump` hằng ngày + `mc mirror` MinIO → thư mục backup, giữ 14 bản.
- **Biến môi trường nhạy cảm** trong `.env` (không commit):
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `VAPID_*`, `MINIO_ROOT_PASSWORD`, `POSTGRES_PASSWORD`.

### 11.0b Tách môi trường development / production

Ba chế độ chạy, phân biệt rạch ròi:

| Chế độ | Lệnh | `NODE_ENV` | Domain | Secret | Cấu hình |
|---|---|---|---|---|---|
| **Dev trên máy** | `npm run dev:api` + `dev:web` | `development` | `http://localhost:5173` | secret dev | `.env` ← `.env.example` |
| **Dev qua Docker** | `npm run docker:up` | `production` | `https://localhost` | secret dev | `.env` + `docker-compose.local.yml` |
| **Production** | `docker compose up -d --build` | `production` | domain thật, HTTPS | secret sinh mới | `.env` ← `.env.production.example` |

**Hai file mẫu tách hẳn nhau:** `.env.example` (dev) và `.env.production.example` (VPS).
Không dùng chung một file cho hai môi trường.

**Vì sao chế độ giữa lại chạy `NODE_ENV=production`:** cố ý — để thử đúng nhánh code
sẽ chạy thật (cookie `secure`, log rút gọn, không có log Prisma) chứ không phải nhánh dev.
Nó khác production thật ở chỗ phục vụ `localhost` bằng secret dev.

#### Rào chắn chống mang cấu hình dev lên máy chủ

Kịch bản dễ xảy ra nhất là `scp .env` từ máy dev lên VPS cho nhanh. Khi đó mọi thứ vẫn
khởi động bình thường — secret dev dài đúng 32 ký tự nên qua được luật độ dài — và
không ai biết cho tới lúc token bị giả mạo.

Vì vậy `apps/api/src/config/env.ts` có thêm một lớp kiểm tra, **chỉ kích hoạt khi
`NODE_ENV=production` VÀ `APP_ORIGIN` trỏ tới domain công khai** (không phải localhost):

| Kiểm tra | Chặn khi |
|---|---|
| JWT secret | chứa `dev_`, `change-me`, `doi-gia-tri-nay`, `example`, `test`… hoặc chỉ gồm vài ký tự lặp |
| Mật khẩu trong `DATABASE_URL` | cùng bộ dấu hiệu trên |
| `COOKIE_DOMAIN` | không khớp host của `APP_ORIGIN` → cookie refresh bị vứt, đăng nhập xong bị đá ra ngay |
| `CORS_EXTRA_ORIGINS` | có origin `http://` hoặc `localhost` |

API **từ chối khởi động** và in ra đúng biến nào sai. Đã kiểm chứng bằng 16 unit test
(`env.spec.ts`) và chạy thật một container giả lập deploy sai — nó dừng ngay với thông báo rõ ràng.

Điều kiện "domain công khai" là cố ý: nếu áp luật cho cả `localhost` thì
`npm run docker:up` trên máy dev sẽ không khởi động được.

### 11.0 Chạy toàn bộ bằng Docker trên máy dev

```bash
npm run docker:up    # docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

`docker-compose.local.yml` chỉ đổi domain sang `localhost`; Caddy cấp chứng chỉ bằng
**CA nội bộ** của nó nên không cần DNS lẫn Let's Encrypt, mà vẫn là HTTPS thật →
Geolocation API hoạt động. Lớp phủ này cũng mở cổng `127.0.0.1:3001` trỏ vào API
để chạy kịch bản trace; **trên VPS thì API không phơi cổng nào ra ngoài**.

> **Lưu ý về Dockerfile của API:** stage chạy thật cài bằng `--ignore-scripts`, nên
> `@prisma/engines` ở đó rỗng. Phải copy engine từ stage build sang **và** `chown` cho
> user `node`, nếu không container sẽ restart vô hạn với lỗi
> `Can't write to /repo/node_modules/@prisma/engines`.

### 11.1 Chạy trên máy dev

**Cách 1 — dùng PostgreSQL cài sẵn trên máy (khuyến nghị khi dev):**

```bash
# Tạo user + database, chạy MỘT LẦN bằng tài khoản superuser
& "C:\Program Files\PostgreSQL8in\psql.exe" -U postgres -f infra/postgres/local-setup.sql

cp .env.example .env          # đổi hết giá trị "doi-gia-tri-nay"
npm install
npm run db:migrate            # tạo bảng
npm run dev:api               # cổng 3000
npm run dev:web               # cổng 5173, tự proxy /api sang 3000
```

> **PostGIS không đi kèm bản cài PostgreSQL mặc định.** Máy dev hiện tại đã cài
> **PostGIS 3.6.2** (bundle chính thức của OSGeo cho `pg18x64`, đã đối chiếu MD5).
> `local-setup.sql` tự bỏ qua nếu máy khác chưa có.
>
> Cách cài trên máy mới: tải `postgis-bundle-pg18-3.6.2x64.zip` từ
> `download.osgeo.org/postgis/windows/pg18/`, **dừng dịch vụ PostgreSQL**
> (postgres.exe giữ một số DLL dùng chung nên không ghi đè được), copy 5 thư mục
> `bin lib share gdal-data utils` vào `C:\Program Files\PostgreSQL8`, bật lại dịch vụ.
>
> `CREATE EXTENSION postgis` **cần quyền superuser** — PostGIS không phải extension
> "trusted" như `unaccent`/`uuid-ossp`. Chạy bằng user `postgres`, sau đó user `beside`
> dùng được bình thường.

**Cách 2 — dùng Docker cho tầng dữ liệu:**

```bash
npm run infra:up              # Postgres (có sẵn PostGIS) + Redis
npm run db:migrate
```

> Nếu máy đã cài PostgreSQL thì cổng 5432 đã bị chiếm — `.env.example` đặt sẵn
> `POSTGRES_PORT=55432` cho container, và phải sửa `DATABASE_URL` sang cổng đó.

> **Lưu ý Windows:** ngoài việc PostgreSQL cài sẵn đã giữ cổng 5432, Hyper-V còn
> giữ trước nhiều dải cổng khác, `docker compose` sẽ báo *“ports are not available …
> forbidden by its access permissions”*. Đổi `POSTGRES_PORT` / `REDIS_PORT` trong
> `.env` (máy dev hiện dùng **55432** và **6380**) — chỉ ảnh hưởng cổng trên máy host,
> bên trong mạng Docker vẫn là 5432/6379.

> **Lệnh Prisma phải chạy từ gốc repo** (`npm run db:*`) vì Prisma tìm `.env` theo
> thư mục hiện tại. Chạy `npx prisma ...` bên trong `apps/api` sẽ báo thiếu `DATABASE_URL`.

> **Dừng API trước khi chạy `db:generate`**: tiến trình đang chạy giữ file
> `query_engine-windows.dll.node`, Prisma sẽ báo `EPERM` khi ghi đè.
