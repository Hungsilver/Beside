import type { User } from '@prisma/client';
import { parsePrivacy, type PublicUser, type SelfUser } from '@beside/shared';

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
    avatarUrl: user.avatarUrl,
    birthday: user.birthday ? toDateOnly(user.birthday) : null,
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
