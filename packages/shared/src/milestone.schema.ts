import { z } from 'zod';
import { AUTO_MILESTONE_DAYS, DISPLAY_TIMEZONE } from './constants';
import {
  calendarDaysBetween,
  daysInMonth,
  MS_PER_DAY,
  ymdInTimeZone,
  ymdToUtcMidnight,
  type Ymd,
} from './datetime';

/**
 * Mốc kỷ niệm (F5).
 *
 * Có hai loại và chúng đến từ hai nguồn khác nhau:
 *
 *   - **Tự sinh** — không lưu trong DB, tính ra từ ngày yêu và ngày sinh:
 *     mốc ngày (100/365/1000…), kỷ niệm hằng năm, sinh nhật hai người.
 *   - **Tự thêm** — người dùng gõ vào, lưu ở bảng `milestones`.
 *
 * Ngày ở đây là **ngày trôi nổi** giống sự kiện cả ngày trên lịch (§6.3):
 * "sinh nhật 12/09" là một ô trên tờ lịch, không phải một khoảnh khắc.
 */

export const MILESTONE_KINDS = ['AUTO_DAYS', 'ANNIVERSARY', 'BIRTHDAY', 'CUSTOM'] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_TITLE_MAX = 80;

/** Trần số mốc tự thêm mỗi cặp đôi. */
export const MAX_CUSTOM_MILESTONES = 30;

/** Nhìn trước bao xa trong danh sách "sắp tới". */
export const MILESTONE_LOOKAHEAD_DAYS = 400;

export const MILESTONE_EMOJIS = ['💖', '🎂', '🎉', '💍', '🌹', '✈️', '🏡', '⭐'] as const;

export const createMilestoneSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Mốc kỷ niệm cần có tên')
    .max(MILESTONE_TITLE_MAX, `Tên tối đa ${MILESTONE_TITLE_MAX} ký tự`),
  /** Ngày trôi nổi `YYYY-MM-DD`. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD'),
  emoji: z.string().trim().min(1).max(8).default('💖'),
  /** Lặp lại hằng năm (mặc định) hay chỉ đúng một lần. */
  yearly: z.boolean().default(true),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export interface MilestoneItem {
  /** Có id = mốc tự thêm (sửa/xoá được). `null` = mốc tự sinh. */
  id: string | null;
  kind: MilestoneKind;
  title: string;
  emoji: string;
  /** Ngày xảy ra LẦN TỚI, dạng ISO của 00:00 UTC (ngày trôi nổi). */
  date: string;
  /** Còn bao nhiêu ngày lịch nữa. 0 = hôm nay. */
  daysLeft: number;
  /** Câu phụ: "3 năm bên nhau", "Bình tròn 27 tuổi"… */
  subtitle: string | null;
}

// ---------------------------------------------------------------------------
// Ngày lặp lại hằng năm
// ---------------------------------------------------------------------------

/**
 * Lần xảy ra kế tiếp của một ngày lặp hằng năm, tính từ `today` (đã bao gồm
 * chính hôm nay).
 *
 * Ngày 29/02 được **kẹp về 28/02** trong năm không nhuận. Nếu không kẹp,
 * `new Date(2027, 1, 29)` sẽ âm thầm trôi sang 01/03 — sinh nhật của người ta
 * tự nhiên đổi ngày mà không ai báo.
 */
export function nextYearlyOccurrence(source: Ymd, today: Ymd): Ymd {
  const clampTo = (year: number): Ymd => ({
    year,
    month: source.month,
    day: Math.min(source.day, daysInMonth(year, source.month)),
  });

  const thisYear = clampTo(today.year);
  if (ymdToUtcMidnight(thisYear) >= ymdToUtcMidnight(today)) return thisYear;
  return clampTo(today.year + 1);
}

/** Số ngày lịch từ `today` tới `target` (cùng quy ước ngày trôi nổi). */
function daysUntil(target: Ymd, today: Ymd): number {
  return Math.round((ymdToUtcMidnight(target) - ymdToUtcMidnight(today)) / MS_PER_DAY);
}

function toIso(ymd: Ymd): string {
  return new Date(ymdToUtcMidnight(ymd)).toISOString();
}

function ymdFromFloatingDate(iso: string): Ymd {
  const d = new Date(iso);
  return ymdInTimeZone(d, 'UTC');
}

// ---------------------------------------------------------------------------
// Dựng danh sách
// ---------------------------------------------------------------------------

export interface MilestoneSource {
  anniversaryAt: Date;
  members: { displayName: string; birthday: Date | null }[];
  custom: {
    id: string;
    title: string;
    emoji: string;
    /** Ngày trôi nổi đã lưu (00:00 UTC). */
    date: Date;
    yearly: boolean;
  }[];
}

/**
 * Mọi mốc sắp tới, đã sắp xếp theo ngày gần nhất trước.
 *
 * Hàm THUẦN — không đụng DB, không đọc đồng hồ (nhận `now` làm tham số) — nên
 * mọi biên (năm nhuận, đúng hôm nay, mốc đã qua) kiểm được bằng unit test.
 */
export function buildUpcomingMilestones(
  source: MilestoneSource,
  now: Date = new Date(),
  timeZone = DISPLAY_TIMEZONE,
): MilestoneItem[] {
  const today = ymdInTimeZone(now, timeZone);
  const startYmd = ymdInTimeZone(source.anniversaryAt, timeZone);
  const daysTogether = Math.max(0, calendarDaysBetween(source.anniversaryAt, now, timeZone));
  const items: MilestoneItem[] = [];

  // --- Mốc ngày: 100 / 365 / 1000 ngày bên nhau ---
  const upcomingDayMarks = AUTO_MILESTONE_DAYS.filter((d) => d >= daysTogether);
  // Vượt hết bảng dựng sẵn thì tiếp tục bằng bội số 500.
  const dayMarks: number[] =
    upcomingDayMarks.length > 0
      ? [...upcomingDayMarks]
      : [(Math.floor(daysTogether / 500) + 1) * 500];

  for (const mark of dayMarks) {
    const daysLeft = mark - daysTogether;
    if (daysLeft > MILESTONE_LOOKAHEAD_DAYS) break;
    const date = new Date(ymdToUtcMidnight(startYmd) + mark * MS_PER_DAY);
    items.push({
      id: null,
      kind: 'AUTO_DAYS',
      title: `${mark.toLocaleString('vi-VN')} ngày bên nhau`,
      emoji: '💖',
      date: date.toISOString(),
      daysLeft,
      subtitle: null,
    });
  }

  // --- Kỷ niệm hằng năm ---
  {
    const next = nextYearlyOccurrence(startYmd, today);
    const years = next.year - startYmd.year;
    const daysLeft = daysUntil(next, today);
    // Năm thứ 0 là chính ngày bắt đầu — không gọi đó là "kỷ niệm 0 năm".
    if (years >= 1 && daysLeft <= MILESTONE_LOOKAHEAD_DAYS) {
      items.push({
        id: null,
        kind: 'ANNIVERSARY',
        title: `Kỷ niệm ${years} năm`,
        emoji: '🌹',
        date: toIso(next),
        daysLeft,
        subtitle: `Từ ${String(startYmd.day).padStart(2, '0')}/${String(startYmd.month).padStart(2, '0')}/${startYmd.year}`,
      });
    }
  }

  // --- Sinh nhật hai người ---
  for (const member of source.members) {
    if (!member.birthday) continue;
    const born = ymdInTimeZone(member.birthday, 'UTC');
    const next = nextYearlyOccurrence(born, today);
    const daysLeft = daysUntil(next, today);
    if (daysLeft > MILESTONE_LOOKAHEAD_DAYS) continue;
    const age = next.year - born.year;
    items.push({
      id: null,
      kind: 'BIRTHDAY',
      title: `Sinh nhật ${member.displayName}`,
      emoji: '🎂',
      date: toIso(next),
      daysLeft,
      subtitle: age > 0 ? `Tròn ${age} tuổi` : null,
    });
  }

  // --- Mốc tự thêm ---
  for (const custom of source.custom) {
    const base = ymdFromFloatingDate(custom.date.toISOString());
    const next = custom.yearly ? nextYearlyOccurrence(base, today) : base;
    const daysLeft = daysUntil(next, today);
    // Mốc một lần đã qua thì không hiện nữa; mốc hằng năm luôn có lần tới.
    if (daysLeft < 0) continue;
    if (daysLeft > MILESTONE_LOOKAHEAD_DAYS) continue;
    const years = custom.yearly ? next.year - base.year : 0;
    items.push({
      id: custom.id,
      kind: 'CUSTOM',
      title: custom.title,
      emoji: custom.emoji,
      date: toIso(next),
      daysLeft,
      subtitle: custom.yearly && years >= 1 ? `Tròn ${years} năm` : null,
    });
  }

  // Gần nhất trước; cùng ngày thì theo tên để thứ tự luôn ổn định.
  return items.sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title, 'vi'));
}
