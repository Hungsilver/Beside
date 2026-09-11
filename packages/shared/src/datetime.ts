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

/**
 * Số phút tính từ 00:00 của ngày, theo múi giờ hiển thị.
 *
 * Dùng để vẽ dải thời gian trong ngày. Hỏi `Intl` chứ không cộng cứng 7 tiếng:
 * lệch múi giờ là loại lỗi chỉ lộ ra ở đúng một vài giờ trong ngày, và lúc đó
 * thì chẳng ai nghĩ tới nó nữa.
 */
export function minutesOfDayInTimeZone(date: Date, timeZone = DISPLAY_TIMEZONE): number {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('minutesOfDayInTimeZone: ngày không hợp lệ');
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new RangeError(`minutesOfDayInTimeZone: thiếu thành phần ${type}`);
    return Number(found.value);
  };

  return get('hour') * 60 + get('minute');
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

// ---------------------------------------------------------------------------
// Mốc đầu / cuối ngày theo múi giờ hiển thị
// ---------------------------------------------------------------------------

/**
 * Độ lệch của một múi giờ so với UTC tại một thời điểm cụ thể (ms).
 *
 * Phải đo TẠI MỘT THỜI ĐIỂM chứ không lấy hằng số: Việt Nam không có giờ mùa hè
 * nên luôn là +7, nhưng hàm này còn nhận `timeZone` bất kỳ và ngày mai có thể
 * dùng cho múi giờ khác. Cách đo: định dạng thời điểm đó theo múi giờ cần biết,
 * rồi đọc ngược các thành phần như thể chúng là UTC — chênh lệch chính là độ lệch.
 */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('timeZoneOffsetMs: ngày không hợp lệ');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `hour12: false` cho ra "24" lúc nửa đêm ở một số engine; h23 thì luôn 00–23.
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new RangeError(`timeZoneOffsetMs: thiếu thành phần ${type}`);
    return Number(found.value);
  };

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  // Chuỗi định dạng chỉ tới GIÂY, nên phải bỏ phần mili-giây của mốc gốc,
  // không thì mọi kết quả lệch đi một chút và cứ âm ỉ sai.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Mốc epoch (ms) của 00:00 ngày lịch chứa `date`, tính theo múi giờ hiển thị.
 *
 * Dùng cho mọi bộ lọc "từ ngày … đến ngày …": lấy thẳng `Date.now() - 7 ngày`
 * sẽ cắt giữa ngày, người dùng chọn "7 ngày" mà bài đăng lúc sáng sớm hôm thứ
 * bảy lại rơi ra ngoài khoảng — sai đúng kiểu R2 cảnh báo.
 */
export function startOfDayMs(date: Date, timeZone = DISPLAY_TIMEZONE): number {
  const midnightAsUtc = ymdToUtcMidnight(ymdInTimeZone(date, timeZone));
  // Đo độ lệch hai lượt: lượt đầu dùng độ lệch tại `date`, lượt sau dùng độ lệch
  // tại chính mốc nửa đêm vừa tính. Hai lượt chỉ khác nhau ở múi giờ có giờ mùa
  // hè và `date` nằm đúng ngày chuyển giờ — VN thì luôn cho cùng kết quả.
  const first = midnightAsUtc - timeZoneOffsetMs(date, timeZone);
  return midnightAsUtc - timeZoneOffsetMs(new Date(first), timeZone);
}

/** Mốc epoch (ms) của 23:59:59.999 ngày lịch chứa `date`. */
export function endOfDayMs(date: Date, timeZone = DISPLAY_TIMEZONE): number {
  // Cộng 36 giờ rồi lấy đầu ngày: chắc chắn rơi vào NGÀY HÔM SAU kể cả khi ngày
  // hiện tại dài 25 giờ vì lùi giờ mùa hè. Cộng đúng 24 giờ thì không chắc.
  const nextDayStart = startOfDayMs(
    new Date(startOfDayMs(date, timeZone) + MS_PER_DAY + MS_PER_DAY / 2),
    timeZone,
  );
  return nextDayStart - 1;
}
