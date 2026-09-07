-- Bật extension TRƯỚC mọi migration khác.
--
-- Vì sao cần dù `infra/postgres/init/01-extensions.sql` đã làm việc này:
-- script init chỉ chạy trên volume DB thật và chỉ đúng một lần lúc volume còn
-- rỗng. Khi `prisma migrate dev` dựng shadow database để kiểm tra, nó tạo một
-- DB trắng và phát lại toàn bộ migration — không có PostGIS nên migration
-- `20260907160000_add_location_geography` chết với "type geography does not exist".
--
-- Thư mục này có timestamp sớm nhất nên luôn chạy đầu tiên. Mọi câu lệnh đều
-- IF NOT EXISTS, nên áp lên DB thật (vốn đã có sẵn extension) là vô hại.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS unaccent;
