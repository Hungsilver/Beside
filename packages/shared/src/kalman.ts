import type { LatLng } from './geo';

/**
 * Bộ lọc Kalman một chiều cho toạ độ GPS (ARCHITECTURE.md §2.1).
 *
 * Bài toán: GPS điện thoại nhảy loạn khi tín hiệu yếu — đang đứng yên trong nhà
 * mà chấm định vị chạy vòng vòng 50m. Vẽ thẳng lên bản đồ thì vệt đường trông
 * như người dùng đang co giật.
 *
 * Cách xử lý: coi vị trí thật là ẩn, mỗi lần đo là một quan sát có nhiễu với
 * phương sai = accuracy². Bộ lọc cân giữa "tin vào vị trí đã ước lượng" và
 * "tin vào phép đo mới" theo độ chính xác của phép đo:
 *
 *   dự đoán : variance += Δt * Q        (càng lâu không đo, càng bớt chắc chắn)
 *   cập nhật: K = variance / (variance + accuracy²)
 *             ước lượng += K * (đo được - ước lượng)
 *             variance = (1 - K) * variance
 *
 * accuracy nhỏ (trời quang, 5m) → K lớn → bám sát phép đo.
 * accuracy lớn (trong nhà, 60m) → K nhỏ → giữ nguyên ước lượng cũ, bỏ qua nhiễu.
 *
 * Chạy ở CLIENT, trước khi gửi lên server — server chỉ lưu điểm đã lọc.
 */

/** Nhiễu quá trình (m²/s): người có thể di chuyển bao nhanh giữa hai lần đo. */
const DEFAULT_PROCESS_NOISE = 3;

/** Sàn cho accuracy. Thiết bị đôi khi báo 0 — nếu tin thì K = 1 và bộ lọc vô dụng. */
const MIN_ACCURACY_M = 1;

export interface GpsSample {
  lat: number;
  lng: number;
  /** Bán kính sai số do thiết bị báo, tính bằng mét. */
  accuracyM: number;
  /** Mốc thời gian của phép đo (ms). */
  timestamp: number;
}

export interface FilteredPoint extends LatLng {
  /** Độ chính xác SAU khi lọc — luôn ≤ accuracy của phép đo. */
  accuracyM: number;
  timestamp: number;
}

export class KalmanLocationFilter {
  private lat = 0;
  private lng = 0;
  private variance = -1; // < 0 nghĩa là chưa có phép đo nào
  private timestamp = 0;

  constructor(private readonly processNoise: number = DEFAULT_PROCESS_NOISE) {}

  /** Đã nhận được phép đo nào chưa. */
  get initialized(): boolean {
    return this.variance >= 0;
  }

  /** Quên hết trạng thái — gọi khi mở phiên chia sẻ mới, hoặc sau khi mất tín hiệu lâu. */
  reset(): void {
    this.variance = -1;
    this.timestamp = 0;
  }

  process(sample: GpsSample): FilteredPoint {
    const accuracy = Math.max(MIN_ACCURACY_M, sample.accuracyM);

    // Phép đo đầu tiên: không có gì để cân, lấy nguyên.
    if (this.variance < 0) {
      this.lat = sample.lat;
      this.lng = sample.lng;
      this.variance = accuracy * accuracy;
      this.timestamp = sample.timestamp;
      return this.snapshot();
    }

    // Bước dự đoán. Δt âm nghĩa là điểm tới muộn/lệch đồng hồ — coi như 0
    // thay vì để variance giảm đi, vì variance giảm sai sẽ khiến bộ lọc
    // tự tin quá mức và bỏ qua các phép đo đúng sau đó.
    const dtSec = Math.max(0, (sample.timestamp - this.timestamp) / 1000);
    if (dtSec > 0) {
      this.variance += dtSec * this.processNoise * this.processNoise;
      this.timestamp = sample.timestamp;
    }

    // Bước cập nhật
    const gain = this.variance / (this.variance + accuracy * accuracy);
    this.lat += gain * (sample.lat - this.lat);
    this.lng += gain * (sample.lng - this.lng);
    this.variance *= 1 - gain;

    return this.snapshot();
  }

  private snapshot(): FilteredPoint {
    return {
      lat: this.lat,
      lng: this.lng,
      accuracyM: Math.sqrt(this.variance),
      timestamp: this.timestamp,
    };
  }
}
