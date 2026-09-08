import { z } from 'zod';
import {
  GEOFENCE_EXIT_HYSTERESIS_M,
  PLACE_RADIUS_DEFAULT_M,
  PLACE_RADIUS_MAX_M,
  PLACE_RADIUS_MIN_M,
} from './constants';

/**
 * Địa điểm đã lưu & hàng rào ảo (F6).
 *
 * "Nhà em", "Công ty anh", "Quán quen" — mỗi nơi là một hình tròn. Server so
 * từng điểm vị trí nhận được với các hình tròn này rồi báo cho người kia biết
 * "vừa tới nơi" / "vừa rời đi".
 */

export const PLACE_NAME_MAX = 60;

/*
 * Giới hạn bán kính (PLACE_RADIUS_MIN_M = 50 m …) đã có sẵn trong `constants.ts`
 * từ Phase 0 — dùng lại chứ không khai báo bản thứ hai.
 *
 * Vì sao tối thiểu 50 m: GPS trên điện thoại giữa phố sai số thường 10–30 m,
 * trong nhà còn tệ hơn. Hàng rào 20 m sẽ bật/tắt liên tục dù người ta ngồi im.
 */

/** Trần số địa điểm mỗi cặp đôi — đủ dùng, và chặn việc rải hàng rào khắp thành phố. */
export const MAX_PLACES_PER_COUPLE = 20;

/*
 * Khoảng chênh vào/ra (`GEOFENCE_EXIT_HYSTERESIS_M = 30 m`) cũng đã có sẵn trong
 * `constants.ts` từ Phase 0 — dùng lại, không đặt thêm một núm thứ hai.
 *
 * Không có khoảng chênh này, người ngồi ngay mép hàng rào sẽ sinh ra một tràng
 * "vừa tới / vừa rời / vừa tới…" chỉ vì GPS nhiễu vài chục mét.
 */

/**
 * Phải ở trong hàng rào ít nhất bằng này mới báo "đã tới nơi".
 *
 * Đi xe ngang qua nhà thì không phải là "về tới nhà". 60 giây đủ để loại các
 * lần chạy ngang mà vẫn báo kịp lúc người ta thật sự dừng lại.
 */
export const GEOFENCE_MIN_DWELL_MS = 60_000;

export const PLACE_EMOJIS = ['🏠', '🏢', '☕', '🍜', '🏫', '🏥', '🏋️', '💖'] as const;

export const createPlaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Địa điểm cần có tên')
    .max(PLACE_NAME_MAX, `Tên địa điểm tối đa ${PLACE_NAME_MAX} ký tự`),
  emoji: z.string().trim().min(1).max(8).default('📍'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.coerce
    .number()
    .int()
    .min(PLACE_RADIUS_MIN_M, `Bán kính tối thiểu ${PLACE_RADIUS_MIN_M}m — nhỏ hơn thì GPS nhiễu sẽ báo loạn`)
    .max(PLACE_RADIUS_MAX_M, `Bán kính tối đa ${PLACE_RADIUS_MAX_M}m`)
    .default(PLACE_RADIUS_DEFAULT_M),
  notifyOnArrive: z.boolean().default(true),
  notifyOnLeave: z.boolean().default(false),
});
export type CreatePlaceInput = z.infer<typeof createPlaceSchema>;

export const updatePlaceSchema = createPlaceSchema;
export type UpdatePlaceInput = CreatePlaceInput;

export interface PlaceResponse {
  id: string;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  radiusM: number;
  notifyOnArrive: boolean;
  notifyOnLeave: boolean;
  /** Ai đang ở trong hàng rào này ngay lúc này (id người dùng). */
  peopleInside: string[];
}

/**
 * Điểm vị trí này có đủ chính xác để kết luận gì về hàng rào không?
 *
 * Một điểm sai số 500 m KHÔNG thể trả lời "người này có đang trong vòng 150 m
 * quanh nhà không". Dùng nó là sinh ra thông báo sai — mà thông báo sai về vị
 * trí thì tệ hơn hẳn không có thông báo.
 */
export function accuracyUsableFor(accuracyM: number, radiusM: number): boolean {
  if (!Number.isFinite(accuracyM) || accuracyM < 0) return false;
  return accuracyM <= radiusM;
}

/** Trạng thái tiếp theo của một hàng rào, tính từ khoảng cách hiện tại. */
export type GeofenceTransition = 'ENTER' | 'EXIT' | 'STAY_IN' | 'STAY_OUT';

/**
 * Quyết định chuyển trạng thái, có tính khoảng chênh vào/ra.
 *
 * Tách riêng thành hàm thuần để test được mọi biên mà không cần DB hay GPS.
 */
export function decideTransition(
  wasInside: boolean,
  distanceM: number,
  radiusM: number,
): GeofenceTransition {
  if (wasInside) {
    // Đang ở trong: chỉ tính là ra khi đã vượt qua vành ngoài.
    return distanceM > radiusM + GEOFENCE_EXIT_HYSTERESIS_M ? 'EXIT' : 'STAY_IN';
  }
  return distanceM <= radiusM ? 'ENTER' : 'STAY_OUT';
}
