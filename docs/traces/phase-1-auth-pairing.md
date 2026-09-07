# Trace: Phase 1 — Xác thực & Ghép đôi

- **Ngày:** 2026-09-07
- **Phạm vi:** `/auth/*`, `/me`, `/couples/*`, `/health`
- **Cập nhật:** 2026-09-07 (đợt 2 — bổ sung sửa hồ sơ cá nhân, TC-36…TC-49)
- **File liên quan:**
  `apps/api/src/auth/*`, `apps/api/src/couples/*`,
  `packages/shared/src/{auth.schema,couple.schema,datetime,love,messaging}.ts`
- **Cách chạy:** API thật (`node dist/main.js`) + **PostgreSQL 18 cài sẵn trên máy** (cổng 5432).
  Kịch bản: `apps/api/test/trace-auth-pairing.mjs` — chạy lại bằng `npm run trace:phase1`
  (39 case gọi HTTP thật, mỗi "thiết bị" giữ cookie riêng như trình duyệt).

## Dữ liệu giả định

| Nhân vật | Vai trò |
|---|---|
| **An** | tạo tài khoản, tạo couple, sinh mã mời |
| **Bình** | nhập mã, ghép đôi thành công |
| **Chi** | người thứ ba thử dùng lại mã đã ghép xong |
| **Host / r1 / r2** | mô phỏng hai người bấm “Kết đôi” cùng lúc |

- Ngày yêu: **14/02/2023**
- Mật khẩu thử: `matkhau123`, `123` (quá ngắn), `"ế"×30` (90 byte)
- Mã thử: mã thật, `ZZZZZZ` (không tồn tại), `LV7K2O` (chứa chữ O bị cấm),
  mã thật viết thường + có khoảng trắng thừa

---

## Kết quả

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| TC-00 | GET /health khi DB đang chạy | 200 + db:"up" | 200 + db:"up" | ✅ |
| TC-01 | **Happy path** — Đăng ký hợp lệ | 201 + accessToken + cookie `beside_rt` + coupleId=null | đúng như kỳ vọng | ✅ |
| TC-01b | Phản hồi KHÔNG chứa `passwordHash` | không có trường này | chỉ có id/displayName/email/avatarUrl/birthday/coupleId/messaging* | ✅ |
| TC-02 | Đăng ký trùng email | 409 EMAIL_TAKEN | 409 EMAIL_TAKEN | ✅ |
| TC-03 | Mật khẩu < 8 ký tự | 422 + lỗi ở trường `password` | 422 + `{"password":["Mật khẩu tối thiểu 8 ký tự"]}` | ✅ |
| TC-04 | Mật khẩu tiếng Việt 30 ký tự = **90 byte** | 422 (đo bằng byte, không phải số ký tự) | 422 VALIDATION_FAILED | ✅ |
| TC-05 | Sai mật khẩu vs email không tồn tại | cùng mã lỗi, cùng câu thông báo | cả hai 401 INVALID_CREDENTIALS, message giống hệt | ✅ |
| TC-05b | Thời gian phản hồi hai trường hợp trên | chênh < 4× (chống dò email) | 57ms vs 54ms → 1,06× | ✅ |
| TC-06 | Đăng nhập bằng email VIẾT HOA | 200 (chuẩn hoá về chữ thường) | 200 | ✅ |
| TC-07 | `/auth/me` khi chưa đăng nhập | 401 UNAUTHENTICATED | 401 UNAUTHENTICATED | ✅ |
| TC-08 | Token rác | 401 | 401 UNAUTHENTICATED | ✅ |
| TC-09 | Xem couple khi chưa ghép đôi | 404 NOT_IN_COUPLE | 404 NOT_IN_COUPLE | ✅ |
| TC-10 | Ngày yêu ở **tương lai** | 422 | 422 VALIDATION_FAILED | ✅ |
| TC-11 | Ngày yêu trước năm 1900 | 422 | 422 VALIDATION_FAILED | ✅ |
| TC-12 | Ngày yêu là chuỗi vô nghĩa (`"hom-qua"`) | 422, **không được 500** | 422 VALIDATION_FAILED | ✅ |
| TC-13 | **Happy path** — Tạo couple 14/02/2023 | 201 + mã 6 ký tự sạch + members=1 | 201 + `AFS8DT` + 2023-02-14 + members=1 | ✅ |
| TC-14 | Tạo couple lần hai | 409 ALREADY_IN_COUPLE | 409 ALREADY_IN_COUPLE | ✅ |
| TC-15 | Tự ghép đôi bằng mã của chính mình | bị chặn | 409 ALREADY_IN_COUPLE | ✅ |
| TC-16 | Mã không tồn tại | 404 INVITE_NOT_FOUND | 404 INVITE_NOT_FOUND | ✅ |
| TC-17 | Mã chứa chữ `O` (ký tự bị cấm) | 422 | 422 VALIDATION_FAILED | ✅ |
| TC-18 | **Happy path** — Ghép bằng mã viết thường + khoảng trắng thừa | 200 + members=2 + mã bị ẩn + partner=An | đúng như kỳ vọng | ✅ |
| TC-19 | Người thứ 3 dùng lại mã đã ghép xong | 409 COUPLE_FULL, **không phải** “mã không tồn tại” | 409 COUPLE_FULL — “Cặp đôi này đã đủ 2 người” | ✅ |
| TC-20 | An xem couple sau khi Bình vào | partner=Bình, inviteCode ẩn | đúng | ✅ |
| TC-21 | Đếm ngày yêu từ 14/02/2023 | 1301 (tính lại độc lập trong test) | 1301 · 3 năm 6 tháng 24 ngày | ✅ |
| TC-22 | Mốc kế tiếp | daysLeft > 0, progress ∈ [0,100] | 1.460 ngày · còn 159 ngày · 56% | ✅ |
| TC-23 | Refresh token xoay vòng | 200 + cookie đổi | 200 + cookie đổi | ✅ |
| TC-24 | Dùng lại refresh token cũ (giả lập bị đánh cắp) | 401 REFRESH_TOKEN_REUSED | 401 REFRESH_TOKEN_REUSED | ✅ |
| TC-25 | Sau khi phát hiện tái sử dụng | thu hồi cả family, buộc đăng nhập lại | 401 | ✅ |
| TC-26 | **Race** — hai người bấm “Kết đôi” cùng lúc | đúng 1 người vào được | thành công 1, còn lại 409 COUPLE_FULL | ✅ |
| TC-26b | Người thua cuộc đua | 409 COUPLE_FULL, **không được 500** | 409 COUPLE_FULL | ✅ |
| TC-27 | Số thành viên sau cuộc đua | đúng 2, không bao giờ 3 | 2 | ✅ |
| TC-28 | Huỷ ghép đôi **không** xác nhận | 422 | 422 VALIDATION_FAILED | ✅ |
| TC-29 | Huỷ ghép đôi có `confirm:true` | 204 | 204 | ✅ |
| TC-30 | Bình xem couple sau khi huỷ | 404 NOT_IN_COUPLE | 404 | ✅ |
| TC-31 | An cũng bị gỡ (huỷ là xoá cả hai) | 404 NOT_IN_COUPLE | 404 | ✅ |
| TC-32 | Tài khoản An vẫn còn | 200 + coupleId=null | 200 + coupleId=null | ✅ |
| TC-33 | Đăng xuất | 204 + cookie bị xoá | 204 + cookie đã xoá | ✅ |
| TC-34 | Refresh sau khi đăng xuất | 401 | 401 REFRESH_TOKEN_INVALID | ✅ |
| TC-35 | Đăng ký hàng loạt từ cùng IP | 429 RATE_LIMITED | bị chặn ở lần thứ 21 (20/giờ) | ✅ |

### Đợt 2 — Sửa hồ sơ cá nhân trong app (`GET|PATCH /me`)

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| TC-36 | Đọc hồ sơ của chính mình | 200 + mặc định app nhắn tin là Zalo, chưa có số | 200 · An · ZALO · handle null | ✅ |
| TC-37 | **Happy path** — sửa tên + ngày sinh | 200 + tên đã cắt khoảng trắng | `"  Nguyen An  "` → `"Nguyen An"` · 1998-05-12 | ✅ |
| TC-38 | `PATCH /me` với body rỗng | 422 — không có gì để cập nhật | 422 VALIDATION_FAILED | ✅ |
| TC-39 | Ngày sinh ở tương lai | 422 | 422 VALIDATION_FAILED | ✅ |
| TC-40 | Ngày sinh là chuỗi vô nghĩa | 422, **không được 500** | 422 VALIDATION_FAILED | ✅ |
| TC-41 | **Happy path** — cài Zalo bằng số điện thoại | 200 | 200 · ZALO/0912345678 | ✅ |
| TC-42 | Đổi **riêng** số thành chuỗi rác (app vẫn Zalo) | 422 + gợi ý riêng cho Zalo | “Zalo: nhập số điện thoại Việt Nam, ví dụ 0912345678” | ✅ |
| TC-43 | Đổi **riêng** app sang Messenger khi số đang là SĐT | 422 — SĐT không phải username Facebook | 422 + gợi ý riêng cho Messenger | ✅ |
| TC-44 | Đổi **cả hai** cùng lúc sang Messenger + username | 200 | 200 · MESSENGER/nguyen.an | ✅ |
| TC-45 | Xoá thông tin liên hệ (chuỗi rỗng → null) | 200 + handle null → giao diện ẩn nút nhắn tin | 200 · null | ✅ |
| TC-46 | Người ấy thấy được tên mới qua `partner` | partner.displayName đã đổi | “Nguyen An” | ✅ |
| TC-47 | Bình sửa hồ sơ của mình, **không** đụng tới An | hồ sơ An giữ nguyên | Bình đổi tên; An vẫn “Nguyen An” | ✅ |
| TC-48 | Đổi ngày kỷ niệm trong app | 200 + bộ đếm tính lại theo ngày mới | 2024-03-08 → daysTogether 913 | ✅ |
| TC-49 | Đổi ngày kỷ niệm sang ngày tương lai | 422 | 422 VALIDATION_FAILED | ✅ |

**Tổng: 53/53 ✅**

---

## Lỗi phát hiện được và đã sửa trong lượt trace này

### L1 — `breakdownDuration` trả về số ngày ÂM

- **Phát hiện:** unit test `packages/shared/src/love.spec.ts`
- **Đầu vào:** 31/01/2024 → 01/03/2024
- **Sai:** `{years:0, months:1, days:-1}`
- **Nguyên nhân:** thuật toán "trừ từng thành phần rồi mượn ngày của tháng liền trước"
  không đủ khi ngày bắt đầu là cuối tháng.
- **Sửa:** cộng dồn số tháng lớn nhất chưa vượt mốc kết thúc (có kẹp ngày về cuối tháng),
  phần dư mới đếm bằng ngày — cùng quy ước với `date-fns`.
- **Hiện tại:** `{years:0, months:1, days:1}` ✅

### L2 — `anniversarySchema` ném `TypeError` thay vì báo lỗi validate

- **Phát hiện:** unit test `couple.schema.spec.ts` với đầu vào `"không phải ngày"`
- **Sai:** `TypeError: d.getTime is not a function` → sẽ thành **500** cho người dùng
- **Nguyên nhân:** trong Zod v3, `z.NEVER` trả về từ `.transform()` **vẫn** được truyền
  tiếp cho các `.refine()` phía sau.
- **Sửa:** gộp toàn bộ kiểm tra vào MỘT `transform`, mọi `addIssue` đều đặt `fatal: true`.
- **Hiện tại:** 422 VALIDATION_FAILED (TC-12) ✅

### L3 — “Hôm nay” bị từ chối là ngày tương lai trong khoảng 00:00–07:00 giờ VN

- **Phát hiện:** khi rà lại phép so sánh trong `anniversarySchema`
- **Kịch bản:** 03:00 sáng 07/09 giờ VN = 06/09 20:00 UTC. Người dùng chọn “hôm nay”,
  trình duyệt gửi `"2026-09-07"` → được hiểu là `2026-09-07T00:00Z` > `Date.now()`
  → **báo “Ngày yêu không thể ở tương lai” dù họ chọn đúng hôm nay.**
- **Sửa:** thêm `isFutureCalendarDay()` trong `packages/shared/src/datetime.ts`,
  so sánh theo **ngày lịch giờ Việt Nam** thay vì timestamp.
- **Kiểm chứng:** 3 unit test trong `love.spec.ts` mô phỏng đúng mốc 03:00 sáng.

### L4 — Người thua cuộc đua ghép đôi nhận **500 INTERNAL**

- **Phát hiện:** TC-26 ở lượt trace đầu tiên
- **Log:** `PrismaClientKnownRequestError: Transaction API error: Unable to start a
  transaction in the given time.`
- **Nguyên nhân:** giao dịch dùng isolation `Serializable`; giao dịch thứ hai chờ khoá
  quá `maxWait` mặc định (2s) của Prisma → lỗi hạ tầng lọt thẳng ra người dùng.
  Dữ liệu vẫn đúng (chỉ 1 người vào), nhưng người kia thấy “lỗi máy chủ”.
- **Sửa:** bỏ `Serializable`, chuyển sang **atomic claim** —
  `UPDATE couples SET invite_consumed_at = now() WHERE id = ? AND invite_consumed_at IS NULL`.
  Postgres khoá dòng nên chỉ một giao dịch đổi được (count = 1), giao dịch kia thấy
  count = 0 và nhận 409 COUPLE_FULL. Chạy được ở Read Committed, không cần thử lại.
- **Hiện tại:** TC-26b ✅

### L5 — Thông báo “Mã ghép đôi không tồn tại” sai sự thật

- **Phát hiện:** TC-19 và TC-26 sau khi sửa L4
- **Sai:** mã bị **xoá** (`inviteCode = null`) ngay khi ghép xong, nên người vào sau
  nhận 404 “mã không tồn tại” — trong khi họ vừa gõ đúng mã người yêu gửi.
- **Sửa:** giữ nguyên mã, thêm cột `inviteConsumedAt` làm chốt chặn
  (migration `20260907054741_add_invite_consumed_at`).
  Mã vẫn bị ẩn khỏi API khi couple đã đủ 2 người.
- **Hiện tại:** 409 COUPLE_FULL — “Cặp đôi này đã đủ 2 người” ✅

### L6 — Rate limit đăng ký quá chặt (5 lần / 10 phút / IP)

- **Phát hiện:** 3 case của lượt trace đầu fail vì chính rate limit chặn kịch bản test
- **Vấn đề thật:** rất nhiều người dùng mạng di động ở Việt Nam đi qua **CGNAT** —
  hàng nghìn thuê bao dùng chung một IP công cộng. Ngưỡng này sẽ chặn nhầm người thật.
- **Sửa:** nới lên **20 lần / giờ / IP**. Rào chắn thật vẫn là email duy nhất + scrypt.
- **Hiện tại:** TC-35 xác nhận vẫn chặn được spam ✅

### L7 — Số điện thoại lọt qua ô username Messenger

- **Phát hiện:** TC-43 ở lượt trace đợt 2
- **Sai:** đặt app = Messenger trong khi handle đang là `0912345678` thì API trả **200**.
  Regex cũ `^[A-Za-z0-9.]{3,50}$` cho phép chuỗi toàn chữ số, nên `buildMessagingUrl`
  sinh ra `https://m.me/0912345678` — một link hỏng, mà người dùng lại tưởng đã cấu hình xong.
- **Vì sao dễ xảy ra:** người dùng đổi app nhắn tin nhưng quên đổi ô bên dưới —
  đúng kịch bản TC-43 mô phỏng.
- **Sửa:** siết regex thành `^[A-Za-z][A-Za-z0-9.]{4,49}$` — bắt buộc **bắt đầu bằng chữ cái**
  và tối thiểu 5 ký tự, đúng luật username của Facebook (Facebook cũng không cho username
  toàn chữ số). Cập nhật cả câu gợi ý ở API lẫn ở màn Cài đặt cho khớp.
- **Kiểm chứng:** thêm test `Messenger TỪ CHỐI số điện thoại` trong `messaging.spec.ts`
  (chặn `0912345678`, `+84912345678`, `9nguyenan`, `.nguyenan`, `an.b`).

---

## Đã kiểm thử tự động

```
packages/shared   50 test  ✅   (love, datetime, messaging, couple/user schema)
apps/api          19 test  ✅   (password scrypt, parseDuration, bearer token, invite code)
trace HTTP thật   53 case  ✅   (npm run trace:phase1)
typecheck         shared + api + web  ✅
```

## Còn thiếu / để lại cho Phase sau

- Chưa có E2E Playwright ở viewport 390×844 (Phase 2, khi đã có màn hình bản đồ).
- Chưa test hành vi khi PostGIS vắng mặt ở Phase 2 (máy dev hiện chưa cài PostGIS —
  Phase 1 không dùng tới nên không ảnh hưởng).
- Chưa test trường hợp mã mời **hết hạn** bằng đồng hồ thật (cần chờ 24h hoặc
  chèn dữ liệu trực tiếp) — logic đã có, sẽ bổ sung test khi tách được đồng hồ ra khỏi service.
- Chưa test khôi phục phiên phía web (`/auth/refresh` lúc mở app) bằng trình duyệt thật.

## Thay đổi cần ghi vào ARCHITECTURE.md

Có — đã cập nhật: §4 (scrypt thay bcrypt), §6 (`inviteConsumedAt`), §6.1 (atomic claim),
§7.1 (`POST /couples/me/invite`, `GET|PATCH /me`), §10 (ADR), §11.1 (dev bằng PostgreSQL
cài sẵn trên máy).
