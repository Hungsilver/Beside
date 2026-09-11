-- F12 Đợt 2: mốc đếm ngược · việc cần làm trong ngày · nhật ký một dòng.

-- Nhật ký gắn vào CHẶNG đã ghi công, không phải vào phiên: một buổi Pomodoro
-- có nhiều chặng và mỗi chặng làm một việc khác nhau.
ALTER TABLE "study_logs" ADD COLUMN "note" TEXT;

CREATE TABLE "study_ddays" (
    "id"        TEXT NOT NULL,
    "coupleId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    -- DATE chứ không TIMESTAMP: đây là ngày trên tờ lịch giờ VN, không phải
    -- một thời điểm. Lưu timestamp rồi so sau sẽ lệch một ngày trong khoảng
    -- 00:00–07:00 giờ VN (ADR 2026-09-07).
    "date"      DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_ddays_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "study_tasks" (
    "id"        TEXT NOT NULL,
    "coupleId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "day"       DATE NOT NULL,
    -- NULL = chưa xong. Mốc thời gian thay cờ boolean: biết luôn xong lúc nào.
    "doneAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "study_ddays_coupleId_date_idx"    ON "study_ddays"("coupleId", "date");
CREATE INDEX "study_tasks_coupleId_userId_day_idx"    ON "study_tasks"("coupleId", "userId", "day");
-- Danh sách "việc đang mở" đọc theo (người, chưa xong) ở mọi lần mở màn học.
CREATE INDEX "study_tasks_coupleId_userId_doneAt_idx" ON "study_tasks"("coupleId", "userId", "doneAt");

ALTER TABLE "study_ddays" ADD CONSTRAINT "study_ddays_coupleId_fkey"
    FOREIGN KEY ("coupleId") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_ddays" ADD CONSTRAINT "study_ddays_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_coupleId_fkey"
    FOREIGN KEY ("coupleId") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
