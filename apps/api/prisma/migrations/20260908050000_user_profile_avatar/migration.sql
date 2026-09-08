-- Hồ sơ cá nhân đầy đủ hơn: ảnh đại diện, lời giới thiệu, địa chỉ.

-- Định danh ảnh đại diện. Khoá lưu trữ suy ra từ đây: avatars/{avatarId}/{md|thumb}.webp
ALTER TABLE "users" ADD COLUMN "avatarId" UUID;
ALTER TABLE "users" ADD COLUMN "bio" TEXT;
-- Địa chỉ người dùng tự gõ. Không geocode, không dính tới hệ thống vị trí.
ALTER TABLE "users" ADD COLUMN "address" TEXT;

-- "avatarUrl" có từ migration đầu nhưng CHƯA TỪNG được ghi giá trị nào (luôn NULL):
-- không có đường code nào set nó. Xoá hẳn thay vì để một cột chết cạnh "avatarId",
-- vì hai cột tên gần giống nhau là chỗ để lần sau sửa nhầm.
ALTER TABLE "users" DROP COLUMN "avatarUrl";
