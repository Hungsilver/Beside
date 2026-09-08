import type { User } from '@prisma/client';
import { parsePrivacy, type PublicUser, type SelfUser } from '@beside/shared';

/** Ảnh đại diện đi qua API để còn kiểm tra quyền, giống hệt ảnh check-in. */
const AVATAR_URL_PREFIX = '/api/v1/users';

/**
 * Dựng đường dẫn ảnh đại diện.
 *
 * Đường dẫn TƯƠNG ĐỐI nên đổi tên miền không phải sửa gì. Kèm `?v=<avatarId>`
 * để mỗi lần đổi ảnh là một URL khác — nhờ vậy đặt được `immutable` cho cache
 * mà người dùng vẫn thấy ảnh mới ngay. Chưa có ảnh thì trả `null` để client
 * tự vẽ chữ cái đầu, chứ không trả một URL sẽ 404.
 */
export function avatarUrlFor(userId: string, avatarId: string | null): string | null {
  if (!avatarId) return null;
  return `${AVATAR_URL_PREFIX}/${userId}/avatar/md?v=${avatarId}`;
}

/**
 * Chuyển bản ghi User trong DB thành dữ liệu trả ra ngoài.
 *
 * ĐÂY LÀ HÀNG RÀO DUY NHẤT giữa DB và client — mọi endpoint trả về user
 * PHẢI đi qua hàm này. Không bao giờ `res.json(user)` thẳng, vì như vậy
 * `passwordHash` sẽ lọt ra ngoài khi ai đó thêm trường mới vào schema.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: avatarUrlFor(user.id, user.avatarId),
    birthday: user.birthday ? toDateOnly(user.birthday) : null,
    bio: user.bio,
    address: user.address,
    coupleId: user.coupleId,
    messagingApp: user.messagingApp,
    messagingHandle: user.messagingHandle,
  };
}

/**
 * Hồ sơ của chính người đang đăng nhập — kèm cài đặt riêng tư.
 * CHỈ dùng cho GET/PATCH /me, không bao giờ dùng cho `partner`.
 */
export function toSelfUser(user: User): SelfUser {
  return { ...toPublicUser(user), privacy: parsePrivacy(user.privacy) };
}

/** Cột kiểu DATE của Postgres được Prisma trả về là Date lúc 00:00 UTC. */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
