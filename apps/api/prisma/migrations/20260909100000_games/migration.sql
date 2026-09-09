-- Trò chơi cho hai người (F10 Tiến lên · F11 Cờ caro) — docs/thiet-ke-games.md

-- CreateEnum
CREATE TYPE "GameKind" AS ENUM ('TIEN_LEN', 'CARO');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('PLAYING', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "kind" "GameKind" NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'PLAYING',
    -- Với Tiến lên, cột này chứa bài trên tay CẢ HAI người. Không bao giờ trả
    -- thẳng ra client — phải đi qua bộ lọc theo người xem.
    "state" JSONB NOT NULL,
    "turnUserId" TEXT,
    -- NULL = đồng hồ đang tạm dừng vì người tới lượt không mở app.
    "turnDeadlineAt" TIMESTAMP(3),
    "turnRemainingMs" INTEGER NOT NULL DEFAULT 30000,
    -- Mốc huỷ ván bỏ dở tính từ đây, KHÔNG tính từ "updatedAt": tạm dừng đồng hồ
    -- cũng là một lần ghi, nên updatedAt sẽ tự đẩy hạn huỷ ra xa mãi mãi.
    "lastMoveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMoveAuto" BOOLEAN NOT NULL DEFAULT false,
    "winnerId" TEXT,
    "endReason" TEXT,
    -- Khoá lạc quan chống hai người bấm cùng lúc.
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_moves" (
    "id" BIGSERIAL NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "games_coupleId_kind_status_idx" ON "games"("coupleId", "kind", "status");

-- CreateIndex
-- Cho cron quét ván hết giờ.
CREATE INDEX "games_status_turnDeadlineAt_idx" ON "games"("status", "turnDeadlineAt");

-- CreateIndex
-- Cho cron huỷ ván bỏ dở.
CREATE INDEX "games_status_lastMoveAt_idx" ON "games"("status", "lastMoveAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_moves_gameId_no_key" ON "game_moves"("gameId", "no");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_coupleId_fkey" FOREIGN KEY ("coupleId") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull chứ không Cascade: xoá tài khoản thì ván vẫn còn để đối phương xem lại
-- kết quả, chỉ mất tên người đi lượt.
ALTER TABLE "games" ADD CONSTRAINT "games_turnUserId_fkey" FOREIGN KEY ("turnUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_moves" ADD CONSTRAINT "game_moves_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_moves" ADD CONSTRAINT "game_moves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
