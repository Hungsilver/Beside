-- Đánh dấu đã gửi nhắc lịch, để job chạy mỗi phút không gửi trùng (Phase 4, F7).
ALTER TABLE "events" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- Job quét theo (chưa gửi, sắp tới giờ) nên chỉ mục ghép đúng thứ tự đó.
CREATE INDEX "events_reminderSentAt_startAt_idx" ON "events"("reminderSentAt", "startAt");
