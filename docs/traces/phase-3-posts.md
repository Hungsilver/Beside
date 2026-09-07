# Trace: Phase 3 — Check-in bằng ảnh & dòng kỷ niệm

- **Ngày:** 2026-09-07
- **Phạm vi:** `POST/GET/DELETE /posts`, `/posts/:id/react`, phát lại ảnh qua API,
  nén ảnh phía trình duyệt, xoá EXIF & xoay ảnh phía server, lưu tệp trên MinIO
- **File liên quan:**
  `apps/api/src/posts/{posts.controller.ts,posts.service.ts,image.processor.ts}`,
  `apps/api/src/common/storage/storage.service.ts`,
  `packages/shared/src/post.schema.ts`,
  `apps/web/src/lib/{posts-api.ts,image-compress.ts}`,
  `apps/web/src/components/AuthedImage.tsx`,
  `apps/web/src/screens/{CheckinScreen.tsx,FeedScreen.tsx}`
- **Cách chạy:** toàn bộ hạ tầng thật trong Docker (API + PostgreSQL 18/PostGIS +
  Redis + MinIO), đi qua Caddy HTTPS đúng như trình duyệt.
  `npm run trace:phase3` — 34 case. Ảnh test được **sinh tại chỗ bằng sharp**, có
  nhúng EXIF thật (toạ độ GPS + thẻ xoay 90°), không dùng ảnh mock.

## Dữ liệu giả định

| | |
|---|---|
| Couple A | An ❤ Bình (ghép đôi đầy đủ) |
| Couple B | Dũng ❤ Em — dùng để thử rò rỉ chéo cặp đôi |
| Ảnh chuẩn | JPEG 1200×800, EXIF `Orientation=6` (xoay 90°), GPS 10.7769/106.7009 |
| Ảnh nhỏ | JPEG 200×150 — kiểm tra không bị phóng to |
| Tệp giả ảnh | tệp văn bản đổi đuôi `.jpg` |
| Toạ độ ghim | 10.7769, 106.7009 · "Quán cà phê Quận 1" |
| Lời nhắn | "  Hoàng hôn Thủ Thiêm đẹp quá  " (thừa khoảng trắng) · dài 600 ký tự (vượt trần 500) |

---

## Kết quả

| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|---|
| P3-00 | **Tự kiểm tra đồ nghề:** ảnh test thật sự có thẻ xoay 90° và EXIF GPS | `orientation=6` và có trường `exif` | orientation=6 · có exif=true · 1200×800 | ✅ |
| P3-01 | **Happy path** — đăng một khoảnh khắc có ảnh | 201 + 1 ảnh + caption đã cắt khoảng trắng + mood | 201 · ảnh=1 · caption đã cắt · mood 🥰 | ✅ |
| P3-02 | Đối phương thấy được bài vừa đăng | có bài, đủ 3 link ảnh + ảnh đặt chỗ | bài=1 · thumb/md/orig=true · placeholder `data:image/webp;base64…` | ✅ |
| P3-03 | **Ảnh đã xoá sạch EXIF** (toạ độ GPS, model máy) | không còn trường exif nào trong ảnh trả về | format=webp · có exif=false · có gps=false | ✅ |
| P3-04 | **Ảnh đã được xoay** theo thẻ EXIF trước khi xoá metadata | ảnh 1200×800 có thẻ xoay 90° phải trả về 800×1200 | 800×1200 · kích thước trong DB 800×1200 | ✅ |
| P3-05 | Ba mức kích thước đều là WebP và nhỏ dần | thumb ≤ 320px, md ≤ 1080px, thumb nhẹ hơn md | thumb 213×320 (218 B) · md 720×1080 (1.476 B) | ✅ |
| P3-06 | Ảnh 200×150 nhỏ hơn mức đích | giữ nguyên, không phóng to | 200×150 | ✅ |
| P3-07 | Xem ảnh **không kèm token** | 401 — ảnh không phải "ai có link thì xem được" | 401 | ✅ |
| P3-08 | Ảnh được cache vĩnh viễn và riêng tư | `Cache-Control` có `private` và `immutable` | `private, max-age=31536000, immutable` | ✅ |
| P3-09 | Đăng bài không có ảnh nào | 400/422 | 400 + VALIDATION_FAILED | ✅ |
| P3-10 | Đăng 4 ảnh (trần là 3) | bị từ chối | 400 | ✅ |
| P3-11 | Tệp văn bản đổi đuôi thành `.jpg` | 400/422 — server đọc **nội dung thật**, không tin `mimetype` | 400 + "Không đọc được tệp này — có phải ảnh không?" | ✅ |
| P3-12 | Lời nhắn dài hơn 500 ký tự | 422 | 422 | ✅ |
| P3-13 | Emoji tâm trạng ngoài danh sách | 422 | 422 | ✅ |
| P3-14 | Check-in có ghim toạ độ | 201 + lưu đúng lat/lng/placeName | 201 · 10.7769,106.7009 · Quận 1 | ✅ |
| P3-15 | Lọc chỉ lấy bài có ghim toạ độ | chỉ trả về bài có lat/lng | 1 bài, tất cả đều có toạ độ | ✅ |
| P3-16 | **Ẩn danh:** check-in vẫn đăng được nhưng KHÔNG ghim toạ độ | bài được tạo, lat/lng = null | 201 · lat=null lng=null | ✅ |
| P3-17 | Bình thả tim lên bài của An | 200 + 1 cảm xúc | 200 · `❤️` của Bình | ✅ |
| P3-18 | Đổi sang emoji khác | mỗi người chỉ giữ **một** cảm xúc | vẫn 1 cảm xúc, đổi thành 🔥 | ✅ |
| P3-19 | Bấm lại đúng emoji đang chọn | bỏ thả cảm xúc | 0 | ✅ |
| P3-20 | Emoji ngoài danh sách cho phép | 422 | 422 | ✅ |
| P3-21 | Bình xoá bài của An | 403 — chỉ người đăng mới xoá được | 403 + FORBIDDEN | ✅ |
| P3-22 | Có `canDelete` để giao diện ẩn nút xoá đúng chỗ | An: true | true | ✅ |
| P3-23 | Với Bình thì bài của An có `canDelete=false` | false | false | ✅ |
| P3-24 | Xoá bài không tồn tại | 404 | 404 + NOT_FOUND | ✅ |
| P3-25 | Phân trang không lặp bài giữa hai trang | không bài nào xuất hiện ở cả hai trang | trang1=3 trang2=3 trùng=0 | ✅ |
| P3-26 | Có bài **mới chèn vào giữa lúc đang cuộn** | vẫn không lặp (lý do dùng con trỏ thay vì offset) | trùng=0 | ✅ |
| P3-27 | Con trỏ hỏng | 200 và trả về trang đầu, không phải lỗi | 200 · 7 bài | ✅ |
| P3-28 | Cặp đôi **khác** không thấy bài của An và Bình | 0 bài | 0 bài | ✅ |
| P3-29 | Người ngoài xoá bài của couple khác | 404 — không được lộ là id đó có thật | 404 + NOT_FOUND | ✅ |
| P3-30 | Người ngoài thả cảm xúc lên bài của couple khác | 404 | 404 | ✅ |
| P3-30b | Người ngoài **biết đúng URL ảnh** của couple khác | 404 — mỗi lượt xem ảnh đều kiểm tra quyền | 404 | ✅ |
| P3-31 | Xoá bài → tệp ảnh trong kho cũng bị xoá | trước 200, sau khi xoá không còn 200 | trước=200 · xoá=204 · sau=404 | ✅ |
| P3-32 | Bài đã biến mất khỏi dòng kỷ niệm | không còn trong danh sách | 0 bài trùng id | ✅ |

**Tổng: 34/34 ✅**

Chạy chung với toàn bộ hệ thống: `npm run verify:local` → **32/32 mục đạt**
(hạ tầng · HTTPS · 4 bộ trace = 137 case · typecheck · 140 unit test).

---

## Lỗi đã tìm ra và đã sửa trong lượt này

### L16 — URL ký sẵn của S3 không dùng được (sai ở kiến trúc, không phải cú pháp)

- **Phát hiện:** khi ghép ảnh vào giao diện.
- **Sai:** ban đầu API trả về **presigned URL** trỏ thẳng vào MinIO. Chữ ký SigV4
  **bao gồm cả hostname**, mà API ký bằng `http://minio:9000` — tên chỉ tồn tại
  trong mạng Docker. Trình duyệt không phân giải được tên đó, còn nếu đổi host thì
  chữ ký sai. Ngoài ra link ký sẵn là "ai có link thì xem được", trái với R3 (ảnh
  check-in là dữ liệu riêng tư của một cặp đôi).
- **Sửa:** bỏ hẳn presigned URL. API trả về **đường dẫn tương đối**
  `/api/v1/posts/photos/:id/:size` và tự đọc luồng từ MinIO, **kiểm tra quyền theo
  `coupleId` ở từng lượt xem**. Case P3-07 và P3-30b khoá hành vi này lại.
- **Hệ quả phía web:** thẻ `<img src>` không gửi được header `Authorization`, nên
  phải có `AuthedImage.tsx` — tải bằng `fetch` rồi đổi sang blob URL, kèm
  `IntersectionObserver` để chỉ tải ảnh sắp lọt vào màn hình và `revokeObjectURL`
  khi rời khỏi (không thì cuộn qua lại là rò bộ nhớ).

### L17 — Ảnh dựng đứng của iPhone bị nằm ngang **vĩnh viễn**

- **Sai:** nén ảnh phía trình duyệt bằng `createImageBitmap(file)` rồi vẽ ra canvas
  sẽ **bỏ qua thẻ xoay EXIF**. Ảnh gửi lên đã nằm ngang và không còn EXIF để server
  sửa — hỏng vĩnh viễn.
- **Sửa:** dùng `createImageBitmap(file, { imageOrientation: "from-image" })` trong
  `image-compress.ts`. Phía server, `image.processor.ts` gọi `.rotate()` **trước**
  `.resize()`, và không gọi `.withMetadata()` nên EXIF bị loại bỏ hoàn toàn.
  Case P3-04 kiểm 1200×800 phải ra 800×1200, P3-03 kiểm không còn EXIF/GPS.

### L18 — Đồ nghề test sai làm case P3-04 "hỏng" oan

- **Phát hiện:** P3-04 báo FAIL trong khi mã production đúng.
- **Sai:** ảnh test dựng bằng `.withExifMerge({ IFD0: { Orientation: "6" } })` —
  đọc lại thì orientation vẫn là 1, tức **ảnh test không hề có thẻ xoay**.
- **Sửa:** đổi sang `.withMetadata({ orientation, exif })`, **và** thêm case
  **P3-00** để bộ trace tự kiểm tra đồ nghề của chính nó trước khi kiểm sản phẩm.
  Bài học: khi một case báo lỗi, xác minh đồ nghề trước khi sửa mã production.

### L19 — Hạn mức ghép đôi làm case TC-26b báo hỏng oan (lỗi ở khâu kiểm thử)

- **Phát hiện:** lượt `verify:local` đầu tiên báo `TC-26b` FAIL, chạy riêng lại thì đạt.
- **Sai:** `POST /couples/join` giới hạn 10 lần/10 phút/IP, bộ đếm nằm **trong bộ
  nhớ tiến trình API**. Nếu tiến trình đã phục vụ trace trước đó, người thua cuộc
  đua ở TC-26 nhận `429 RATE_LIMITED` thay vì `409 COUPLE_FULL`.
- **Đã tái hiện đúng dấu hiệu:** nạp sẵn 9 lượt join hỏng rồi chạy cuộc đua →
  `[{status:200}, {status:429, code:"RATE_LIMITED"}]`, khớp chính xác triệu chứng
  (TC-26 đạt vì vẫn đúng 1 người thành công; TC-26b hỏng vì mã lỗi khác).
- **Sửa:** `verify-local.mjs` khởi động lại container `api` **trước mỗi bộ trace**
  để mỗi bộ luôn bắt đầu từ hạn mức đầy; đồng thời in kèm dòng "kỳ vọng / thực tế"
  dưới mỗi FAIL — trước đó chỉ in tên case nên không đủ dữ kiện để lần ra nguyên nhân.
- **Không phải lỗi sản phẩm:** logic atomic claim vẫn đúng — chạy 12 lượt đua liên
  tiếp trên tiến trình sạch luôn ra đúng `1 × 200 + 1 × 409 COUPLE_FULL`.

### L20 — Thu hồi nhầm blob của ảnh **đang hiển thị** (bắt được ở bước tự rà)

- **Sai:** `CheckinScreen` dọn blob preview bằng
  `useEffect(() => () => photos.forEach(revoke), [photos])`. React chạy hàm dọn dẹp
  của lượt trước **mỗi khi phụ thuộc đổi**, nên chọn tấm ảnh thứ hai sẽ thu hồi
  luôn blob URL của tấm thứ nhất — ảnh vẫn nằm trên màn hình nhưng nguồn đã bị huỷ.
- **Sửa:** giữ danh sách trong `useRef`, mảng phụ thuộc để rỗng → chỉ thu hồi đúng
  một lần khi rời màn hình. Bỏ ảnh lẻ vẫn thu hồi ngay trong `removePhoto`.
- **Ghi chú:** trace chạy bằng Node không bắt được lỗi này (không có `URL.createObjectURL`).
  Nó lộ ra ở **bước 1 của R1 — đọc lại code**, đúng mục "dọn dẹp" trong checklist.

### L21 — Dựng lại `IntersectionObserver` sau mỗi lần render

- **Sai:** `FeedScreen` để nguyên object `feed` của TanStack Query trong mảng phụ
  thuộc. Object này đổi danh tính sau mọi lần render, nên observer bị huỷ và dựng
  lại liên tục trong lúc cuộn.
- **Sửa:** tách ra `hasNextPage`, `isFetchingNextPage`, `fetchNextPage`, và không
  gắn observer khi đã hết trang. Cùng lúc, `AuthedImage` đặt lại `url = null` khi
  đổi ảnh để thẻ `img` không trỏ vào blob vừa bị thu hồi.

---

## Đã tự rà (checklist R1 bước 1)

- **Null/undefined:** `caption`, `mood`, `lat/lng`, `placeName`, `placeholder` đều
  nullable và được kiểm ở cả Zod lẫn lúc dựng giao diện.
- **Kiểu dữ liệu:** không có `any`; `lat/lng` từ `FormData` là chuỗi nên
  `createPostSchema` ép kiểu tường minh.
- **Biên:** 0 ảnh (P3-09), 4 ảnh (P3-10), caption rỗng và 600 ký tự (P3-12),
  ảnh nhỏ hơn mức đích (P3-06), ảnh 60 triệu điểm ảnh (chặn bằng `MAX_PIXELS`),
  con trỏ phân trang hỏng (P3-27).
- **Async:** upload nhiều ảnh chạy tuần tự để không nổ RAM; xoá bài xoá DB trước
  rồi mới xoá tệp — tệp mồ côi thì vô hại, còn bản ghi mồ côi thì hiện ảnh vỡ.
- **Lỗi mạng:** `CheckinScreen` chặn bấm Đăng hai lần bằng `createPost.isPending`;
  `AuthedImage` có trạng thái "Không tải được ảnh".
- **Quyền:** `posts.service.ts` lọc theo `coupleId` ở **tầng service** cho cả đọc,
  xoá, thả cảm xúc và **từng lượt xem ảnh** (P3-28 → P3-30b).
- **Múi giờ:** `createdAt` lưu UTC, `FeedScreen.formatWhen` đổi sang
  `Asia/Ho_Chi_Minh` khi hiển thị ngày tuyệt đối.
- **Dọn dẹp:** mục này **bắt được 2 lỗi** — xem L20 và L21. Sau khi sửa: mọi
  `URL.createObjectURL` đều có `revokeObjectURL` đúng thời điểm (bỏ ảnh lẻ → ngay;
  rời màn → một lần duy nhất; `AuthedImage` → khi đổi ảnh/unmount) và mọi
  `IntersectionObserver` đều `disconnect()`.
- **Rò rỉ dữ liệu:** ảnh bị xoá EXIF trước khi lưu; log không in toạ độ.

---

## Còn thiếu / để lại

- **Chưa bấm thử trên trình duyệt thật.** Chọn ảnh từ thư viện iPhone/Android và
  việc nén bằng canvas chỉ chạy trong trình duyệt — logic đã đúng trên giấy nhưng
  chưa có ai bấm.
- **Chưa có test Playwright ở 390×844** cho hai màn mới (đã ghi vào BACKLOG).
- **Chưa test ảnh 12 MB thật** từ máy ảnh điện thoại — mới test ảnh sinh bằng sharp.
  Đường nén phía trình duyệt (cạnh dài 2048px) chưa chạy trên ảnh HEIC của iPhone.
- **Chưa test mất mạng giữa chừng lúc upload** (case bắt buộc theo bảng R1 nhóm
  "Check-in ảnh") — cần chặn mạng ở tầng trình duyệt, không mô phỏng được bằng Node.
- **Chưa gắn ảnh check-in lên bản đồ.** Bài có toạ độ đã lưu đúng và lọc được
  (P3-14, P3-15) nhưng `MapScreen` chưa vẽ điểm ghim.

## Thay đổi đã ghi vào ARCHITECTURE.md

§4 (sharp, MinIO, multer), §6 (bảng `Post`, `Photo`, `Reaction`), §7.1 (`/posts/*`),
§9 (Phase 3 xong), §10 (ADR ảnh phát qua API thay vì URL ký sẵn; ADR nén hai lần —
trình duyệt rồi server).
