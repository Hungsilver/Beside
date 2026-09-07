# Trace: <tên feature>

- **Ngày:** YYYY-MM-DD
- **File liên quan:** `path/a.ts`, `path/b.tsx`
- **Dữ liệu giả định dùng:** `packages/fixtures/<tên>.ts`

> Quy tắc: tối thiểu **1 happy path + 3 edge case + 1 case lỗi**.
> Phải chạy tay từng bước bằng ngòi bút, không chỉ dựa vào test tự động.

---

## TC-01 — Happy path: <mô tả ngắn>

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | `foo()` :24 | | | |
| 2 | `bar()` :51 | | | |
| 3 | | | | |

- **Kỳ vọng:**
- **Thực tế:**
- **Kết luận:** ✅ ĐẠT / ❌ LỖI → mô tả lỗi + đã sửa ở đâu

---

## TC-02 — Edge: <mô tả>

| Bước | Hàm / dòng | Đầu vào | Trạng thái sau bước | Ghi chú |
|---|---|---|---|---|
| 1 | | | | |

- **Kỳ vọng:**
- **Thực tế:**
- **Kết luận:**

---

## TC-03 — Edge: <mô tả>

...

## TC-04 — Edge: <mô tả>

...

## TC-05 — Lỗi: <mô tả> (đầu vào không hợp lệ / mất mạng / thiếu quyền)

- **Kỳ vọng:** thông báo lỗi rõ ràng cho user, không crash, không mất dữ liệu đang nhập
- **Thực tế:**
- **Kết luận:**

---

## Tổng kết

| Mã | Loại | Kết quả | Ghi chú |
|---|---|---|---|
| TC-01 | happy | | |
| TC-02 | edge | | |
| TC-03 | edge | | |
| TC-04 | edge | | |
| TC-05 | lỗi | | |

**Thay đổi cần ghi vào `ARCHITECTURE.md`:** (có / không — nếu có thì mục nào)
