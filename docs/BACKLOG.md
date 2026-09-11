# BACKLOG — ý tưởng & việc phát sinh

Nơi ghi lại những thứ nghĩ ra trong lúc làm nhưng **không** thuộc phạm vi việc đang làm.
Không tự ý làm những việc ở đây khi chưa được duyệt.

## Đã chốt (07/09/2026)

- [x] Tên app: **Beside**
- [x] Domain: `easytech.io.vn` (tạm) → sau đổi sang domain `beside`. Mọi URL đọc từ ENV.
- [x] Không làm chat trong app — chỉ nút deep-link Zalo / Messenger / gọi điện
- [x] Tab bar 5 khe: Nhà · Bản đồ · [＋] · Lịch · Kỷ niệm
- [x] Bảng màu hồng–tím giữ nguyên

## Đã chốt (07/09/2026 — đợt 2)

- [x] **Chủ dự án tự deploy lên VPS** → không cần IP/SSH. Hướng dẫn ở `docs/DEPLOY.md`
- [x] Tài khoản demo chỉ tạo bằng `npm run seed:demo` ở máy dev, không nằm trong code
- [x] **Không seed dữ liệu cá nhân trong code.** Tên, ngày sinh, ngày kỷ niệm, số Zalo…
      do hai người tự nhập trong app → đã làm màn hình `/cai-dat` + `GET|PATCH /me`
- [x] Dev dùng PostgreSQL cài sẵn trên máy (cổng 5432), Docker chỉ dùng lúc build/deploy
- [x] **Đã cài PostGIS 3.6.2** vào PostgreSQL 18 trên máy dev → Phase 2 không còn bị chặn

## Cần quyết định (chờ chủ dự án)

- [ ] Có cần bản Android APK (Phase 6) để tracking nền 24/7 không?
- [ ] Có muốn đổi ảnh đại diện (avatar) không? Hiện chỉ hiện chữ cái đầu của tên.
      MinIO và đường xử lý ảnh đã có sẵn từ Phase 3 nên giờ chỉ là việc nhỏ

## Ý tưởng chưa xếp lịch

- [ ] Chế độ "Cùng nghe nhạc" — đồng bộ 1 playlist
- [ ] Widget iOS qua Shortcuts (chỉ hiện số ngày yêu)
- [ ] Xuất album kỷ niệm ra PDF theo năm
- [ ] "Hộp thư tương lai" — viết thư hẹn mở vào ngày kỷ niệm
- [ ] Heatmap những nơi hai đứa hay đi
- [ ] SOS: giữ nút 3 giây → gửi vị trí + báo động cho đối phương
- [ ] Chế độ du lịch: giảm tần suất GPS khi roaming để tiết kiệm data

## Đã chốt (07/09/2026 — đợt 3)

- [x] **Toàn bộ stack đã chạy thật trên Docker** (db · redis · api · web · caddy), 5/5 healthy
- [x] Caddy cấp HTTPS bằng CA nội bộ cho `localhost` → thử được Geolocation trên máy dev
- [x] API tự chạy `prisma migrate deploy` khi khởi động — đã kiểm chứng
- [x] **Redis đã được test thật** — trace Phase 2 chạy lại trên Docker, có key `loc:last:*`
- [x] Trace lại trên Docker: Phase 1 53/53, Phase 2 29/29
- [x] **WebSocket đã kiểm chứng chạy xuyên Caddy HTTPS** — 29/29 qua `https://localhost`
      (lần đầu tưởng lỗi Caddy, hoá ra thư viện `ws` trong kịch bản test không nhận
      chứng chỉ tự ký; đã thêm cờ `TRACE_INSECURE_TLS=1`)

## Đã chốt (07/09/2026 — đợt 4, Phase 3)

- [x] **Ảnh phát qua API, không dùng URL ký sẵn của S3** — chữ ký SigV4 gắn với
      hostname nội bộ Docker, và link ký sẵn không kiểm tra được quyền theo cặp đôi
- [x] Nén ảnh **hai lần**: trình duyệt (2048px) để tiết kiệm data, server (3 cỡ WebP)
      làm chốt chặn thật
- [x] Cảm xúc lưu trong cột `Json` của `Post` — mỗi couple chỉ 2 người nên không tách bảng
- [x] Phân trang bằng **con trỏ** `(createdAt, id)` thay vì offset
- [x] `verify:local` khởi động lại API trước **mỗi** bộ trace (bộ đếm chống spam nằm
      trong bộ nhớ tiến trình, chạy nối tiếp làm case sau báo hỏng oan — xem L19)

## Đã chốt (08/09/2026 — Phase 4, F4 Lịch trình)

- [x] **Sự kiện cả ngày dùng "ngày trôi nổi"** (00:00 UTC, đọc theo UTC) —
      tách hẳn khỏi mốc thời gian thật. Xem ARCHITECTURE §6.3
- [x] Sự kiện **chung** thì cả hai đều thấy, chỉ người tạo mới sửa/xoá
- [x] Việc riêng của người kia trả **404** chứ không phải 403
- [x] Truy vấn lịch dùng điều kiện **giao khoảng**, không lọc theo mỗi `startAt`
- [x] Thêm migration bật PostGIS chạy đầu tiên, để shadow DB replay được

## Đã chốt (08/09/2026 — Phase 4, F7 Thông báo đẩy)

- [x] Dùng **`web-push` + VAPID** trực tiếp, không qua Firebase hay dịch vụ bên thứ ba
- [x] Khoá công khai trả qua `GET /push/public-key`, **không nhúng lúc build**
- [x] Service worker chuyển sang **`injectManifest`** để tự viết được handler `push`
- [x] Nhắc lịch bằng **vòng quét mỗi phút**, đánh dấu `reminderSentAt` TRƯỚC khi gửi
- [x] Thiếu khoá VAPID = tắt tính năng (app vẫn chạy); khai báo nửa vời = từ chối boot
- [x] Đăng ký đẩy trùng endpoint thì **chuyển chủ** — chống việc hai người dùng
      chung một máy nhận thông báo của nhau

## Đã chốt (08/09/2026 — Phase 4, F6 Địa điểm & Geofence)

- [x] Geofence chạy ở **server** (lớp L3), không tốn pin máy người dùng
- [x] **Ba chốt chặn** chống báo sai: sai số GPS · khoảng chênh 30m · ở đủ 60 giây
- [x] Trạng thái để ở bảng riêng `GeofenceState`, không suy từ sự kiện gần nhất
- [x] Địa điểm là của **cả cặp đôi** — khác sự kiện trên lịch (chỉ người tạo mới sửa)
- [x] Làm mờ vị trí rộng hơn hàng rào ⇒ vẫn ghi cho chính chủ nhưng **không báo** cho người kia
- [x] Dùng lại hằng số Phase 0 (`GEOFENCE_EXIT_HYSTERESIS_M`, `PLACE_RADIUS_*`)

## Đã chốt (08/09/2026 — Phase 4, F5 Mốc kỷ niệm)

- [x] Mốc **tự sinh** (mốc ngày, kỷ niệm năm, sinh nhật) không lưu DB — tính lúc đọc
- [x] Mốc **tự thêm** mặc định lặp hằng năm; `yearly: false` cho việc chỉ xảy ra một lần
- [x] Ghi/sửa trả về **cả danh sách mới** đã sắp xếp
- [x] Nhắc mốc **mỗi ngày 08:00 giờ VN**, ở các nấc còn 7/3/1/0 ngày
- [x] Cách làm đã chứng minh hiệu quả: **tách hàm thuần + unit test trước, nối API sau**
      → F5 chạy đúng ngay lượt trace đầu, không lỗi nào

## Đã chốt (08/09/2026 — đợt 5)

- [x] **Chỉ làm giao diện mobile.** Giao diện PC (breakpoint `lg:`, thanh điều
      hướng dọc) chỉ làm khi chủ dự án yêu cầu. Phần đã làm thử đã được gỡ bỏ.
- [x] `socket.io-client` nạp động — gói tải đầu 364 → 323 KB

## Nợ kỹ thuật (ghi khi phát sinh)

| Ngày | Mô tả | Mức độ | File |
|---|---|---|---|
| 07/09 | Chưa test hành vi khi **Redis chết giữa chừng** (đang chạy rồi mất kết nối). Đã test nhánh "không có Redis từ đầu" và nhánh "có Redis", chưa test lúc chuyển trạng thái | Trung bình | `apps/api/src/common/redis/redis.service.ts` |
| 07/09 | Chưa test hai instance API dùng chung một Redis — hạn mức và cache lúc đó mới thật sự cần Redis | Thấp (đang chạy 1 instance) | `apps/api/src/locations/` |
| 07/09 | Icon PWA đang là hình trái tim sinh bằng script, cần bộ icon thật | Thấp | `apps/web/public/icons/` |
| ~~07/09~~ | ~~Chưa có E2E Playwright ở 390×844; render React chưa được test~~ → **ĐÃ SỬA** 08/09: 6 màn đều có test dựng được nội dung thật và không lỗi JS | ~~Trung bình~~ | — |
| 07/09 | Chưa test job dọn lịch sử vị trí trên dữ liệu quá 7/90 ngày (cần tách đồng hồ ra khỏi service) | Trung bình | `apps/api/src/locations/location-retention.job.ts` |
| 07/09 | Chưa test kịch bản rớt mạng giữa chuyến đi rồi nối lại | Trung bình | `apps/web/src/lib/realtime.tsx` |
| 07/09 | `watchPosition` / Wake Lock / MapLibre chỉ chạy được trong trình duyệt thật — phần ghép nối giao diện chưa được bấm thử. Đã có `https://localhost` nên thử được | Cao | `apps/web/src/lib/use-live-location.ts` |
| 07/09 | **Chưa thử được trên điện thoại thật qua LAN**: chứng chỉ Caddy chỉ cấp cho `localhost`, điện thoại vào `https://192.168.x.x` sẽ lỗi TLS. Cách làm: deploy lên VPS, hoặc dùng tunnel (ngrok/cloudflared) | Trung bình | `docker-compose.local.yml` |
| 07/09 | Chưa test được mã mời **hết hạn** (cần tách đồng hồ ra khỏi service để giả lập thời gian) | Trung bình | `apps/api/src/couples/couples.service.ts` |
| 07/09 | Luồng đăng ký → ghép đôi → cài đặt chưa bấm thử trên trình duyệt thật (đã test đầy đủ qua API: 53 case) | Trung bình | `apps/web/src/screens/` |
| 07/09 | Ảnh check-in **chưa hiện lên bản đồ**. Toạ độ đã lưu đúng và lọc được (`filter=pinned`), chỉ còn thiếu phần vẽ điểm ghim | Trung bình | `apps/web/src/screens/MapScreen.tsx` |
| 07/09 | Chưa test **ảnh 12MB thật từ điện thoại** và ảnh HEIC của iPhone — mới test ảnh sinh bằng sharp | Cao | `apps/web/src/lib/image-compress.ts` |
| 07/09 | Chưa test **mất mạng giữa chừng lúc upload** (case bắt buộc của R1 nhóm check-in ảnh) — cần chặn mạng ở tầng trình duyệt | Trung bình | `apps/web/src/screens/CheckinScreen.tsx` |
| 07/09 | Xoá bài xoá bản ghi DB trước, xoá tệp MinIO sau. Nếu tiến trình chết ở giữa thì còn **tệp mồ côi** trong kho — vô hại nhưng tốn chỗ, chưa có job dọn | Thấp | `apps/api/src/posts/posts.service.ts` |
| 07/09 | Chưa có E2E Playwright cho hai màn mới `/check-in` và `/ky-niem` ở 390×844 | Trung bình | `apps/web/src/screens/` |
| 08/09 | **`prisma migrate dev` vẫn không chạy được** dù đã thêm migration bật PostGIS và đã kiểm chứng cả 6 migration replay sạch vào DB trắng. Đang đi đường vòng: `migrate diff` → viết tay thư mục migration → `migrate deploy`. Cần tìm ra nguyên nhân thật | Trung bình | `apps/api/prisma/migrations/` |
| 08/09 | **Chuỗi hiển thị vẫn nằm rải rác trong component**, chưa gom về `src/i18n/vi.ts` như CLAUDE.md R2 yêu cầu. Lệch từ Phase 1, mỗi phase lại thêm — càng để lâu càng khó gom | Trung bình | `apps/web/src/` |
| 08/09 | Nhắc lịch chưa chạy: `remindMinBefore` đã lưu và chọn được nhưng chưa có job gửi thông báo (cần Web Push trước) | Cao | `apps/api/src/events/` |
| 08/09 | Chưa gắn được địa điểm vào sự kiện — `placeId` đã có và đã kiểm quyền, nhưng chưa có màn quản lý Địa điểm (F6) | Trung bình | `apps/web/src/screens/CalendarScreen.tsx` |
| 08/09 | Lịch mới có chế độ xem tháng + danh sách theo ngày; chưa có xem tuần / xem danh sách dài | Thấp | `apps/web/src/screens/CalendarScreen.tsx` |
| 08/09 | `<input type="date">` và `type="time"` hiển thị rất khác nhau giữa iOS Safari và Chrome Android — chưa bấm thử trên máy thật | Cao | `apps/web/src/components/EventSheet.tsx` |
| 08/09 | **Chưa bấm thử thông báo trên máy thật.** Trace và unit test phủ hết phần server, nhưng "thông báo có hiện lên khay hay không" thì chỉ bấm tay mới biết. Trên iPhone phải cài lên màn hình chính trước | Cao | `apps/web/src/sw.ts` |
| 08/09 | Chưa có màn quản lý thiết bị nhận thông báo — API `/push/devices` đã có nhưng giao diện mới chỉ bật/tắt cho máy hiện tại | Thấp | `apps/web/src/screens/SettingsScreen.tsx` |
| 08/09 | Chưa tách được từng loại thông báo (nhắc lịch / check-in / geofence) — hiện bật là nhận hết | Trung bình | `apps/api/src/push/` |
| 08/09 | Job nhắc lịch chưa chạy thật qua một mốc thời gian thật, mới kiểm bằng unit test với đồng hồ giả | Trung bình | `apps/api/src/events/event-reminder.job.ts` |
| 08/09 | `PARTNER_ARRIVED` / `PARTNER_LEFT` đã khai báo trong `PUSH_KINDS` nhưng chưa có nơi nào gửi — chờ F6 Geofence | Trung bình | `packages/shared/src/push.schema.ts` |
| ~~08/09~~ | ~~Chưa chọn được địa điểm trên bản đồ~~ → **ĐÃ SỬA**: `PlacePicker`, chạm để đặt ghim, xem trước vòng hàng rào. E2E-10 | ~~Cao~~ | — |
| ~~08/09~~ | ~~Hàng rào và ghim địa điểm chưa vẽ lên `MapScreen`~~ → **ĐÃ SỬA**: đa giác theo bán kính thật. E2E-08 | ~~Trung bình~~ | — |
| 08/09 | Bảng `geofence_events` ghi đầy đủ nhưng **chưa có API đọc** — chưa hiện được "hôm nay người ấy tới những đâu" | Trung bình | `apps/api/src/places/` |
| 08/09 | Chưa có case hai người cùng ở trong một hàng rào (logic tách theo `userId` nên về lý là đúng) | Thấp | `apps/api/test/trace-phase4-places.mjs` |
| 08/09 | Geofence dùng `haversineMeters` trong RAM, chưa dùng `ST_DWithin` của PostGIS — đủ cho 20 địa điểm, cần đổi nếu tăng nhiều | Thấp | `apps/api/src/places/geofence.service.ts` |
| 08/09 | `npm run verify:local` giờ mất ~2,5 phút chỉ riêng bộ trace địa điểm (phải chờ thật 2×65 giây vì ngưỡng "ở đủ lâu") | Thấp | `apps/api/test/trace-phase4-places.mjs` |
| 08/09 | Job nhắc mốc có 17 unit test nhưng **chưa ai chờ tới 08:00 giờ VN thật** để xem nó chạy (giống nợ của job nhắc lịch) | Trung bình | `apps/api/src/milestones/milestone-reminder.job.ts` |
| 08/09 | **Chưa cho chọn mốc nào muốn được nhắc** — hiện mọi mốc đều nhắc như nhau | Thấp | `apps/api/src/milestones/` |
| 08/09 | Mốc tự sinh **không tắt được** — ai không muốn thấy "1460 ngày bên nhau" thì đành chịu | Thấp | `packages/shared/src/milestone.schema.ts` |
| 08/09 | Chưa gắn được ảnh cho mốc kỷ niệm — dữ liệu đã có sẵn ở `posts`, chỉ thiếu phần nối | Thấp | `apps/web/src/screens/MilestonesScreen.tsx` |
| ~~08/09~~ | ~~`npm run lint` không kiểm gì cả~~ → **ĐÃ SỬA** cùng ngày: dựng ESLint thật ở `eslint.config.mjs`, tìm ra 27 lỗi, đã sửa hết. Xem `docs/traces/fix-lint-khong-chay.md` | ~~Cao~~ | — |
| ~~08/09~~ | ~~Lỗi khung bản đồ 0px không test nào bắt được~~ → **ĐÃ SỬA**: E2E Playwright 390×844, 12 test, đã kiểm chứng là đỏ được với bản có lỗi. Xem `docs/traces/e2e-trinh-duyet-that.md` | ~~Cao~~ | — |
| 08/09 | Hai cảnh báo `react-refresh/only-export-components` (`auth-context.tsx`, `realtime.tsx` vừa xuất component vừa xuất hook) — chỉ ảnh hưởng tốc độ hot-reload lúc dev | Thấp | `apps/web/src/lib/` |
| 08/09 | **Chưa có Prettier** — định dạng code dựa vào thói quen, không có công cụ chốt lại | Thấp | gốc dự án |
| 08/09 | **Chưa có CI** — `verify:local` là chốt chặn duy nhất và phải chạy bằng tay. Một lần quên là một lần lọt | Trung bình | gốc dự án |
| 08/09 | E2E chạy trên **Chromium**, chưa chạy WebKit/Safari — những thứ riêng của iOS (Web Push, `<input type="date">`, thanh địa chỉ co giãn) vẫn phải bấm tay | Trung bình | `apps/web/playwright.config.ts` |
| 08/09 | E2E mới chỉ **mở màn và đo**, chưa test luồng có tương tác (đăng ảnh, tạo sự kiện) — mỗi luồng cần dọn dữ liệu sau đó | Trung bình | `apps/web/e2e/app.spec.ts` |
| 08/09 | Chưa test được **hai người cùng lúc** nhìn thấy nhau di chuyển: cần hai context song song, mà điều đó đụng đúng cơ chế xoay vòng refresh token | Trung bình | `apps/web/e2e/` |
| 08/09 | Bấm ghim ảnh trên bản đồ mới **đưa sang màn Kỷ niệm**, chưa mở ảnh tại chỗ | Thấp | `apps/web/src/screens/MapScreen.tsx` |
| 08/09 | Chưa lọc ghim ảnh theo thời gian — đang lấy 40 bài mới nhất có toạ độ | Thấp | `apps/web/src/screens/MapScreen.tsx` |
| 08/09 | Chưa chỉnh được bán kính ngay trên bản đồ lúc chọn chỗ, nên không thấy trước hàng rào rộng cỡ nào so với đường thật | Trung bình | `apps/web/src/components/PlacePicker.tsx` |
| 08/09 | **Chưa đo hiệu năng trên mạng chậm thật** — con số 41 KB tiết kiệm được là đo tĩnh trên bản build, chưa ai mở app bằng 3G thật | Trung bình | `apps/web/` |
| 08/09 | Gói chính còn 323 KB (gzip 99 KB); chưa phân tích chi tiết React / TanStack Query / Zod đóng góp bao nhiêu | Thấp | `apps/web/vite.config.ts` |
| 08/09 | **Giao diện PC chưa làm** (chủ dự án hoãn) — màn hình rộng vẫn hiện cột 430px ở giữa | Chờ yêu cầu | `apps/web/src/components/ui.tsx` |
| 08/09 | **PWA offline mức 2 chưa làm được** — mất mạng vẫn ra màn đăng nhập vì khôi phục phiên cần gọi mạng. Cần chủ dự án quyết định về đánh đổi bảo mật (xem `docs/traces/phase-5-pwa-offline.md` §4) | Chờ quyết định | `apps/web/src/lib/auth-context.tsx` |
| 08/09 | Chưa có màn báo "đang xem bản offline" — người dùng không biết dữ liệu đang thấy là cũ hay mới | Trung bình | `apps/web/src/` |
| 08/09 | `registerType: 'prompt'` nhưng **chưa có giao diện hỏi** người dùng có muốn cập nhật bản mới không | Trung bình | `apps/web/src/` |
| 08/09 | Toàn bộ đo đạc offline chạy với cờ bỏ qua lỗi chứng chỉ; chưa kiểm chứng trên production có Let's Encrypt thật | Trung bình | `apps/web/playwright.config.ts` |
| ~~08/09~~ | ~~Bốn lớp phủ toàn màn hình dùng `absolute inset-0`: cuộn 170px rồi mở bảng thì bảng nằm ở −170..494 thay vì 0..664 — hở đáy màn và cắt mất phần đầu~~ → **ĐÃ SỬA** 08/09: `absolute` → `fixed` ở `EventSheet`, `MilestonesScreen`, `PlacesScreen`, `PlacePicker`; chốt bằng `E2E-14`. Xem `docs/traces/fix-thanh-tab-troi-khi-cuon.md` §3 | ~~Cao~~ | — |
| 08/09 | **Lớp giao thông chưa làm** — không có nguồn dữ liệu giao thông thời gian thực miễn phí; Google/TomTom/HERE đều bắt gắn thẻ tín dụng, làm là vi phạm ràng buộc "không cần khoá API" ở §3.2. Chủ dự án chốt bỏ qua | Chờ quyết định | `apps/web/src/lib/map-styles.ts` |
| 08/09 | **Chỉ đường thời gian thực giữa hai người chưa làm** — cần chọn engine định tuyến trước (OSRM tự host ~2GB RAM cho VN, hay dịch vụ ngoài có hạn mức). Chủ dự án chốt bỏ qua | Chờ quyết định | `apps/web/src/screens/MapScreen.tsx` |
| 08/09 | Ảnh vệ tinh dùng raster Esri: phóng quá zoom 19 là vỡ, và không có nhãn đường. Muốn đẹp hơn phải chồng thêm một lớp nhãn vector trong suốt | Thấp | `apps/web/src/lib/map-styles.ts` |
| 08/09 | Bảng thông tin kéo được nhưng bản đồ **chưa căn lại khung nhìn** theo nấc — kéo lên nấc `full` thì hai ghim có thể bị bảng che. `DraggableSheet` đã có sẵn `onSnapChange` chờ nối | Trung bình | `apps/web/src/screens/MapScreen.tsx` |
| 08/09 | Đổi loại bản đồ làm MapLibre tải lại toàn bộ tile — trên 3G thì trắng bản đồ vài giây, chưa có trạng thái chờ | Thấp | `apps/web/src/components/CoupleMap.tsx` |
| 08/09 | Ảnh đại diện chưa hiện ở **dòng kỷ niệm** (`FeedScreen` vẫn vẽ chữ cái đầu) — `PostResponse` chưa mang `authorAvatarUrl` | Thấp | `apps/api/src/posts/posts.service.ts` |
| 08/09 | Ghim người trên bản đồ (`CoupleMap`) vẫn là vòng tròn chữ cái đầu, chưa dùng ảnh đại diện — marker dựng bằng DOM thuần nên phải tự tải blob | Thấp | `apps/web/src/components/CoupleMap.tsx` |
| 08/09 | Chưa cắt/xoay ảnh đại diện trước khi tải lên — ảnh ngang bị cắt giữa theo `object-cover`, người dùng không chọn được vùng | Trung bình | `apps/web/src/screens/SettingsScreen.tsx` |
| 08/09 | `bio` / `address` của người ấy đã có trong `GET /couples/me` nhưng **chưa hiện ở đâu cả** — mới chỉ sửa được, chưa xem được | Trung bình | `apps/web/src/screens/HomeScreen.tsx` |
| 08/09 | Ảnh đại diện cũ xoá hụt (kho lỗi) sẽ nằm lại vĩnh viễn — chưa có việc dọn rác định kỳ | Thấp | `apps/api/src/users/users.service.ts` |
| ~~09/09~~ | ~~**Tiến lên: luật ăn tiền chưa làm** — tới trắng, thối bài, phạt theo số lá~~ → **LÀM MỘT PHẦN 10/09**: chủ dự án đảo Q2, đã làm **tới trắng** (sảnh rồng · tứ quý heo · 5–6 đôi thông · 6 đôi) và **thối 3 bích**. Xem `docs/thiet-ke-games.md` §4.6 | ~~Chờ quyết định~~ | — |
| 10/09 | **Ăn tiền / đền bài vẫn chưa làm** — phạt theo số lá còn lại, đền khi để đối phương tới trắng, thối heo. Thối 3 bích hiện chỉ là cái nhãn, không trừ điểm | Chờ quyết định | `docs/thiet-ke-games.md` §4.6 |
| 09/09 | **Tiến lên chia 26 lá/người chưa làm** — chốt chia 13 lá, bỏ 26 lá. Biến thể chia hết bộ cần giao diện xếp bài khác hẳn ở khổ 390px | Chờ quyết định | `docs/thiet-ke-games.md` §1 |
| 09/09 | **Đôi thông chỉ nhận 3 hoặc 4 đôi** — 5–6 đôi thông bị từ chối. Luật miền Nam phổ biến chỉ dùng 3 và 4 đôi làm hàng chặt; người có 5 đôi thông vẫn đánh được 4 đôi trong đó nên không mất nước nào | Thấp | `packages/shared/src/tien-len.ts` |
| ~~09/09~~ | ~~`hasAnswer()` chỉ dò bộ cùng loại + hàng chặt, có thể báo "bí" oan~~ → **ĐÃ LÀM** cùng ngày: thay bằng `listPlays()` ở `tien-len-suggest.ts`, liệt kê đủ mọi bộ đi được (và nhờ vậy có luôn nút Gợi ý). `hasAnswer()` đã bỏ | ~~Thấp~~ | — |
| 09/09 | **Chưa test được ván thật giữa hai tài khoản** cho cả hai game (đổi lượt, đồng hồ tạm dừng, chặt heo) — cần hai context Playwright song song, mà điều đó đụng cơ chế xoay vòng refresh token | Trung bình | `apps/web/e2e/` |
| ~~09/09~~ | ~~Chưa có trace API cho Phase 6~~ → **ĐÃ LÀM** cùng ngày: `apps/api/test/trace-phase6-games.mjs`, **45/45 case** qua REST + WebSocket thật, đã nối vào `verify:local`. 10/09 thêm G6-46/47 cho chồng bài → **47/47** | ~~Trung bình~~ | — |
| 09/09 | **Huỷ ván bỏ dở sau 30 phút chưa kiểm được** — ba hành vi còn lại của đồng hồ (tạm dừng khi ẩn app, chạy tiếp khi quay lại, hết giờ tự đi thay) đã có trace G6-16/17/18/40–45; riêng mốc 30 phút thì chờ thật quá lâu cho một bộ kiểm thử | Thấp | `apps/api/src/games/game-clock.job.ts` |
| 09/09 | **Caro chưa có luật cấm nước đôi ba** (double-three) — hiếm ai chơi trên giấy áp luật đó, nhưng người chơi mạnh sẽ thấy thiếu | Thấp | `docs/thiet-ke-games.md` §4.5 |
| 09/09 | **Chưa có màn phát lại ván cũ** — `GameMove` đã lưu đủ dữ liệu, chỉ thiếu phần giao diện | Thấp | `docs/thiet-ke-games.md` §3 |
| 09/09 | **Chưa có âm thanh cho game** — repo chưa có tài sản âm thanh nào | Chờ quyết định | `docs/thiet-ke-games.md` §12 |
| 10/09 | **Tới trắng chưa có trace chạy thật** — nó phụ thuộc vào lần chia bài ngẫu nhiên, không ép được từ REST. Hiện chỉ có 9 unit test cho `detectInstantWin()`; muốn trace thật thì cần một cửa hậu chia bài theo kịch bản, mà cửa hậu ấy lại là lỗ hổng lộ bài | Trung bình | `apps/api/src/games/games.service.ts` |
| 10/09 | **Chuỗi hiển thị của game vẫn hardcode trong component**, chưa gom về `src/i18n/vi.ts` như R2 yêu cầu — cả web hiện chưa có thư mục `i18n`, nên gom riêng mình màn game sẽ lệch với phần còn lại | Thấp | `apps/web/src/components/TienLenTable.tsx` |
| 09/09 | **Không có cách biết chắc người dùng thật sự đang ngồi học** — đồng hồ chạy tiếp khi khoá màn hình (đúng ý đồ), nên phiên bỏ quên vẫn được ghi công tới khi chạm trần 16 chặng. Chấp nhận được: đây là công cụ tự giác cho hai người, không phải hệ thống chấm công | Thấp | `apps/api/src/study/study.service.ts` |
| 09/09 | **Pomodoro chưa có "nghỉ dài"** sau mỗi 4 chặng như luật gốc — hiện chỉ luân phiên học/nghỉ ngắn | Thấp | `packages/shared/src/study.schema.ts` |
| 09/09 | **Gọi thoại/video trong app**: đã cân nhắc lại 09/09, chủ dự án chốt giữ nguyên "không làm". Nếu đổi ý thì cần WebRTC P2P + coturn — xem ADR cùng ngày | Chờ quyết định | — |

| 10/09 | **TL-05 E2E hỏng**: ở bàn Tiến lên 390×844, lá `4♠` chắn mất vùng chạm của lá `3♣` đang được ghim "bắt buộc đánh" → Playwright không bấm được (`subtree intercepts pointer events`). Người thật chạm vào phần lộ ra vẫn trúng, nhưng đây là dấu hiệu vùng chạm bị che thật | Trung bình | `apps/web/src/components/TienLenTable.tsx` · `apps/web/e2e/app.spec.ts:791` |
| 10/09 | **Màn cắt ảnh chưa dùng cho ảnh đại diện** — `PhotoCropper` + `crop-math.ts` đã có và dùng được cho `/cai-dat`, chỉ chưa nối vào (gộp với mục 08/09 ở trên) | Thấp | `apps/web/src/screens/SettingsScreen.tsx` |
| 10/09 | **Bản đồ chỉ lấy tối đa 50 ghim mỗi lượt** (`MAP_PIN_LIMIT`) — vượt qua thì phải thu hẹp khoảng thời gian. Chưa có gộp cụm (clustering) khi nhiều ghim nằm sát nhau | Thấp | `apps/web/src/lib/posts-api.ts` |
| 10/09 | **Màn cắt ảnh chưa xoay được ảnh** — hướng ảnh đã đúng nhờ EXIF, nhưng ai muốn xoay thêm 90° thì chưa có nút | Thấp | `apps/web/src/components/PhotoCropper.tsx` |
| 10/09 | **Chuỗi hiển thị của phần bản đồ / khoảnh khắc mới vẫn hardcode trong component** — cùng lý do với mục game ở trên: web chưa có `src/i18n/vi.ts` nên gom riêng vài màn sẽ lệch với phần còn lại | Thấp | `apps/web/src/components/MapTimeFilter.tsx` |
| 11/09 | **Chấm vị trí của chính mình chưa bấm được** — chỉ chấm của người ấy mở được chi tiết. Toạ độ của mình thì điện thoại nào cũng có sẵn và chỉ đường tới chỗ mình đang đứng là vô nghĩa, nhưng "sao chép toạ độ chỗ tôi đang đứng" thì vẫn có ích | Thấp | `apps/web/src/screens/MapScreen.tsx` |
| 11/09 | **Màn ghép đôi (`/ghep-doi`) chưa được thiết kế lại** theo ngôn ngữ mới của Cài đặt — vẫn là bố cục cũ từ Phase 1 | Thấp | `apps/web/src/screens/PairScreen.tsx` |
| 11/09 | **Chưa dùng lại `PhotoCropper` cho ảnh đại diện** ở màn Hồ sơ mới — ảnh vẫn bị cắt giữa theo `object-cover` (gộp với mục 08/09 và 10/09 ở trên) | Trung bình | `apps/web/src/screens/settings/ProfileScreen.tsx` |
