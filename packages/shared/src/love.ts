import { AUTO_MILESTONE_DAYS, DISPLAY_TIMEZONE } from './constants';
import {
  calendarDaysBetween,
  daysInMonth,
  MS_PER_DAY,
  ymdInTimeZone,
  ymdToUtcMidnight,
  type Ymd,
} from './datetime';
import type { LoveSummary } from './couple.schema';

/**
 * Đếm ngày yêu (F5).
 *
 * ĐỊNH NGHĨA CHỐT — mọi nơi trong hệ thống phải hiểu giống nhau:
 *   daysTogether = số ngày LỊCH trọn vẹn đã trôi qua kể từ ngày bắt đầu.
 *   → Đúng ngày bắt đầu  = 0
 *   → Hôm sau            = 1
 *   → "Kỷ niệm 100 ngày" rơi vào ngày mà daysTogether === 100
 *
 * Vì sao tính theo ngày lịch chứ không phải (now - start) / 86400000:
 *   phép chia đó phụ thuộc GIỜ trong ngày, nên số ngày sẽ nhảy vào lúc
 *   trùng giờ bắt đầu chứ không phải lúc 00:00 — người dùng thấy rất vô lý.
 *   Ở đây mốc nhảy luôn là 00:00 giờ Việt Nam.
 */

/** Cộng n tháng vào một ngày lịch, kẹp ngày về cuối tháng nếu tràn.
 *  31/01 + 1 tháng = 29/02 (năm nhuận) chứ không phải 02/03. */
function addMonthsClamped(ymd: Ymd, n: number): Ymd {
  const totalMonths = ymd.year * 12 + (ymd.month - 1) + n;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return { year, month, day: Math.min(ymd.day, daysInMonth(year, month)) };
}

/**
 * Tách khoảng cách thành "x năm y tháng z ngày" theo lịch.
 *
 * Không dùng cách trừ từng thành phần rồi "mượn" ngày của tháng trước:
 * cách đó ra kết quả âm với những mốc như 31/01 → 01/03.
 * Ở đây cộng dồn số tháng lớn nhất mà chưa vượt quá mốc kết thúc,
 * rồi phần dư mới đếm bằng ngày — cùng quy ước với date-fns.
 */
export function breakdownDuration(
  from: Date,
  to: Date,
  timeZone = DISPLAY_TIMEZONE,
): { years: number; months: number; days: number } {
  const a = ymdInTimeZone(from, timeZone);
  const b = ymdInTimeZone(to, timeZone);

  if (ymdToUtcMidnight(b) <= ymdToUtcMidnight(a)) {
    return { years: 0, months: 0, days: 0 };
  }

  let totalMonths = (b.year - a.year) * 12 + (b.month - a.month);
  let anchor = addMonthsClamped(a, totalMonths);
  if (ymdToUtcMidnight(anchor) > ymdToUtcMidnight(b)) {
    totalMonths -= 1;
    anchor = addMonthsClamped(a, totalMonths);
  }

  const days = Math.round(
    (ymdToUtcMidnight(b) - ymdToUtcMidnight(anchor)) / MS_PER_DAY,
  );

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days,
  };
}

/** Cộng thêm n ngày vào một ngày lịch (giữ đúng 00:00 giờ VN). */
function addDaysToYmd(ymd: Ymd, days: number): Date {
  return new Date(ymdToUtcMidnight(ymd) + days * MS_PER_DAY);
}

/** Mốc kế tiếp: lấy mốc dựng sẵn gần nhất, nếu đã vượt hết thì lấy bội số 500 tiếp theo. */
export function findNextMilestoneDays(daysTogether: number): number {
  const next = AUTO_MILESTONE_DAYS.find((d) => d > daysTogether);
  if (next !== undefined) return next;
  return (Math.floor(daysTogether / 500) + 1) * 500;
}

function previousMilestoneDays(daysTogether: number): number {
  let prev = 0;
  for (const d of AUTO_MILESTONE_DAYS) {
    if (d <= daysTogether) prev = d;
    else break;
  }
  if (daysTogether >= AUTO_MILESTONE_DAYS[AUTO_MILESTONE_DAYS.length - 1]!) {
    prev = Math.floor(daysTogether / 500) * 500;
  }
  return prev;
}

/**
 * Tổng hợp thông tin "chuyện của mình".
 * @param anniversaryAt ngày bắt đầu yêu
 * @param now           thời điểm tham chiếu (truyền vào để test được, mặc định là bây giờ)
 */
export function buildLoveSummary(
  anniversaryAt: Date,
  now: Date = new Date(),
  timeZone = DISPLAY_TIMEZONE,
): LoveSummary {
  const startYmd = ymdInTimeZone(anniversaryAt, timeZone);

  // Ngày bắt đầu ở tương lai → coi như 0 ngày, không trả số âm cho giao diện.
  const rawDays = calendarDaysBetween(anniversaryAt, now, timeZone);
  const daysTogether = Math.max(0, rawDays);

  const { years, months, days } = breakdownDuration(anniversaryAt, now, timeZone);

  const nextDays = findNextMilestoneDays(daysTogether);
  const prevDays = previousMilestoneDays(daysTogether);
  const span = nextDays - prevDays;
  const progressPercent =
    span <= 0 ? 0 : Math.min(100, Math.round(((daysTogether - prevDays) / span) * 100));

  return {
    anniversaryAt: anniversaryAt.toISOString(),
    daysTogether,
    years,
    months,
    days,
    nextMilestone: {
      title: `${nextDays.toLocaleString('vi-VN')} ngày bên nhau`,
      date: addDaysToYmd(startYmd, nextDays).toISOString(),
      daysLeft: nextDays - daysTogether,
      progressPercent,
    },
  };
}
