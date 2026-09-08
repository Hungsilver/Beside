# Trace: Phase 5 — Tách `socket.io-client` khỏi gói tải đầu tiên

- **Ngày:** 2026-09-08
- **Phạm vi:** hiệu năng lần mở app đầu tiên (mobile)
- **File liên quan:** `apps/web/src/lib/realtime.tsx`, `apps/web/e2e/app.spec.ts`
- **Cách chạy:** `npm run e2e` — 17 test (2 test mới)

---

## 1. Vấn đề đo được

| | Trước | Sau |
|---|---|---|
| Gói tải về đầu tiên | **364 KB** (gzip 108 KB) | **323 KB** (gzip 99 KB) |
| `socket.io-client` | nằm trong gói chính | chunk riêng **41 KB** (gzip 13 KB), nạp sau |

`socket.io-client` là một trong những thư viện nặng nhất của app, mà **người
chưa ghép đôi không dùng tới một dòng nào** — effect kết nối thoát ngay ở dòng
đầu (`if (!coupleId) return`). Vậy mà nó vẫn nằm trong gói chặn lần vẽ màn hình
đầu tiên.

Với người dùng 3G/4G ở Việt Nam, 41 KB trong đường dẫn quan trọng là đáng cắt.

## 2. Đã sửa gì

`import { io } from 'socket.io-client'` → `import type { Socket }` (bị xoá lúc
build) cộng với `await import('socket.io-client')` **bên trong** effect.

Cờ `cancelled` là bắt buộc: người dùng có thể rời màn hình trước khi mạng trả
về, lúc đó hàm dọn dẹp đã chạy xong rồi. Không có cờ này thì ta tạo ra một
socket không ai gỡ — rò kết nối.

---

## 3. Rủi ro của thay đổi này, và cách chặn nó

Kết nối thời gian thực có thể **chết trong im lặng**: không lỗi, không màn
trắng, chỉ là vị trí không bao giờ cập nhật. Trace Phase 2 kiểm WebSocket ở phía
**server**, không kiểm client trong trình duyệt — đúng chỗ trống mà thay đổi này
rơi vào.

| Mã | Tình huống | Kết quả |
|---|---|---|
| E2E-11 | Mở `/ban-do` → dòng "Đang kết nối lại..." **biến mất** ⇒ socket nạp động vẫn kết nối được | ✅ |
| E2E-12 | **Chặn WebSocket** → dòng đó **phải hiện lên** | ✅ |

E2E-12 tồn tại để E2E-11 không thành test rỗng. Một khẳng định "đã kết nối" chỉ
có nghĩa khi biết chắc nó đỏ được lúc kết nối hỏng.

### Suýt nữa thì có thêm một test rỗng

Lần đầu thử phá, tôi dùng `page.route('**/socket.io/**', r => r.abort())`. Probe
**xanh** — tưởng E2E-11 không đỏ được. Đo lại thì thấy **0 request bị chặn**:

> `page.route` của Playwright **không chặn WebSocket**. Socket.IO cấu hình
> `transports: ['websocket', 'polling']` nên nó đi thẳng bằng WebSocket và lách
> qua toàn bộ lớp chặn HTTP.

Phải dùng `page.routeWebSocket` (có từ Playwright 1.48). Lúc đó mới đo được
`ws bị chặn = 2` và `"Đang kết nối lại..." đang hiện = true`.

Bài học lặp lại lần thứ tư trong dự án này (L18, L25, L27, L31): **một phép thử
xanh chưa nói lên điều gì cho tới khi biết vì sao nó xanh.** Ở đây suýt nữa tôi
kết luận ngược hẳn — rằng chốt không hoạt động — trong khi thật ra cái hỏng là
đồ nghề phá hoại.

---

## 4. Đã tự rà (checklist R1 bước 1)

- **Async:** cờ `cancelled` chặn việc tạo socket sau khi component đã unmount.
- **Dọn dẹp:** hàm dọn dẹp gỡ listener, ngắt kết nối, xoá ref — như cũ, chỉ khác
  là thao tác trên biến `socket` có thể còn `null` nếu import chưa xong.
- **Lỗi mạng:** `import()` hỏng (mất mạng giữa chừng) thì promise bị từ chối và
  bị nuốt bởi `void` — app vẫn chạy, chỉ mất thời gian thực. Đúng mức độ ưu tiên:
  thời gian thực là tính năng phụ so với việc mở được app.
- **Kiểu dữ liệu:** `typeof import('socket.io-client').io` giữ nguyên kiểu đầy đủ
  cho hàm `connect`, không dùng `any`.

## 5. Còn thiếu

- **Chưa đo trên mạng chậm thật.** Con số 41 KB là đo tĩnh trên bản build; chưa
  ai mở app bằng 3G thật để xem khác biệt bao nhiêu giây.
- **Gói chính vẫn 323 KB** (gzip 99 KB). Thành phần lớn còn lại là React,
  TanStack Query và Zod — chưa phân tích chi tiết từng thư viện.
- **MapLibre vẫn 1,1 MB** (gzip 284 KB) khi mở bản đồ lần đầu. Đã tách chunk và
  không nạp sẵn từ Phase 2; giảm thêm thì phải đổi thư viện bản đồ.
- **Chưa làm PWA offline** — mục còn lại của Phase 5 (ngoài giao diện PC, thứ mà
  chủ dự án đã bảo để sau).
