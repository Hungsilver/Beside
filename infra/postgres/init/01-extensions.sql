-- =========================================================
-- Beside — khởi tạo extension cho PostgreSQL
-- Chỉ chạy MỘT LẦN khi volume db_data còn rỗng.
-- =========================================================

-- PostGIS: truy vấn không gian (geofence, khoảng cách giữa 2 người)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Sinh UUID phía DB khi cần
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bỏ dấu tiếng Việt khi tìm kiếm địa điểm ("Quan 1" khớp "Quận 1")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Toàn bộ dữ liệu thời gian lưu ở UTC; việc đổi sang Asia/Ho_Chi_Minh
-- được xử lý ở tầng hiển thị (xem CLAUDE.md R2).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;
