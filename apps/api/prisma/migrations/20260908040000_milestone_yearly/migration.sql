-- Mốc kỷ niệm lặp hằng năm hay chỉ một lần (Phase 4, F5).
-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "yearly" BOOLEAN NOT NULL DEFAULT true;

