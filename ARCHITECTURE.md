# ARCHITECTURE.md — Ứng dụng Check-in & Theo dõi lịch trình cho cặp đôi

> **File này là nguồn sự thật (source of truth) về kiến trúc.**
> Mọi thay đổi về stack, schema, API, luồng dữ liệu **phải** được ghi lại ở đây
> *trước hoặc ngay sau khi* code. Đọc file này trước khi viết code mới.

- **Tên app:** `Beside` (đã chốt)
- **Domain:** `https://easytech.io.vn` (tạm dùng — đã mua). Sẽ đổi sang domain `beside` sau
  ⇒ **mọi URL phải lấy từ biến môi trường, không hardcode domain ở bất kỳ đâu**
- **Cập nhật lần cuối:** 2026-09-12
- **Trạng thái:** `PHASE 7` ✅ xong — bình luận trong khoảnh khắc, cờ caro & tiến lên, phòng học chung.
  Đã chạy trên máy chủ thật `https://easytech.io.vn` từ 2026-09-09 (commit `133e5fc`)
  - Phase 1: `docs/traces/phase-1-auth-pairing.md` — 53/53 case
  - Phase 2: `docs/traces/phase-2-realtime-location.md` — 29/29 case
  - Rà soát: `docs/traces/phase-2-review.md` — 21/21 case (bắt được 2 lỗi rò rỉ quyền riêng tư)
  - Phase 3: `docs/traces/phase-3-posts.md` — 34/34 case (bắt được 4 lỗi, xem L16–L19)
  - Phase 4 (F4): `docs/traces/phase-4-events.md` — 37/37 case (bắt được 2 lỗi, L22–L23)
  - Phase 4 (F7): `docs/traces/phase-4-push.md` — 21/21 case (bắt được 3 lỗi, L24–L26)
  - Phase 4 (F6): `docs/traces/phase-4-places.md` — 27/27 case (bắt được 3 lỗi, L27–L29)
  - Sửa lỗi: `docs/traces/fix-ban-do-khong-hien.md` — khung bản đồ cao 0px do cascade layer của Tailwind v4 (L30), 7/7 case
  - Sửa lỗi: `docs/traces/fix-lint-khong-chay.md` — `npm run lint` không kiểm gì suốt 4 phase (L31), 9/9 case
  - Kiểm thử: `docs/traces/e2e-trinh-duyet-that.md` — E2E Playwright 390×844, 12/12 case
  - Phase 5: `docs/traces/phase-5-ban-do.md` — địa điểm & ảnh trên bản đồ, 15/15 E2E
  - Phase 5: `docs/traces/phase-5-hieu-nang.md` — tách socket.io khỏi gói tải đầu
  - Phase 5: `docs/traces/phase-5-pwa-offline.md` — PWA offline mức 1, 4/4 case (mức 2 chưa làm được)
  - Phase 4 (F5): `docs/traces/phase-4-milestones.md` — 25/25 case (không lỗi mới)
  - Phase 7: F12 Học cùng nhau — **22/22 case trace** (`trace:study`) + 3 E2E
  - Phase 6: F11 Cờ caro + F10 Tiến lên — `docs/thiet-ke-games.md`, **45/45 case trace** (`trace:games`), 84 unit test luật, 7 E2E
  - 10/09 — **Bản đồ**: lọc ghim check-in theo khoảng thời gian; chạm ghim mở chi tiết bài
    kèm toạ độ và nút chỉ đường Google Maps. **Khoảnh khắc**: xem ảnh toàn màn hình
    (phóng to, vuốt đổi ảnh) + cắt / chọn tỉ lệ ảnh trước khi đăng.
    28 unit test mới (`crop-math`, `map-filter`, `datetime`, `geo`) + 4 E2E (BD-01…BD-04)
  - 11/09 — **Bản đồ**: thêm mốc lọc **Hôm nay**; bảng lọc **thu gọn được** (mặc định thu gọn,
    còn một chip ghi khoảng đang lọc). Chạm **chấm vị trí của người ấy** → tấm trượt chi tiết:
    khoảng cách · sai số · pin/tốc độ · toạ độ · nút chỉ đường Google Maps; có lối vào thứ hai
    từ bảng thông tin ở đáy. 5 unit test mới + 1 E2E (BD-05)
  - 11/09 — **Cài đặt & Hồ sơ thiết kế lại**: một trang cuộn dài 688 dòng tách thành
    **danh sách nhóm + 5 màn con** (`src/screens/settings/`), mỗi hàng nói luôn giá trị
    đang dùng; thẻ hồ sơ gradient ở đầu màn; thanh Lưu neo đáy chỉ sáng khi có thay đổi;
    huỷ ghép đôi dời vào màn "Chuyện của hai đứa". 4 E2E (CD-01, CD-02 + PF-01…04 viết lại)
  - 11/09 — **F13 Đang trên đường về** · **F14 Chu kỳ kinh nguyệt** · **sửa lỗi app không cập nhật
    sau deploy** (service worker mới nằm chờ vĩnh viễn vì `registerType: 'prompt'` mà không có
    chỗ nào mời tải lại) + màn **Bộ nhớ & cập nhật** có nút xoá bộ nhớ đệm.
    37 unit test mới (`trip.schema`, `cycle`) + 3 E2E (VD-01, CK-01, BN-01), 2 migration
  - Tổng: **578 unit test** + **336 case trace** + **58 E2E**, typecheck + lint sạch cả 3 workspace
  - ✅ `npm run verify:local` → **41/41 mục đạt** trên Docker thật (gồm chốt ESLint và E2E trình duyệt)
    (6/6 container healthy: db · redis · api · web · caddy · minio), đi qua Caddy HTTPS
    — chạy lại ngày 09/09 sau khi thêm bình luận và hai trò chơi: 13 migration, 41 E2E
  - ⚠️ 10–11/09: chạy `npm run e2e` trên Docker thật. **TL-05 hỏng** (lá 4♠ chắn mất lá 3♣
    đang được ghim ở bàn Tiến lên) và nó chặn các test xếp sau — lỗi nằm ở màn Tiến lên,
    **không liên quan** tới phần bản đồ / khoảnh khắc, đã ghi `docs/BACKLOG.md`.
    Chạy cả bộ trừ nhóm Tiến lên: **55/55 đạt** (gồm BD-01…BD-05, CD-01/CD-02, VD-01, CK-01, BN-01)
- **Triển khai:** chủ dự án tự deploy — hướng dẫn ở `docs/DEPLOY.md`

---

## 1. Bài toán & Ràng buộc

### 1.1 Yêu cầu chức năng
| # | Chức năng | Mô tả |
|---|-----------|-------|
| F1 | Ghép đôi (Pairing) | 2 người ghép thành 1 `couple` qua mã mời 6 ký tự. 1 user chỉ thuộc 1 couple tại 1 thời điểm |
| F2 | Vị trí thời gian thực | Xem đối phương đang di chuyển trên bản đồ, có vệt đường đi (trail), độ chính xác, hướng, tốc độ |
| F3 | Check-in bằng ảnh | Chụp/chọn ảnh + caption + vị trí → ghim lên bản đồ + lên timeline. Mỗi khoảnh khắc có **thả cảm xúc** và **bình luận** |
| F4 | Lịch trình chung | Lịch hẹn, kế hoạch đi chơi, nhắc nhở; xem "hôm nay đối phương đi đâu" |
| F5 | Đếm ngày yêu | Số ngày bên nhau, đếm ngược mốc kỷ niệm (100/365/1000 ngày, sinh nhật) |
| F6 | Địa điểm & Geofence | Lưu "Nhà", "Công ty", "Quán quen" → tự động thông báo khi đến/rời |
| F7 | Thông báo đẩy | Web Push: đối phương đã đến nơi, vừa check-in, sắp tới ngày kỷ niệm |
| F8 | Quyền riêng tư | Ghost mode (tạm ẩn vị trí), làm mờ độ chính xác, hạn lưu lịch sử vị trí |
| F9 | Nhắn tin | **Không làm chat trong app.** Chỉ 1 nút deep-link mở Zalo / Messenger / gọi điện |
| F10 | Tiến lên miền Nam | ✅ 2 người, 13 lá mỗi bên, luật cơ bản + chặt heo, 30s/lượt |
| F11 | Cờ caro | ✅ Bàn 15×15, luật Việt Nam (đúng 5 quân bị chặn hai đầu thì không thắng, ≥6 quân thắng), 30s/lượt |
| F13 | Đang trên đường về | ✅ Bấm một nút khi bắt đầu về; người ấy nhận thông báo lúc khởi hành và lúc tới nơi, xem được giờ dự kiến. Điểm đến là một Địa điểm đã lưu (F6), chính hàng rào ảo của nó phát hiện "đã tới nơi" |
| F14 | Chu kỳ kinh nguyệt | ✅ Ghi kỳ, dự đoán kỳ tới, nhắc trước 1 ngày. **Dữ liệu sức khoẻ của MỘT người** — mặc định người ấy không thấy gì; ba mức chia sẻ do chính chủ chọn; có nút xoá sạch |
| F12 | Học cùng nhau | ✅ Phòng Pomodoro chung: **đồng hồ số lật** chạy đồng bộ hai máy, đặt tên môn cho buổi học, mục tiêu phút mỗi ngày, thống kê 7 ngày + phân bổ theo môn + chuỗi ngày, mốc đếm ngược, việc cần làm, nhật ký một dòng mỗi chặng, dải thời gian trong ngày, so kè tuần, tiếng ồn nền tổng hợp, cổ vũ thời gian thực, **đồng hồ toàn màn hình** (đếm ngược / xem giờ hiện tại, xoay ngang được). **Không có gọi video** — xem §1.1b |

### 1.1b Ngoài phạm vi (không làm)

- Chat / nhắn tin trong app (đã chốt: chỉ deep-link ra app ngoài — xem F9)
- **Gọi thoại / video trong app** — được nêu lại ngày 09/09 khi làm F12 và **chủ dự án
  chốt giữ nguyên**. Về kỹ thuật thì khả thi (WebRTC P2P cho đúng hai người, báo hiệu đi
  nhờ Socket.IO sẵn có), nhưng ~15–30% cuộc gọi sẽ hỏng nếu không dựng thêm coturn, mà
  coturn thì relay ~2 Mbps mỗi cuộc qua băng thông VPS. Zalo/Messenger đã có sẵn video
  call và app đã có nút deep-link (F9)
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
┌─ L3 · GEOFENCE PHÍA SERVER ✅ đã triển khai ────────────────────────┐
│ Mỗi điểm nhận được → so với các Place đã lưu (haversine trong RAM)  │
│ → sinh event ARRIVED / LEFT → Web Push cho đối phương               │
│ Ưu điểm: không tốn pin client, logic tập trung, dễ viết test        │
│                                                                     │
│ BA CHỐT CHẶN chống báo sai (§6.4) — thông báo vị trí SAI tệ hơn     │
│ hẳn không có thông báo:                                             │
│   1. sai số GPS > bán kính → bỏ qua điểm                            │
│   2. khoảng chênh vào/ra 30 m → không bắn tràng thông báo ở mép     │
│   3. phải ở đủ 60 giây → đi ngang qua nhà không tính là về tới nhà  │
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

### 3.3 Bốn loại bản đồ (đã triển khai & trace)

Khai báo ở `apps/web/src/lib/map-styles.ts`. Lựa chọn được nhớ trong `localStorage`.

| Loại | Nguồn | Dạng | Cần khoá API |
|---|---|---|---|
| Đường phố 🗺️ | OpenFreeMap Liberty (`VITE_MAP_STYLE_URL` đè được) | vector | không |
| Tối giản 🤍 | OpenFreeMap Positron | vector | không |
| Ban đêm 🌙 | OpenFreeMap Dark Matter | vector | không |
| Vệ tinh 🛰️ | Esri World Imagery | raster, viết tay `StyleSpecification` | không |

Ràng buộc giữ nguyên từ §3.2: **không nguồn nào cần thẻ tín dụng hay khoá API.**

**Lớp giao thông thì không có.** Dữ liệu tình trạng giao thông thời gian thực
không tồn tại ở dạng miễn phí — Google/TomTom/HERE đều bắt gắn thẻ tín dụng.
Chủ dự án đã chốt bỏ qua; xem `docs/BACKLOG.md`.

> **Bẫy `setStyle()`:** đổi loại bản đồ **xoá sạch** mọi nguồn và lớp do app thêm
> vào (hàng rào địa điểm, vệt đường). Phải dựng lại trong listener `styledata`.
> Chi tiết ở `docs/traces/phase-5-ban-do-nang-cao.md` TC-01 và TC-03.

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
  comments  Comment[]
  lat       Float?
  lng       Float?
  placeName String?
  reactions Json     @default("[]")
  createdAt DateTime @default(now())
  @@index([coupleId, createdAt])
}

model Comment {                          // F3 — bình luận trong một khoảnh khắc
  id        String   @id @default(uuid())
  postId    String                       // KHÔNG có coupleId: quyền suy từ post
  authorId  String
  body      String                       // ≤300 ký tự
  createdAt DateTime @default(now())
  @@index([postId, createdAt])
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

### 6.5 Ván chơi (Phase 6 — đã triển khai cho caro)

```prisma
model Game {                             // F10/F11 — một ván giữa hai người
  id              String     @id @default(uuid())
  coupleId        String
  kind            GameKind                  // TIEN_LEN | CARO
  status          GameStatus @default(PLAYING)  // PLAYING | FINISHED | ABANDONED
  state           Json                      // bàn cờ / bài trên tay — KHÔNG trả thẳng ra client
  turnUserId      String?
  turnDeadlineAt  DateTime?                 // NULL = đồng hồ đang TẠM DỪNG (§6.6)
  turnRemainingMs Int        @default(30000)
  lastMoveAt      DateTime   @default(now())  // mốc tính hạn huỷ ván bỏ dở
  lastMoveAuto    Boolean    @default(false)  // nước do đồng hồ tự sinh
  winnerId        String?
  endReason       String?                   // HET_BAI|DU_QUAN|HET_GIO|DAU_HANG|HOA|BO_DO|TOI_TRANG
  version         Int        @default(0)    // khoá lạc quan, xem §6.7
  @@index([coupleId, kind, status])
  @@index([status, turnDeadlineAt])         // cron quét hết giờ
  @@index([status, lastMoveAt])             // cron huỷ ván bỏ dở
}

model GameMove {                         // lịch sử, KHÔNG dùng để dựng lại ván
  id      BigInt  @id @default(autoincrement())
  gameId  String
  userId  String
  no      Int
  payload Json                              // caro {r,c} · tiến lên {cards[]}|{pass}
  auto    Boolean @default(false)
  @@unique([gameId, no])
}
```

Bảng điểm **không lưu riêng** — đếm thẳng từ `winnerId`. Một cặp đôi thì số ván nhỏ tới mức
đếm lại mỗi lần vẫn rẻ hơn việc phải giữ hai nguồn sự thật đồng bộ.

Khuôn của cột `state`:

```ts
// CARO — không có gì phải giấu, hai bên cùng nhìn một bàn cờ
{ kind:'CARO', board: string /*225 ký tự*/, marks: {userId:'X'|'O'}, lastMove, winLine }

// TIEN_LEN — `hands` chứa bài CẢ HAI NGƯỜI, tuyệt đối không trả thẳng ra client
{ kind:'TIEN_LEN', hands: {userId: number[]},
  pile: {userId, cards}[],          // CẢ VÒNG, cũ → mới; bộ cuối là bộ phải chặn
  passedBy: userId | null, mustInclude: number | null,
  thoiThreeSpade: userId | null,    // người thua còn ôm 3♠ lúc ván xong
  instantWin: {userId, kind} | null // tới trắng lúc chia bài
}
```

`pile` thay cho `table` cũ (một bộ): bàn phải **giữ nguyên cả vòng** thì người chơi mới
nhìn lại được mình vừa chặn cái gì. Bỏ lượt là vòng khép lại và `pile` về `[]`. Ván mở
trước thay đổi này được `readTienLenState()` nâng cấp tại chỗ (`table` → `pile` một tầng),
nên không cần migration dữ liệu.

`GamesService.clientState()` là **chỗ duy nhất** trong toàn bộ code base mở cột `state` ra để
gửi đi: người xem thấy bài của mình, còn của đối phương chỉ thấy **số lá**. Thêm bất kỳ đường
ra nào khác cho `game.state` là phá thẳng luật số một của tính năng này.

### 6.8 Phòng học chung (Phase 7)

```prisma
model StudySession {                     // F12 — Pomodoro cho hai người
  id             String      @id @default(uuid())
  coupleId       String
  startedById    String
  phase          StudyPhase  @default(FOCUS)   // FOCUS | BREAK
  status         StudyStatus @default(RUNNING) // RUNNING | DONE | CANCELLED
  focusMin       Int         @default(25)
  breakMin       Int         @default(5)
  longBreakMin   Int         @default(15)      // nghỉ dài sau mỗi 4 chặng
  subject        String?                       // môn / việc đang học
  endsAt         DateTime                      // đồng hồ của SERVER
  roundsDone     Int         @default(0)
  presentUserIds Json        @default("[]")    // ai đang trong phòng
  @@index([coupleId, status])
  @@index([status, endsAt])                    // cron quét chặng hết giờ
}

model StudyLog {                         // một chặng HỌC đã hoàn thành
  id        BigInt @id @default(autoincrement())
  coupleId  String
  userId    String
  sessionId String?
  round     Int                          // (sessionId, round) = khoá của một chặng
  minutes   Int
  subject   String?                      // BẢN CHÉP tên môn lúc ghi công
  note      String?                      // nhật ký một dòng cho chặng này
  day       DateTime @db.Date            // ngày lịch GIỜ VN
  @@index([coupleId, userId, day])
  @@index([coupleId, day])               // biểu đồ 7 ngày của cả couple
}

model StudyDDay {                        // mốc đếm ngược ("còn 12 ngày nữa thi")
  id       String   @id @default(uuid())
  coupleId String
  userId   String                        // của MỘT người, nhưng cả hai đều thấy
  title    String
  date     DateTime @db.Date             // ngày lịch GIỜ VN
  @@index([coupleId, date])
}

model StudyTask {                        // việc cần làm trong ngày
  id       String    @id @default(uuid())
  coupleId String
  userId   String                        // RIÊNG tư — người ấy không thấy
  title    String
  day      DateTime  @db.Date            // ngày TẠO, không phải hạn chót
  doneAt   DateTime?                     // null = chưa xong
  @@index([coupleId, userId, day])
  @@index([coupleId, userId, doneAt])
}
```

**Việc chưa xong không biến mất lúc nửa đêm.** `tasksOf()` trả về mọi việc `doneAt = null`
(tạo từ hôm nào cũng được) cộng với việc đã xong **hôm nay**; việc cũ chưa xong được đánh
dấu `carriedOver` để giao diện nói rõ "còn lại từ 10/09". Danh sách bó cứng vào "hôm nay"
nghe gọn hơn, nhưng nó âm thầm nuốt đúng những việc người ta đang nợ.

**Mốc đếm ngược chung, việc cần làm riêng.** Biết người ấy còn mười hai ngày nữa thi là lý
do mốc tồn tại trong một app cho hai người; còn danh sách việc vặt của một người thì người
kia không có lý do gì để đọc. Số ngày còn lại do **server** tính — máy người dùng có thể
lệch giờ hoặc sai múi giờ, mà "còn mấy ngày nữa thi" thì không được phép sai.

`User.studyGoalMin` (Int, mặc định `0`) giữ mục tiêu phút mỗi ngày. `0` nghĩa là chưa đặt —
giao diện ẩn vòng tiến độ. Không dùng `NULL` vì mọi chỗ đọc ra đều đem đi cộng/so sánh.

**Nghỉ dài KHÔNG phải pha thứ ba.** `StudyPhase` vẫn chỉ có `FOCUS | BREAK`; "đang nghỉ dài"
được **suy ra** từ `roundsDone % 4 === 0` (`isLongBreak()` ở `packages/shared`). Thêm giá trị
vào enum của Postgres là migration không lùi được, mà nghỉ dài xét cho cùng vẫn là nghỉ —
chỉ khác độ dài. Suy ra thì không có cách nào để cột trong DB lệch khỏi luật.

**Đồng hồ học chạy ngược với đồng hồ ván bài.** Đồng hồ ván bài *dừng* khi người tới lượt
khoá màn hình (§6.6). Đồng hồ học phải *chạy tiếp*: khoá máy để khỏi bị phân tâm chính là
điều người ta làm khi ngồi học — dừng lúc đó là phá đúng thứ tính năng này phục vụ. Hệ quả
bắt buộc: hết chặng phải báo bằng **Web Push**, vì rất có thể app đang đóng.

Chỉ ghi `StudyLog` khi chặng FOCUS **chạy hết giờ**; bỏ dở giữa chừng thì không tính, để
con số thống kê nói đúng sự thật.

`day` là **ngày lịch giờ Việt Nam**, không phải ngày UTC: chuỗi ngày học đếm theo cột này,
mà lưu timestamp rồi so sau sẽ tính nhầm mọi buổi học sau nửa đêm (ADR 2026-09-07).

**Tên môn nằm ở cả hai bảng là cố ý**, không phải chuẩn hoá thiếu. `study_logs.subject` là
bản chép tại thời điểm ghi công: phiên bị xoá thì `sessionId` thành `NULL` (`onDelete:
SetNull`), mà lịch sử "hôm đó học Toán 50 phút" vẫn phải còn đúng.

### 6.6 Đồng hồ 30 giây — và cách không phạt oan người dùng

Chủ dự án chốt 30 giây mỗi lượt. Nhưng §1.3 đã ghi: **iOS treo JavaScript ngay khi khoá màn
hình** — để đồng hồ chạy thẳng thì ai nhận một cuộc gọi giữa ván sẽ thua oan. Nên:

- Đồng hồ là **của server** (`turnDeadlineAt`); client chỉ vẽ lại phần đếm ngược.
- `turnDeadlineAt = NULL` nghĩa là **tạm dừng**, phần còn lại nằm ở `turnRemainingMs`.
- Dừng khi người tới lượt gửi `g:away` (bắt `visibilitychange`, **không đợi** socket rớt —
  Socket.IO mất ~20 giây mới nhận ra, quá muộn trên đồng hồ 30 giây), hoặc khi socket rớt thật.
- **Và sau MỖI lần lượt đổi tay**, server hỏi lại: người tới lượt có socket nào đang xem ván
  không? Không thì dừng ngay. Thiếu bước này là lỗ hổng lớn nhất của cả cơ chế — `g:away` đã
  xảy ra từ trước nước đi, nên deadline mới vẫn được đặt cho một người đang không nhìn màn hình.
- **Trần chờ 30 phút**: không ai đi nước nào trong 30 phút thì ván sang `ABANDONED`. Không có
  mốc này thì một ván tạm dừng treo vĩnh viễn.

Canh giờ bằng **cron 5 giây**, không phải `setTimeout` hẹn riêng từng ván: `setTimeout` chết
theo tiến trình nên khởi động lại API là mọi ván treo ở lượt của một người — đúng bài học đã
ghi ở job nhắc lịch.

### 6.7 Chống hai người bấm cùng lúc

`Game.version` là khoá lạc quan: `UPDATE ... WHERE id = ? AND version = <đã đọc>`. Không đổi
được dòng nào ⇒ có người đi trước ⇒ trả 409.

Trường hợp thật sự xảy ra không phải hai người, mà là **đồng hồ hết giờ đúng lúc người chơi
bấm đánh**. Một bên thua — và đó là kết quả đúng: ván không bao giờ đi hai nước cho một lượt.

Cố tình **không** dùng transaction Serializable — ADR 2026-09-07 đã ghi lại bài học lúc ghép
đôi: bên thua cuộc trả 500 vì hết `maxWait` của Prisma.

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

### 6.4 Hàng rào ảo — ba chốt chặn chống báo sai (đã triển khai & trace)

Một thông báo vị trí **sai** tệ hơn hẳn không có thông báo: nó làm người ta mất
lòng tin vào cả tính năng. Ba lớp lọc, theo thứ tự quan trọng:

| Lớp | Quy tắc | Hằng số |
|---|---|---|
| 1. Sai số GPS | điểm có `accuracyM > radiusM` thì **bỏ qua**, giữ nguyên trạng thái | — |
| 2. Khoảng chênh vào/ra | vào khi `d ≤ radiusM`, ra khi `d > radiusM + 30` | `GEOFENCE_EXIT_HYSTERESIS_M` |
| 3. Ở đủ lâu | phải ở trong **60 giây** mới tính là ARRIVED | `GEOFENCE_MIN_DWELL_MS` |

Trạng thái nằm ở bảng riêng `GeofenceState` (khoá chính `[userId, placeId]`),
**không** suy từ `GeofenceEvent` gần nhất: mỗi điểm vị trí gửi lên đều phải trả
lời "đang ở trong hay ngoài", mà "sự kiện mới nhất theo từng địa điểm" là một
câu truy vấn khó và tốn.

Phần quyết định được tách thành hai **hàm thuần** trong
`packages/shared/src/place.schema.ts` (`accuracyUsableFor`, `decideTransition`)
để kiểm mọi biên bằng unit test, không cần DB hay GPS.

Việc đối chiếu chạy **không chờ** (`void geofence.evaluate(...)`) trong
`LocationsService.ingest` — địa điểm là việc phụ, không được làm chậm đường vị
trí thời gian thực.

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

> **Bổ sung Phase 4 (F6):** khi bán kính làm mờ vị trí **rộng bằng hoặc hơn**
> bán kính một hàng rào, server vẫn ghi sự kiện ra/vào cho chính chủ nhưng
> **không** báo cho người kia. Lý do: tên một địa điểm cụ thể ("vừa tới Nhà")
> còn tiết lộ chính xác hơn cả một toạ độ đã làm mờ — báo đi là tiết lộ nhiều
> hơn mức người dùng đã đồng ý chia sẻ.

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

GET    /places                     kèm `peopleInside` — ai đang trong hàng rào   ✅
POST   /places                     {name, emoji, lat, lng, radiusM, notify*}     ✅
PATCH  /places/:id                 dời/đổi bán kính thì XOÁ trạng thái cũ        ✅
DELETE /places/:id                                                              ✅

POST   /posts                      multipart: photos[] + caption + mood + toạ độ  ✅
GET    /posts                      ?cursor&limit&authorId&pinned&from&to           ✅
                                   from/to = epoch ms, bao gồm cả hai đầu (10/09)
DELETE /posts/:id                  chỉ người đăng mới xoá được                    ✅
POST   /posts/:id/react            {emoji} — mỗi người 1 cảm xúc, bấm lại = bỏ    ✅
GET    /posts/photos/:photoId/:size   size = thumb | md | orig                    ✅

GET    /posts/:postId/comments     ?cursor&limit — trả MỚI → CŨ, client đảo lại    ✅
POST   /posts/:postId/comments     {body} ≤300 ký tự, trần 300 dòng/bài            ✅
DELETE /posts/:postId/comments/:commentId   người viết HOẶC chủ khoảnh khắc        ✅

GET    /events?from&to             sự kiện GIAO với khoảng đó (§6.3)              ✅
POST   /events                     có giờ hoặc cả ngày, riêng tư hoặc chung        ✅
GET    /events/:id                                                                ✅
PATCH  /events/:id                 chỉ người tạo                                   ✅
DELETE /events/:id                 chỉ người tạo                                   ✅

GET    /milestones                 mốc sắp tới — trộn tự sinh + tự thêm         ✅
POST   /milestones                 {title, date, emoji, yearly} → cả danh sách  ✅
PATCH  /milestones/:id             → cả danh sách mới                           ✅
DELETE /milestones/:id             chỉ xoá được mốc TỰ THÊM                     ✅

GET    /games                      ?kind — danh sách ván của couple               ✅
GET    /games/summary              bảng điểm + id ván đang chạy mỗi loại          ✅
POST   /games                      {kind} — 409 kèm gameId nếu còn ván dở         ✅
GET    /games/:id                  state ĐÃ LỌC theo người xem                    ✅
POST   /games/:id/moves            {version, move} — version là khoá lạc quan     ✅
POST   /games/:id/resign           đầu hàng                                       ✅

GET    /study/current              phiên đang chạy, hoặc null                     🔸
GET    /study/summary              tổng giờ + chuỗi ngày + "học cùng nhau"        🔸
                                   + 7 ngày gần nhất + phân bổ theo môn + mục tiêu
                                   + mốc đếm ngược + việc cần làm + nhật ký
                                   + dải thời gian hôm nay
PUT    /study/goal                 {dailyGoalMin} — mục tiêu của CHÍNH mình        🔸
POST   /study                      {focusMin, breakMin, longBreakMin, subject?}          🔸
                                   — đã có phòng thì vào cùng luôn
POST   /study/:id/join             vào học cùng                                   🔸
POST   /study/:id/leave            rời phòng; người cuối rời thì phiên đóng lại    🔸
POST   /study/:id/cancel           dừng hẳn — ai trong hai người cũng dừng được    🔸
POST   /study/ddays                {title, date} — tối đa 5 mốc mỗi người         🔸
DELETE /study/ddays/:id            chỉ xoá được mốc của CHÍNH mình                🔸
POST   /study/tasks                {title} — tối đa 40 việc đang mở               🔸
PATCH  /study/tasks/:id            {title?, done?}                                🔸
DELETE /study/tasks/:id                                                           🔸
PUT    /study/logs/:logId/note     {note} — nhật ký một dòng, chuỗi rỗng = gỡ     🔸

POST   /trips                      {placeId} — bắt đầu chuyến "đang trên đường về"  ✅
GET    /trips/current               chuyến đang chạy của couple (mình hoặc người ấy) ✅
POST   /trips/:id/arrive            tự bấm "đã tới nơi"                              ✅
DELETE /trips/:id                   huỷ chuyến                                       ✅

GET    /cycle/me                    hồ sơ chu kỳ CỦA MÌNH + dự đoán                  ✅
PUT    /cycle/settings              {shareLevel, avgCycleDays?, remindMe, ...}        ✅
POST   /cycle/periods               {startDate, endDate?}                            ✅
PATCH  /cycle/periods/:id           sửa một kỳ                                       ✅
DELETE /cycle/periods/:id           xoá một kỳ                                       ✅
DELETE /cycle/me                    XOÁ SẠCH dữ liệu chu kỳ                          ✅
GET    /cycle/partner               phần người ấy chia sẻ — server cắt gọt sẵn       ✅

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

### 7.1c Hồ sơ cá nhân & ảnh đại diện (đã triển khai)

| Method | Đường dẫn | Việc |
|---|---|---|
| `PATCH` | `/me` | Thêm `bio` (≤160) và `address` (≤120). Gửi `null` hoặc chuỗi rỗng = **xoá**; không gửi = giữ nguyên |
| `POST` | `/me/avatar` | multipart, trường `avatar`. 20 lần/giờ |
| `DELETE` | `/me/avatar` | Gỡ ảnh, lặp lại an toàn |
| `GET` | `/users/:userId/avatar/:size?v=` | `size` ∈ `md` (512px) \| `thumb` (128px). Quyền: chính mình hoặc cùng couple, kiểm ở tầng service |

Ảnh đại diện đi qua đúng đường ống của ảnh check-in (`ImageProcessor`) nên cũng
**bị xoá sạch EXIF** — ảnh chân dung chụp bằng điện thoại cũng mang toạ độ GPS.

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

**Namespace thứ hai `/rtg`** — trò chơi (F10/F11). Tách hẳn khỏi `/rt`: gateway vị trí là nơi
nhạy cảm nhất về quyền riêng tư và đang chạy ổn định, trộn thêm luồng game vào là đặt hai việc
không liên quan vào chung một chỗ dễ vỡ. Đổi lại máy người dùng mở socket thứ hai — nhưng chỉ
khi đang ở màn game. **Nước đi KHÔNG đi qua đây** (xem §7.4).

| Hướng | Sự kiện | Payload |
|---|---|---|
| C→S | `g:watch` ✅ | `{gameId}` |
| C→S | `g:away` / `g:back` ✅ | `{}` — tab ẩn / hiện lại, để tạm dừng đồng hồ (§6.6) |
| S→C | `g:state` ✅ | `GameResponse` — **gửi riêng từng socket** vì mỗi người thấy một bản đã lọc khác nhau |
| S→C | `g:over` ✅ | `{gameId, winnerId, endReason}` |
| S→C | `g:error` ✅ | `{code, message}` |

**Namespace thứ ba `/rts`** — phòng học (F12), cùng lý do tách như `/rtg`.

| Hướng | Sự kiện | Payload |
|---|---|---|
| C→S | `s:watch` 🔸 | *(không tham số)* — nghe theo **couple**, không theo phiên |
| S→C | `s:state` 🔸 | `StudySessionResponse` hoặc `null` |
| C→S | `s:cheer` 🔸 | `{code}` — MÃ trong danh sách đóng, không nhận chữ tự do (§7.3: app không có chat). Chặn 3 giây/lần ở server |
| S→C | `s:cheer` 🔸 | `StudyCheerEvent` — phát cho CẢ phòng kể cả người gửi; client tự bỏ tiếng vọng của mình qua `fromUserId` |
| S→C | `s:error` 🔸 | `{code, message}` |

Nghe theo couple chứ không theo phiên là có chủ ý: người kia bấm "bắt đầu" lúc mình đang
mở app thì mình phải thấy ngay. Nghe theo phiên thì lúc chưa có phiên nào client chẳng có
gì để nghe — mà đúng khoảnh khắc cần biết nhất lại là khoảnh khắc không nghe được.

### 7.4 Nước đi đi bằng REST, không bằng WebSocket

Nước đi cần **mã lỗi rõ ràng** ("chưa tới lượt bạn", "ô này đã có quân") và cơ chế thử lại —
HTTP có sẵn cả hai, còn qua WebSocket thì phải tự dựng lại. Ván 30 giây một lượt không cần
tiết kiệm một nhịp mạng. WebSocket chỉ làm đúng một việc: đẩy state mới về.

**Phát state KHÔNG chặn câu trả lời REST** (09/09). State mới đã nằm sẵn trong body trả về
cho người vừa đi; bắt họ chờ thêm một vòng đọc DB + phát socket nữa chỉ để phục vụ người kia
là cộng thẳng vào độ trễ của chính họ. `GamesController` gọi `gateway.pushState()` — bản
không-chờ, có bắt lỗi và ghi log. Cùng lúc đó `broadcastGame()` nạp ván **một lần** cho cả
phòng thay vì `games.get()` cho từng socket; bản gửi đi vẫn lọc riêng theo từng người (bài
úp không đổi), chỉ dữ liệu gốc là dùng chung. Xem `docs/thiet-ke-games.md` §8.1b.

**Với Tiến lên, `state` chứa bài úp của cả hai người.** Mọi đường ra đều đi qua bộ lọc theo
người xem: thấy bài của mình, còn của đối phương chỉ thấy **số lá**. Đây là bản sao của R3 áp
cho ván bài. Xáo bài bằng `crypto.randomInt` chứ không `Math.random` — `Math.random` đoán được
trạng thái sau vài chục mẫu, và với bài úp thì đó là lỗ hổng thật.

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

### 8.1 Ba chốt tự động — và điều kiện để chúng có nghĩa

| Lệnh | Chạy cái gì | Chốt lại ở đâu |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` cho cả 3 workspace, **bao gồm file `*.spec.ts`** | `verify:local` mục 4 |
| `npm run lint` | **ESLint thật** (`eslint.config.mjs` ở gốc) cho cả 3 workspace | `verify:local` mục 4 |
| `npm run test` | Vitest — hiện 466 unit test | `verify:local` mục 4 |
| `npm run e2e` | **Playwright ở 390×844** trên bản build thật trong Docker — 21 test (17 mobile + 4 offline) | `verify:local` mục 4 |

> ⚠️ **Bài học đắt nhất của dự án này (L31).** Từ Phase 1 tới Phase 4,
> `npm run lint` chạy `--workspaces --if-present` mà **không workspace nào có
> script `lint`** — nó luôn thoát 0 và không kiểm gì cả. Bốn báo cáo "lint sạch"
> là vô căn cứ. Cùng khoảng đó, `tsconfig.json` của `packages/shared` **loại trừ**
> `*.spec.ts`, nên hơn 100 unit test chưa từng được kiểm kiểu.
>
> **Một mã thoát 0 không có nghĩa là phép kiểm đã chạy.** Mỗi khi thêm một chốt
> tự động, phải kiểm chứng nó **thất bại được** trên một trường hợp cố ý sai —
> nếu không nó chỉ là một dòng chữ xanh vô nghĩa. Nguyên tắc này cũng chính là
> thứ đã bắt được L18, L25 và L27 trong các bộ trace.

Bộ quy tắc ESLint **không chọn theo mặc định** mà chọn theo đúng những lỗi dự án
này đã thật sự mắc phải: `no-floating-promises` (L11),
`react-hooks/exhaustive-deps` (L20, L21), `no-explicit-any` và `no-console` (R2).

**E2E tồn tại vì một lý do cụ thể:** lỗi khung bản đồ cao 0px (L30) làm cả tính
năng bản đồ vô hình mà bốn chốt kia đều xanh — đó là loại lỗi chỉ tồn tại sau
khi trình duyệt tính bố cục. Bộ E2E **không** lặp lại việc của trace API; nó chỉ
đo những thứ chỉ trình duyệt trả lời được: kích thước thật của khung, tràn ngang,
vùng chạm 44px, và màn có dựng ra trang trắng không.

Bộ E2E này **đã được kiểm chứng là đỏ được**: đưa lỗi L30 trở lại → E2E-04 bắt
được ngay; khôi phục → 12/12 xanh.

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
| **4** | ✅ F4 Lịch trình (37/37) · F7 Thông báo đẩy + nhắc lịch (21/21) · F6 Địa điểm & Geofence (27/27) · F5 Mốc kỷ niệm (25/25) | Đủ tính năng cốt lõi |
| **5** | 🔸 Địa điểm + ảnh check-in lên bản đồ ✅ · tách socket.io khỏi gói tải đầu ✅ · PWA offline **mức 1** ✅ (mức 2 chờ quyết định, xem trace) · **Giao diện PC hoãn theo yêu cầu chủ dự án** | Bản 1.0 |
| **6** | ✅ **F11 Cờ caro** (luật VN) · **F10 Tiến lên** (13 lá, chặt heo) — chung khung ván + API + WS `/rtg` + đồng hồ 30s có tạm dừng | 45/45 trace · 84 unit test luật · 7 E2E · verify:local 40/40 |
| **7** | ✅ **F12 Học cùng nhau** — phòng Pomodoro chung, đồng hồ đồng bộ, thống kê giờ + chuỗi ngày | 22/22 trace · 3 E2E · verify:local 41/41 |
| **8** | *(tuỳ chọn)* APK Android qua Capacitor cho tracking nền | File APK sideload |

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
| 2026-09-08 | Mốc tự sinh (mốc ngày, kỷ niệm năm, sinh nhật) **không lưu DB**, tính lúc đọc | Chúng suy ra được hoàn toàn từ ngày yêu + ngày sinh; lưu là tạo ra hai nguồn sự thật phải giữ đồng bộ | Mỗi lần đọc phải tính lại — rẻ, vì chỉ vài chục phép cộng ngày |
| 2026-09-08 | Ghi/sửa mốc trả về **cả danh sách mới** thay vì một bản ghi | Thêm một mốc có thể chen vào giữa và đổi thứ tự mọi thứ; trả cả danh sách thì client khỏi gọi thêm vòng nữa | Payload lớn hơn chút — danh sách có trần 400 ngày nên vẫn nhỏ |
| 2026-09-08 | Nhắc mốc **mỗi ngày 08:00 giờ VN**, ở các nấc còn 7/3/1/0 ngày | Mốc kỷ niệm là chuyện của cả một ngày, không phải một giờ hẹn — bắn lúc 3 giờ sáng chỉ làm người ta khó chịu | Server chết qua 08:00 thì mất lời nhắc hôm đó; các nấc sau vẫn nhắc lại |
| 2026-09-08 | Tách phần tính ngày tháng thành **hàm thuần** rồi mới nối vào service | F5 chạy đúng ngay lượt trace đầu (25/25), trong khi F6 để logic lẫn trong service thì dính 3 lỗi khâu kiểm thử. Hàm thuần nhận `now` làm tham số nên không phải chờ thật | Thêm một lớp trung gian giữa service và phép tính |
| 2026-09-08 | Hàng rào ảo có **ba chốt chặn** chống báo sai (§6.4) | Thông báo vị trí sai tệ hơn hẳn không có thông báo — mất lòng tin vào cả tính năng | Báo chậm hơn tối đa 60 giây so với lúc thật sự tới nơi |
| 2026-09-08 | Trạng thái hàng rào để ở **bảng riêng** `GeofenceState`, không suy từ sự kiện gần nhất | Mỗi điểm vị trí đều phải hỏi "trong hay ngoài"; truy vấn "sự kiện mới nhất theo từng địa điểm" là câu khó và tốn | Thêm một bảng phải giữ đồng bộ khi dời/xoá địa điểm |
| 2026-09-08 | Đối chiếu hàng rào chạy **không chờ** trong luồng nhận vị trí | Địa điểm là việc phụ, không được làm chậm đường thời gian thực | Đọc `/places` ngay sau khi gửi điểm có thể thấy trạng thái cũ |
| 2026-09-08 | **Làm mờ vị trí rộng hơn hàng rào ⇒ không báo cho người kia** | "Vừa tới Nhà" tiết lộ chính xác hơn một toạ độ đã làm mờ (§6.2) | Bật làm mờ 500 m là mất thông báo địa điểm với hàng rào mặc định 150 m |
| 2026-09-08 | Dùng `haversineMeters` trong RAM, chưa dùng `ST_DWithin` của PostGIS | Tối đa 20 địa điểm mỗi couple — chênh lệch không đáng kể, và hàm thuần thì unit test được | Nếu số địa điểm tăng nhiều thì phải chuyển sang truy vấn không gian |
| 2026-09-08 | Dùng lại hằng số `GEOFENCE_EXIT_HYSTERESIS_M`/`PLACE_RADIUS_*` của Phase 0 thay vì đặt núm mới | R0: bản kế hoạch là nguồn sự thật; hai núm cùng điều khiển một thứ là mầm lệch (trace L29) | Khoảng chênh là cộng 30 m cố định, không co giãn theo bán kính |
| 2026-09-08 | Thêm migration `20260907000000_enable_postgis` chạy trước mọi migration khác | Shadow database của `migrate dev` là DB trắng, không có PostGIS nên migration cột `geog` chết (trace L22) | Trùng việc với `infra/postgres/init/01-extensions.sql`, nhưng mọi câu lệnh đều IF NOT EXISTS nên vô hại |
| 2026-09-08 | PWA offline chỉ làm **mức 1** (vỏ app + cache dữ liệu đọc), **không** khôi phục phiên từ hồ sơ lưu máy | Mức 2 đòi coi "mất mạng" khác "chưa đăng nhập" — một đánh đổi về bảo mật cần chủ dự án đồng ý, và tôi chưa kiểm chứng được nó chạy (xem trace §4) | Mất mạng vẫn ra màn đăng nhập; vỏ app tải được nhưng chưa vào tới dữ liệu |
| 2026-09-08 | **KHÔNG cache `/locations/*`** trong service worker | Vị trí phải luôn mới nhất (quyết định từ Phase 2). Hiện vị trí cũ khi mất mạng dễ làm người ta tin nhầm "người ấy đang ở đó" | Bản đồ trống hoàn toàn khi mất mạng |
| 2026-09-08 | **Chỉ làm giao diện mobile**; giao diện PC hoãn tới khi chủ dự án yêu cầu | Chủ dự án chốt: "tập trung vào mobile thôi". App dành cho hai người, dùng trên điện thoại là chính | Màn hình rộng vẫn hiện cột 430px ở giữa — chấp nhận được, sẽ làm sau |
| 2026-09-08 | `socket.io-client` **nạp động**, không nằm trong gói tải đầu | Người chưa ghép đôi không dùng tới nó dòng nào, mà nó chặn lần vẽ màn hình đầu. Gói chính 364 → 323 KB | Cần cờ `cancelled` chống tạo socket sau khi unmount; thời gian thực bắt đầu chậm hơn một nhịp mạng |
| 2026-09-08 | Hàng rào vẽ bằng **đa giác toạ độ**, không dùng lớp `circle` của MapLibre | Lớp `circle` nhận bán kính bằng **pixel**; hàng rào 150 m là khoảng cách thật ngoài đời, phải co giãn theo bản đồ | Phải tự tính hình học — `circlePolygon` ở shared, 7 unit test |
| 2026-09-08 | `CoupleMap` phơi ra `data-places` / `data-photo-pins` | MapLibre vẽ vào **canvas**, không selector nào chạm tới; không có hai thuộc tính này thì gỡ sạch dữ liệu đi E2E vẫn xanh | Hai thuộc tính chỉ để kiểm thử và gỡ lỗi nằm trong mã production |
| 2026-09-08 | Mỗi chốt tự động phải được kiểm chứng là **thất bại được** trước khi tin nó | `npm run lint` thoát 0 suốt 4 phase mà không chạy gì; `tsconfig` của shared loại trừ file test nên 100+ test chưa từng được typecheck (L31) | Thêm một bước xác minh mỗi lần dựng chốt mới |
| 2026-09-08 | ESLint dùng **một file cấu hình ở gốc** cho cả 3 workspace | Ba workspace dùng chung `packages/shared` và chung quy ước R2; ba file cấu hình là ba chỗ để lệch nhau | File cấu hình dài hơn, phải phân nhánh theo `files:` |
| 2026-09-08 | `packages/shared` tách `tsconfig.build.json` khỏi `tsconfig.json` | Bản build phải bỏ `*.spec.ts` khỏi `dist`, nhưng typecheck và ESLint thì phải thấy chúng — một file không phục vụ được cả hai | Thêm một file cấu hình phải giữ đồng bộ |
| 2026-09-08 | Không đặt utility bố cục của Tailwind lên thẻ DOM mà thư viện ngoài tự gắn class vào — bọc thêm một thẻ ngoài | Tailwind v4 gói utility vào `@layer utilities`; CSS thư viện ngoài nhập thẳng thì không-layer nên **thắng tuyệt đối** bất kể độ đặc hiệu. `.maplibregl-map{position:relative}` đè `absolute` làm khung bản đồ co còn cao 0px (trace L30) | Thêm một thẻ bọc; đổi lại không phải kéo 70KB CSS của MapLibre vào bundle khởi động chỉ để đưa nó vào layer |
| 2026-09-08 | Trên VPS thật, Beside **không chạy Caddy riêng** — dùng chung Caddy của dự án `hungsilver` đã ở sẵn trên máy | Máy đã có stack khác giữ cổng 80/443; dựng Caddy thứ hai là không thể. `caddy` bị đẩy vào profile `standalone-tls` trong `docker-compose.vps.yml` nên không khởi động | Site block của Beside sống ở `/opt/hungsilver/Caddyfile` — ngoài repo. Bản gốc giữ ở `infra/caddy/shared-host.Caddyfile`, sửa một chỗ phải nhớ chỗ kia |
| 2026-09-10 | Bàn Tiến lên giữ **cả chồng bài của một vòng** (`pile`), không chỉ bộ cuối (`table`) | Đánh một cái là bộ trước biến mất — mất đúng thứ người chơi cần lúc cân nhắc: mình vừa chặn cái gì. Chủ dự án báo lỗi 10/09 | Cột `state` phình theo số nước trong vòng (trần thực tế vài bộ); giao diện phải tự cắt bớt còn 4 tầng |
| 2026-09-10 | **Đảo Q2**: làm luật **tới trắng** và **thối 3 bích** (trước đó chốt "chỉ luật cơ bản + chặt heo") | Chủ dự án chốt lại 10/09. Tới trắng: sảnh rồng · tứ quý heo · 5–6 đôi thông · 6 đôi. Xét ngay lúc chia bài ở server nên không sinh trạng thái "chờ khai báo" mà đồng hồ 30 giây không biết xử ra sao | Thêm `endReason = TOI_TRANG`; ván có thể kết thúc mà không ai đánh lá nào — mọi màn hình phải chịu được `status = FINISHED` ngay lúc vừa tạo |
| 2026-09-10 | Gợi ý đổi từ **tự chọn hộ cả bộ** (`autoPick`) sang **tô màu lá ghép được** (`companions`) | `autoPick` quyết hộ người chơi: chạm một lá 9 khi bàn có đôi 8 là mất luôn đôi 9. Bản mới chạm là chọn đúng lá đó, còn "ghép được với gì" thì nói bằng màu | Muốn đánh nguyên bộ phải chạm nhiều lá hơn — bù lại nút 💡 vẫn chọn sẵn cả bộ |
| 2026-09-10 | `companions()` dựng bộ **theo từng hình dạng**, không dùng lại `candidates()` của `listPlays()` | `candidates()` cố tình chỉ giữ bản rẻ nhất mỗi hình dạng (luôn lấy lá thấp làm nền) nên nó không biết `3♣3♦` cũng là một đôi. Tô màu thì phải phủ đủ mọi cách ghép | Thêm ~150 dòng dựng bộ; chặn nổ tổ hợp bằng nhận xét "chỉ lá ở bậc cao nhất mới đổi được sức mạnh của sảnh/đôi thông" |
| 2026-09-08 | `api`/`web` mở cổng trên **IP gateway của mạng bridge** (`172.18.0.1:3003`/`:3002`), không dùng tên container | Caddy nằm ở stack khác nên không cùng mạng Docker, không phân giải được `api:3000`. Đây cũng là cách stack cũ vẫn dùng | Phụ thuộc vào IP gateway; mạng bridge bị dựng lại thì IP có thể đổi và phải sửa Caddyfile |
| 2026-09-08 | TLS ở production đi bằng **Cloudflare Origin Certificate**, không phải Let's Encrypt | DNS đang bật proxy Cloudflare (mây cam) nên ACME HTTP-01 không tới được origin. Cert sẵn có phủ `*.easytech.io.vn`, hạn 2041 | Trái với mặc định "Caddy tự lo TLS" của §4; đổi domain sau này phải xin cert origin mới, và `curl -k https://127.0.0.1` ở origin báo lỗi SSL vì thiếu SNI |
| 2026-09-08 | `POSTGRES_PORT=5433` trên VPS đó | 5432 đã bị Postgres của dự án kia chiếm, và nó bind `0.0.0.0` | Lệnh Prisma chạy tay trên máy chủ phải nhớ cổng khác |
| 2026-09-08 | Mọi thứ neo theo KHUNG NHÌN — thanh tab, nút nổi, lớp phủ modal — phải dùng `fixed` (thứ neo đáy thì đi qua `<BottomLayer>`); **cấm** `absolute bottom-0` / `absolute inset-0` | `<Screen>` là `min-h-dvh` và không được định vị, nên `absolute` neo vào khối chứa ban đầu ở đầu tài liệu: cuộn 259px thì thanh tab trôi lên 259px, cuộn 170px thì bảng modal lệch xuống −170..494 (trace `fix-thanh-tab-troi-khi-cuon.md`) | Thêm một lớp bọc và phải nhớ `pointer-events-auto` cho từng phần tử con; trên PC thanh tab và bảng modal thu về đúng cột 430px thay vì kéo hết bề ngang |
| 2026-09-08 | Bốn loại bản đồ, ảnh vệ tinh lấy từ **Esri World Imagery** dạng raster viết tay | Ba style vector của OpenFreeMap không có ảnh vệ tinh; Esri là nguồn ảnh vệ tinh duy nhất dùng được mà không cần khoá API — giữ đúng ràng buộc §3.2 | Raster nên không có nhãn vector, phóng to bị vỡ sớm hơn; điều khoản của Esri bắt buộc ghi nguồn, đã đặt trong `attribution` của style |
| 2026-09-08 | Nguồn + lớp riêng của app tách thành `installLayers()`, gọi ở **cả** `load` lẫn `styledata` | `map.setStyle()` xoá sạch mọi source/layer không thuộc về style. Không dựng lại thì đổi sang Vệ tinh là hàng rào và vệt đường biến mất — **im lặng, không ném lỗi** | `styledata` bắn nhiều lần nên phải tự chặn `addSource` trùng bằng `if (!map.getSource('places'))` |
| 2026-09-08 | `data-places` / `data-photo-pins` lấy từ trạng thái **đã sờ vào bản đồ**, cấm lấy từ độ dài prop | Bản đầu lấy `places?.length`: nó nói "API trả về mấy địa điểm", không nói "bản đồ có vẽ không". Phá `installLayers` để thử, lớp mất sạch mà test **vẫn xanh** — cái chốt đó vô dụng ngay từ đầu | Thêm hai state và `styledata` phải tăng `mapReadyTick` trong mọi trường hợp để effect chạy lại soi nguồn thật |
| 2026-09-08 | Bảng thông tin ở màn bản đồ **kéo được**, ba nấc 84px / 46% / 82% | Trên khung 390×844 bảng cố định ăn gần nửa màn hình, mà bản đồ mới là thứ người ta mở app để nhìn | Tự xử lý `pointerdown/move/up` thay vì kéo thư viện gesture về; phải đặt `touch-action: none` cho thanh nắm |
| 2026-09-08 | **Bỏ qua** lớp giao thông và chỉ đường thời gian thực | Giao thông: không có nguồn miễn phí, làm là vi phạm ràng buộc §3.2. Chỉ đường: phải chọn engine định tuyến (OSRM tự host / dịch vụ ngoài) — quyết định của chủ dự án. Chủ dự án chốt: "2 chỗ vướng thì bỏ qua" | Hai tính năng nằm ở `docs/BACKLOG.md`, chưa làm |
| 2026-09-08 | Ảnh đại diện dùng LẠI `ImageProcessor` của ảnh check-in, tách phần kiểm tra ra `inspect()` | Hai đường ống ảnh phải chịu ĐÚNG một bộ luật: cùng trần dung lượng, cùng danh sách định dạng, cùng chốt ảnh bom nén, cùng luật xoá EXIF. Hai bản sao là hai chỗ để lần sau siết một bên quên bên kia | `ImageProcessor` giờ phục vụ hai module; `UsersModule` phải nạp nó từ `posts/` |
| 2026-09-08 | Cột `avatarUrl` bị XOÁ, thay bằng `avatarId` (uuid); URL do `avatarUrlFor()` dựng ra | `avatarUrl` có từ migration đầu nhưng chưa từng được ghi (đã kiểm: 2 user, 0 giá trị). Lưu id thay vì URL để đổi cách phục vụ ảnh không phải sửa dữ liệu | Thêm một hàm phải nhớ gọi; bù lại không còn hai cột tên gần giống nhau nằm cạnh nhau |
| 2026-09-08 | `GET /users/:id/avatar/:size` **bắt buộc** `?v=` khớp `avatarId` hiện tại, lệch thì 404 | Route trả `Cache-Control: immutable` — đã hứa "URL này không bao giờ đổi nội dung". Bỏ qua `?v=` thì URL cũ lặng lẽ phục vụ ảnh MỚI, hứa một đằng làm một nẻo và trình duyệt sẽ giữ ảnh sai không gỡ được (trace PA-11) | Trang đã tải lâu giữ URL cũ sẽ mất ảnh; `Avatar` lùi về chữ cái đầu thay vì hiện ô vỡ |
| 2026-09-08 | Đổi ảnh: **ghi kho trước, cập nhật DB sau**, xoá ảnh cũ sau cùng | Ngược lại mà ghi kho hỏng giữa chừng thì DB trỏ tới ảnh không tồn tại — người dùng thấy ô vỡ vĩnh viễn. Theo thứ tự này, hỏng ở bước ghi kho thì người dùng vẫn giữ ảnh cũ | Xoá hụt để lại vài chục KB rác trong kho, không ai chạm tới được |
| 2026-09-08 | `bio` / `address` là chuỗi người dùng TỰ GÕ, không geocode | `address` chỉ để người ấy biết nhà nhau. Nối nó vào hệ thống vị trí (§2) hay hàng rào (F6) là biến một ô văn bản thành dữ liệu vị trí — đúng loại dữ liệu R3 bắt phải dè dặt nhất | Không tính được khoảng cách tới "nhà" từ trường này; muốn thế thì dùng F6 Địa điểm |
| 2026-09-09 | **Bình luận trong từng khoảnh khắc** — không vi phạm "không làm chat" (F9) | Mỗi dòng gắn cứng vào một `Post`: không có phòng chat, không "đang gõ", không đã-xem, không đẩy thời gian thực. Đây là phần đọc thêm dưới một tấm ảnh, không phải kênh nhắn tin | Người dùng có thể coi nó như chỗ nhắn tin và thất vọng vì không có "đã xem"; nếu phát sinh thì vẫn phải trỏ ra nút deep-link Zalo |
| 2026-09-09 | Bảng `comments` **không có cột `coupleId`** | Quyền đọc/ghi suy ra từ `post.coupleId`. Nhân đôi cột đó là tạo thêm một chỗ để dữ liệu lệch nhau, mà mọi đường vào đều đã phải nạp bài cha để kiểm quyền rồi | Truy vấn nào cần lọc theo couple phải join qua `posts` — hiện chưa có truy vấn nào như vậy |
| 2026-09-09 | API trả bình luận **MỚI → CŨ**, client `reverse()` khi vẽ | Trả cũ → mới thì trang đầu là những dòng cũ nhất: bài có 25 bình luận, gõ thêm một câu, câu đó rơi vào trang chưa tải và người vừa gõ không thấy nó đâu. (Bắt được ở bước tự review, trước khi chạy thử) | Nơi vẽ phải nhớ đảo lại; nút "xem thêm" nằm ở ĐẦU danh sách chứ không phải cuối |
| 2026-09-09 | **Chủ khoảnh khắc cũng xoá được** bình luận của người ấy trong bài mình | Bài là của họ, họ phải dọn được phần hiện dưới ảnh của mình. Khác với sự kiện trên lịch (chỉ người tạo mới sửa) vì ở đó hai người có hai lịch riêng, còn đây là một tấm ảnh có chủ rõ ràng | Có thể xoá lời người kia mà họ không được báo — với 2 người thì nói nhau một câu là xong |
| 2026-09-09 | `commentCount` đếm bằng `_count` của Prisma, nhét sẵn vào `PostResponse` | Dòng kỷ niệm chỉ cần con số; kéo về toàn bộ nội dung bình luận của 10 bài chỉ để lấy `.length` là tốn băng thông vô ích | Thêm một `LEFT JOIN … COUNT` vào mọi truy vấn bài viết |
| 2026-09-09 | Chỉ đẩy thông báo khi **người ấy có liên quan** tới bài (chủ bài, hoặc đã bình luận ở đó) | Vừa đăng ảnh xong rồi tự chú thích thêm một câu dưới bài của chính mình mà bắn thông báo đi là làm phiền vô cớ — người ấy còn chưa kịp mở bài ra xem | Thêm một câu `count` trước khi gửi; và bình luận đầu tiên vào bài của chính mình thì người ấy không được báo |
| 2026-09-09 | `formatWhen()` tách khỏi `FeedScreen` ra `lib/relative-time.ts`, nhận `now` làm tham số | Tấm trượt bình luận cần đúng cách hiển thị thời gian đó; chép sang là hai bản sao sẽ lệch nhau. Nhận `now` nên unit test được mà không phải giả lập đồng hồ | Thêm một file; `FeedScreen` mất phần hiển thị thời gian của riêng nó |
| 2026-09-09 | **Có game trong app** (F10/F11) — không mâu thuẫn với "không làm chat" (F9) | Mỗi nước đi gắn cứng vào một ván: không có phòng chat, không "đang gõ", không đã-xem. Chủ dự án yêu cầu | Kéo app rời khỏi định vị "check-in & lịch trình" một chút; đổi lại hai người có việc để làm cùng nhau khi ở xa |
| 2026-09-09 | Luật chơi là **hàm thuần ở `packages/shared`**, dùng chung FE/BE | FE cần luật để tắt/bật nút và tô sáng nước thắng, BE cần luật để làm trọng tài. Hai bản sao là hai chỗ để lệch nhau. Hàm thuần thì test được 100% mà không cần DB — 27 test caro viết xong trước khi có một dòng API nào | Luật đi xuống client nên ai đọc mã nguồn cũng biết — vốn không phải bí mật; bí mật là **bài úp**, và nó không rời server |
| 2026-09-09 | Bàn cờ lưu bằng **một chuỗi 225 ký tự**, không phải mảng hai chiều | Nó nằm trong cột JSON và đi qua WebSocket sau mỗi nước; chuỗi 225 byte thì gọn và so sánh được bằng `===`, mảng lồng mảng tốn gấp mấy lần chỗ mà không cho thêm gì | Muốn đọc một ô phải qua hàm `cellAt`, không index thẳng được |
| 2026-09-09 | Caro dùng **luật Việt Nam**: đúng 5 quân bị chặn hai đầu thì không thắng, ≥6 quân thắng | Chủ dự án chốt — đúng kiểu chơi trên giấy ở VN, công bằng hơn cho người đi sau | Thêm 4 case biên, trong đó **mép bàn tính là bị chặn** là chỗ dễ quên nhất |
| 2026-09-09 | Nước đi qua **REST**, WebSocket chỉ đẩy state | Nước đi cần mã lỗi rõ ràng và cơ chế thử lại; ván 30s/lượt không cần tiết kiệm một nhịp mạng | Chậm hơn một nhịp — không ai nhận ra ở nhịp 30 giây |
| 2026-09-09 | `g:state` **gửi riêng từng socket**, không broadcast theo room như `loc:partner` | Mỗi người phải nhận một bản state đã lọc theo chính họ — với Tiến lên thì bài trên tay là thứ tuyệt đối không được lộ | Một vòng lặp thay cho một lệnh emit; với 2 người thì không đáng kể |
| 2026-09-09 | Namespace WebSocket **riêng** `/rtg` cho game | Không trộn luồng game vào `LocationsGateway` — nơi nhạy cảm nhất về quyền riêng tư và đang chạy ổn | Socket thứ hai, nhưng chỉ mở khi đang ở màn game |
| 2026-09-09 | Đồng hồ **dừng khi người tới lượt không mở app** — và dừng **cả sau mỗi lần lượt đổi tay** | §1.3: iOS treo JS khi khoá màn hình. Vế thứ hai là lỗ hổng bắt được ở bước tự review: `g:away` xảy ra TRƯỚC nước đi, nên deadline mới vẫn bị đặt cho người đang không nhìn màn hình và 30 giây sau họ thua một ván chưa từng thấy | Có thể câu giờ bằng cách tắt app — với hai người yêu nhau thì không phải mối lo. Trần 30 phút chặn lại |
| 2026-09-09 | Ván bỏ dở **30 phút** thì tự huỷ | Chủ dự án chốt (tôi đề nghị 7 ngày). Khớp với việc chọn đồng hồ 30 giây: chơi khi cả hai cùng online, không phải cờ qua thư. Đây cũng chính là **trần chờ** mà cơ chế tạm dừng còn thiếu | Đi ra ngoài một tiếng rồi quay lại là mất ván |
| 2026-09-09 | Hạn huỷ tính từ `lastMoveAt`, **không** từ `updatedAt` | Tạm dừng đồng hồ cũng là một lần ghi, nên `updatedAt` sẽ tự đẩy hạn huỷ ra xa mỗi lần người dùng khoá màn hình — ván bỏ dở sẽ không bao giờ bị dọn | Thêm một cột phải nhớ cập nhật ở mọi nước đi |
| 2026-09-09 | Canh giờ bằng **cron 5 giây**, không `setTimeout` riêng từng ván | `setTimeout` chết theo tiến trình: khởi động lại API là mọi ván treo ở lượt của một người. Dùng lại đúng cách giải của job nhắc lịch | Độ chính xác chỉ tới 5 giây — người dùng luôn được lợi phần dư đó, không bao giờ bị thiệt |
| 2026-09-09 | Caro trên 390px dùng **chạm hai bước** (ngắm → nút "Đặt quân" 44px) | Bàn 15×15 cho ra ô 23px, dưới mức 44px của R2. Cách này vừa đủ vùng chạm vừa chặn đánh nhầm ô — mà cờ thì không có nút hoàn tác | Thêm một lần chạm cho mỗi nước đi |
| 2026-09-09 | Trò chơi vào **thẻ ở màn Nhà**, không thêm khe thứ sáu vào thanh tab | Bố cục 5 khe đã chốt trong ADR 2026-09-07. Thẻ mới thay đúng chỗ thẻ "Sắp có" từng quảng cáo thông báo đẩy — thứ đã làm xong từ Phase 4, giờ chỉ là chữ thừa | Trò chơi nằm sâu hơn một lớp so với các tính năng chính |
| 2026-09-09 | Mỗi loại game chỉ **một ván đang chạy** mỗi couple | Hai ván song song giữa đúng hai người là vô nghĩa, mà lại đẻ ra câu hỏi "ván nào là ván đang chơi" ở mọi màn hình | Muốn bỏ ván cũ phải bấm đầu hàng; API trả 409 kèm `gameId` để client mở thẳng vào ván đó |
| 2026-09-09 | Tiến lên: người đi trước là người cầm **lá nhỏ nhất ĐÃ CHIA**, không phải "ai có 3♠" | Mỗi người 13 lá nên **26 lá bị bỏ ra — 3♠ có thể không được chia cho ai cả**, và lúc đó không ván nào bắt đầu được. "Lá nhỏ nhất đã chia" là cách nói tổng quát của đúng luật ấy: với bộ bài chia hết thì nó chính là 3♠. Phát hiện lúc viết `deal.ts`, đã chốt bằng một unit test riêng | Ván khác nhau thì lá mở màn khác nhau — màn hình phải nói ra ("Nước đầu phải có 5♦") chứ không để người chơi tự đoán |
| 2026-09-09 | Hết giờ ở Tiến lên là **mất lượt**, ở caro là **thua ván** | Cờ không có nước "bỏ lượt" nên hết giờ là thua, đúng luật đồng hồ cờ. Tiến lên thì có: xử thua ở đó là hình phạt nặng hơn hẳn thứ người chơi đáng nhận. Đang được ra bài tự do (không bỏ lượt được) thì tự đánh **lá lẻ nhỏ nhất** — ván buộc phải đi tiếp, và đó là nước ít thiệt nhất | Đây là chỗ DUY NHẤT hai game xử khác nhau; nằm gọn trong `GamesService.timeout()` |
| 2026-09-09 | Đôi thông chỉ nhận **3 hoặc 4 đôi** | Luật miền Nam phổ biến chỉ dùng 3 và 4 đôi thông làm hàng chặt; mở rộng lên 5–6 đôi là thêm case biên cho một nước gần như không ai đánh | 5 đôi thông trong tay vẫn đánh được 4 đôi trong đó, nên không mất nước nào. Ghi `docs/BACKLOG.md` |
| 2026-09-09 | Nút "Đánh" tắt/bật bằng **chính hàm luật server dùng làm trọng tài** | `checkPlay()` chạy ngay tại chỗ sau mỗi lần chạm lá bài, nên người chơi đọc được lý do ("sảnh này không chặn được sảnh trên bàn") thay vì bấm rồi chờ một vòng mạng mới biết mình sai | Luật đi xuống client — vốn không phải bí mật; bí mật là bài úp, và nó không rời server |
| 2026-09-09 | Có `hasAnswer()` để nói thẳng "không có nước nào chặn được" | Người chơi bí mà không biết mình bí sẽ ngồi mò cho tới lúc hết giờ. Hàm chỉ dò các bộ cùng loại cộng hàng chặt, không liệt kê toàn bộ tổ hợp của 13 lá — đủ chính xác cho việc nó phục vụ | Về lý thuyết có thể bỏ sót một nước rất hiếm; nút "Bỏ lượt" vẫn luôn ở đó nên không chặn ai cả |
| 2026-09-09 | Xáo bài bằng `crypto.randomInt`, Fisher–Yates | Bộ sinh số của V8 để lộ trạng thái sau vài chục mẫu. Với bài úp thì đó là lỗ hổng thật: nhìn vài ván là đoán được bài | Chậm hơn không đáng kể |
| 2026-09-09 | Màn ván tách thành **khung chung + bàn riêng** (`GameScreen` · `CaroBoard` · `TienLenTable`) | Tải dữ liệu, socket, đồng hồ, đầu hàng giống hệt nhau ở cả hai game; chép đôi là hai chỗ để lệch nhau. Khung không biết gì về quân cờ hay lá bài | Thêm một lớp component; bù lại game thứ ba chỉ là thêm một nhánh ở đúng một chỗ |
| 2026-09-09 | Bài trên tay xoè quạt, lá rộng 44px nhưng chỉ **lộ ra 24px** | 13 lá phải nằm vừa khổ 390px. Vùng CHẠM vẫn đủ 44px theo R2 — phần bị che nằm dưới lá kế bên, đúng cách mọi app bài vẫn làm | Ở máy 360px thì hàng bài cuộn ngang được thay vì lòi ra khỏi màn hình |
| 2026-09-09 | **Giữ nguyên "không gọi thoại/video trong app"** dù đã cân nhắc lại khi làm F12 | Khả thi về kỹ thuật (WebRTC P2P cho đúng hai người, báo hiệu đi nhờ Socket.IO sẵn có), nhưng ~15–30% cuộc gọi hỏng nếu không có coturn, mà coturn relay ~2 Mbps mỗi cuộc qua băng thông VPS đang chạy chung hai stack. Zalo/Messenger đã có video call và app đã có nút deep-link (F9). Chủ dự án chốt không làm | Muốn thấy mặt nhau lúc học thì phải mở app ngoài |
| 2026-09-09 | Đồng hồ phòng học **chạy tiếp khi khoá màn hình** — ngược hẳn đồng hồ ván bài | Khoá máy để khỏi bị phân tâm chính là điều người ta làm khi ngồi học; dừng đồng hồ lúc đó là phá đúng thứ tính năng phục vụ. Đồng hồ ván bài thì ngược lại, dừng để khỏi xử thua oan | Hết chặng phải báo bằng Web Push vì app rất có thể đang đóng; và không có cách nào biết chắc người dùng thật sự đang ngồi học |
| 2026-09-09 | Chỉ ghi `StudyLog` khi chặng học **chạy hết giờ**, bỏ dở thì không tính | Con số thống kê phải nói đúng sự thật. Cộng cả chặng dở dang thì "tổng giờ học" thành một con số tự khen | Dừng ở phút 24/25 là mất trắng chặng đó |
| 2026-09-09 | `StudyLog` có cột `round`; `(sessionId, round)` là khoá của một chặng | Cần nó để đếm "chặng nào CẢ HAI cùng ngồi". Bản đầu nhóm theo ngày + số phút, và hai chặng 25 phút trong cùng một buổi bị gộp làm một — con số "học cùng nhau" thấp hơn sự thật | Thêm một cột phải nhớ ghi ở mọi chỗ tạo log |
| 2026-09-09 | Phòng học nghe WebSocket theo **couple**, không theo phiên | Người kia bấm "bắt đầu" lúc mình đang mở app thì phải thấy ngay. Nghe theo phiên thì lúc chưa có phiên nào client chẳng có gì để nghe — mà đúng khoảnh khắc cần biết nhất lại là khoảnh khắc không nghe được (bắt được ở bước tự review) | Room sống suốt thời gian ở màn học chứ không chỉ khi có phiên |
| 2026-09-09 | **Ai trong hai người cũng dừng được** buổi học, khác sự kiện trên lịch (chỉ người tạo mới sửa) | Phòng học là hoạt động chung chứ không phải đồ của riêng ai, và người còn lại cần thoát được mà không phải chờ người kia | Có thể dừng buổi học của nhau — với hai người thì nói một câu là xong |
| 2026-09-09 | Chặng mới tính từ **lúc cron phát hiện**, không phải từ `endsAt` cũ | Cộng dồn từ `endsAt` thì server ngủ một tiếng rồi tỉnh dậy sẽ chạy đuổi hàng chục chặng liên tiếp và ghi công cho người không hề ngồi học | Mỗi chặng trôi thêm tối đa 10 giây so với lịch |
| 2026-09-09 | Route **tạo ván** phải CHỜ `syncAndBroadcast`, hai route kia thì không | Người tạo ván chưa gửi `g:watch` — họ còn chưa biết ván tồn tại. Để việc đó chạy nền thì nó đua với `g:watch`: gateway thấy "chưa ai xem" nên tạm dừng đồng hồ, trong khi `handleWatch` vừa đọc DB thấy đồng hồ còn chạy nên không gọi `resumeClock`. Kết quả: ván đứng im ở lượt đầu, KHÔNG BAO GIỜ hết giờ. Trace G6-41/45 bắt được ngay sau khi tối ưu "không chờ" được đưa vào | Route tạo ván chậm thêm một vòng phát socket; hai route nước đi vẫn giữ được tối ưu vì người tới lượt đã ở trong phòng từ trước |
| 2026-09-09 | Luồng ván Tiến lên tách thành **hàm thuần** `tien-len-flow.ts`, service chỉ còn lo DB · đồng hồ · thông báo | Đúng bài học ADR 2026-09-08: F5 tách hàm thuần thì chạy đúng ngay lượt trace đầu, F6 để logic lẫn trong service thì dính 3 lỗi. Ở đây còn một lý do nặng hơn: `viewTienLen()` là **hàng rào giữ bài úp**, mà hàng rào thì phải test được 100% — giờ nó có một test soi thẳng vào JSON đi qua dây, tìm bất kỳ lá nào chỉ đối phương mới có | Thêm một file và một lớp gián tiếp giữa service với luật |
| 2026-09-09 | Trace Phase 6 **chờ 40 giây thật** để kiểm đồng hồ hết giờ, không rút ngắn bằng cách giả lập | Thứ cần kiểm chính là cron quét mỗi 5 giây có xử đúng không, và hai game xử KHÁC nhau ở đúng chỗ đó (caro thua, tiến lên mất lượt). Giả lập thời gian sẽ bỏ qua đúng phần đang cần chứng minh | `verify:local` chậm thêm ~40 giây |
| 2026-09-09 | Trace đồng hồ phải **mở socket và ở lại xem** thì mới hết giờ được | Đồng hồ chỉ chạy khi người tới lượt đang mở app. Bản trace đầu không mở socket nên server tự dừng đồng hồ và ván không bao giờ hết giờ — đúng như thiết kế, nhưng cũng nghĩa là không kiểm được gì. Chính chỗ này chứng minh cơ chế chống phạt oan có hiệu lực thật | Kịch bản trace phải dựng đủ WebSocket, không gọi REST suông được |
| 2026-09-09 | Bàn Tiến lên **toàn màn hình, ưu tiên khổ ngang**; xin `orientation.lock` từ cú chạm ở sảnh, không chặn màn hình khi khoá hỏng | 13 lá ở khổ dọc 390px chỉ hở 26px mỗi lá. iOS Safari không có API khoá xoay và rất nhiều máy bật khoá xoay hệ thống — dựng tấm chắn "hãy xoay máy" là khoá luôn ván bài của họ | Màn này lệch khỏi khung 430px dùng chung; phải tự lo vùng an toàn tai thỏ cho cả hai chiều |
| 2026-09-09 | **Vẽ lạc quan** nước bài vừa bấm ở client, giữ state cục bộ trong component chứ không đưa vào cache Query | Người chơi thấy bài rời tay ngay, không phải chờ hết một vòng mạng. Không trộn vào cache vì socket cũng đổ state vào đó — gói tin đến muộn sẽ xoá mất nước vừa bấm | Thêm một đường quay lui khi server từ chối; mọi ghi vào cache phải qua `putGame()` chốt theo `version` |
| 2026-09-09 | Bỏ `hasAnswer()`, thay bằng `listPlays()` liệt kê **đủ** mọi bộ đi được | Cùng một phép liệt kê phục vụ ba việc: nút Gợi ý, tự chọn cả bộ khi chạm một lá, và biết chính xác lúc nào người chơi bí thật. Giữ hai cách dò song song là giữ hai nguồn sự thật về cùng một câu hỏi | Nặng hơn `hasAnswer()` cũ (vài chục bộ ứng viên thay vì dò có chọn lọc) nên phải bọc `useMemo` ở màn chơi |
| 2026-09-10 | Lọc ghim bản đồ theo thời gian **ở server** (`?from&to`), không lọc ở client | Một trang chỉ có 10–50 bài; lọc sau khi phân trang cho ra những trang gần như rỗng và người dùng tưởng là hết bài | Thêm hai tham số vào `feedQuerySchema` — dùng chung FE/BE nên không lệch được |
| 2026-09-10 | Ranh giới bộ lọc là **ngày lịch giờ VN**, không phải "24 giờ trước tính từ bây giờ" | Người dùng nghĩ theo tờ lịch: chọn "7 ngày" là muốn thấy cả tấm ảnh chụp 6 giờ sáng của ngày đầu khoảng. Thêm `startOfDayMs` / `endOfDayMs` vào `datetime.ts` (R2) | Client phải tự quy đổi sang epoch trước khi gọi API — chỉ client mới biết múi giờ người xem |
| 2026-09-10 | Ghim bản đồ dùng truy vấn **một trang** `useMapPins` (trần 50), không dùng lại `useFeed('pinned')` | `useInfiniteQuery` chỉ nạp trang đầu (10 bài) nếu không ai bấm "tải thêm" — bản đồ lặng lẽ bỏ sót ghim từ Phase 5 tới giờ | Quá 50 ghim thì phải thu hẹp khoảng thời gian; đổi lại bản đồ không bao giờ đặc kín ảnh |
| 2026-09-10 | Chạm ghim mở **tấm trượt chi tiết** ngay trên bản đồ, không nhảy sang dòng kỷ niệm | Nhảy màn là mất khung nhìn bản đồ vừa canh, mà thứ người dùng cần lúc đó (toạ độ + đường tới đó) lại không có ở dòng kỷ niệm | Thêm một component; phần bài viết hiển thị rút gọn, muốn bình luận vẫn phải sang Kỷ niệm |
| 2026-09-10 | Nút bản đồ ngoài dùng link `google.com/maps/dir/?api=1`, KHÔNG dùng scheme riêng `comgooglemaps://` | Cùng lý do với nút nhắn tin (§7.3): iOS Safari chặn im lặng scheme riêng khi app chưa cài, còn link https tự rơi về trang web | Không mở thẳng được Apple Maps; ai muốn thì sao chép toạ độ |
| 2026-09-10 | Ảnh trong dòng kỷ niệm hiện theo **tỉ lệ thật** (kẹp trong 0,7–1,91), thay cho khung 4:3 cứng | Khung 4:3 cắt mất đầu và chân của mọi ảnh dọc chụp bằng điện thoại — đúng chỗ có mặt người | Thẻ bài cao thấp không đều nhau; `AuthedImage` phải nhận `aspectRatio` để khung có chiều cao trước khi ảnh tải xong (chống nhảy bố cục) |
| 2026-09-10 | Cắt ảnh **tự viết** (`crop-math.ts` + `PhotoCropper`), không kéo thư viện cropper về | Mọi gói phổ biến nặng 30–60KB gói tải đầu, trong khi phần việc thật chỉ là một phép biến hình; hình học tách ra hàm thuần nên test được bằng ngòi bút (15 unit test) | Tự lo cử chỉ kéo / chụm hai ngón; chưa có xoay ảnh (EXIF đã được `createImageBitmap` xử lý) |
| 2026-09-10 | Cắt từ **tệp gốc**, không cắt trên bản đã nén ở bước chọn ảnh | Cắt bản nén rồi nén lại là hai lượt mất chất lượng chồng lên nhau, thấy rõ ở vùng trời và da người | Giữ `File` gốc trong bộ nhớ tới lúc đăng (tối đa 3 tệp) và giải mã ảnh thêm một lượt khi mở màn cắt |
| 2026-09-11 | Bảng lọc thời gian **mặc định thu gọn**, chỉ còn một chip ghi khoảng đang lọc | Bản đồ là thứ người ta mở màn này để nhìn; bảy chip + dòng tóm tắt chiếm mất dải ngang dễ nhìn nhất của khung 390px. Thu gọn hẳn (không còn gì) thì "sao ít ảnh thế" lại thành một câu hỏi không có lời đáp | Muốn đổi khoảng lọc phải chạm thêm một lần; trạng thái mở/thu được nhớ trong `localStorage` |
| 2026-09-11 | Mốc **"Hôm nay"** là trọn ngày lịch giờ VN, không phải 24 giờ vừa qua | Đi chơi từ tối hôm qua tới sáng nay là hai ngày khác nhau trên tờ lịch, và người dùng mong đúng như thế. Cùng một luật với các mốc còn lại (`startOfDayMs`) | Lúc 00:30 sáng thì "Hôm nay" gần như rỗng — đúng nghĩa đen, và vẫn có mốc "7 ngày" ngay cạnh |
| 2026-09-11 | Chấm vị trí trên bản đồ **bấm được** → tấm trượt chi tiết + chỉ đường | Bản đồ trong app không dẫn đường được (§3.2: MapLibre + OpenFreeMap, không có dữ liệu routing), nên thứ người dùng cần ngay lúc nhìn thấy chấm là toạ độ và một lối sang Google Maps | Chỉ bật ở màn Bản đồ: `PlacePicker` truyền `onMarkerClick` rỗng, vì ở đó một chấm nuốt mất cú chạm là người dùng không dời được điểm vừa đặt |
| 2026-09-11 | Thêm **lối vào thứ hai** từ bảng thông tin ở đáy, không chỉ dựa vào cú chạm lên chấm | Chấm chỉ rộng 44px và rất hay nằm khuất dưới bảng thông tin (bảng nhớ nấc "mở rộng" 82% của lần trước) — bắt được ngay khi viết E2E BD-05 | Thêm một nút trong bảng vốn đã khá dày |
| 2026-09-11 | Khối toạ độ tách thành `CoordinateCard` dùng chung cho khoảnh khắc và vị trí | Ba thứ dễ lệch nếu chép đôi: định dạng toạ độ (dấu CHẤM thập phân, nếu không Google Maps hiểu sai), cách dựng link, và cách xử lý khi trình duyệt không cho sao chép | Thêm một component nhỏ |
| 2026-09-11 | Tấm trượt vị trí **nói rõ khi toạ độ đang bị làm mờ** (F8) | Không nói thì người xem tin vào một toạ độ lệch tới vài trăm mét và tưởng người kia đứng đúng chỗ đó — làm mờ là tính năng riêng tư, không phải cái bẫy | Người bật làm mờ lộ ra là mình đang bật; đây vốn đã hiện ở thanh trên cùng từ Phase 2 |
| 2026-09-11 | Cài đặt đổi từ **một trang cuộn dài** sang **danh sách + màn con** | 688 dòng trong một tệp, bảy thẻ và BỐN nút "Lưu thay đổi" trên cùng một trang: ở khổ 390px không ai biết nút Lưu nào thuộc ô mình vừa gõ, và không liếc một cái mà biết app đang bật những gì. Danh sách có giá trị ở mép phải ("Zalo · 0912…", "Đang ẩn danh") trả lời câu hỏi đó ngay | Thêm 5 route con và một lần chạm nữa để sửa một mục; đổi lại mỗi màn chỉ làm một việc |
| 2026-09-11 | Nút Lưu **neo ở đáy khung nhìn** và chỉ sáng khi thật sự có thay đổi | Nút Lưu nằm cuối biểu mẫu thì phải cuộn mới thấy. Bản cũ còn luôn cho bấm và bấm khi không sửa gì vẫn hiện "✓ Đã lưu" — một câu nói dối nhỏ làm người dùng hết tin vào dấu tích đó | Nút nằm NGOÀI `<form>`, nối bằng thuộc tính `form="id"`; mỗi màn phải tự tính `dirty` |
| 2026-09-11 | Công tắc (riêng tư, thông báo) **lưu ngay**, không có nút Lưu | Đây là thứ người ta bật lúc đang cần ẩn NGAY. Bắt bấm thêm một nút là một khoảng thời gian họ tưởng mình đã ẩn mà thực ra chưa | Không hoàn tác được bằng cách "không bấm Lưu"; bù lại mỗi công tắc tự khoá khi vô nghĩa (ẩn danh bật thì khoá chia sẻ trực tiếp) |
| 2026-09-11 | **Huỷ ghép đôi** dời vào trong màn "Chuyện của hai đứa" | Nó xoá vĩnh viễn toàn bộ dữ liệu chung, không được ngồi ngay cạnh những nút bấm hằng ngày ở màn Cài đặt | Ai thật sự muốn huỷ phải đi thêm một lớp — đúng ý đồ |
| 2026-09-11 | `AvatarPicker` nâng lên **component cấp module** | Định nghĩa component bên trong component khác sinh ra một kiểu mới sau mỗi lần vẽ ⇒ React tháo và dựng lại liên tục: gõ một chữ vào ô tên là mất trạng thái "Đang tải lên…" và mất câu lỗi vừa hiện. Bản cũ dính đúng lỗi này, phát hiện lúc thiết kế lại | Phải truyền `user` / `patchUser` xuống bằng props |
| 2026-09-11 | **F13**: điểm đến của chuyến đi BẮT BUỘC là một `Place` đã lưu, không phải toạ độ tuỳ ý | Hàng rào ảo của địa điểm đó (F6) chính là thứ phát hiện "đã tới nơi" — không cần thêm cơ chế nào. Và người đang chuẩn bị ra về thì không muốn chấm toạ độ trên bản đồ | Muốn chia sẻ chuyến tới một chỗ lạ thì phải lưu nó thành địa điểm trước |
| 2026-09-11 | **F13**: giờ dự kiến tính LÚC ĐỌC, không lưu trong bảng | Lưu thì phải có một job cập nhật liên tục, và mỗi lần server ngủ dậy là một con số cũ nằm chình ình trên màn hình người kia | Mỗi lần đọc tốn thêm một truy vấn điểm vị trí mới nhất — rẻ hơn nhiều so với một job |
| 2026-09-11 | **F13**: dùng REST + hỏi lại mỗi 20 giây, KHÔNG thêm sự kiện WebSocket | Giờ dự kiến đổi rất chậm. Thêm một loại sự kiện vào `LocationsGateway` là gánh theo mọi bài học về đua sự kiện trong §10 cho thứ không cần độ trễ mili-giây. Hai khoảnh khắc thật sự cần biết ngay (khởi hành, tới nơi) đã có thông báo đẩy lo, kể cả khi app đóng | Người ấy mở sẵn app thì thấy chậm nhất 20 giây |
| 2026-09-11 | **F13**: ẩn danh thì KHÔNG cho bắt đầu chuyến | Chuyến đi là lời mời "nhìn tôi về tới nơi", ẩn danh là "server không phát vị trí nào". Bật cả hai chỉ tạo ra một thanh trạng thái đứng im mãi mãi | Muốn chia sẻ chuyến thì phải tắt ẩn danh — nói rõ trong câu báo lỗi |
| 2026-09-11 | **F14**: dữ liệu chu kỳ thuộc về MỘT NGƯỜI, không thuộc về couple | Đây là dữ liệu sức khoẻ. Mặc định `OFF`; ba mức chia sẻ do chính chủ đặt; mức `SUMMARY` không lộ ngày nào kể cả "còn mấy ngày" (từ đó suy ngược ra ngày cụ thể) | Người ấy có thể không thấy gì — đúng ý đồ. Có `partnerView()` ở `packages/shared` là nơi DUY NHẤT cắt gọt, 25 unit test soi vào nó |
| 2026-09-11 | **F14**: trễ kỳ thì trả `daysUntilNext` ÂM, không nhảy sang chu kỳ kế | "Trễ 5 ngày" là thông tin người dùng cần nhất lúc đó. Lặng lẽ dời dự đoán sang chu kỳ sau là giả vờ mọi thứ vẫn đúng lịch | Giao diện phải xử lý số âm ở mọi chỗ hiển thị |
| 2026-09-11 | **F14**: bỏ qua khoảng cách trên 90 ngày khi tính chu kỳ trung bình | Đó là lúc người dùng quên ghi vài kỳ liên tiếp, không phải một chu kỳ 4 tháng. Gộp vào trung bình sẽ đẩy mọi dự đoán sau đó sai hàng tuần | Người có chu kỳ thật sự dài bất thường sẽ phải tự đặt độ dài trong cài đặt |
| 2026-09-11 | **F12 đợt 1**: tên môn được **chép** sang `StudyLog`, không tra ngược qua `sessionId` | `sessionId` là `onDelete: SetNull`. Chuẩn hoá triệt để thì mỗi phiên bị dọn đi là một mảng lịch sử mất tên môn, và thống kê "học môn gì" tự bốc hơi theo | Đổi tên phiên giữa chừng không sửa lại các chặng đã ghi — đúng ý đồ, lịch sử phải nói thứ có thật lúc đó |
| 2026-09-11 | **F12 đợt 1**: biểu đồ tuần dùng **một thang đo chung** cho cả hai người | Mỗi người một thang riêng thì hai cột cao bằng nhau lại đang là 20 phút và 3 tiếng — người xem hiểu ngược hoàn toàn | Người học ít hơn hẳn sẽ thấy cột của mình gần như phẳng |
| 2026-09-11 | **F12 đợt 1**: thống kê 7 ngày gắn vào `GET /study/summary`, không tách endpoint riêng | `summary()` đã nạp sẵn toàn bộ `StudyLog` của couple để tính tổng và chuỗi ngày. Tách ra là quét bảng lần thứ hai cho đúng bộ dữ liệu đó | Khi cần khung tháng/năm sẽ phải tách — lúc đó mới tách |
| 2026-09-11 | **F12 đợt 1**: đồng hồ số lật viết bằng CSS thuần trong `index.css`, không kéo thư viện | Cần `@keyframes` + `backface-visibility` + `perspective` đi cùng nhau; nhét vào class tiện ích thì mỗi chỗ dùng phải chép lại cả cụm. Thư viện flip-clock nào cũng gánh theo phần đếm giờ riêng, mà đồng hồ ở đây do SERVER giữ mốc | Thêm ~90 dòng CSS vào tệp chung |
| 2026-09-11 | **F12 đợt 2**: việc chưa xong KHÔNG hết hạn lúc nửa đêm, chỉ được đánh dấu `carriedOver` | Danh sách bó cứng vào "hôm nay" gọn hơn nhưng âm thầm nuốt mất đúng những việc người ta đang nợ — và người dùng chỉ phát hiện khi đã quên hẳn. Truy vấn "chưa xong (mọi ngày) HOẶC xong hôm nay" cũng chỉ là một câu | Danh sách có thể dài dần nếu không ai dọn; chặn bằng trần 40 việc đang mở |
| 2026-09-11 | **F12 đợt 2**: mốc đếm ngược CẢ HAI cùng thấy, việc cần làm thì RIÊNG | Biết người ấy còn mười hai ngày nữa thi là lý do mốc tồn tại trong app cho hai người. Danh sách việc vặt thì người kia không có lý do gì để đọc | Hai bảng gần giống nhau lại có hai luật quyền khác nhau — phải nhớ khi thêm truy vấn mới |
| 2026-09-11 | **F12 đợt 2**: `daysLeft` tính ở SERVER, không để client tự trừ | Máy người dùng có thể lệch giờ hoặc đặt sai múi giờ. "Còn mấy ngày nữa thi" thì không được phép sai | Số ngày chỉ đổi khi tải lại — chấp nhận được, nó đổi mỗi ngày một lần |
| 2026-09-11 | **F12 đợt 2**: nhật ký gắn vào `StudyLog` (một chặng), không vào `StudySession` | Một buổi Pomodoro có nhiều chặng và mỗi chặng làm một việc khác nhau. Gắn vào phiên thì bốn chặng chung một dòng ghi chú | Muốn xem nhật ký cả buổi phải gom nhiều dòng |
| 2026-09-11 | **F12 đợt 2**: chỉ hỏi "vừa làm được gì" trong 3 giờ sau khi chặng kết thúc | Mở app sau một tuần mà bị hỏi về buổi học tuần trước thì chẳng ai còn nhớ để mà ghi — câu hỏi trở thành thứ phải gạt đi | Chặng cũ hơn 3 giờ không ghi chú được nữa qua đường hỏi tự động (vẫn ghi được bằng `PUT .../note`) |
| 2026-09-12 | **F12 đợt 3**: nghỉ dài SUY RA từ `roundsDone`, không thêm giá trị vào enum `StudyPhase` | `ALTER TYPE ... ADD VALUE` là thao tác không lùi được, mà nghỉ dài vẫn là nghỉ — chỉ khác độ dài. Suy ra thì cột trong DB không có cách nào lệch khỏi luật | Mọi chỗ tính thời lượng chặng phải nhớ truyền cờ `longBreak`; `phaseDurationMs()` bắt truyền tường minh thay vì tự đoán |
| 2026-09-12 | **F12 đợt 3**: tiếng ồn nền TỔNG HỢP bằng Web Audio, không dùng tệp âm thanh | Một vòng lặp mưa nghe không lộ mối nối thì nặng vài MB — đắt hơn cả phần còn lại của app cộng lại, trên mạng di động Việt Nam. Nhiễu tổng hợp tốn 0 byte, chạy offline, và không bao giờ lặp lại chính nó | Không có tiếng "thật" như mưa thu âm; và tiếng tắt khi khoá màn hình (trình duyệt treo `AudioContext`) — phải nói thẳng điều này trên giao diện |
| 2026-09-12 | **F12 đợt 3**: cổ vũ chỉ gửi được MÃ trong danh sách đóng, và KHÔNG kèm thông báo đẩy | Cho gửi chữ tự do thì kênh này thành khung chat, mà app đã chốt không có chat (§7.3) — một ô chat hiện ra giữa lúc đang học phá đúng thứ phòng học phục vụ. Không đẩy vì cổ vũ chỉ có nghĩa khi người kia đang ngồi đó; rung máy của người đã cất điện thoại đi học là làm phiền | Bốn câu cố định, không nói được gì khác |
| 2026-09-12 | **F12 đợt 3**: tên người gửi cổ vũ lấy từ SERVER, không nhận từ client | Để client tự khai tên thì ai cũng gửi được một lời cổ vũ mang tên người khác | Thêm một lượt đọc `getContext()` cho mỗi lời cổ vũ — đã bị chặn 3 giây/lần nên không đáng lo |
| 2026-09-12 | **F12 đợt 3**: khung trục của dải thời gian LUÔN chia hết cho số khoảng | Các nhãn giờ được rải đều bằng `justify-between`. Không chia hết thì nhãn cuối nằm ở mép 100% trong khi giờ nó chỉ tới nằm ở 90% — cả trục nói dối mà nhìn vẫn thấy cân đối. Bản đầu dính đúng lỗi này | Khung có thể rộng hơn dữ liệu thật một chút |
| 2026-09-12 | **F12 đợt 4**: đồng hồ toàn màn hình dùng lại `useLandscape()` của bàn Tiến lên, không viết mới | Ba mức rơi xuống dần (khoá ngang thật → nhắc người dùng tự xoay → chịu thua khi máy khoá xoay) đã được kiểm chứng ở ván bài. Quan trọng nhất là nguyên tắc đi kèm: KHÔNG bao giờ chặn màn hình bằng tấm "hãy xoay máy" | Lớp phủ phải đẹp ở cả hai chiều, không được thiết kế riêng cho khổ ngang |
| 2026-09-12 | **F12 đợt 4**: khổ DỌC xếp chồng mỗi nhóm một hàng, khổ ngang nằm một hàng | Sáu thẻ xếp ngang trên khung 390px cho ra mỗi thẻ 45px trong khi nửa trên và nửa dưới màn hình bỏ trống. Xếp chồng làm chữ số to lên hơn hai lần mà không bỏ bớt thông tin nào | Xếp chồng thì mất dấu hai chấm, nên phải thêm nhãn `GIỜ/PHÚT/GIÂY` — không có nó thì `18` trên `07` đọc thành giờ:phút |
| 2026-09-12 | **F12 đợt 4**: mặt đồng hồ đọc giờ **Việt Nam**, không đọc đồng hồ máy | R2 đã chốt mọi thứ hiển thị theo `Asia/Ho_Chi_Minh`. Một mặt đồng hồ nói giờ khác với dòng "cập nhật 5 phút trước" ngay bên cạnh sẽ khiến người dùng không tin cái nào nữa | Người dùng đang ở múi giờ khác sẽ thấy giờ VN — đúng ý đồ với app cho một cặp đôi ở Việt Nam |
| 2026-09-12 | **F12 đợt 4**: nhịp đồng hồ canh vào đầu giây kế rồi mới chạy đều | `setInterval(…, 1000)` trần làm mốc bấm giờ trôi dần khỏi giây thật, và thỉnh thoảng nuốt hẳn một giây — trên mặt số lật thì đó là một thẻ đứng im hai giây rồi nhảy hai số cùng lúc | Thêm một `setTimeout` canh nhịp trước `setInterval` |
| 2026-09-12 | **F12**: mặt đồng hồ toàn màn hình đo theo KHUNG CHỨA (`cqw`/`cqh`), không theo khung nhìn | Phần giữa màn hình co lại khi bảng chỉnh sáng/tiếng mở ra, mà `vh` không biết chuyện đó — đồng hồ giữ nguyên cỡ và tràn đè lên các nút. Bản đo theo khung nhìn giữ lại làm dự phòng trong `@supports` | Trình duyệt không có container query sẽ thấy đồng hồ nhỏ hơn một chút (bản dự phòng lấy 70% chiều cao cho chắc) |
| 2026-09-12 | **F12**: "độ sáng" là LỚP PHỦ ĐEN, không phải độ sáng phần cứng | Web không có API chỉnh đèn nền, không có cách nào khác. Chặn ở 82% là để tự cứu: cho tối 100% thì nút thoát biến mất và người dùng kẹt trong màn hình đen | Không tiết kiệm pin như giảm sáng thật; và phải nói rõ trong giao diện rằng "âm lượng" là của TIẾNG NỀN trong app, không phải âm lượng máy |
| 2026-09-12 | **F12**: đồng hồ đếm ngược hẹn giờ ĐÚNG vào mốc đổi giây, bỏ `setInterval(500)` | Con số vẫn đúng với `setInterval`, nhưng khoảnh khắc nó ĐỔI lệch tới nửa giây và lệch không đều — trên mặt số lật thì thấy ngay, các cú lật rơi lệch nhịp nhau | Mỗi giây một `setTimeout` mới thay vì một `setInterval` duy nhất |
| 2026-09-12 | **F12**: một cú lật rút từ 620ms xuống 420ms, hai nửa nối khít, bỏ đường cong vọt quá | Thẻ giây đổi mỗi 1000ms mà hiệu ứng chiếm 620ms thì mặt đồng hồ lúc nào cũng đang động đậy. Hai nửa còn chồng nhau 20ms và lá dưới nảy ở cuối — đó mới là chỗ trông giật, không phải tốc độ | Cú lật bớt "nặng"; ai thích chậm thì phải sửa lại CSS |
| 2026-09-11 | **F14**: không log nội dung chu kỳ, chỉ log số lượng | Nhật ký máy chủ đã cấm toạ độ chính xác (R3); dữ liệu sức khoẻ còn nhạy cảm hơn | Gỡ lỗi khó hơn một chút |
| 2026-09-11 | Sửa gốc lỗi **"deploy xong vẫn thấy giao diện cũ"**: app tự đăng ký service worker và mời tải lại | `registerType: 'prompt'` + `injectRegister: 'auto'` = bản mới cài xong rồi NẰM CHỜ tới khi đóng hết tab — trên điện thoại thì gần như không bao giờ. Giờ app bắt `onNeedRefresh`, hiện dải "Đã có bản mới", tự hỏi lại server mỗi lần quay về tiền cảnh và mỗi 30 phút | Thêm một dải thông báo trên đỉnh màn hình; đổi lại không còn kẹt ở bản cũ |
| 2026-09-11 | Vẫn giữ **không tự tải lại**, chỉ mời | Người dùng có thể đang gõ dở một lời nhắn hoặc đang giữa ván bài — cướp trang của họ để cập nhật tệ hơn hẳn việc chờ thêm vài phút | Ai bỏ qua dải thông báo thì vẫn ở bản cũ tới lần mở sau |

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

> ⚠️ Dòng "Caddy tự xin Let's Encrypt" ở trên mô tả **cấu hình chuẩn khi Beside có
> VPS riêng**. Máy chủ đang chạy thật KHÔNG như vậy — xem 11.0a ngay dưới.

### 11.0a Máy chủ đang chạy thật (từ 2026-09-08)

| | |
|---|---|
| Máy | `14.225.222.216` · Ubuntu 24.04 · 2 vCPU · 3.9 GB RAM (+2 GB swap) |
| Thư mục | `/opt/beside`, `.env` chmod 600 (secret sinh tại chỗ, không có bản nào ở máy dev) |
| Lệnh dựng | `docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build` |
| Chung máy với | stack `hungsilver` ở `/opt/hungsilver` — giữ cổng 80/443 và 5432, phục vụ `h-edutech.io.vn` |
| TLS & định tuyến | do `hungsilver-caddy` lo, bằng Cloudflare Origin Certificate. Site block: `infra/caddy/shared-host.Caddyfile` |
| Cổng nội bộ | `beside-web` `172.18.0.1:3002` · `beside-api` `172.18.0.1:3003` · Postgres `127.0.0.1:5433` · MinIO `127.0.0.1:9000/9001` — **không cổng nào phơi ra Internet** |

Ba lệch so với thiết kế gốc (Caddy riêng, cổng 5432, Let's Encrypt) đều đã ghi ở
§10 kèm lý do. Hướng dẫn đầy đủ: `docs/DEPLOY.md` §"Triển khai chung máy với dự án khác".

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
