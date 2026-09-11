import { z } from 'zod';

/**
 * F13 — "Đang trên đường về".
 *
 * ── Vì sao có tính năng này ─────────────────────────────────────────────────
 * Mô hình Live Session (§2) chỉ hữu ích khi người kia ĐANG mở tab Bản đồ mà
 * nhìn. Nhưng đúng lúc cần nhất — đi làm về khuya — thì người ở nhà đang làm
 * việc khác. Chuyến đi lật ngược thế: người đi bấm một nút, người ở nhà nhận
 * thông báo lúc bắt đầu và lúc tới nơi, ở giữa thì liếc bản đồ nếu muốn.
 *
 * Toàn bộ phần khó đã có sẵn: vị trí trực tiếp (F2), hàng rào ảo báo "đã tới
 * nơi" (F6), thông báo đẩy (F7). Ở đây chỉ là chỗ nối ba thứ đó lại.
 */

export const TRIP_STATUSES = ['ACTIVE', 'ARRIVED', 'CANCELLED', 'EXPIRED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/**
 * Chuyến đi quá ngần này mà chưa tới nơi thì tự huỷ.
 *
 * Ba giờ đủ cho mọi quãng đường trong thành phố kể cả tắc đường. Dài hơn thì
 * gần như chắc chắn là người dùng quên bấm "đã tới nơi", và một chuyến treo
 * mãi trên màn hình người kia còn tệ hơn là không có chuyến nào.
 */
export const TRIP_MAX_DURATION_MS = 3 * 60 * 60 * 1000;

/**
 * Tốc độ giả định khi chưa đo được (m/s) — 25 km/h.
 *
 * Đây là tốc độ trung bình thực tế của xe máy trong nội thành giờ cao điểm,
 * đã tính cả đèn đỏ. Lấy tốc độ tức thời của GPS làm chuẩn thì lúc đang dừng
 * đèn đỏ sẽ ra "còn 9 tiếng nữa".
 */
export const TRIP_FALLBACK_SPEED_MPS = 25_000 / 3600;

/** Dưới ngưỡng này coi như đang đứng yên, không dùng để tính giờ tới. */
const MIN_USABLE_SPEED_MPS = 2;

/** Trần giờ dự kiến — quá xa thì con số không còn nghĩa gì. */
const MAX_ETA_MS = 6 * 60 * 60 * 1000;

export const startTripSchema = z.object({
  /** Điểm đến phải là một Địa điểm đã lưu của couple (xem chú thích model Trip). */
  placeId: z.string().uuid('Chọn một địa điểm đã lưu'),
});
export type StartTripInput = z.infer<typeof startTripSchema>;

export interface TripResponse {
  id: string;
  status: TripStatus;
  /** Ai đang đi. So với `me` ở client để biết đây là chuyến của mình hay của người ấy. */
  userId: string;
  userName: string;
  placeId: string;
  placeName: string;
  placeEmoji: string;
  startedAt: string;
  arrivedAt: string | null;
  /** Khoảng cách còn lại (m) theo điểm vị trí mới nhất. `null` = chưa biết. */
  remainingM: number | null;
  /** Giờ dự kiến tới nơi (ISO). `null` khi chưa có vị trí nào để tính. */
  etaAt: string | null;
  /** Vị trí dùng để tính hai số trên cũ tới mức nào (epoch ms). */
  basedOnTs: number | null;
}

/**
 * Số mili-giây còn lại của chuyến đi.
 *
 * Dùng tốc độ đo được khi nó đủ lớn để tin (đang thật sự di chuyển), còn lại
 * thì dùng tốc độ trung bình nội thành. Kết quả luôn được làm tròn lên phút và
 * chặn trên, vì một con số quá chi tiết ("còn 7 phút 23 giây") vừa sai vừa tạo
 * cảm giác chính xác giả.
 *
 * Trả `null` khi không tính được — giao diện phải nói "đang tính" chứ không
 * được bịa ra một con số.
 */
export function estimateRemainingMs(
  remainingM: number | null,
  speedMps: number | null,
): number | null {
  if (remainingM === null || !Number.isFinite(remainingM) || remainingM < 0) return null;

  const speed =
    speedMps !== null && Number.isFinite(speedMps) && speedMps >= MIN_USABLE_SPEED_MPS
      ? speedMps
      : TRIP_FALLBACK_SPEED_MPS;

  const ms = (remainingM / speed) * 1000;
  if (!Number.isFinite(ms)) return null;
  // Làm tròn lên phút: "còn dưới 1 phút" vẫn hiện là 1 phút, không phải 0.
  return Math.min(MAX_ETA_MS, Math.ceil(ms / 60_000) * 60_000);
}

/** "còn 12 phút" · "còn 1 giờ 5 phút" · "sắp tới nơi". */
export function formatRemaining(ms: number | null): string {
  if (ms === null) return 'đang tính...';
  const minutes = Math.round(ms / 60_000);
  if (minutes <= 1) return 'sắp tới nơi';
  if (minutes < 60) return `còn ${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `còn ${h} giờ` : `còn ${h} giờ ${m} phút`;
}
