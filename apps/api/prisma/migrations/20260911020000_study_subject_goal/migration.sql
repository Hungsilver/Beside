-- F12 Đợt 1: buổi học có TÊN MÔN, và mỗi người có mục tiêu phút mỗi ngày.

-- Tên môn nằm ở cả hai bảng là cố ý, không phải chuẩn hoá thiếu: `study_logs`
-- giữ BẢN CHÉP tại thời điểm ghi công. Phiên bị xoá thì `sessionId` thành NULL,
-- mà lịch sử "hôm đó học Toán 50 phút" vẫn phải còn đúng.
ALTER TABLE "study_sessions" ADD COLUMN "subject" TEXT;
ALTER TABLE "study_logs"     ADD COLUMN "subject" TEXT;

-- Thống kê 7 ngày gom theo (ngày, môn) cho cả couple, không lọc theo userId.
CREATE INDEX "study_logs_coupleId_day_idx" ON "study_logs"("coupleId", "day");

-- 0 = chưa đặt mục tiêu. Không dùng NULL: mọi chỗ đọc ra đều phải cộng/so sánh,
-- một con số luôn có giá trị đỡ được cả loạt kiểm tra null ở tầng trên.
ALTER TABLE "users" ADD COLUMN "studyGoalMin" INTEGER NOT NULL DEFAULT 0;
