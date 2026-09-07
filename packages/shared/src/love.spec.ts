import { describe, expect, it } from 'vitest';
import {
  breakdownDuration,
  buildLoveSummary,
  findNextMilestoneDays,
} from './love';
import {
  calendarDaysBetween,
  isFutureCalendarDay,
  ymdInTimeZone,
} from './datetime';

/** Tạo Date từ giờ Việt Nam cho dễ đọc test. */
const vn = (iso: string): Date => new Date(`${iso}+07:00`);

describe('ymdInTimeZone', () => {
  it('trả về ngày theo giờ Việt Nam, không phải giờ UTC', () => {
    // 2026-09-07T18:00Z = 2026-09-08 01:00 giờ VN → phải ra ngày 8
    expect(ymdInTimeZone(new Date('2026-09-07T18:00:00Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 8,
    });
  });

  it('ném lỗi với Date không hợp lệ thay vì trả NaN âm thầm', () => {
    expect(() => ymdInTimeZone(new Date('không phải ngày'))).toThrow(RangeError);
  });
});

describe('calendarDaysBetween', () => {
  it('đếm theo ngày lịch chứ không theo số giờ trôi qua', () => {
    // Cách nhau 2 tiếng nhưng vắt qua nửa đêm giờ VN → phải là 1 ngày
    expect(
      calendarDaysBetween(vn('2026-09-07T23:00:00'), vn('2026-09-08T01:00:00')),
    ).toBe(1);
  });

  it('cùng ngày, cách nhau 23 tiếng vẫn là 0 ngày', () => {
    expect(
      calendarDaysBetween(vn('2026-09-07T00:30:00'), vn('2026-09-07T23:30:00')),
    ).toBe(0);
  });

  it('đi qua năm nhuận 29/02 vẫn đúng', () => {
    // 2024 là năm nhuận: 28/02 → 01/03 là 2 ngày (28 → 29 → 01)
    expect(
      calendarDaysBetween(vn('2024-02-28T10:00:00'), vn('2024-03-01T10:00:00')),
    ).toBe(2);
    // 2023 không nhuận: 28/02 → 01/03 là 1 ngày
    expect(
      calendarDaysBetween(vn('2023-02-28T10:00:00'), vn('2023-03-01T10:00:00')),
    ).toBe(1);
  });
});

describe('breakdownDuration', () => {
  it('tách đúng năm / tháng / ngày', () => {
    expect(
      breakdownDuration(vn('2023-02-14T00:00:00'), vn('2026-09-07T12:00:00')),
    ).toEqual({ years: 3, months: 6, days: 24 });
  });

  it('mượn ngày từ tháng liền trước khi ngày kết thúc nhỏ hơn', () => {
    // 31/01 → 01/03/2024 (tháng 2 năm nhuận có 29 ngày)
    expect(
      breakdownDuration(vn('2024-01-31T00:00:00'), vn('2024-03-01T00:00:00')),
    ).toEqual({ years: 0, months: 1, days: 1 });
  });

  it('trả về 0 khi mốc kết thúc ở trước mốc bắt đầu', () => {
    expect(
      breakdownDuration(vn('2026-09-07T00:00:00'), vn('2020-01-01T00:00:00')),
    ).toEqual({ years: 0, months: 0, days: 0 });
  });
});

describe('isFutureCalendarDay', () => {
  it('KHÔNG coi "hôm nay" là tương lai, kể cả lúc 3 giờ sáng giờ VN', () => {
    // 3h sáng 07/09 giờ VN = 06/09 20:00 UTC.
    // Người dùng chọn "hôm nay" → trình duyệt gửi chuỗi "2026-09-07"
    // → được hiểu là 2026-09-07T00:00Z, LỚN HƠN thời điểm hiện tại tính bằng UTC.
    const now = new Date('2026-09-06T20:00:00Z'); // = 07/09 03:00 giờ VN
    const chosenToday = new Date('2026-09-07'); // 2026-09-07T00:00Z
    expect(isFutureCalendarDay(chosenToday, now)).toBe(false);
  });

  it('vẫn chặn ngày mai', () => {
    const now = new Date('2026-09-06T20:00:00Z');
    expect(isFutureCalendarDay(new Date('2026-09-08'), now)).toBe(true);
  });

  it('chấp nhận ngày quá khứ', () => {
    const now = new Date('2026-09-06T20:00:00Z');
    expect(isFutureCalendarDay(new Date('2023-02-14'), now)).toBe(false);
  });
});

describe('findNextMilestoneDays', () => {
  it('lấy mốc dựng sẵn kế tiếp', () => {
    expect(findNextMilestoneDays(0)).toBe(100);
    expect(findNextMilestoneDays(99)).toBe(100);
    // Đang ĐÚNG mốc 100 thì mốc kế tiếp phải là 200, không phải 100
    expect(findNextMilestoneDays(100)).toBe(200);
    expect(findNextMilestoneDays(364)).toBe(365);
  });

  it('vượt hết mốc dựng sẵn thì lấy bội số 500 kế tiếp', () => {
    expect(findNextMilestoneDays(3000)).toBe(3500);
    expect(findNextMilestoneDays(3600)).toBe(4000);
  });
});

describe('buildLoveSummary', () => {
  it('đúng ngày bắt đầu thì đếm 0 ngày', () => {
    const s = buildLoveSummary(vn('2026-09-07T08:00:00'), vn('2026-09-07T22:00:00'));
    expect(s.daysTogether).toBe(0);
    expect(s.years).toBe(0);
    expect(s.nextMilestone?.daysLeft).toBe(100);
  });

  it('hôm sau là 1 ngày', () => {
    const s = buildLoveSummary(vn('2026-09-07T23:59:00'), vn('2026-09-08T00:01:00'));
    expect(s.daysTogether).toBe(1);
  });

  it('ngày yêu ở tương lai thì kẹp về 0, không trả số âm', () => {
    const s = buildLoveSummary(vn('2030-01-01T00:00:00'), vn('2026-09-07T00:00:00'));
    expect(s.daysTogether).toBe(0);
    expect(s.years).toBe(0);
    expect(s.months).toBe(0);
    expect(s.days).toBe(0);
  });

  it('đúng mốc 100 ngày thì tiến độ là 0% của chặng kế tiếp', () => {
    const start = vn('2026-01-01T10:00:00');
    const day100 = new Date(start.getTime() + 100 * 86_400_000);
    const s = buildLoveSummary(start, day100);
    expect(s.daysTogether).toBe(100);
    expect(s.nextMilestone?.daysLeft).toBe(100); // 100 → 200
    expect(s.nextMilestone?.progressPercent).toBe(0);
  });

  it('ngày của mốc kế tiếp đúng bằng ngày bắt đầu cộng số ngày mốc', () => {
    const start = vn('2023-02-14T00:00:00');
    const s = buildLoveSummary(start, vn('2026-09-07T12:00:00'));
    const target = s.nextMilestone!;
    const daysFromStart = calendarDaysBetween(start, new Date(target.date));
    expect(daysFromStart).toBe(s.daysTogether + target.daysLeft);
  });

  it('mốc thời gian không đổi khi giờ trong ngày thay đổi (không nhảy giữa ngày)', () => {
    const start = vn('2023-02-14T00:00:00');
    const morning = buildLoveSummary(start, vn('2026-09-07T00:05:00'));
    const night = buildLoveSummary(start, vn('2026-09-07T23:55:00'));
    expect(morning.daysTogether).toBe(night.daysTogether);
  });
});
