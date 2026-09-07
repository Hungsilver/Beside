-- =========================================================
-- Beside — tạo user + database trên PostgreSQL CÀI SẴN TRÊN MÁY
-- (khác với infra/postgres/init/01-extensions.sql — file đó chỉ chạy
--  tự động bên trong container Docker)
--
-- Chạy MỘT LẦN, bằng tài khoản superuser:
--   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f infra/postgres/local-setup.sql
-- (psql sẽ hỏi mật khẩu của user postgres)
-- =========================================================

-- Tạo user riêng cho app thay vì dùng thẳng superuser.
-- Mật khẩu này CHỈ dùng cho máy dev — trên VPS dùng giá trị khác trong .env.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beside') THEN
    CREATE ROLE beside LOGIN PASSWORD 'beside_dev_pw_2026' CREATEDB;
    RAISE NOTICE 'Da tao user "beside"';
  ELSE
    RAISE NOTICE 'User "beside" da ton tai, bo qua';
  END IF;
END
$$;

-- CREATE DATABASE không chạy được trong khối DO, nên dùng \gexec:
-- chỉ sinh ra câu lệnh khi database chưa tồn tại.
SELECT 'CREATE DATABASE beside OWNER beside'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'beside')
\gexec

\connect beside

-- Hai extension này là "trusted" từ PostgreSQL 13, chủ sở hữu database tạo được.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS unaccent;

-- PostGIS (geofence, tính khoảng cách — cần từ Phase 2).
-- KHÔNG đi kèm bản cài PostgreSQL mặc định; bỏ qua nếu máy chưa có.
--
-- Lưu ý: PostGIS không phải extension "trusted" nên PHẢI tạo bằng superuser —
-- đó là lý do cả file này chạy bằng user postgres chứ không phải user beside.
--
-- Cài trên máy mới (Windows):
--   1. Tải postgis-bundle-pg18-3.6.2x64.zip ở download.osgeo.org/postgis/windows/pg18/
--   2. DỪNG dịch vụ postgresql-x64-18 (postgres.exe giữ một số DLL dùng chung)
--   3. Copy 5 thu muc bin, lib, share, gdal-data, utils vao thu muc cai PostgreSQL
--      (mac dinh tren Windows: "C:/Program Files/PostgreSQL/18")
--   4. Bật lại dịch vụ, rồi chạy lại file này
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
  RAISE NOTICE 'PostGIS: da bat';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS chua duoc cai — bo qua (chi can tu Phase 2).';
  RAISE NOTICE 'Xem huong dan 4 buoc ghi ngay tren trong file nay.';
END
$$;

-- Toàn bộ dữ liệu thời gian lưu ở UTC, hiển thị mới đổi sang giờ VN.
ALTER DATABASE beside SET timezone TO 'UTC';

\echo ''
\echo '=== XONG ==='
\echo 'DATABASE_URL=postgresql://beside:beside_dev_pw_2026@localhost:5432/beside?schema=public'
