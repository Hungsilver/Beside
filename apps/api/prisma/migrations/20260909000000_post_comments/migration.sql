-- Bình luận trong từng khoảnh khắc (mở rộng F3).
--
-- Không có cột "coupleId": quyền đọc/ghi suy ra từ bài viết cha (posts.coupleId).
-- Nhân đôi cột đó ở đây là tạo thêm một chỗ để dữ liệu lệch nhau.

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Danh sách bình luận luôn đọc theo bài và sắp xếp cũ → mới; đếm số bình luận
-- của một bài cũng chỉ quét đúng nhánh này.
CREATE INDEX "comments_postId_createdAt_idx" ON "comments"("postId", "createdAt");

-- AddForeignKey
-- Xoá khoảnh khắc thì bình luận đi theo — không để lại dòng mồ côi trỏ vào hư không.
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
