-- Cột không gian cho bảng vị trí (ARCHITECTURE.md §6).
--
-- Prisma không có kiểu geography, nên cột này được khai báo là Unsupported()
-- trong schema.prisma và tạo bằng SQL thuần ở đây.
--
-- Dùng GENERATED ALWAYS ... STORED thay vì cột thường:
--   - Prisma cứ ghi lat/lng như bình thường, Postgres tự tính geog
--   - Không thể xảy ra cảnh geog lệch với lat/lng do quên cập nhật
--   - Không cần trigger
-- Cách này chạy được vì ST_MakePoint / ST_SetSRID và phép ép sang geography
-- đều là IMMUTABLE trong PostGIS 3.

ALTER TABLE "location_points"
  ADD COLUMN "geog" geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography
  ) STORED;

-- Chỉ mục GIST cho ST_DWithin / ST_Distance (geofence ở Phase 4).
CREATE INDEX "location_points_geog_idx" ON "location_points" USING GIST ("geog");

-- Truy vấn vệt đường luôn theo (người, khoảng thời gian) và lấy điểm mới nhất
-- trước, nên thêm chỉ mục giảm dần để không phải sắp xếp lại.
CREATE INDEX "location_points_user_recorded_desc_idx"
  ON "location_points" ("userId", "recordedAt" DESC);
