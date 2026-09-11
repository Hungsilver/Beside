import { describe, expect, it } from 'vitest';
import {
  estimateRemainingMs,
  formatRemaining,
  TRIP_FALLBACK_SPEED_MPS,
} from './trip.schema';

describe('estimateRemainingMs', () => {
  it('dùng tốc độ đo được khi đang thật sự di chuyển', () => {
    // 6000m ở 10 m/s = 600s = 10 phút
    expect(estimateRemainingMs(6000, 10)).toBe(10 * 60_000);
  });

  it('đang dừng đèn đỏ (tốc độ ~0) thì KHÔNG cho ra con số vô lý', () => {
    const ms = estimateRemainingMs(6000, 0.2);
    // Phải rơi về tốc độ trung bình nội thành, tức khoảng 15 phút cho 6km.
    const expected = Math.ceil((6000 / TRIP_FALLBACK_SPEED_MPS / 60) ) * 60_000;
    expect(ms).toBe(expected);
  });

  it('không có tốc độ thì vẫn ước lượng được', () => {
    expect(estimateRemainingMs(1000, null)).not.toBeNull();
  });

  it('chưa biết khoảng cách thì trả null, không bịa số', () => {
    expect(estimateRemainingMs(null, 10)).toBeNull();
  });

  it('khoảng cách âm hoặc hỏng cũng trả null', () => {
    expect(estimateRemainingMs(-5, 10)).toBeNull();
    expect(estimateRemainingMs(Number.NaN, 10)).toBeNull();
  });

  it('luôn làm tròn LÊN phút, không bao giờ ra 0', () => {
    expect(estimateRemainingMs(5, 10)).toBe(60_000);
  });

  it('quá xa thì chặn ở 6 giờ', () => {
    expect(estimateRemainingMs(5_000_000, 1000)).toBeLessThanOrEqual(6 * 60 * 60_000);
  });
});

describe('formatRemaining', () => {
  it('null → đang tính', () => {
    expect(formatRemaining(null)).toBe('đang tính...');
  });

  it('dưới 2 phút → sắp tới nơi', () => {
    expect(formatRemaining(60_000)).toBe('sắp tới nơi');
  });

  it('phút', () => {
    expect(formatRemaining(12 * 60_000)).toBe('còn 12 phút');
  });

  it('giờ tròn', () => {
    expect(formatRemaining(60 * 60_000)).toBe('còn 1 giờ');
  });

  it('giờ lẻ phút', () => {
    expect(formatRemaining(65 * 60_000)).toBe('còn 1 giờ 5 phút');
  });
});
