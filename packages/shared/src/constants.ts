/**
 * Hằng số dùng chung giữa API và Web.
 * Đổi ở đây là đổi cả hai phía — không được khai báo trùng ở nơi khác.
 */

/** Bảng chữ cái sinh mã ghép đôi.
 *  Đã bỏ 0 / O / 1 / I để người dùng không đọc nhầm khi chép tay. */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const INVITE_CODE_LENGTH = 6;

/** Số ký tự tối thiểu / tối đa của mật khẩu.
 *  Trần 72 byte là giới hạn của bcrypt — giữ lại để sau này đổi thuật toán không vỡ dữ liệu. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export const DISPLAY_NAME_MAX_LENGTH = 40;

/** Múi giờ hiển thị. DB luôn lưu UTC. */
export const DISPLAY_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Ứng dụng nhắn tin cho nút deep-link (F9 — không có chat trong app). */
export const MESSAGING_APPS = ['ZALO', 'MESSENGER', 'PHONE', 'SMS'] as const;
export type MessagingApp = (typeof MESSAGING_APPS)[number];

/** Mốc "ngày yêu" tự sinh (đơn vị: ngày). */
export const AUTO_MILESTONE_DAYS = [
  100, 200, 300, 365, 500, 730, 1000, 1095, 1460, 1500, 1825, 2000, 2555, 3000,
] as const;

/** Ngưỡng lấy mẫu GPS thích ứng — xem ARCHITECTURE.md §2.1 */
export const GPS_SAMPLING = {
  /** Bỏ hẳn điểm có sai số lớn hơn ngưỡng này (mét) */
  MAX_ACCURACY_M: 100,
  STILL: { maxSpeedMps: 1, intervalMs: 60_000, minDistanceM: 50 },
  WALKING: { maxSpeedMps: 3, intervalMs: 20_000, minDistanceM: 30 },
  VEHICLE: { maxSpeedMps: Infinity, intervalMs: 8_000, minDistanceM: 80 },
} as const;

/** Bán kính geofence cho phép (mét). */
export const PLACE_RADIUS_MIN_M = 50;
export const PLACE_RADIUS_MAX_M = 2000;
export const PLACE_RADIUS_DEFAULT_M = 150;

/** Ra khỏi vùng phải vượt thêm ngần này mét mới tính là "đã rời"
 *  (chống bắn thông báo liên tục khi đứng ngay ranh giới). */
export const GEOFENCE_EXIT_HYSTERESIS_M = 30;
