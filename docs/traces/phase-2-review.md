# Trace: Phase 2 — Lượt rà soát lại

- **Ngày:** 2026-09-07
- **Lý do rà soát:** bộ trace Phase 2 gốc chạy khi **Redis đang tắt**, nên toàn bộ
  nhánh cache chưa từng được kiểm — mà đó lại chính là cấu hình production.
- **Kịch bản:** `apps/api/test/trace-phase2-review.mjs` — `npm run trace:review`
- **Chạy qua:** `https://localhost` (Caddy + Docker + PostGIS + Redis thật)

## Phạm vi rà soát

Nhắm đúng vào chỗ hai bộ trace trước không chạm tới:

| Nhóm | Nội dung |
|---|---|
| A | Cache Redis đối đầu với cài đặt quyền riêng tư |
| B | Biên đầu vào của `PATCH /me/privacy` |
| C | Biên đầu vào của điểm vị trí |
| D | Huỷ ghép đôi khi socket đang mở |
| E | Ghép đôi lại với người mới — dữ liệu cũ không được rò sang |

---

## Kết quả

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| RV-01 | Chua lam mo: Binh thay toa do chinh xac | lat khop, fuzzed=false | lat=10.776901 fuzzed=false | ✅ |
| RV-02 | BAT lam mo, KHONG gui diem moi -> cache khong duoc lo toa do that | fuzzed=true, toa do da bi bat vao luoi, accuracyM=500 | lat=10.775242544017248 fuzzed=true acc=500 | ✅ |
| RV-03 | BAT lam mo -> khoang cach cung phai lam tho ngay | distanceM null hoac boi so cua 500 | distanceM=null | ✅ |
| RV-04 | TAT lam mo, khong gui diem moi -> chinh xac tro lai ngay | lat khop lai, fuzzed=false | lat=10.776901 fuzzed=false | ✅ |
| RV-05 | BAT an danh, khong gui diem moi -> cache khong duoc tra ve gi | location=null va distanceM=null | location=null distanceM=null | ✅ |
| RV-06 | Ban kinh lam mo vuot tran (99999 > 5000) | 422 | 422 + VALIDATION_FAILED | ✅ |
| RV-07 | Ban kinh lam mo am | 422 | 422 + VALIDATION_FAILED | ✅ |
| RV-08 | PATCH /me/privacy voi body rong | 422 — khong co gi de cap nhat | 422 + VALIDATION_FAILED | ✅ |
| RV-09 | ghostMode khong phai boolean | 422 | 422 + VALIDATION_FAILED | ✅ |
| RV-10 | Sai so am | 422 | 422 | ✅ |
| RV-11 | Pin ngoai khoang 0-100 | 422 | 422 | ✅ |
| RV-12 | Huong ngoai khoang 0-360 | 422 | 422 | ✅ |
| RV-13 | Moc thoi gian = 0 | 422 | 422 | ✅ |
| RV-14 | Dong ho may cham 2 gio -> server kep ve toi da 5 phut | diem duoc luu voi moc khong qua 5 phut truoc | moc cach hien tai 300 giay | ✅ |
| RV-15 | limit vuot tran (99999 > 2000) | 422 | 422 | ✅ |
| RV-16 | Huy ghep doi khi socket dang mo -> lan gui tiep theo bi ngat | socket cua An bi ngat | huy=204 · An connected=false | ✅ |
| RV-17 | Sau khi huy ghep doi: doc vi tri doi phuong | 404 NOT_IN_COUPLE | 404 + NOT_IN_COUPLE | ✅ |
| RV-18 | Sau khi huy ghep doi: gui vi tri | 404 NOT_IN_COUPLE | 404 + NOT_IN_COUPLE | ✅ |
| RV-19 | Sau khi huy ghep doi: khong ket noi WebSocket duoc nua | bi tu choi hoac ngat ngay | error=false connected=false | ✅ |
| RV-20 | Ghep doi voi nguoi MOI: khong duoc thay lich su vi tri cu cua An | location=null (du lieu cu da bi xoa cung couple cu) | location=null | ✅ |
| RV-21 | Vet duong voi nguoi moi cung phai rong | points=[] | 0 diem | ✅ |

**Tổng: 21/21 ✅**

---

## Hai lỗi phát hiện được — cả hai đều là RÒ RỈ QUYỀN RIÊNG TƯ

Điểm chung: cả hai chỉ xuất hiện **khi Redis chạy**. Lượt trace Phase 2 đầu tiên chạy
lúc Redis tắt nên nhánh cache luôn trượt, mọi lời gọi đều rơi xuống Postgres — nơi
quyền riêng tư vẫn được áp đúng. Đưa lên production là lộ ngay.

### L14 — Bật "làm mờ vị trí" nhưng đối phương vẫn thấy toạ độ chính xác

- **Phát hiện:** RV-02
- **Kịch bản:** An gửi một điểm khi chưa bật làm mờ → cache lưu lại. An bật
  "làm mờ vị trí 500m" nhưng **không gửi điểm mới** (đang đứng yên, hoặc đã đóng app).
  Bình mở app → API đọc trúng cache → trả về **toạ độ chính xác**, `fuzzed: false`,
  `accuracyM: 8`.
- **Mức độ:** rò rỉ kéo dài tới **24 giờ** (TTL của cache). Người dùng bật một công tắc
  bảo vệ quyền riêng tư và tin rằng nó có tác dụng, trong khi thực tế không.
- **Nguyên nhân:** `cacheLast()` lưu payload **đã làm mờ sẵn** theo cài đặt tại thời
  điểm gửi; `getPartnerLatest()` đọc cache rồi trả nguyên xi, không áp lại cài đặt hiện
  tại. Nhánh đọc Postgres thì làm đúng — hai nhánh lệch nhau.
- **Sửa:** cache chỉ lưu **số liệu thô**, quyền riêng tư áp ở **đường ra**, dùng chung
  một hàm `applyPrivacy()` cho cả hai nhánh. Nhờ vậy cache và DB không thể lệch nữa.
- **Quy tắc rút ra:** *cache lưu sự thật, quyền riêng tư áp ở đường ra.*

### L15 — Người yêu mới thấy vị trí cuối cùng từ mối quan hệ trước

- **Phát hiện:** RV-20
- **Kịch bản:** An và Bình huỷ ghép đôi → An ghép đôi với Chi → Chi mở app và
  **thấy ngay vị trí cuối cùng của An từ hồi còn với Bình**.
- **Nguyên nhân:** huỷ ghép đôi xoá couple, Postgres xoá theo cascade toàn bộ
  `location_points` (RV-21 xác nhận vệt đường đã rỗng). Nhưng **Redis không biết gì về
  chuyện đó** và vẫn giữ khoá `loc:last:{userId}` thêm 24 giờ.
- **Mức độ:** "xoá toàn bộ dữ liệu chung" là lời hứa ghi thẳng trên nút Huỷ ghép đôi.
  Lời hứa đó đã bị vi phạm.
- **Sửa:** `CouplesService.unpair()` gọi `LocationsService.forgetCachedLocations()`
  cho cả hai thành viên ngay sau khi giao dịch xoá hoàn tất.
- **Quy tắc rút ra:** *xoá dữ liệu phải xoá ở MỌI nơi nó từng được nhân bản.*
  Cascade của Postgres không với tới được cache.

---

## Vì sao hai lỗi này lọt qua lượt trace trước

Không phải vì thiếu case, mà vì **môi trường trace khác môi trường production**.
Redis là thành phần tuỳ chọn và `RedisService` cố tình xuống cấp êm khi Redis chết —
nên khi máy dev không có Redis, mọi thứ vẫn xanh và không ai biết có một nhánh code
chưa từng chạy lần nào.

Đã sửa quy trình: `npm run verify:local` giờ chạy toàn bộ trace **qua Docker**, nơi
Redis luôn có mặt — đúng như production.

## Còn thiếu

- Chưa test hành vi khi Redis **chết giữa chừng** (đang chạy rồi mất kết nối).
- Chưa test hai instance API dùng chung một Redis (hiện chỉ chạy một instance).
- Job dọn lịch sử vị trí vẫn chưa test được trên dữ liệu quá 7/90 ngày.

## Đã ghi vào ARCHITECTURE.md

§6.2 bổ sung hai quy tắc mới, đánh số 4 và 5.
