import { describe, expect, it } from 'vitest';
import { endOfDayMs, MS_PER_DAY, startOfDayMs } from './datetime';

/**
 * Giờ Việt Nam là UTC+7 cố định (không có giờ mùa hè), nên 00:00 ngày N ở VN
 * luôn là 17:00 UTC ngày N-1. Mọi kỳ vọng dưới đây neo vào sự thật đó.
 */

describe('startOfDayMs', () => {
  it('đưa một mốc giữa trưa về 00:00 giờ VN của cùng ngày', () => {
    // 10/09/2026 12:34 giờ VN = 05:34 UTC
    const noon = new Date('2026-09-10T05:34:00.000Z');
    expect(new Date(startOfDayMs(noon)).toISOString()).toBe('2026-09-09T17:00:00.000Z');
  });

  it('mốc 01:00 sáng giờ VN vẫn thuộc về ngày hôm đó, không lùi một ngày', () => {
    // Đây là cái bẫy R2: 01:00 ngày 10/09 giờ VN = 18:00 UTC ngày 09/09.
    const earlyMorning = new Date('2026-09-09T18:00:00.000Z');
    expect(new Date(startOfDayMs(earlyMorning)).toISOString()).toBe(
      '2026-09-09T17:00:00.000Z',
    );
  });

  it('bản thân mốc 00:00 giờ VN thì giữ nguyên', () => {
    const midnight = new Date('2026-09-09T17:00:00.000Z');
    expect(startOfDayMs(midnight)).toBe(midnight.getTime());
  });

  it('luôn cách nhau đúng một ngày giữa hai ngày liền kề', () => {
    const a = startOfDayMs(new Date('2026-02-28T09:00:00.000Z'));
    const b = startOfDayMs(new Date('2026-03-01T09:00:00.000Z'));
    expect(b - a).toBe(MS_PER_DAY);
  });

  it('qua ngày 29/02 của năm nhuận vẫn đúng', () => {
    const leap = new Date('2028-02-29T03:00:00.000Z'); // 10:00 giờ VN 29/02/2028
    expect(new Date(startOfDayMs(leap)).toISOString()).toBe('2028-02-28T17:00:00.000Z');
  });

  it('ngày không hợp lệ thì ném lỗi thay vì trả NaN âm thầm', () => {
    expect(() => startOfDayMs(new Date('không phải ngày'))).toThrow(RangeError);
  });
});

describe('endOfDayMs', () => {
  it('là mili-giây cuối cùng của ngày lịch giờ VN', () => {
    const noon = new Date('2026-09-10T05:34:00.000Z');
    expect(new Date(endOfDayMs(noon)).toISOString()).toBe('2026-09-10T16:59:59.999Z');
  });

  it('luôn đứng sau đầu ngày đúng một ngày trừ 1ms', () => {
    const d = new Date('2026-09-10T05:34:00.000Z');
    expect(endOfDayMs(d) - startOfDayMs(d)).toBe(MS_PER_DAY - 1);
  });
});
