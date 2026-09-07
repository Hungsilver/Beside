-- Emoji cho sự kiện trên lịch (Phase 4, F4).
-- Sinh bằng: prisma migrate diff --from-schema-datasource --to-schema-datamodel
-- (không đi qua shadow database — xem ghi chú ở 20260907000000_enable_postgis).
ALTER TABLE "events" ADD COLUMN "emoji" TEXT NOT NULL DEFAULT '📅';
