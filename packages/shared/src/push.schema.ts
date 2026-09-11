import { z } from 'zod';

/**
 * Thông báo đẩy (F7).
 *
 * Cả hai bên đều phải hiểu cùng một khuôn dữ liệu, vì service worker là nơi
 * DUY NHẤT xử lý thông báo khi app đã đóng — lúc đó không có React, không có
 * store, chỉ còn đúng đoạn JSON server gửi sang.
 */

export const PUSH_KINDS = [
  'EVENT_REMINDER', // sắp tới giờ hẹn
  'PARTNER_ARRIVED', // người ấy vừa tới một địa điểm đã lưu
  'PARTNER_LEFT', // người ấy vừa rời một địa điểm đã lưu
  'PARTNER_CHECKIN', // người ấy vừa đăng khoảnh khắc mới
  'PARTNER_COMMENT', // người ấy vừa bình luận vào một khoảnh khắc
  'MILESTONE', // sắp tới mốc kỷ niệm
  'GAME_TURN', // tới lượt bạn trong ván đang chơi
  'STUDY_INVITE', // người ấy vừa mở phòng học
  'STUDY_PHASE', // hết giờ học hoặc hết giờ nghỉ
  'TRIP_STARTED', // người ấy bắt đầu một chuyến "đang trên đường về"
  'TRIP_ARRIVED', // người ấy đã tới nơi
  'CYCLE_REMINDER', // sắp tới kỳ (F14)
  'TEST', // bấm "gửi thử" trong màn Cài đặt
] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** Thân thông báo mà service worker nhận được. */
export interface PushPayload {
  kind: PushKind;
  title: string;
  body: string;
  /** Mở màn nào khi người dùng bấm vào thông báo. Luôn là đường dẫn tương đối. */
  url: string;
  /**
   * Gộp thông báo trùng nhau. Hai lần nhắc cùng một sự kiện thì chỉ hiện một
   * cái, thay vì xếp chồng lên nhau trong khay thông báo.
   */
  tag?: string;
  /** Mốc thời gian server gửi, dùng để sắp xếp trong khay. */
  at: number;
}

/**
 * Đăng ký một thiết bị.
 *
 * Khuôn này khớp đúng với `PushSubscription.toJSON()` của trình duyệt để web
 * không phải nắn lại dữ liệu — càng ít chỗ nắn thì càng ít chỗ sai.
 */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url('endpoint không hợp lệ').max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  /** Chỉ để người dùng nhận ra thiết bị nào trong danh sách. */
  userAgent: z.string().max(300).optional(),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});

export interface PushConfigResponse {
  /** Khoá công khai VAPID. Rỗng = server chưa bật thông báo đẩy. */
  publicKey: string;
  enabled: boolean;
}

export interface PushSubscriptionSummary {
  id: string;
  /** Đã rút gọn — endpoint đầy đủ là dữ liệu định danh thiết bị, không phô ra. */
  device: string;
  createdAt: string;
  /** Có phải chính thiết bị đang mở màn hình này không. */
  current: boolean;
}

/**
 * Đoán tên thiết bị từ user agent, chỉ để hiển thị.
 * Không dùng cho bất kỳ quyết định nghiệp vụ nào — user agent bịa được.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (!ua) return 'Thiết bị không rõ';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Điện thoại Android';
  if (/Macintosh/i.test(ua)) return 'Máy Mac';
  if (/Windows/i.test(ua)) return 'Máy Windows';
  return 'Thiết bị khác';
}
