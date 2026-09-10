import { z } from 'zod';

/** Tối đa bao nhiêu ảnh trong một bài check-in. */
export const MAX_PHOTOS_PER_POST = 3;

/** Cạnh dài nhất khi client nén ảnh TRƯỚC khi tải lên. */
export const CLIENT_MAX_EDGE = 2048;

/** Trần dung lượng mỗi tệp mà server chấp nhận. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const CAPTION_MAX = 500;

/** Bộ emoji tâm trạng — cố định để giao diện hai bên hiển thị giống nhau. */
export const MOODS = ['🥰', '😌', '🤩', '😢', '😴', '🔥'] as const;
export type Mood = (typeof MOODS)[number];

/** Emoji thả cảm xúc lên bài. */
export const REACTIONS = ['❤️', '😍', '🥺', '🔥'] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export const createPostSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(CAPTION_MAX, `Lời nhắn tối đa ${CAPTION_MAX} ký tự`)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  mood: z.enum(MOODS).optional(),
  /** Toạ độ CHỈ được gửi khi người dùng bật "ghim lên bản đồ". */
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  placeName: z.string().trim().max(120).optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const reactionSchema = z.object({
  emoji: z.enum(REACTIONS),
});

/**
 * Số ghim ảnh tối đa lấy về cho bản đồ trong một lượt.
 *
 * Bằng đúng trần `limit` của truy vấn dòng kỷ niệm. Nhiều hơn thì bản đồ đặc
 * kín ảnh, mà mỗi ghim còn kéo theo một lượt tải ảnh nhỏ qua mạng di động.
 * Người dùng thu hẹp khoảng thời gian là cách đúng để thấy nhóm ảnh mình cần.
 */
export const MAP_PIN_LIMIT = 50;

export const feedQuerySchema = z
  .object({
    /** Con trỏ phân trang: `createdAtMs_postId` của bài cuối trang trước. */
    cursor: z.string().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    /** Lọc theo người đăng. */
    authorId: z.string().uuid().optional(),
    /** Chỉ lấy bài có ghim toạ độ. */
    pinned: z
      .union([z.boolean(), z.literal('true'), z.literal('false')])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
    /**
     * Lọc theo thời điểm đăng (epoch ms, bao gồm cả hai đầu).
     *
     * Cùng quy ước với `trailQuerySchema` — số epoch chứ không phải chuỗi ISO:
     * chuỗi ISO thiếu hậu tố múi giờ là mỗi máy hiểu một kiểu, còn số thì không
     * có chỗ cho hiểu nhầm. Client tự quy đổi ranh giới NGÀY theo giờ VN
     * (`startOfDayMs` / `endOfDayMs`) trước khi gửi lên.
     */
    from: z.coerce.number().int().positive().optional(),
    to: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: 'Khoảng thời gian không hợp lệ (từ ngày phải trước đến ngày)',
    path: ['from'],
  });
export type FeedQuery = z.infer<typeof feedQuerySchema>;

export interface PhotoResponse {
  id: string;
  /**
   * Đường dẫn TƯƠNG ĐỐI, đi qua API (`/api/v1/posts/photos/:id/:size`).
   * Mỗi lượt xem đều bị kiểm tra quyền — không phải link "ai có thì xem được".
   * URL cố định nên trình duyệt cache được vĩnh viễn.
   */
  urlThumb: string;
  urlMd: string;
  urlOrig: string;
  width: number;
  height: number;
  /** Ảnh mờ dạng data URI, hiện trong lúc ảnh thật đang tải. */
  placeholder: string;
}

export interface PostReaction {
  userId: string;
  emoji: string;
  at: number;
}

export interface PostResponse {
  id: string;
  authorId: string;
  authorName: string;
  caption: string | null;
  mood: string | null;
  lat: number | null;
  lng: number | null;
  placeName: string | null;
  photos: PhotoResponse[];
  reactions: PostReaction[];
  /** Số bình luận. Đếm sẵn ở server để dòng kỷ niệm không phải gọi thêm một vòng. */
  commentCount: number;
  createdAt: string;
  /** Người đang xem có xoá được bài này không (chỉ tác giả). */
  canDelete: boolean;
}

export interface FeedResponse {
  items: PostResponse[];
  /** Truyền lại vào `cursor` để lấy trang kế. `null` = hết. */
  nextCursor: string | null;
}

/** Sự kiện WebSocket khi có bài mới (bổ sung cho RT_EVENTS). */
export const RT_POST_NEW = 'post:new';

export interface PostNewEvent {
  postId: string;
  authorId: string;
  authorName: string;
  caption: string | null;
  urlThumb: string | null;
  createdAt: number;
}
