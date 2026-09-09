import { z } from 'zod';

/**
 * Bình luận trong từng khoảnh khắc (mở rộng của F3).
 *
 * KHÔNG phải chat (F9 đã chốt: không có chat trong app). Khác nhau ở chỗ
 * bình luận luôn **gắn vào một khoảnh khắc cụ thể** — không có phòng chat,
 * không có "đang gõ...", không có đã xem, không có thông báo theo thời gian
 * thực. Chỉ là lời nhắn để lại dưới một tấm ảnh, đọc lúc nào cũng được.
 */

/** Trần độ dài một bình luận. Ngắn hơn caption vì đây là lời đáp, không phải bài. */
export const COMMENT_MAX = 300;

/**
 * Trần số bình luận mỗi khoảnh khắc.
 *
 * Chỉ hai người dùng nên con số này không bao giờ chạm tới trong thực tế —
 * nó ở đây để một vòng lặp hỏng ở client không bơm được vô hạn dòng vào DB.
 */
export const MAX_COMMENTS_PER_POST = 300;

export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Chưa nhập nội dung bình luận')
    .max(COMMENT_MAX, `Bình luận tối đa ${COMMENT_MAX} ký tự`),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const commentQuerySchema = z.object({
  /** Con trỏ phân trang: `createdAtMs_commentId` của dòng cuối trang trước. */
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CommentQuery = z.infer<typeof commentQuerySchema>;

export interface CommentResponse {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  /**
   * Người đang xem có xoá được dòng này không.
   * Đúng khi họ là người viết, hoặc là chủ của khoảnh khắc.
   */
  canDelete: boolean;
}

export interface CommentListResponse {
  items: CommentResponse[];
  /** Truyền lại vào `cursor` để lấy trang kế. `null` = hết. */
  nextCursor: string | null;
  /** Tổng số bình luận của khoảnh khắc, để hiện "N bình luận" mà không phải tải hết. */
  total: number;
}
