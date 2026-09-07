import { describe, expect, it } from 'vitest';
import { KalmanLocationFilter } from './kalman';
import { haversineMeters } from './geo';

const BASE = { lat: 10.7769, lng: 106.7009 };

/** Sinh nhiễu lặp lại được, để test không "chớp tắt". */
function seededNoise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1; // [-1, 1]
  };
}

describe('KalmanLocationFilter', () => {
  it('phép đo đầu tiên được lấy nguyên', () => {
    const f = new KalmanLocationFilter();
    expect(f.initialized).toBe(false);

    const out = f.process({ ...BASE, accuracyM: 12, timestamp: 1000 });

    expect(out.lat).toBe(BASE.lat);
    expect(out.lng).toBe(BASE.lng);
    expect(f.initialized).toBe(true);
  });

  it('đứng yên với GPS nhiễu: kết quả bám sát vị trí thật hơn hẳn dữ liệu thô', () => {
    const f = new KalmanLocationFilter();
    const noise = seededNoise(42);

    let rawError = 0;
    let filteredError = 0;
    let last = { lat: 0, lng: 0 };

    for (let i = 0; i < 60; i += 1) {
      // Nhiễu ±0,00025 độ ≈ ±28 m, đúng kiểu GPS trong nhà
      const raw = {
        lat: BASE.lat + noise() * 0.00025,
        lng: BASE.lng + noise() * 0.00025,
        accuracyM: 30,
        timestamp: 1000 + i * 5000,
      };
      const out = f.process(raw);

      // Bỏ 10 điểm đầu để bộ lọc kịp hội tụ
      if (i >= 10) {
        rawError += haversineMeters(BASE, raw);
        filteredError += haversineMeters(BASE, out);
      }
      last = out;
    }

    expect(filteredError).toBeLessThan(rawError / 2);
    // Vẫn phải quanh quẩn chỗ cũ, không trôi đi đâu
    expect(haversineMeters(BASE, last)).toBeLessThan(20);
  });

  it('vẫn bám theo khi người dùng thật sự di chuyển', () => {
    const f = new KalmanLocationFilter();
    f.process({ ...BASE, accuracyM: 8, timestamp: 0 });

    // Đi thẳng về phía Bắc ~11 m mỗi 5 giây trong 20 bước (~220 m)
    let out = { lat: BASE.lat, lng: BASE.lng, accuracyM: 0, timestamp: 0 };
    for (let i = 1; i <= 20; i += 1) {
      out = f.process({
        lat: BASE.lat + i * 0.0001,
        lng: BASE.lng,
        accuracyM: 8,
        timestamp: i * 5000,
      });
    }

    const target = { lat: BASE.lat + 20 * 0.0001, lng: BASE.lng };
    // Bám sát trong vòng 15 m — có trễ chút là bình thường, nhưng không được kẹt lại
    expect(haversineMeters(target, out)).toBeLessThan(15);
    expect(haversineMeters(BASE, out)).toBeGreaterThan(180);
  });

  it('phép đo càng chính xác thì càng được tin — accuracy 3m kéo mạnh hơn accuracy 80m', () => {
    const near = new KalmanLocationFilter();
    const far = new KalmanLocationFilter();
    const start = { ...BASE, accuracyM: 10, timestamp: 0 };
    near.process(start);
    far.process(start);

    const jump = { lat: BASE.lat + 0.001, lng: BASE.lng, timestamp: 1000 };
    const a = near.process({ ...jump, accuracyM: 3 });
    const b = far.process({ ...jump, accuracyM: 80 });

    expect(Math.abs(a.lat - jump.lat)).toBeLessThan(Math.abs(b.lat - jump.lat));
  });

  it('accuracy = 0 do thiết bị báo sai không làm bộ lọc mất tác dụng', () => {
    const f = new KalmanLocationFilter();
    f.process({ ...BASE, accuracyM: 10, timestamp: 0 });
    const out = f.process({ lat: BASE.lat + 0.01, lng: BASE.lng, accuracyM: 0, timestamp: 1000 });

    expect(Number.isFinite(out.lat)).toBe(true);
    expect(Number.isFinite(out.accuracyM)).toBe(true);
    // Nếu tin accuracy=0 hoàn toàn thì K = 1 và ước lượng nhảy nguyên vào điểm mới
    expect(out.lat).not.toBe(BASE.lat + 0.01);
  });

  it('mốc thời gian lùi về quá khứ không làm hỏng trạng thái', () => {
    const f = new KalmanLocationFilter();
    f.process({ ...BASE, accuracyM: 10, timestamp: 10_000 });
    const out = f.process({ ...BASE, accuracyM: 10, timestamp: 5_000 });

    expect(Number.isFinite(out.lat)).toBe(true);
    expect(out.accuracyM).toBeGreaterThan(0);
    // Không được lùi đồng hồ nội bộ
    expect(out.timestamp).toBe(10_000);
  });

  it('độ chính xác sau lọc không tệ hơn phép đo', () => {
    const f = new KalmanLocationFilter();
    let out = f.process({ ...BASE, accuracyM: 40, timestamp: 0 });
    for (let i = 1; i <= 10; i += 1) {
      out = f.process({ ...BASE, accuracyM: 40, timestamp: i * 2000 });
    }
    expect(out.accuracyM).toBeLessThan(40);
  });

  it('reset() xoá sạch trạng thái', () => {
    const f = new KalmanLocationFilter();
    f.process({ ...BASE, accuracyM: 10, timestamp: 0 });
    f.reset();
    expect(f.initialized).toBe(false);

    const out = f.process({ lat: 21.0278, lng: 105.8342, accuracyM: 5, timestamp: 1000 });
    expect(out.lat).toBe(21.0278); // lấy nguyên như phép đo đầu tiên
  });

  it('khoảng lặng dài làm bộ lọc bớt tự tin và tin phép đo mới hơn', () => {
    const quick = new KalmanLocationFilter();
    const slow = new KalmanLocationFilter();
    quick.process({ ...BASE, accuracyM: 5, timestamp: 0 });
    slow.process({ ...BASE, accuracyM: 5, timestamp: 0 });

    const target = { lat: BASE.lat + 0.005, lng: BASE.lng, accuracyM: 20 };
    const a = quick.process({ ...target, timestamp: 1_000 }); // 1 giây sau
    const b = slow.process({ ...target, timestamp: 600_000 }); // 10 phút sau

    expect(Math.abs(b.lat - target.lat)).toBeLessThan(Math.abs(a.lat - target.lat));
  });
});
