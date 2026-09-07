import { describe, expect, it } from 'vitest';
import { classifyMovement, inferSpeedMps, shouldSend, type LastSent } from './sampling';

const BASE = { lat: 10.7769, lng: 106.7009 };

/** Dịch chuyển về phía Bắc n mét (1 độ vĩ ≈ 111.320 m). */
const northOf = (m: number) => ({ lat: BASE.lat + m / 111_320, lng: BASE.lng });

describe('classifyMovement', () => {
  it('phân loại theo tốc độ', () => {
    expect(classifyMovement(0)).toBe('STILL');
    expect(classifyMovement(0.5)).toBe('STILL');
    expect(classifyMovement(1.5)).toBe('WALKING');
    expect(classifyMovement(2.9)).toBe('WALKING');
    expect(classifyMovement(10)).toBe('VEHICLE');
  });

  it('không có dữ liệu tốc độ thì coi như đứng yên (tiết kiệm pin)', () => {
    expect(classifyMovement(null)).toBe('STILL');
    expect(classifyMovement(undefined)).toBe('STILL');
    expect(classifyMovement(Number.NaN)).toBe('STILL');
    expect(classifyMovement(-5)).toBe('STILL');
  });
});

describe('shouldSend', () => {
  it('điểm đầu tiên luôn được gửi', () => {
    const d = shouldSend({ ...BASE, accuracyM: 10, speedMps: 0, ts: 0 } as never, null);
    expect(d).toEqual({ send: true, reason: 'FIRST' });
  });

  it('loại điểm có sai số quá lớn TRƯỚC khi xét khoảng cách', () => {
    // Điểm nhiễu 500m: nếu xét khoảng cách trước thì nó sẽ được coi là
    // "đã đi đủ xa" và lọt lên server.
    const last: LastSent = { ...BASE, timestamp: 0 };
    const d = shouldSend(
      { ...northOf(500), accuracyM: 350, speedMps: null, timestamp: 5000 },
      last,
    );
    expect(d).toEqual({ send: false, reason: 'TOO_INACCURATE' });
  });

  it('loại toạ độ không hợp lệ', () => {
    const last: LastSent = { ...BASE, timestamp: 0 };
    expect(
      shouldSend({ lat: 0, lng: 0, accuracyM: 5, speedMps: 0, timestamp: 1000 }, last).reason,
    ).toBe('INVALID_COORDS');
    expect(
      shouldSend({ lat: 999, lng: 106, accuracyM: 5, speedMps: 0, timestamp: 1000 }, last)
        .reason,
    ).toBe('INVALID_COORDS');
  });

  it('rung GPS khi đứng yên bị bỏ qua', () => {
    const last: LastSent = { ...BASE, timestamp: 0 };
    // Dịch 8 m nhưng sai số 30 m → không phân biệt được với nhiễu
    const d = shouldSend(
      { ...northOf(8), accuracyM: 30, speedMps: 0, timestamp: 10_000 },
      last,
    );
    expect(d).toEqual({ send: false, reason: 'WITHIN_NOISE' });
  });

  it('đứng yên vẫn gửi mỗi 60 giây để đối phương biết mình còn trực tuyến', () => {
    const last: LastSent = { ...BASE, timestamp: 0 };
    const d = shouldSend(
      { ...northOf(8), accuracyM: 30, speedMps: 0, timestamp: 60_000 },
      last,
    );
    expect(d).toEqual({ send: true, reason: 'INTERVAL' });
  });

  it('đi bộ: gửi khi đã đi hơn 30 m', () => {
    const last: LastSent = { ...BASE, timestamp: 0 };
    expect(
      shouldSend({ ...northOf(35), accuracyM: 8, speedMps: 1.4, timestamp: 25_000 }, last),
    ).toEqual({ send: true, reason: 'MOVED' });

    expect(
      shouldSend({ ...northOf(20), accuracyM: 8, speedMps: 1.4, timestamp: 5_000 }, last)
        .send,
    ).toBe(false);
  });

  it('đi xe: ngưỡng khoảng cách rộng hơn nhưng nhịp thời gian dày hơn', () => {
    const last: LastSent = { ...BASE, timestamp: 0 };

    // 50 m khi đang chạy xe thì chưa cần gửi (ngưỡng 80 m) và chưa tới 8 giây
    expect(
      shouldSend({ ...northOf(50), accuracyM: 10, speedMps: 12, timestamp: 4_000 }, last).send,
    ).toBe(false);

    // Quá 8 giây thì gửi dù chưa đủ 80 m
    expect(
      shouldSend({ ...northOf(50), accuracyM: 10, speedMps: 12, timestamp: 9_000 }, last),
    ).toEqual({ send: true, reason: 'INTERVAL' });

    // Đủ 80 m thì gửi ngay
    expect(
      shouldSend({ ...northOf(90), accuracyM: 10, speedMps: 12, timestamp: 3_000 }, last),
    ).toEqual({ send: true, reason: 'MOVED' });
  });

  it('mô phỏng một chuyến đi: số lần gửi phải ít hơn hẳn số lần đo', () => {
    // watchPosition bắn ~1 điểm/giây; đi xe máy 25 km/h trong 5 phút
    let last: LastSent = null;
    let sent = 0;
    const total = 300;

    for (let i = 0; i < total; i += 1) {
      const point = {
        ...northOf(i * 7), // ~7 m/giây ≈ 25 km/h
        accuracyM: 12,
        speedMps: 7,
        timestamp: i * 1000,
      };
      const d = shouldSend(point, last);
      if (d.send) {
        sent += 1;
        last = { lat: point.lat, lng: point.lng, timestamp: point.timestamp };
      }
    }

    // Ngưỡng 80 m ở tốc độ 7 m/s → khoảng 11-12 giây một lần
    expect(sent).toBeLessThan(total / 5);
    expect(sent).toBeGreaterThan(10); // nhưng vẫn đủ dày để vẽ vệt đường
  });

  it('đứng yên 10 phút chỉ tốn 10 lần gửi', () => {
    let last: LastSent = null;
    let sent = 0;

    for (let i = 0; i < 600; i += 1) {
      // Nhiễu ±5 m quanh một chỗ
      const point = {
        ...northOf((i % 2 === 0 ? 1 : -1) * 5),
        accuracyM: 20,
        speedMps: 0,
        timestamp: i * 1000,
      };
      const d = shouldSend(point, last);
      if (d.send) {
        sent += 1;
        last = { lat: point.lat, lng: point.lng, timestamp: point.timestamp };
      }
    }

    expect(sent).toBeLessThanOrEqual(11);
  });
});

describe('inferSpeedMps', () => {
  it('tính được tốc độ từ hai điểm liên tiếp', () => {
    const v = inferSpeedMps(
      { ...BASE, timestamp: 0 },
      { ...northOf(70), timestamp: 10_000 },
    );
    expect(v).toBeCloseTo(7, 0);
  });

  it('trả null khi thời gian không tiến lên', () => {
    expect(inferSpeedMps({ ...BASE, timestamp: 5000 }, { ...northOf(10), timestamp: 5000 })).toBeNull();
    expect(inferSpeedMps({ ...BASE, timestamp: 5000 }, { ...northOf(10), timestamp: 1000 })).toBeNull();
  });

  it('trả null khi toạ độ nhảy phi lý (> 324 km/h)', () => {
    expect(inferSpeedMps({ ...BASE, timestamp: 0 }, { ...northOf(5000), timestamp: 1000 })).toBeNull();
  });
});
