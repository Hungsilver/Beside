import { DISPLAY_TIMEZONE } from './constants';

/**
 * Tiện ích ngày/giờ theo múi giờ hiển thị.
 *
 * Quy tắc của dự án (CLAUDE.md R2): DB lưu UTC, người dùng nhìn theo
 * Asia/Ho_Chi_Minh. Mọi phép so sánh "cùng ngày / ngày mai / tương lai"
 * PHẢI dùng các hàm ở đây, không được so trực tiếp bằng timestamp —
 * nếu không sẽ sai lệch đúng một ngày trong khoảng 00:00–07:00 giờ VN.
 */

export interface Ymd {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

export const MS_PER_DAY = 86_400_000;

/** Lấy ngày/tháng/năm theo một múi giờ cụ thể (mặc định giờ Việt Nam). */
export function ymdInTimeZone(date: Date, timeZone = DISPLAY_TIMEZONE): Ymd {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('ymdInTimeZone: ngày không hợp lệ');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new RangeError(`ymdInTimeZone: thiếu thành phần ${type}`);
    return Number(found.value);
  };

  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Đổi Y/M/D thành mốc UTC 00:00 — chỉ dùng để SO SÁNH và TRỪ hai ngày lịch. */
export function ymdToUtcMidnight({ year, month, day }: Ymd): number {
  return Date.UTC(year, month - 1, day);
}

/** Số ngày lịch giữa hai thời điểm, tính theo múi giờ hiển thị. */
export function calendarDaysBetween(
  from: Date,
  to: Date,
  timeZone = DISPLAY_TIMEZONE,
): number {
  const a = ymdToUtcMidnight(ymdInTimeZone(from, timeZone));
  const b = ymdToUtcMidnight(ymdInTimeZone(to, timeZone));
  return Math.round((b - a) / MS_PER_DAY);
}

/** Số ngày trong tháng (month 1–12) — tự xử lý năm nhuận. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `date` có nằm sau ngày hôm nay (theo lịch giờ VN) hay không.
 *
 * Vì sao không dùng `date.getTime() > Date.now()`:
 * chuỗi "2026-09-07" được hiểu là 2026-09-07T00:00Z. Lúc 03:00 sáng giờ VN
 * ngày 07/09 thì `Date.now()` mới là 06/09T20:00Z — phép so sánh kia sẽ kết luận
 * "hôm nay là ngày tương lai" và từ chối đúng ngày người dùng vừa chọn.
 */
export function isFutureCalendarDay(
  date: Date,
  now: Date = new Date(),
  timeZone = DISPLAY_TIMEZONE,
): boolean {
  return (
    ymdToUtcMidnight(ymdInTimeZone(date, timeZone)) >
    ymdToUtcMidnight(ymdInTimeZone(now, timeZone))
  );
}
