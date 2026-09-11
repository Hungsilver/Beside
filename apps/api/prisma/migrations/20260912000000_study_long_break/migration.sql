-- F12 Đợt 3: nghỉ DÀI sau mỗi 4 chặng học (luật Pomodoro gốc).
--
-- Cố ý KHÔNG thêm giá trị vào enum "StudyPhase". Nghỉ dài vẫn là nghỉ, chỉ khác
-- độ dài; suy nó ra từ "roundsDone" thì không có cách nào để cột trong DB lệch
-- khỏi luật — mà ALTER TYPE ... ADD VALUE lại là thao tác không lùi được.
ALTER TABLE "study_sessions" ADD COLUMN "longBreakMin" INTEGER NOT NULL DEFAULT 15;
