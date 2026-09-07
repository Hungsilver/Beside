-- Đổi tên cột cho khớp bản chất.
--
-- Cột này ban đầu đặt tên `blurhash` theo thuật toán BlurHash, nhưng cuối cùng
-- không dùng thuật toán đó: nó cần thư viện ở cả server lẫn client để mã hoá và
-- giải mã. Thay vào đó lưu một ảnh WebP 20px dạng data URI — trình duyệt hiển thị
-- được ngay bằng thẻ <img>, không cần thư viện nào, mà hiệu quả thị giác tương đương.
--
-- Dùng RENAME thay vì DROP + ADD để không mất dữ liệu đã có.
ALTER TABLE "photos" RENAME COLUMN "blurhash" TO "placeholder";
