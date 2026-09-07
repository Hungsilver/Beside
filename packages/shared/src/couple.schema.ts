import { z } from 'zod';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  MESSAGING_APPS,
} from './constants';
import { isFutureCalendarDay } from './datetime';
import type { PublicUser } from './auth.schema';

const inviteCodePattern = new RegExp(
  `^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`,
);

export const inviteCodeSchema = z
  .string({ required_error: 'Vui lòng nhập mã ghép đôi' })
  .trim()
  .toUpperCase()
  // Người dùng hay chép cả dấu cách/gạch ngang từ tin nhắn — dọn trước khi kiểm tra.
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine(
    (v) => inviteCodePattern.test(v),
    `Mã gồm ${INVITE_CODE_LENGTH} ký tự, không chứa số 0/1 và chữ O/I`,
  );

/**
 * Ngày bắt đầu yêu.
 * - Không cho phép ngày tương lai (đếm ngày yêu sẽ ra số âm).
 * - Không cho phép trước 1900 (gần như chắc chắn là gõ nhầm).
 * - Nhận cả chuỗi "YYYY-MM-DD" lẫn ISO đầy đủ.
 *
 * Toàn bộ kiểm tra nằm TRONG MỘT transform duy nhất, không tách thành
 * `.transform().refine().refine()`: trong Zod v3, `z.NEVER` trả về từ transform
 * vẫn được truyền tiếp cho các refine phía sau → refine sẽ gọi `.getTime()`
 * trên giá trị rác và ném TypeError thay vì báo lỗi validate tử tế.
 */
export const anniversarySchema = z
  .union([z.string(), z.date()])
  .transform((v, ctx) => {
    const d = v instanceof Date ? v : new Date(v);

    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày không hợp lệ',
        fatal: true,
      });
      return z.NEVER;
    }

    // So theo NGÀY LỊCH giờ VN, không so timestamp — xem datetime.ts
    if (isFutureCalendarDay(d)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày yêu không thể ở tương lai',
        fatal: true,
      });
      return z.NEVER;
    }

    if (d.getTime() < Date.UTC(1900, 0, 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày yêu không hợp lệ (trước năm 1900)',
        fatal: true,
      });
      return z.NEVER;
    }

    return d;
  });

export const createCoupleSchema = z.object({
  anniversaryAt: anniversarySchema,
});
export type CreateCoupleInput = z.input<typeof createCoupleSchema>;

export const joinCoupleSchema = z.object({
  inviteCode: inviteCodeSchema,
});
export type JoinCoupleInput = z.input<typeof joinCoupleSchema>;

export const updateCoupleSchema = z
  .object({
    anniversaryAt: anniversarySchema.optional(),
  })
  .refine(
    (o) => Object.values(o).some((v) => v !== undefined),
    'Không có thay đổi nào để cập nhật',
  );

export const updateMessagingSchema = z.object({
  messagingApp: z.enum(MESSAGING_APPS),
  messagingHandle: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
});

/** Couple như API trả về. `inviteCode` chỉ hiện khi chưa đủ 2 người. */
export interface CoupleResponse {
  id: string;
  anniversaryAt: string;
  createdAt: string;
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  members: PublicUser[];
  /** Người còn lại trong cặp — null khi chưa ai ghép vào. */
  partner: PublicUser | null;
}

export interface LoveSummary {
  anniversaryAt: string;
  /** Số ngày đã bên nhau, tính theo ngày lịch ở Asia/Ho_Chi_Minh. */
  daysTogether: number;
  years: number;
  months: number;
  days: number;
  nextMilestone: {
    title: string;
    date: string;
    daysLeft: number;
    /** Phần trăm đã đi được từ mốc trước tới mốc này (0–100). */
    progressPercent: number;
  } | null;
}
