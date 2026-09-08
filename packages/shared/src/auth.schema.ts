import { z } from 'zod';
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './constants';
import type { Privacy } from './location.schema';

export const emailSchema = z
  .string({ required_error: 'Vui lòng nhập email' })
  .trim()
  .toLowerCase()
  .min(1, 'Vui lòng nhập email')
  .email('Email không hợp lệ')
  .max(254, 'Email quá dài');

export const displayNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên hiển thị' })
  .trim()
  .min(1, 'Vui lòng nhập tên hiển thị')
  .max(DISPLAY_NAME_MAX_LENGTH, `Tên tối đa ${DISPLAY_NAME_MAX_LENGTH} ký tự`);

export const passwordSchema = z
  .string({ required_error: 'Vui lòng nhập mật khẩu' })
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`)
  // Đo bằng BYTE chứ không phải ký tự: tiếng Việt có dấu chiếm 2–3 byte,
  // nếu đo bằng .length thì chuỗi vẫn có thể vượt trần của thuật toán băm.
  // Dùng TextEncoder (có ở cả Node lẫn trình duyệt) — KHÔNG dùng Buffer,
  // vì file này được bundle vào cả web.
  .refine(
    (v) => utf8ByteLength(v) <= PASSWORD_MAX_LENGTH,
    `Mật khẩu quá dài (tối đa ${PASSWORD_MAX_LENGTH} byte)`,
  );

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export const registerSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Khi đăng nhập chỉ kiểm tra "có nhập gì đó" — không áp luật độ dài,
  // để thông báo lỗi không tiết lộ quy tắc mật khẩu cho người dò.
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Người dùng như API trả về cho client (không bao giờ chứa hash mật khẩu). */
export interface PublicUser {
  id: string;
  displayName: string;
  email: string | null;
  /**
   * Đường dẫn TƯƠNG ĐỐI tới ảnh đại diện, đã kèm phiên bản (`?v=`).
   * `null` nghĩa là chưa đặt ảnh — client tự vẽ chữ cái đầu thay thế.
   */
  avatarUrl: string | null;
  birthday: string | null;
  /** Vài dòng tự giới thiệu. */
  bio: string | null;
  /** Địa chỉ tự gõ, chỉ để người ấy biết — không liên quan tới định vị. */
  address: string | null;
  coupleId: string | null;
  messagingApp: string;
  messagingHandle: string | null;
}

/**
 * Hồ sơ của CHÍNH MÌNH — có thêm cài đặt riêng tư.
 *
 * Tách riêng khỏi PublicUser vì PublicUser còn được dùng cho trường `partner`
 * trong CoupleResponse. Nếu nhét privacy vào PublicUser thì cài đặt riêng tư
 * của một người sẽ lộ sang phía người kia.
 */
export interface SelfUser extends PublicUser {
  privacy: Privacy;
}

export interface AuthResponse {
  accessToken: string;
  /** Số giây còn hiệu lực của accessToken, để client hẹn giờ refresh trước khi hết hạn. */
  expiresIn: number;
  /** Luôn là hồ sơ của CHÍNH người vừa đăng nhập → dùng SelfUser, có privacy. */
  user: SelfUser;
}
