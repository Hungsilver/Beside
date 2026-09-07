import { GPS_SAMPLING } from './constants';
import { haversineMeters, isValidLatLng, type LatLng } from './geo';

/**
 * Lấy mẫu thích ứng (ARCHITECTURE.md §2.1).
 *
 * Mục tiêu: vệt đường vẫn mượt mà pin không tụt. Đứng yên thì gửi thưa,
 * đang chạy xe thì gửi dày. Ngoài ra loại thẳng những điểm rác mà GPS hay
 * sinh ra trong nhà hoặc giữa toà nhà cao tầng.
 */

export type MovementMode = 'STILL' | 'WALKING' | 'VEHICLE';

export function classifyMovement(speedMps: number | null | undefined): MovementMode {
  const v = typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps > 0
    ? speedMps
    : 0;
  if (v < GPS_SAMPLING.STILL.maxSpeedMps) return 'STILL';
  if (v < GPS_SAMPLING.WALKING.maxSpeedMps) return 'WALKING';
  return 'VEHICLE';
}

export function thresholdsFor(mode: MovementMode) {
  switch (mode) {
    case 'STILL':
      return GPS_SAMPLING.STILL;
    case 'WALKING':
      return GPS_SAMPLING.WALKING;
    default:
      return GPS_SAMPLING.VEHICLE;
  }
}

export interface CandidatePoint extends LatLng {
  accuracyM: number;
  speedMps: number | null;
  timestamp: number;
}

/** Điểm gần nhất ĐÃ GỬI lên server. `null` nghĩa là chưa gửi lần nào. */
export type LastSent = (LatLng & { timestamp: number }) | null;

export type SamplingDecision =
  | { send: true; reason: 'FIRST' | 'MOVED' | 'INTERVAL' }
  | {
      send: false;
      reason: 'INVALID_COORDS' | 'TOO_INACCURATE' | 'WITHIN_NOISE' | 'TOO_SOON';
    };

/**
 * Có nên gửi điểm này lên server không.
 *
 * Thứ tự kiểm tra có chủ đích: loại điểm rác TRƯỚC, rồi mới xét đến ngưỡng
 * thời gian/khoảng cách. Nếu làm ngược lại, một điểm nhiễu 500m sẽ thoả điều
 * kiện "đã dịch chuyển đủ xa" và được gửi đi ngay.
 */
export function shouldSend(point: CandidatePoint, lastSent: LastSent): SamplingDecision {
  if (!isValidLatLng(point)) {
    return { send: false, reason: 'INVALID_COORDS' };
  }

  if (
    !Number.isFinite(point.accuracyM) ||
    point.accuracyM > GPS_SAMPLING.MAX_ACCURACY_M
  ) {
    return { send: false, reason: 'TOO_INACCURATE' };
  }

  if (!lastSent) return { send: true, reason: 'FIRST' };

  const movedM = haversineMeters(lastSent, point);
  const elapsedMs = point.timestamp - lastSent.timestamp;

  // Rung GPS khi đứng yên: dịch chuyển nhỏ hơn nửa bán kính sai số thì
  // không thể phân biệt được với nhiễu, coi như chưa đi đâu cả.
  if (movedM < point.accuracyM / 2) {
    // Vẫn phải gửi định kỳ để đối phương biết "vẫn đang trực tuyến",
    // nhưng dùng nhịp của trạng thái đứng yên.
    if (elapsedMs >= GPS_SAMPLING.STILL.intervalMs) {
      return { send: true, reason: 'INTERVAL' };
    }
    return { send: false, reason: 'WITHIN_NOISE' };
  }

  const mode = classifyMovement(point.speedMps);
  const t = thresholdsFor(mode);

  if (movedM >= t.minDistanceM) return { send: true, reason: 'MOVED' };
  if (elapsedMs >= t.intervalMs) return { send: true, reason: 'INTERVAL' };

  return { send: false, reason: 'TOO_SOON' };
}

/**
 * Tốc độ suy ra từ hai điểm liên tiếp, dùng khi thiết bị không báo `speed`
 * (iOS Safari thường trả null khi đứng yên hoặc khi dùng định vị theo Wi-Fi).
 */
export function inferSpeedMps(
  from: LatLng & { timestamp: number },
  to: LatLng & { timestamp: number },
): number | null {
  const dtSec = (to.timestamp - from.timestamp) / 1000;
  if (!Number.isFinite(dtSec) || dtSec <= 0) return null;

  const speed = haversineMeters(from, to) / dtSec;
  // > 90 m/s (324 km/h) thì chắc chắn là nhảy toạ độ, không phải người thật.
  return speed > 90 ? null : speed;
}
