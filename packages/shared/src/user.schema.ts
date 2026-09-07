import { z } from 'zod';
import { MESSAGING_APPS } from './constants';
import { isFutureCalendarDay } from './datetime';
import { displayNameSchema } from './auth.schema';

/**
 * Ngày sinh — dạng "YYYY-MM-DD", cho phép để trống (null) nếu không muốn khai.
 *
 * Cũng như ngày kỷ niệm, phép so sánh "tương lai" phải theo NGÀY LỊCH giờ VN
 * (xem datetime.ts), không so bằng timestamp.
 */
export const birthdaySchema = z
  .union([z.string(), z.date(), z.null()])
  .transform((v, ctx) => {
    if (v === null || v === '') return null;

    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày sinh không hợp lệ',
        fatal: true,
      });
      return z.NEVER;
    }
    if (isFutureCalendarDay(d)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày sinh không thể ở tương lai',
        fatal: true,
      });
      return z.NEVER;
    }
    if (d.getTime() < Date.UTC(1900, 0, 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày sinh không hợp lệ (trước năm 1900)',
        fatal: true,
      });
      return z.NEVER;
    }
    return d;
  });

/**
 * Cập nhật hồ sơ cá nhân.
 * Mọi trường đều tuỳ chọn — chỉ gửi lên thứ thật sự thay đổi.
 *
 * Việc kiểm tra `messagingHandle` có khớp với `messagingApp` hay không KHÔNG nằm
 * ở đây: người dùng có thể chỉ đổi một trong hai, nên phải trộn với giá trị đang
 * lưu trong DB rồi mới kiểm tra được — việc đó làm ở tầng service.
 */
export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    birthday: birthdaySchema.optional(),
    messagingApp: z.enum(MESSAGING_APPS).optional(),
    messagingHandle: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const trimmed = v.trim();
        return trimmed === '' ? null : trimmed;
      })
      .refine(
        (v) => v === undefined || v === null || v.length <= 64,
        'Thông tin liên hệ quá dài (tối đa 64 ký tự)',
      ),
  })
  .refine(
    (o) => Object.values(o).some((v) => v !== undefined),
    'Không có thay đổi nào để cập nhật',
  );

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
