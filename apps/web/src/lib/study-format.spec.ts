import { describe, expect, it } from 'vitest';
import {
  TICK_SEGMENTS,
  buildAxis,
  dayLabel,
  formatMinutes,
  formatShortDuration,
  splitClock,
  spokenTime,
  weekdayLabel,
} from './study-format';

describe('formatMinutes', () => {
  it('dưới một giờ thì chỉ nói phút', () => {
    expect(formatMinutes(0)).toBe('0 phút');
    expect(formatMinutes(59)).toBe('59 phút');
  });

  it('tròn giờ thì bỏ phần phút', () => {
    expect(formatMinutes(60)).toBe('1 giờ');
    expect(formatMinutes(180)).toBe('3 giờ');
  });

  it('lẻ thì nói cả hai', () => {
    expect(formatMinutes(750)).toBe('12 giờ 30 phút');
  });

  it('số âm và số hỏng quy về 0', () => {
    expect(formatMinutes(-40)).toBe('0 phút');
    expect(formatMinutes(Number.NaN)).toBe('0 phút');
    expect(formatMinutes(Number.POSITIVE_INFINITY)).toBe('0 phút');
  });
});

describe('splitClock', () => {
  it('dưới một giờ chỉ có hai nhóm — không hiện "00:" thừa', () => {
    expect(splitClock(125)).toEqual([
      { id: 'm', digits: ['0', '2'] },
      { id: 's', digits: ['0', '5'] },
    ]);
  });

  it('từ một giờ trở lên thì có thêm nhóm giờ', () => {
    expect(splitClock(3661)).toEqual([
      { id: 'h', digits: ['0', '1'] },
      { id: 'm', digits: ['0', '1'] },
      { id: 's', digits: ['0', '1'] },
    ]);
  });

  it('0 giây vẫn ra 00:00 chứ không rỗng', () => {
    expect(splitClock(0).map((p) => p.digits.join(''))).toEqual(['00', '00']);
  });

  it('số âm / NaN kẹp về 0, không sinh dấu trừ trong thẻ số', () => {
    expect(splitClock(-9).map((p) => p.digits.join(''))).toEqual(['00', '00']);
    expect(splitClock(Number.NaN).map((p) => p.digits.join(''))).toEqual(['00', '00']);
  });

  it('giờ vượt hai chữ số thì không bị cắt cụt', () => {
    // 100 giờ: `padStart(2)` không được phép xén bớt, nếu không đồng hồ nói dối.
    expect(splitClock(100 * 3600)[0]?.digits.join('')).toBe('100');
  });
});

describe('spokenTime', () => {
  it('bỏ các đơn vị bằng 0 ở đầu', () => {
    expect(spokenTime(65)).toBe('1 phút 5 giây');
    expect(spokenTime(5)).toBe('5 giây');
    expect(spokenTime(3600)).toBe('1 giờ 0 giây');
  });
});

describe('weekdayLabel', () => {
  it('đọc thứ theo UTC, không theo múi giờ máy', () => {
    // 2026-09-11 là thứ Sáu.
    expect(weekdayLabel('2026-09-11')).toBe('T6');
    expect(weekdayLabel('2026-09-13')).toBe('CN');
  });

  it('khoá hỏng thì trả chuỗi rỗng, không ném lỗi', () => {
    expect(weekdayLabel('hong')).toBe('');
    expect(weekdayLabel('')).toBe('');
    expect(weekdayLabel('2026-9-1')).toBe('');
  });
});

describe('dayLabel', () => {
  it('đổi sang ngày/tháng', () => {
    expect(dayLabel('2026-09-11')).toBe('11/09');
  });

  it('khoá hỏng thì trả nguyên chuỗi', () => {
    expect(dayLabel('hong')).toBe('hong');
  });
});

describe('formatShortDuration', () => {
  it('dạng ngắn cho cột hẹp', () => {
    expect(formatShortDuration(45)).toBe('45p');
    expect(formatShortDuration(60)).toBe('1h');
    expect(formatShortDuration(100)).toBe('1h40');
    expect(formatShortDuration(605)).toBe('10h05');
  });

  it('số âm và số hỏng quy về 0', () => {
    expect(formatShortDuration(-5)).toBe('0p');
    expect(formatShortDuration(Number.NaN)).toBe('0p');
  });
});

describe('buildAxis', () => {
  it('khung LUÔN chia hết cho số khoảng — nếu không cả trục nói dối', () => {
    // Đây là bất biến quan trọng nhất: các nhãn được rải đều bằng
    // `justify-between`, nên span không chia hết thì nhãn cuối chỉ sai chỗ.
    for (const [lo, hi] of [
      [8 * 60 + 10, 14 * 60 + 50],
      [0, 30],
      [22 * 60, 23 * 60 + 59],
      [9 * 60, 9 * 60 + 25],
    ] as const) {
      const a = buildAxis(lo, hi);
      expect(a.span % TICK_SEGMENTS).toBe(0);
      expect(a.ticks).toHaveLength(TICK_SEGMENTS + 1);
      expect(a.ticks[0]).toBe(a.from);
      expect(a.ticks[a.ticks.length - 1]).toBe(a.to);
    }
  });

  it('khung bao trọn dữ liệu và nới ra mỗi bên', () => {
    const a = buildAxis(8 * 60 + 10, 14 * 60 + 50);
    expect(a.from).toBeLessThanOrEqual(8 * 60 + 10);
    expect(a.to).toBeGreaterThanOrEqual(14 * 60 + 50);
    // 8:10–14:50 nới ra mỗi bên một giờ là 7h–16h, và 9 giờ chia hết cho 3.
    expect(a.from).toBe(7 * 60);
    expect(a.to).toBe(16 * 60);
  });

  it('học sát nửa đêm thì lùi mép TRÁI, không tràn quá 24h', () => {
    const a = buildAxis(22 * 60 + 30, 23 * 60 + 50);
    expect(a.to).toBeLessThanOrEqual(24 * 60);
    expect(a.from).toBeGreaterThanOrEqual(0);
    expect(a.to).toBeGreaterThanOrEqual(23 * 60 + 50);
  });

  it('một chặng rất ngắn vẫn cho khung tối thiểu 3 giờ', () => {
    const a = buildAxis(10 * 60, 10 * 60 + 15);
    expect(a.span).toBeGreaterThanOrEqual(3 * 60);
  });

  it('số hỏng không làm vỡ trục', () => {
    const a = buildAxis(Number.NaN, Number.NaN);
    expect(a.span).toBeGreaterThan(0);
    expect(a.ticks).toHaveLength(TICK_SEGMENTS + 1);
  });
});
