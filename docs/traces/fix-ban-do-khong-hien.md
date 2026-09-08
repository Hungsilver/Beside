# Trace: Sửa lỗi bản đồ không hiển thị (F2)

- **Ngày:** 2026-09-08
- **Triệu chứng do chủ dự án báo:** "chia sẻ vị trí và nhìn thấy nhau trên bản đồ
  không hoạt động — bản đồ không hiển thị", khi test local qua `npm run docker:up`.
- **File liên quan:** `apps/web/src/components/CoupleMap.tsx`
- **Cách chạy:** đo trực tiếp trên bản build thật trong Docker, đi qua Caddy HTTPS
  (`https://localhost/ban-do`), bằng trình duyệt điều khiển tự động ở 390×844.

---

## 1. Nguyên nhân gốc

Thẻ chứa bản đồ được khai báo:

```tsx
<div ref={containerRef} className="absolute inset-0" aria-label="Bản đồ" />
```

Đo computed style trên bản chạy thật:

| Thuộc tính | Mong đợi | Thực tế đo được |
|---|---|---|
| `class` | `absolute inset-0` | `absolute inset-0 maplibregl-map` |
| `position` | `absolute` | **`relative`** |
| `height` | `844px` | **`0px`** |
| kích thước canvas | 390×844 | 390×300 |

MapLibre **tự gắn thêm class `maplibregl-map`** vào chính thẻ mình được giao, và
`maplibre-gl.css` có `.maplibregl-map { position: relative; overflow: hidden }`.

Điểm mấu chốt: **`maplibre-gl.css` không nằm trong cascade layer nào**, còn utility
của **Tailwind v4 nằm trong `@layer utilities`**. Luật CSS quy định rule
**không-layer luôn thắng** rule nằm trong layer — bất kể thứ tự khai báo hay độ
đặc hiệu. Nên `.absolute` của Tailwind không có cơ hội thắng.

Hệ quả dây chuyền:

1. `position` bị ép về `relative` ⇒ `inset-0` (top/bottom = 0) mất tác dụng.
2. Con của thẻ đều `position: absolute` ⇒ không có gì đẩy chiều cao ⇒ `height: 0`.
3. MapLibre đọc `clientHeight === 0`, rơi về kích thước mặc định 300px cho canvas.
4. `.maplibregl-map { overflow: hidden }` cắt sạch canvas 300px đó ⇒ **không thấy gì**.

Bản đồ chưa bao giờ "lỗi" — nó vẽ đúng, chỉ là bị nén còn cao 0px.

**Vì sao phần dữ liệu vẫn chạy đúng:** bảng thông tin phía dưới đọc được
"Bình · 9 phút trước", khoảng cách, độ chính xác, pin — nghĩa là REST + WebSocket
+ ghép đôi đều bình thường. Chỉ có lớp hiển thị hỏng, nên nhìn từ ngoài giống hệt
"chia sẻ vị trí không hoạt động".

## 2. Cách sửa

Không đặt utility bố cục lên chính thẻ mà MapLibre sở hữu. Tách làm hai lớp:

```tsx
<div className="absolute inset-0">
  <div ref={containerRef} className="size-full" aria-label="Bản đồ" />
</div>
```

- Thẻ ngoài giữ bố cục — MapLibre không đụng tới nó nên Tailwind thắng bình thường.
- Thẻ trong giao cho MapLibre; `size-full` an toàn vì `maplibre-gl.css` **không**
  khai báo `width`/`height` cho `.maplibregl-map`.

Phương án đã cân nhắc và **loại**: `@import 'maplibre-gl/dist/maplibre-gl.css'
layer(base)` trong `index.css`. Đúng về nguyên tắc nhưng kéo ~70KB CSS của MapLibre
vào bundle khởi động, phá quyết định "MapLibre chỉ tải khi thật sự mở bản đồ"
(ADR 2026-09-07).

## 3. Kết quả đo

Cột "Trước" là số đo trên đúng bản build mà chủ dự án đang test.

| Mã | Tình huống | Kỳ vọng | Trước khi sửa | Sau khi sửa | KQ |
|---|---|---|---|---|---|
| MAP-01 | **Happy path** — mở `/ban-do` ở 390×844 | thẻ cao 844, canvas 390×844, có marker đối phương | h=0, canvas 390×300, không thấy gì | h=844 w=390 · canvas 390×844 · marker `["Bình"]` | ✅ |
| MAP-02 | **Biên** — đối phương chưa có vị trí nào (`location: null`) | vẫn hiện bản đồ ở tâm dự phòng TP.HCM, không vỡ | h=0 | h=844 · canvas 390×844 · `markers=[]` · 0 lỗi JS | ✅ |
| MAP-03 | **Biên** — xoay dọc → ngang giữa chừng | ResizeObserver của MapLibre vẽ lại theo khung mới | h=0 ở cả hai chiều | trước 844×390/canvas 390×844 → sau 390 cao/844 rộng · canvas 844×390 | ✅ |
| MAP-04 | **Biên** — rời màn Bản đồ rồi quay lại (unmount → remount) | `map.remove()` chạy, dựng lại sạch, không còn thẻ mồ côi | h=0 ở cả hai lượt | lượt 1 h=844 · rời đi: đã gỡ khỏi DOM · lượt 2 h=844 canvas 390×844 marker `["Bình"]` | ✅ |
| MAP-05 | **Lỗi** — mất mạng tới máy chủ tile (chặn `tiles.openfreemap.org`) | khung bản đồ vẫn đúng kích thước, app không vỡ, bảng dữ liệu vẫn chạy | h=0 | h=844 · canvas 390×844 · 0 lỗi JS mới · bảng vẫn hiện "Bình · 42 giây trước" | ✅ |
| MAP-06 | **Biên** — máy nhỏ nhất còn hỗ trợ (iPhone SE 320×568) | khít khung, marker nằm trong khung nhìn | h=0 | h=568 w=320 · canvas 320×568 · `inView=true` | ✅ |
| MAP-07 | **Hai người cùng bật chia sẻ trực tiếp** | mỗi người thấy 2 chấm (mình + đối phương), khoảng cách khớp nhau | không thấy chấm nào | An thấy `["Bình","Bạn"]`, Bình thấy `["An","Bạn"]`, cả hai đều 858 m, huy hiệu "Trực tiếp", pin 100% | ✅ |

**Ghi chú về "2 lỗi JS" xuất hiện ở mọi case:** đều là
`Failed to register a ServiceWorker … An SSL certificate error occurred` — hệ quả
tất yếu của chứng chỉ tự ký do CA nội bộ của Caddy cấp cho `localhost` (mỗi lần
tải trang một lỗi, kịch bản tải 2 trang). Không liên quan tới bản đồ, và không
xảy ra trên VPS thật vì ở đó là chứng chỉ Let's Encrypt.

## 4. Đã loại trừ trong lúc chẩn đoán

| Nghi vấn | Cách kiểm | Kết luận |
|---|---|---|
| `VITE_MAP_STYLE_URL` không lọt vào bundle | `grep` trong file JS đã build trong container `beside-web` | Có, đúng URL OpenFreeMap |
| Máy chủ tile không vào được từ VN | `curl` tới `tiles.openfreemap.org/styles/liberty` | HTTP 200, 1,15s |
| CSP chặn tile bên ngoài | đọc `infra/caddy/Caddyfile` và `helmet` ở `main.ts` | Không đặt CSP ở đâu cả |
| Ghép đôi / quyền / ghost mode | truy vấn thẳng DB + đọc bảng thông tin trên UI | Hai user cùng `coupleId`, dữ liệu chảy bình thường |
| **WebSocket bị 502** trong log Caddy | đối chiếu giờ với `docker inspect` | Container API bị build lại lúc 04:35 và 04:38 (do phần F5 làm song song). Đo lại lúc yên: **20/20 lần bắt tay trả 101**, socket giữ kết nối liên tục 33 giây không rớt lần nào |

## 5. Bài học

**L30 — Utility của Tailwind v4 thua CSS của thư viện ngoài, không phải vì độ đặc
hiệu mà vì cascade layer.** Tailwind v4 gói utility vào `@layer utilities`; mọi
CSS bên thứ ba nhập thẳng bằng `import 'thu-vien/style.css'` đều không-layer nên
thắng tuyệt đối. Quy tắc rút ra cho dự án này: **không đặt utility bố cục lên thẻ
DOM mà thư viện ngoài sẽ tự gắn class vào** — hãy bọc thêm một thẻ ngoài.

Cùng cơ chế đó đang xảy ra ở marker (`buildMarkerElement`): MapLibre gắn
`.maplibregl-marker { position: absolute }` đè lên `relative` mình viết. Ở đó
**vô hại và đúng ý** vì marker phải `absolute` để MapLibre định vị bằng
`transform`; các class còn lại (`flex items-center justify-center`) không xung đột
nên vẫn có tác dụng. Ghi lại để lần sau đọc code không hoảng.
