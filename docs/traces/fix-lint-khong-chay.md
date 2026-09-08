# Trace: Sửa lỗi `npm run lint` không kiểm gì cả

- **Ngày:** 2026-09-08
- **Loại:** lỗi **quy trình**, không phải lỗi sản phẩm — nhưng nó làm hỏng một
  trong ba chốt của R1 suốt bốn phase.
- **File liên quan:** `package.json`, `eslint.config.mjs` (mới),
  `packages/shared/tsconfig*.json`, `apps/{api,web}/tsconfig.json`,
  `scripts/verify-local.mjs`

---

## 1. Triệu chứng

`CLAUDE.md` R1 bước 3 yêu cầu:

```bash
npm run typecheck && npm run lint && npm run test
```

Tôi đã chạy đúng câu đó sau mỗi feature và báo cáo **"lint sạch"** ở cả bốn lượt
F4 · F7 · F6 · F5. Câu đó **sai**.

## 2. Nguyên nhân gốc

```jsonc
// package.json (gốc)
"lint": "npm run lint --workspaces --if-present"
```

`--if-present` nghĩa là "workspace nào có script `lint` thì chạy". Kiểm tra:

```
$ grep '"lint"' apps/api/package.json apps/web/package.json packages/shared/package.json
KHÔNG WORKSPACE NÀO CÓ SCRIPT lint
```

Không có workspace nào khai báo `lint`. Lệnh duyệt qua ba workspace, không tìm
thấy gì, **thoát 0**. Không có ESLint nào được cài, không có file cấu hình nào
tồn tại.

Đây đúng là kiểu lỗi tôi đã bắt được **ba lần** trong bộ trace của chính mình
(L18 đồ nghề ảnh sai, L25 khoá P-256 bịa, L27 hạn mức chặn ping) — **một mã
thoát 0 không có nghĩa là phép kiểm đã chạy**. Tôi bắt được nó ở code người
khác viết ra nhưng không soi lại chính quy trình của mình.

Phát hiện ban đầu do một lượt rà soát song song ghi vào `docs/BACKLOG.md`; tôi
tự kiểm chứng lại bằng hai lệnh ở trên trước khi sửa.

## 3. Đã sửa gì

### 3.1 Dựng ESLint thật

`eslint.config.mjs` ở gốc, một file cho cả ba workspace (ba file cấu hình là ba
chỗ để lệch nhau). Bộ quy tắc **không chọn theo mặc định** mà chọn theo đúng
những lỗi dự án này **đã thật sự mắc phải**:

| Quy tắc | Bắt được lỗi nào đã từng xảy ra |
|---|---|
| `@typescript-eslint/no-floating-promises` | L11 — quên `await` nên đọc trúng dữ liệu cũ |
| `react-hooks/exhaustive-deps` | L20 — thu hồi blob của ảnh đang hiển thị · L21 — dựng lại observer sau mỗi render |
| `@typescript-eslint/no-explicit-any` | R2 cấm `any` |
| `no-console` | R2 cấm `console.log` trong code commit |

Một số quy tắc `no-unsafe-*` bị **tắt có chủ đích**: chúng bắt rất nhiều chỗ vô
hại trong code Prisma/Nest, và một rừng cảnh báo sẽ che mất lỗi thật.

### 3.2 Vá thêm một lỗ khác lộ ra khi bật ESLint

ESLint không parse nổi **11 file `.spec.ts` của `packages/shared`**. Lý do:

```jsonc
// packages/shared/tsconfig.json (cũ)
"include": ["src/**/*.ts"],
"exclude": ["src/**/*.spec.ts"]
```

Nghĩa là `npm run typecheck` **chưa bao giờ kiểm kiểu cho hơn 100 unit test của
shared**. Một lỗi kiểu trong file test chỉ lộ ra lúc vitest chạy.

Sửa: tách `tsconfig.build.json` (chỉ `src`, bỏ spec — dùng để sinh `dist`) ra
khỏi `tsconfig.json` (mọi thứ, kể cả spec — dùng cho typecheck và ESLint).

### 3.3 Chốt lại trong `verify:local`

Thêm mục **"ESLint 3 workspace"** vào phần 4. Từ nay lint là một mục có thể
**đỏ**, không phải một lệnh chạy cho có.

## 4. Kết quả

| Case | Kỳ vọng | Thực tế | KQ |
|---|---|---|---|
| LT-01 | `npm run lint` thật sự chạy ESLint | quét 3 workspace, in số vấn đề | ✅ |
| LT-02 | Bắt được `no-floating-promises` | 4 chỗ `navigate()` của react-router v7 (trả Promise) không được đánh dấu | ✅ |
| LT-03 | Bắt được `react-hooks/exhaustive-deps` | 1 chỗ dùng `ref.current` trong hàm dọn dẹp — đúng loại bẫy của L20 | ✅ |
| LT-04 | Bắt được hàm `async` không có `await` | `PostsService.toResponse` | ✅ |
| LT-05 | Bắt được biến thừa | `pinnedId` trong `trace-phase3-posts.mjs` | ✅ |
| LT-06 | Typecheck giờ phủ cả file spec của shared | 11 file spec vào diện kiểm | ✅ |
| LT-07 | `verify:local` có mục lint đỏ được | mục "ESLint 3 workspace" | ✅ |
| LT-08 | Sau khi sửa: 0 lỗi | 0 error, 2 warning `react-refresh` (chấp nhận được) | ✅ |
| LT-09 | `verify:local` vẫn xanh sau toàn bộ thay đổi | 37/37 mục | ✅ |

**Tổng: 9/9 ✅** · typecheck sạch · 270 unit test · `verify:local` **37/37**
(247 case trace)

## 5. Lỗi ESLint tìm ra và cách xử lý

| Chỗ | Xử lý |
|---|---|
| 4 × `navigate()` không chờ (Checkin/Login/Register/Settings) | thêm `void` — cố ý không chờ, giờ nói rõ ra |
| `CoupleMap` dùng `markersRef.current` trong cleanup | chép ra biến cục bộ **trong thân effect**, đúng mẫu React khuyến nghị |
| `PostsService.toResponse` là `async` nhưng không `await` gì | bỏ `async`; `Promise.all` ở chỗ gọi cũng bỏ theo |
| `pinnedId` thừa trong bộ trace | xoá |
| `no-control-regex` ở hàm bỏ mã màu ANSI | `eslint-disable-next-line` kèm lý do — ký tự ESC chính là thứ cần khớp |
| `no-unsafe-enum-comparison` ở filter lỗi | tắt cho `apps/api`: `HttpStatus` của Nest là enum số, `getStatus()` trả `number` — so sánh vậy là bình thường |

### Cái giá của việc sửa cẩu thả: tôi làm chết container API

Để ESLint parse được `apps/api/vitest.config.ts`, tôi thêm file đó vào
`include` của `tsconfig.json`. Hậu quả: file nằm **ngoài** `src`, nên `tsc` suy
ra `rootDir` là thư mục gốc của workspace thay vì `src` — bản build ra
`dist/src/main.js` chứ không phải `dist/main.js`, và container chết ngay khi
khởi động:

```
Error: Cannot find module '/repo/apps/api/dist/main.js'
```

`typecheck`, `lint` và `test` **đều xanh**. Chỉ `verify:local` bắt được, vì nó
là thứ duy nhất chạy bản build thật trong Docker: 10/37 mục đỏ, toàn bộ phần
mạng sập.

Sửa: trả lại `include` cũ và cho ESLint **bỏ qua** `vite.config.ts` /
`vitest.config.ts`. Đó là file cấu hình công cụ build, lint chúng gần như không
được gì, mà cái giá là làm hỏng bản build.

Bài học đi kèm bài học chính: **đừng nới cấu hình build chỉ để chiều một công cụ
kiểm tra.**

### Một cái bẫy của `--fix`

`eslint --fix` gỡ phép ép kiểu ở `CoupleMap`:

```ts
const source = map.getSource('trail') as maplibregl.GeoJSONSource | undefined;
```

Nó cho rằng phép ép này thừa. **Sai** — `getSource()` khai báo trả về `Source`,
kiểu cha không có `setData`. Gỡ xong thì typecheck vỡ ngay. Đã khôi phục và tắt
quy tắc tại chỗ kèm lý do.

Bài học: **chạy typecheck sau mỗi lần `--fix`**. Một công cụ sửa tự động cũng
chỉ là một công cụ, và nó không chạy `tsc`.

## 6. Còn thiếu

- **Hai cảnh báo `react-refresh/only-export-components`** ở `auth-context.tsx` và
  `realtime.tsx` (file vừa xuất component vừa xuất hook). Chỉ ảnh hưởng tốc độ
  hot-reload lúc dev, không ảnh hưởng bản build — để cảnh báo, chưa tách file.
- **Chưa có Prettier.** Định dạng code hiện dựa vào thói quen, không có công cụ
  chốt lại.
- **Chưa chạy lint trong CI** — dự án chưa có CI. `verify:local` là chốt chặn
  duy nhất, và nó chạy bằng tay.

## 7. Sửa lại phần đã báo cáo sai

Bốn báo cáo "lint sạch" ở các lượt F4 · F7 · F6 · F5 là **không có căn cứ**.
Những gì thật sự đã kiểm ở các lượt đó: typecheck, unit test, và bộ trace —
đều là thật. Chỉ riêng dòng "lint sạch" là vô nghĩa. Chạy ESLint thật lần đầu
tìm ra **27 lỗi**, trong đó có mấy lỗi thuộc đúng loại đã từng gây sự cố trong
dự án này.
