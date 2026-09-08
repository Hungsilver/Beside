import { describe, expect, it } from 'vitest';
import { GEOFENCE_EXIT_HYSTERESIS_M, PLACE_RADIUS_MIN_M } from './constants';
import {
  accuracyUsableFor,
  createPlaceSchema,
  decideTransition,
  MAX_PLACES_PER_COUPLE,
} from './place.schema';

const NHA_AN = { lat: 10.7769, lng: 106.7009 };

describe('createPlaceSchema', () => {
  const base = { name: 'Nhà em', ...NHA_AN };

  it('happy path với giá trị mặc định', () => {
    const r = createPlaceSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.radiusM).toBe(150);
      expect(r.data.emoji).toBe('📍');
      expect(r.data.notifyOnArrive).toBe(true);
      // Mặc định KHÔNG báo lúc rời đi: "vừa rời nhà" ít giá trị hơn hẳn
      // "vừa về tới nhà", mà lại gấp đôi số thông báo.
      expect(r.data.notifyOnLeave).toBe(false);
    }
  });

  it('cắt khoảng trắng thừa ở tên', () => {
    const r = createPlaceSchema.safeParse({ ...base, name: '  Nhà em  ' });
    expect(r.success && r.data.name).toBe('Nhà em');
  });

  it('tên rỗng bị từ chối', () => {
    expect(createPlaceSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
  });

  it('bán kính nhỏ hơn mức tối thiểu bị từ chối', () => {
    const r = createPlaceSchema.safeParse({ ...base, radiusM: PLACE_RADIUS_MIN_M - 1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('GPS nhiễu');
  });

  it('bán kính đúng mức tối thiểu thì được', () => {
    expect(
      createPlaceSchema.safeParse({ ...base, radiusM: PLACE_RADIUS_MIN_M }).success,
    ).toBe(true);
  });

  it('bán kính quá lớn bị từ chối', () => {
    expect(createPlaceSchema.safeParse({ ...base, radiusM: 5000 }).success).toBe(false);
  });

  it('toạ độ ngoài dải Trái Đất bị từ chối', () => {
    expect(createPlaceSchema.safeParse({ ...base, lat: 999 }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...base, lng: -181 }).success).toBe(false);
  });

  it('trần số địa điểm là một con số hữu hạn, hợp lý', () => {
    expect(MAX_PLACES_PER_COUPLE).toBeGreaterThan(5);
    expect(MAX_PLACES_PER_COUPLE).toBeLessThanOrEqual(50);
  });
});

describe('accuracyUsableFor', () => {
  it('sai số nhỏ hơn bán kính thì dùng được', () => {
    expect(accuracyUsableFor(20, 150)).toBe(true);
  });

  it('sai số ĐÚNG BẰNG bán kính vẫn dùng được', () => {
    expect(accuracyUsableFor(150, 150)).toBe(true);
  });

  it('SAI SỐ LỚN HƠN BÁN KÍNH thì không kết luận được gì', () => {
    // Đây là chốt chặn quan trọng nhất chống thông báo sai: một điểm sai số
    // 500 m không thể trả lời "có đang trong vòng 150 m quanh nhà không".
    expect(accuracyUsableFor(500, 150)).toBe(false);
  });

  it('sai số vô nghĩa thì từ chối', () => {
    expect(accuracyUsableFor(Number.NaN, 150)).toBe(false);
    expect(accuracyUsableFor(-1, 150)).toBe(false);
    expect(accuracyUsableFor(Number.POSITIVE_INFINITY, 150)).toBe(false);
  });
});

describe('decideTransition', () => {
  const R = 150;

  it('đang ngoài, bước vào trong → ENTER', () => {
    expect(decideTransition(false, 100, R)).toBe('ENTER');
  });

  it('đang ngoài, vẫn ở ngoài → STAY_OUT', () => {
    expect(decideTransition(false, 400, R)).toBe('STAY_OUT');
  });

  it('đúng ngay mép (bằng bán kính) tính là ĐÃ VÀO', () => {
    expect(decideTransition(false, R, R)).toBe('ENTER');
  });

  it('đang trong, vẫn trong → STAY_IN', () => {
    expect(decideTransition(true, 100, R)).toBe('STAY_IN');
  });

  it('KHOẢNG CHÊNH: ra khỏi bán kính một chút vẫn tính là ĐANG TRONG', () => {
    // Đây là chỗ chống bắn thông báo liên tục. Người ngồi yên ngay mép hàng
    // rào, GPS nhiễu ±20 m — không có khoảng chênh thì họ nhận một tràng
    // "vừa tới / vừa rời / vừa tới…".
    expect(decideTransition(true, R + 10, R)).toBe('STAY_IN');
    expect(decideTransition(true, R + GEOFENCE_EXIT_HYSTERESIS_M, R)).toBe('STAY_IN');
  });

  it('vượt qua vành ngoài mới là EXIT', () => {
    expect(decideTransition(true, R + GEOFENCE_EXIT_HYSTERESIS_M + 1, R)).toBe('EXIT');
  });

  it('KHÔNG đối xứng: cùng một khoảng cách cho kết quả khác nhau tuỳ trạng thái trước', () => {
    const d = R + 10;
    expect(decideTransition(true, d, R)).toBe('STAY_IN'); // đang trong thì vẫn trong
    expect(decideTransition(false, d, R)).toBe('STAY_OUT'); // đang ngoài thì vẫn ngoài
  });

  it('khoảng cách 0 (đứng đúng tâm)', () => {
    expect(decideTransition(false, 0, R)).toBe('ENTER');
    expect(decideTransition(true, 0, R)).toBe('STAY_IN');
  });

  it('hàng rào nhỏ nhất vẫn có khoảng chênh đủ rộng', () => {
    // 50 m bán kính → ra khỏi 80 m mới tính là rời đi. Đủ để nuốt nhiễu GPS
    // thông thường (10–30 m).
    expect(decideTransition(true, 79, PLACE_RADIUS_MIN_M)).toBe('STAY_IN');
    expect(decideTransition(true, 81, PLACE_RADIUS_MIN_M)).toBe('EXIT');
  });
});

/** Ghi lại toạ độ dùng trong trace, để test và trace nói cùng một thứ. */
describe('dữ liệu giả định khớp với trace', () => {
  it('nhà An là toạ độ Quận 1 dùng xuyên suốt dự án', () => {
    expect(NHA_AN).toEqual({ lat: 10.7769, lng: 106.7009 });
  });
});
