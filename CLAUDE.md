# CLAUDE.md — Quy tắc làm việc trong dự án này

Dự án: **Ứng dụng check-in & theo dõi lịch trình cho cặp đôi** (PWA, self-host trên VPS).
Ngôn ngữ giao tiếp: **Tiếng Việt**. Code/comment/commit: tiếng Anh; chuỗi hiển thị: tiếng Việt.

---

## R0 — ARCHITECTURE.md là nguồn sự thật

- **Trước khi viết code:** đọc `ARCHITECTURE.md` để nắm stack, schema, hợp đồng API.
- **Sau khi viết code:** nếu có thay đổi về stack / schema / API / luồng dữ liệu / quyết định
  kiến trúc → **cập nhật ngay** `ARCHITECTURE.md` (kể cả bảng ADR §10 và ngày "Cập nhật lần cuối").
- **Không được** tự ý dùng thư viện / công nghệ ngoài danh sách §4 mà không ghi lý do vào §10.
- Nếu phát hiện code hiện tại **lệch** so với ARCHITECTURE.md → dừng lại, báo, rồi mới sửa
  (hoặc sửa tài liệu, hoặc sửa code — không để lệch âm thầm).

---

## R1 — BẮT BUỘC: Review + Trace bằng dữ liệu giả định sau khi code xong

Đây là quy tắc quan trọng nhất của dự án. **Không feature nào được coi là "xong"** nếu chưa
đi hết 3 bước dưới đây.

### Bước 1 — Self-review (đọc lại code vừa viết)

Checklist tối thiểu:

- [ ] **Null / undefined:** mọi giá trị từ API, DB, GPS, form đều có thể thiếu — đã xử lý chưa?
- [ ] **Kiểu dữ liệu:** không còn `any`; số/chuỗi/ngày không bị ép kiểu ngầm.
- [ ] **Biên (boundary):** mảng rỗng, chuỗi rỗng, 0, số âm, ngày trong quá khứ/tương lai.
- [ ] **Async:** đã `await`? có `try/catch`? có race condition khi user bấm 2 lần?
- [ ] **Lỗi mạng:** timeout, mất kết nối, WebSocket rớt → UI có trạng thái tương ứng?
- [ ] **Quyền:** user chỉ đọc/ghi được dữ liệu của **couple của chính mình** (kiểm tra ở server, không tin client).
- [ ] **Múi giờ:** lưu UTC ở DB, hiển thị theo `Asia/Ho_Chi_Minh`. Không dùng `new Date(string)` không rõ format.
- [ ] **Dọn dẹp:** `watchPosition` / `setInterval` / socket listener / object URL đã được huỷ khi unmount?
- [ ] **Rò rỉ dữ liệu:** log không chứa toạ độ chính xác, token, mật khẩu.

### Bước 2 — Trace với dữ liệu giả định

Tạo/cập nhật file `docs/traces/<tên-feature>.md`. **Chạy tay từng bước bằng ngòi bút**, không
chỉ chạy test. Mẫu bắt buộc:

```markdown
# Trace: <tên feature>
Ngày: YYYY-MM-DD · File liên quan: `path/a.ts`, `path/b.tsx`

## TC-01 — Happy path: <mô tả>
| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `parseGps()` :24 | `{lat:10.7769, lng:106.7009, acc:12}` | hợp lệ | |
| 2 | `kalman.update()` :51 | trên | `{lat:10.77691, lng:106.70088}` | R=144 |
| 3 | ... | | | |
**Kỳ vọng:** ...
**Thực tế:** ...
**Kết luận:** ✅ ĐẠT / ❌ LỖI → mô tả + đã sửa ở commit nào
```

**Số case tối thiểu cho mỗi feature: 1 happy path + 3 edge case + 1 case lỗi.**

Edge case **bắt buộc** cân nhắc cho từng nhóm feature:

| Nhóm | Edge case bắt buộc |
|---|---|
| Vị trí / GPS | accuracy > 100m; user từ chối quyền; GPS nhảy 5km trong 2s; đứng yên 10 phút; qua nửa đêm |
| Đếm ngày yêu | anniversary = hôm nay (0 ngày); anniversary tương lai; năm nhuận 29/02; đúng mốc 100/365/1000 |
| Check-in ảnh | ảnh 12MB; ảnh xoay EXIF 90°; upload giữa chừng mất mạng; không có toạ độ |
| Lịch trình | sự kiện all-day; endAt < startAt; 2 sự kiện trùng giờ; sự kiện đã qua |
| Ghép đôi | mã sai; mã hết hạn; tự ghép với chính mình; user đã có couple; 2 người nhập cùng lúc |
| Realtime | socket rớt rồi nối lại; nhận điểm cũ hơn điểm hiện tại (out-of-order); ghost mode đang bật |

### Bước 3 — Chạy kiểm thử tự động

```bash
npm run typecheck && npm run lint && npm run test
```
Nếu là feature có UI: thêm 1 test Playwright ở viewport 390×844.

**Chỉ khi cả 3 bước xanh mới được báo "đã xong".** Nếu có bước không chạy được, phải nói rõ
bước nào bị bỏ và vì sao — không được im lặng.

---

## R2 — Quy ước code

- **Mobile-first tuyệt đối.** CSS mặc định viết cho 390px; dùng `sm:` `md:` `lg:` để mở rộng lên.
  Không bao giờ viết desktop trước rồi thu nhỏ.
- Vùng chạm tối thiểu **44×44px**. Tôn trọng `env(safe-area-inset-*)` (tai thỏ iPhone).
- Mọi chuỗi hiển thị nằm trong `src/i18n/vi.ts` — không hardcode chuỗi tiếng Việt trong component.
- Validate bằng **Zod**, schema đặt ở `packages/shared/` và **dùng chung** cho FE + BE.
- Tên file: component `PascalCase.tsx`, còn lại `kebab-case.ts`.
- Không có `console.log` trong code commit — dùng logger (`pino` ở BE, `debug` ở FE).
- Migration DB **luôn** qua Prisma migrate; phần PostGIS viết SQL thuần trong migration đó.

## R3 — Bảo mật & quyền riêng tư (app này chứa dữ liệu vị trí — cực nhạy cảm)

- Mọi endpoint mặc định **yêu cầu xác thực**; endpoint public phải khai báo tường minh.
- Kiểm tra quyền theo `coupleId` ở **tầng service**, không chỉ ở controller.
- Không log toạ độ đầy đủ ra file log (làm tròn 2 chữ số thập phân nếu buộc phải log).
- Ảnh check-in: **xoá EXIF** trước khi lưu (toạ độ đã lưu riêng trong DB).
- Ghost mode bật → server **không** phát `loc:partner`, và cũng **không** ghi `LocationPoint`.
- Secret chỉ nằm trong `.env` (đã gitignore). Không commit key, không in ra log.

## R4 — Cách trình bày khi làm việc

- Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào việc.
- Khi có nhiều phương án: nêu **1 khuyến nghị** kèm lý do, không liệt kê dàn trải.
- Khi báo xong việc: nói rõ **đã làm gì / đã trace case nào / còn thiếu gì**.
- Không tự ý mở rộng phạm vi ngoài yêu cầu. Nếu thấy vấn đề khác → ghi vào `docs/BACKLOG.md`.

## R5 — Mockup & tài sản thiết kế

- Mockup HTML nằm ở `mockup/`, chạy được offline bằng cách mở trực tiếp trong trình duyệt.
- Mockup là **để duyệt giao diện**, không phải code production — nhưng bảng màu, khoảng cách,
  bo góc, typography trong mockup sẽ được chuyển thành design token ở Phase 1.
- **Không** tạo file/deploy lên môi trường remote khi chưa được yêu cầu rõ ràng.
