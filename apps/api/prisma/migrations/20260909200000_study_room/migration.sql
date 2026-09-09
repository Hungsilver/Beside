-- Phòng học chung (F12) — Pomodoro cho hai người.

-- CreateEnum
CREATE TYPE "StudyPhase" AS ENUM ('FOCUS', 'BREAK');

-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('RUNNING', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "phase" "StudyPhase" NOT NULL DEFAULT 'FOCUS',
    "status" "StudyStatus" NOT NULL DEFAULT 'RUNNING',
    "focusMin" INTEGER NOT NULL DEFAULT 25,
    "breakMin" INTEGER NOT NULL DEFAULT 5,
    -- Mốc kết thúc chặng hiện tại. Đồng hồ là của server; cả hai máy đọc chung
    -- cột này chứ không máy nào tự đếm giờ của mình.
    "endsAt" TIMESTAMP(3) NOT NULL,
    "roundsDone" INTEGER NOT NULL DEFAULT 0,
    -- Ai đang ở trong phòng — mảng userId.
    "presentUserIds" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_logs" (
    "id" BIGSERIAL NOT NULL,
    "coupleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    -- Chặng thứ mấy trong phiên: (sessionId, round) là khoá tự nhiên của một
    -- chặng, dùng để đếm "chặng nào cả hai cùng ngồi".
    "round" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    -- Ngày lịch GIỜ VIỆT NAM, không phải ngày UTC: chuỗi ngày học đếm theo cột
    -- này, mà lưu timestamp rồi so sau sẽ tính nhầm mọi buổi học sau nửa đêm.
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_sessions_coupleId_status_idx" ON "study_sessions"("coupleId", "status");

-- CreateIndex
-- Cho cron quét chặng đã hết giờ.
CREATE INDEX "study_sessions_status_endsAt_idx" ON "study_sessions"("status", "endsAt");

-- CreateIndex
CREATE INDEX "study_logs_coupleId_userId_day_idx" ON "study_logs"("coupleId", "userId", "day");

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_coupleId_fkey" FOREIGN KEY ("coupleId") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_coupleId_fkey" FOREIGN KEY ("coupleId") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull: xoá phiên thì các chặng đã học vẫn phải còn, nếu không thống kê
-- của người dùng sẽ tụt xuống mà họ không hiểu vì sao.
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "study_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
