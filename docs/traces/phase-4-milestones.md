# Trace: Phase 4 (F5) — Mốc kỷ niệm

- **Ngày:** 2026-09-08
- **Phạm vi:** `/milestones/*`, mốc tự sinh từ ngày yêu & ngày sinh, mốc tự
  thêm, job nhắc mốc hằng ngày, màn Ngày yêu
- **File liên quan:**
  `packages/shared/src/milestone.schema.ts`,
  `apps/api/src/milestones/{milestones.service.ts,milestones.controller.ts,milestone-reminder.job.ts}`,
  `apps/api/prisma/migrations/20260908040000_milestone_yearly/`,
  `apps/web/src/lib/milestones-api.ts`, `apps/web/src/screens/MilestonesScreen.tsx`
- **Cách chạy:** `npm run trace:milestones` — 25 case, qua Caddy HTTPS.
  Kèm **26 unit test** cho hàm thuần `buildUpcomingMilestones`.

## Chia việc giữa unit test và trace

Toàn bộ phép tính ngày tháng nằm trong **một hàm thuần**
`buildUpcomingMilestones(source, now)` ở `packages/shared`. Nó nhận `now` làm
tham số nên mọi biên khó — năm nhuận, đúng hôm nay, mốc đã qua — kiểm được
bằng unit test, **không cần chờ thật** như bộ trace hàng rào (F6).

Bộ trace lo phần còn lại: API ghép đúng dữ liệu thật từ DB chưa, quyền theo cặp
đôi có chặt không.

## Hai loại mốc

| | Nguồn | Có `id`? |
|---|---|---|
| **Tự sinh** | tính từ ngày yêu và ngày sinh trong hồ sơ — mốc ngày (100/365/1000…), kỷ niệm hằng năm, sinh nhật hai người | `null` — không sửa/xoá được |
| **Tự thêm** | người dùng gõ vào, lưu ở bảng `milestones` | có |

Mốc tự thêm mặc định **lặp hằng năm**. Đặt `yearly: false` cho việc chỉ xảy ra
một lần — qua rồi thì biến mất khỏi danh sách "sắp tới".

Ngày ở đây là **ngày trôi nổi** (§6.3), cùng quy ước với sự kiện cả ngày trên
lịch: "kỷ niệm 11/11" là một ô trên tờ lịch, không phải một khoảnh khắc.

## Dữ liệu giả định

| | |
|---|---|
| Couple A | An ❤ Bình, yêu từ 14/02/2023 |
| Couple B | Dũng ❤ Em, yêu từ 01/01/2024 — thử rò rỉ chéo |
| Sinh nhật | đặt vào **đúng 5 ngày nữa** tính từ hôm chạy trace (không hardcode ngày, để trace chạy được vào bất kỳ hôm nào) |
| Mốc tự thêm | "Ngày cưới" +10 ngày · "Đám cưới bạn" −30 ngày một lần · "Lần đầu gặp nhau" −30 ngày hằng năm · "Hôm nay luôn" · **29/02/2024** |
| Dữ liệu bẩn | tên rỗng, ngày `11/11/2025`, id không phải UUID, 31 mốc |

---

## Kết quả

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| MS-01 | Danh sách tính được ngay khi vừa ghép đôi | 200 + có AUTO_DAYS và ANNIVERSARY, không cần thêm gì | đúng | ✅ |
| MS-02 | Sắp xếp | tăng dần theo `daysLeft` | đã sắp xếp | ✅ |
| MS-03 | Mốc tự sinh **không có id** | `id = null` — giao diện phải ẩn nút sửa | tất cả null | ✅ |
| MS-04 | Chưa ai nhập ngày sinh | không có mốc BIRTHDAY, và không lỗi | 0 mốc | ✅ |
| MS-05 | **Nhập ngày sinh xong thì mốc sinh nhật xuất hiện ngay** *(đối chứng cho MS-04)* | "Sinh nhật Binh" · còn 5 ngày · có số tuổi | đúng | ✅ |
| MS-06 | **Happy path** — thêm một mốc riêng | 201 + trả về **cả danh sách mới** + tên đã cắt khoảng trắng + còn 10 ngày | đúng | ✅ |
| MS-07 | Đối phương thấy được mốc vừa thêm | có — mốc là của **cả cặp đôi** | thấy | ✅ |
| MS-08 | Mốc tự thêm **có id** | khác null | có | ✅ |
| MS-09 | Mốc **một lần** đã qua 30 ngày | lưu được nhưng **không** hiện trong danh sách sắp tới | không hiện | ✅ |
| MS-10 | **Mốc hằng năm** đã qua 30 ngày *(đối chứng cho MS-09)* | hiện lại với lần tới là năm sau (~335 ngày) | đúng | ✅ |
| MS-11 | Mốc rơi **đúng hôm nay** | `daysLeft = 0` và **vẫn** nằm trong danh sách | 0 | ✅ |
| MS-12 | **Năm nhuận** — mốc 29/02 lặp hằng năm | lần tới rơi vào 02-29 (năm nhuận) hoặc 02-28 (năm thường), **tuyệt đối không** trôi sang 03-01 | đúng | ✅ |
| MS-13 | Bình sửa mốc do An thêm | 200 — mốc là của **chung**, ai cũng sửa được | 200 | ✅ |
| MS-14 | Sửa thành tên rỗng | 422 | 422 | ✅ |
| MS-15 | Ngày sai định dạng (`11/11/2025`) | 422 | 422 | ✅ |
| MS-16 | Xoá mốc tự thêm | 204 và biến mất khỏi danh sách | đúng | ✅ |
| MS-17 | Xoá mốc không tồn tại | 404 | 404 | ✅ |
| MS-18 | Id không phải UUID | 400 — chặn ở pipe, không đâm vào DB | 400 | ✅ |
| MS-19 | Cặp đôi **khác** không thấy mốc riêng của An và Bình | không rò rỉ | không | ✅ |
| MS-20 | Người ngoài xoá mốc của couple khác | 404 — không lộ là id đó có thật | 404 | ✅ |
| MS-21 | Người ngoài sửa mốc của couple khác | 404 | 404 | ✅ |
| MS-22 | Couple mới có mốc tự sinh **của riêng họ** | tính từ ngày yêu 01/01/2024 của họ | có | ✅ |
| MS-23 | Xem mốc không kèm token | 401 | 401 | ✅ |
| MS-24 | Người chưa ghép đôi xem mốc | 404 + NOT_IN_COUPLE | đúng | ✅ |
| MS-25 | Thêm quá trần 30 mốc tự thêm | 400 | 400 | ✅ |

**Tổng: 25/25 ✅**

### Chống "xanh giả" — bài học từ L27

Sau ba lần dính (L18, L25, L27), lần này mọi case kỳ vọng **"không xuất hiện"**
đều được ghép với một case đối chứng chỉ khác đúng một biến:

| Case "không xuất hiện" | Đối chứng | Khác nhau ở |
|---|---|---|
| MS-04 chưa nhập ngày sinh → không có mốc | MS-05 nhập xong → có ngay | có/không ngày sinh |
| MS-09 mốc một lần đã qua → biến mất | MS-10 mốc hằng năm cùng ngày → hiện lại | `yearly` |

Không có đối chứng, một case xanh có thể chỉ đang chứng minh "API hỏng nên
chẳng trả về gì".

### Unit test — 26 test

`packages/shared/src/milestone.schema.spec.ts`:

| Nhóm | Điểm đáng chú ý |
|---|---|
| `nextYearlyOccurrence` | **29/02 kẹp về 28/02** trong năm thường (không kẹp thì `Date` trôi sang 01/03); **đúng hôm nay vẫn tính là lần tới** chứ không nhảy sang năm sau; ngày 31 của tháng 30 ngày |
| Mốc ngày | rơi đúng ngày `daysTogether === mốc`; `daysLeft = 0` vẫn còn trong danh sách; đã qua thì biến mất; vượt bảng dựng sẵn thì tiếp tục bằng bội số 500 |
| Kỷ niệm năm | **không gọi ngày bắt đầu là "kỷ niệm 0 năm"** |
| Sinh nhật | tính đúng số tuổi sẽ tròn; người chưa nhập ngày sinh thì bỏ qua, không lỗi |
| Mốc tự thêm | một lần đã qua → biến mất; hằng năm → luôn có lần tới |

Thêm **17 unit test** cho `MilestoneReminderJob` (`milestone-reminder.job.spec.ts`):
gửi ở đúng bốn nấc 7/3/1/0 ngày và **không** gửi ở bảy nấc khác, câu chữ riêng
cho từng nấc, gộp theo tag `milestone:<tên>:<ngày>`, một couple hỏng dữ liệu
không chặn couple khác, và chỉ tính danh sách **một lần** cho mỗi couple (mốc là
của chung, tính hai lần là tốn gấp đôi).

Toàn hệ thống: `npm run verify:local` → **36/36 mục đạt**
(8 bộ trace = 247 case · 270 unit test · typecheck + lint sạch).

---

## Không có lỗi mới trong lượt này

Lần đầu tiên trong dự án, một feature chạy đúng ngay từ lượt trace đầu — 25/25
và 26/26 unit test đều xanh ngay. Lý do khá rõ và đáng ghi lại:

**Toàn bộ phần khó được tách thành một hàm thuần trước khi viết API.**
`buildUpcomingMilestones(source, now)` không đụng DB, không đọc đồng hồ. Tôi viết
26 unit test cho nó — bao gồm hai case năm nhuận và case "đúng hôm nay" — rồi
mới nối vào service. Đến lúc chạy trace thì phần dễ sai nhất đã được kiểm xong.

So sánh: F6 (hàng rào) có logic nằm lẫn trong service, phải chờ thật 65 giây mỗi
lần kiểm, và dính ba lỗi ở khâu kiểm thử. Cùng độ khó về ngày tháng, khác nhau ở
chỗ đặt ranh giới hàm thuần.

---

## Đã tự rà (checklist R1 bước 1)

- **Null/undefined:** `birthday` nullable (chưa ai bắt buộc nhập);
  `MilestoneItem.id` null cho mốc tự sinh; `subtitle` nullable.
- **Kiểu dữ liệu:** không có `any`; `MilestoneKind` của Prisma và của shared
  được phân biệt tường minh khi import.
- **Biên:** 29/02, ngày 31 của tháng 30 ngày, `daysLeft = 0`, mốc đã qua, vượt
  bảng mốc dựng sẵn, trần 30 mốc, nhìn trước tối đa 400 ngày.
- **Async:** ghi/sửa trả về **cả danh sách mới** nên client không cần gọi thêm
  một vòng; không có race giữa hai lần bấm.
- **Lỗi mạng:** màn Ngày yêu có nhánh `isError` riêng.
- **Quyền:** lọc theo `coupleId` ở tầng service; mốc của couple khác trả **404**
  chứ không 403 (403 tự nó đã tiết lộ id có thật).
- **Múi giờ:** ngày trôi nổi, đọc theo UTC ở cả server lẫn web — cùng quy ước
  §6.3. `todayVn()` trong bộ trace dùng `Intl` với `Asia/Ho_Chi_Minh` nên trace
  chạy đúng ở bất kỳ múi giờ nào.
- **Dọn dẹp:** không có timer hay listener nào trong màn này.
- **Rò rỉ dữ liệu:** log không in tên mốc.

---

## Còn thiếu / để lại

- **Chưa nhắc mốc qua một mốc thời gian thật.** `MilestoneReminderJob` đã có
  **17 unit test** (bốn nấc được nhắc, bảy nấc không được nhắc, gộp theo tag,
  một couple hỏng không chặn couple khác, chỉ tính danh sách một lần cho mỗi
  couple), nhưng chưa ai chờ tới 08:00 giờ VN thật để xem nó chạy — giống nợ
  của F4.
- **Chưa cho chọn mốc nào muốn được nhắc.** Hiện mọi mốc đều nhắc như nhau.
- **Chưa có ảnh cho mốc.** Một mốc kỷ niệm mà gắn được tấm ảnh của ngày hôm đó
  thì hay hơn nhiều — dữ liệu đã có sẵn ở `posts`.
- Mốc tự sinh không tắt được: ai không muốn thấy "1460 ngày bên nhau" thì đành chịu.

## Thay đổi đã ghi vào ARCHITECTURE.md

§6 (`Milestone.yearly`, `Milestone.createdAt`), §7.1 (`/milestones/*`),
§9 (F5 xong — Phase 4 hoàn tất phần tính năng), §10 (ADR mốc tự sinh không lưu
DB; ADR ghi/sửa trả về cả danh sách; ADR nhắc mốc mỗi ngày 08:00 thay vì mỗi phút).
