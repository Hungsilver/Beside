-- Sửa lỗi của migration trước (20260907160000_add_location_geography).
--
-- VẤN ĐỀ: cột `geog` được tạo bằng GENERATED ALWAYS ... STORED. Cách đó chạy
-- đúng, nhưng Prisma đọc biểu thức sinh cột như một DEFAULT, nên mọi lần
-- `prisma migrate dev` sau này đều sinh ra:
--       ALTER TABLE "location_points" ALTER COLUMN "geog" DROP DEFAULT;
-- Câu lệnh đó THẤT BẠI trên cột generated → migration kế tiếp sẽ vỡ.
-- (Phát hiện bằng `prisma migrate diff` ngay sau khi áp dụng migration trước.)
--
-- CÁCH SỬA: bỏ tính generated, chuyển sang TRIGGER. Prisma không nhìn thấy
-- trigger nên không sinh drift, mà vẫn bảo đảm `geog` không bao giờ lệch với
-- lat/lng — kể cả khi có ai ghi bằng Prisma Client thay vì qua LocationsService.

ALTER TABLE "location_points" ALTER COLUMN "geog" DROP EXPRESSION;

CREATE OR REPLACE FUNCTION beside_set_location_geog()
RETURNS trigger AS $$
BEGIN
  NEW."geog" := ST_SetSRID(ST_MakePoint(NEW."lng", NEW."lat"), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS location_points_set_geog ON "location_points";
CREATE TRIGGER location_points_set_geog
  BEFORE INSERT OR UPDATE OF "lat", "lng" ON "location_points"
  FOR EACH ROW
  EXECUTE FUNCTION beside_set_location_geog();

-- Đổi chỉ mục sang đúng tên mà Prisma sinh ra từ @@index([userId, recordedAt(sort: Desc)]),
-- nếu không Prisma sẽ coi là thiếu chỉ mục và tạo thêm một cái trùng lặp.
DROP INDEX IF EXISTS "location_points_user_recorded_desc_idx";
DROP INDEX IF EXISTS "location_points_userId_recordedAt_idx";
CREATE INDEX "location_points_userId_recordedAt_idx"
  ON "location_points" ("userId", "recordedAt" DESC);

-- Điền lại cho dữ liệu đã có (nếu có).
UPDATE "location_points"
   SET "geog" = ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography
 WHERE "geog" IS NULL;
