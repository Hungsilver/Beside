import { z } from 'zod';
import { calendarDaysBetween, MS_PER_DAY } from './datetime';
import { floatingDateToMs, msToFloatingDate } from './event.schema';

/**
 * F14 — Theo dõi chu kỳ kinh nguyệt.
 *
 * ── Đây là dữ liệu SỨC KHOẺ, không phải một tính năng vui ────────────────────
 * Ba luật bất di bất dịch, áp ở tầng service chứ không chỉ ở giao diện:
 *
 *   1. **Chủ dữ liệu quyết định người ấy thấy gì.** Mặc định là KHÔNG chia sẻ
 *      (`OFF`). Bật chia sẻ là một hành động có ý thức, và tắt được bất cứ lúc nào.
 *   2. **Mức `SUMMARY` không lộ ngày cụ thể** — chỉ nói "đang trong kỳ" hoặc
 *      "sắp tới kỳ". Đủ để người kia biết mà quan tâm, không biến thành lịch
 *      theo dõi cơ thể người khác.
 *   3. **Xoá là xoá thật.** Có một nút xoá sạch toàn bộ dữ liệu chu kỳ.
 *
 * Và một luật về nội dung: **đây không phải công cụ tránh thai**. Cửa sổ dễ thụ
 * thai tính theo lịch có sai số rất lớn; mọi chỗ hiển thị nó phải nói rõ điều đó.
 */

export const CYCLE_SHARE_LEVELS = ['OFF', 'SUMMARY', 'FULL'] as const;
export type CycleShareLevel = (typeof CYCLE_SHARE_LEVELS)[number];

export const CYCLE_SHARE_LABELS: Record<CycleShareLevel, string> = {
  OFF: 'Không chia sẻ',
  SUMMARY: 'Chỉ báo giai đoạn',
  FULL: 'Chia sẻ đầy đủ',
};

export const CYCLE_SHARE_DESCRIPTIONS: Record<CycleShareLevel, string> = {
  OFF: 'Người ấy không thấy gì cả. Dữ liệu chỉ mình bạn xem được.',
  SUMMARY: 'Người ấy thấy “đang trong kỳ” hoặc “sắp tới kỳ”, KHÔNG thấy ngày cụ thể.',
  FULL: 'Người ấy thấy ngày dự kiến của kỳ tới và số ngày còn lại.',
};

/** Độ dài chu kỳ hợp lệ (ngày). Ngoài dải này gần như chắc chắn là gõ nhầm. */
export const CYCLE_LENGTH_MIN = 18;
export const CYCLE_LENGTH_MAX = 60;
export const CYCLE_LENGTH_DEFAULT = 28;

/** Độ dài kỳ hành kinh (ngày). */
export const PERIOD_LENGTH_MIN = 1;
export const PERIOD_LENGTH_MAX = 14;
export const PERIOD_LENGTH_DEFAULT = 5;

/** Khoảng cách giữa hai lần bắt đầu lớn hơn ngần này thì bỏ qua khi lấy trung bình. */
const OUTLIER_GAP_DAYS = 90;

/** Báo trước bao nhiêu ngày thì coi là "sắp tới kỳ". */
export const CYCLE_SOON_DAYS = 3;

export type CyclePhase =
  /** Đang hành kinh. */
  | 'PERIOD'
  /** Sau kỳ, trước cửa sổ dễ thụ thai. */
  | 'FOLLICULAR'
  /** Cửa sổ dễ thụ thai (ƯỚC TÍNH theo lịch — không phải biện pháp tránh thai). */
  | 'FERTILE'
  /** Sau rụng trứng, trước kỳ sau. */
  | 'LUTEAL'
  /** Chưa đủ dữ liệu để nói gì. */
  | 'UNKNOWN';

export const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  PERIOD: 'Đang trong kỳ',
  FOLLICULAR: 'Sau kỳ',
  FERTILE: 'Dễ thụ thai (ước tính)',
  LUTEAL: 'Trước kỳ',
  UNKNOWN: 'Chưa đủ dữ liệu',
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Ngày trôi nổi `YYYY-MM-DD` — cùng quy ước với sự kiện cả ngày (§6.3). */
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((v) => Number.isFinite(floatingDateToMs(v)), 'Ngày không có thật');

export const periodEntrySchema = z
  .object({
    startDate: dayString,
    endDate: dayString.nullable().optional(),
  })
  .refine(
    (v) => !v.endDate || floatingDateToMs(v.endDate) >= floatingDateToMs(v.startDate),
    { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['endDate'] },
  )
  .refine(
    (v) =>
      !v.endDate ||
      (floatingDateToMs(v.endDate) - floatingDateToMs(v.startDate)) / MS_PER_DAY + 1 <=
        PERIOD_LENGTH_MAX,
    { message: `Một kỳ dài tối đa ${PERIOD_LENGTH_MAX} ngày`, path: ['endDate'] },
  );
export type PeriodEntryInput = z.infer<typeof periodEntrySchema>;

export const cycleSettingsSchema = z.object({
  shareLevel: z.enum(CYCLE_SHARE_LEVELS),
  /** Để trống thì tự tính từ lịch sử. */
  avgCycleDays: z.number().int().min(CYCLE_LENGTH_MIN).max(CYCLE_LENGTH_MAX).nullable().optional(),
  avgPeriodDays: z
    .number()
    .int()
    .min(PERIOD_LENGTH_MIN)
    .max(PERIOD_LENGTH_MAX)
    .nullable()
    .optional(),
  /** Nhắc CHÍNH MÌNH trước khi tới kỳ. */
  remindMe: z.boolean(),
  /** Nhắc NGƯỜI ẤY trước khi tới kỳ. Chỉ có tác dụng khi đang chia sẻ. */
  remindPartner: z.boolean(),
});
export type CycleSettingsInput = z.infer<typeof cycleSettingsSchema>;

export interface PeriodEntryResponse {
  id: string;
  startDate: string;
  endDate: string | null;
  /** Số ngày của kỳ này; `null` khi chưa ghi ngày kết thúc. */
  lengthDays: number | null;
}

export interface CyclePrediction {
  phase: CyclePhase;
  /** Hôm nay là ngày thứ mấy của chu kỳ (1 = ngày đầu kỳ). `null` khi chưa có dữ liệu. */
  dayOfCycle: number | null;
  /** Ngày dự kiến bắt đầu kỳ tới (`YYYY-MM-DD`). */
  nextStartDate: string | null;
  /** Còn bao nhiêu ngày nữa tới kỳ. Âm nghĩa là đã trễ ngần ấy ngày. */
  daysUntilNext: number | null;
  /** Độ dài chu kỳ đang dùng để dự đoán. */
  cycleDays: number;
  periodDays: number;
  /** Dự đoán dựa trên bao nhiêu kỳ đã ghi. 0 = đang dùng giá trị mặc định. */
  basedOnCycles: number;
}

/** Hồ sơ chu kỳ của CHÍNH MÌNH — đầy đủ. */
export interface CycleSelfResponse {
  enabled: boolean;
  settings: CycleSettingsInput;
  entries: PeriodEntryResponse[];
  prediction: CyclePrediction;
}

/**
 * Những gì NGƯỜI ẤY được thấy. Server cắt gọt theo `shareLevel` trước khi gửi —
 * client không bao giờ nhận dữ liệu rồi tự ẩn đi.
 */
export interface CyclePartnerResponse {
  shared: boolean;
  level: CycleShareLevel;
  /** Tên người đang chia sẻ, để câu chữ trên giao diện gọi đúng tên. */
  name: string | null;
  phase: CyclePhase | null;
  /** Chỉ có ở mức FULL. */
  nextStartDate: string | null;
  daysUntilNext: number | null;
}

// ---------------------------------------------------------------------------
// Tính toán
// ---------------------------------------------------------------------------

/**
 * Độ dài chu kỳ trung bình, tính từ khoảng cách giữa các lần BẮT ĐẦU.
 *
 * Bỏ qua khoảng cách quá dài (trên 90 ngày): đó là lúc người dùng quên ghi vài
 * kỳ liên tiếp, không phải một chu kỳ 4 tháng. Gộp chúng vào trung bình sẽ đẩy
 * mọi dự đoán sau đó sai hàng tuần.
 *
 * `starts` nhận theo thứ tự nào cũng được — hàm tự sắp xếp.
 */
export function averageCycleDays(
  starts: string[],
  fallback: number = CYCLE_LENGTH_DEFAULT,
): { days: number; samples: number } {
  const ms = starts
    .map(floatingDateToMs)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let i = 1; i < ms.length; i += 1) {
    const gap = Math.round((ms[i]! - ms[i - 1]!) / MS_PER_DAY);
    if (gap >= CYCLE_LENGTH_MIN && gap <= OUTLIER_GAP_DAYS) gaps.push(gap);
  }

  if (gaps.length === 0) return { days: fallback, samples: 0 };

  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return {
    days: Math.min(CYCLE_LENGTH_MAX, Math.max(CYCLE_LENGTH_MIN, Math.round(mean))),
    samples: gaps.length,
  };
}

/** Độ dài kỳ trung bình, từ các kỳ ĐÃ ghi ngày kết thúc. */
export function averagePeriodDays(
  entries: { startDate: string; endDate: string | null }[],
  fallback: number = PERIOD_LENGTH_DEFAULT,
): number {
  const lengths = entries
    .map((e) => periodLength(e.startDate, e.endDate))
    .filter((v): v is number => v !== null);

  if (lengths.length === 0) return fallback;
  const mean = lengths.reduce((s, l) => s + l, 0) / lengths.length;
  return Math.min(PERIOD_LENGTH_MAX, Math.max(PERIOD_LENGTH_MIN, Math.round(mean)));
}

/** Số ngày của một kỳ (tính cả ngày đầu và ngày cuối). */
export function periodLength(startDate: string, endDate: string | null): number | null {
  if (!endDate) return null;
  const a = floatingDateToMs(startDate);
  const b = floatingDateToMs(endDate);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / MS_PER_DAY) + 1;
}

/**
 * Dự đoán chu kỳ.
 *
 * Mốc gốc là lần bắt đầu GẦN NHẤT; các lần trước chỉ dùng để lấy độ dài trung
 * bình. Nếu đã trễ hơn một chu kỳ mà chưa ghi kỳ mới thì vẫn neo vào lần gần
 * nhất và trả `daysUntilNext` ÂM — nói thẳng "trễ 5 ngày" thay vì lặng lẽ đẩy
 * dự đoán sang chu kỳ kế tiếp như thể mọi thứ vẫn đúng lịch.
 *
 * `today` truyền vào để test được; mọi phép so đều theo NGÀY LỊCH giờ VN.
 */
export function predictCycle(
  entries: { startDate: string; endDate: string | null }[],
  overrides: { cycleDays?: number | null; periodDays?: number | null } = {},
  today: Date = new Date(),
): CyclePrediction {
  const starts = entries.map((e) => e.startDate);
  const auto = averageCycleDays(starts);

  const cycleDays = clampInt(
    overrides.cycleDays ?? auto.days,
    CYCLE_LENGTH_MIN,
    CYCLE_LENGTH_MAX,
    CYCLE_LENGTH_DEFAULT,
  );
  const periodDays = clampInt(
    overrides.periodDays ?? averagePeriodDays(entries),
    PERIOD_LENGTH_MIN,
    PERIOD_LENGTH_MAX,
    PERIOD_LENGTH_DEFAULT,
  );

  const lastStartMs = starts
    .map(floatingDateToMs)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => b - a)[0];

  if (lastStartMs === undefined) {
    return {
      phase: 'UNKNOWN',
      dayOfCycle: null,
      nextStartDate: null,
      daysUntilNext: null,
      cycleDays,
      periodDays,
      basedOnCycles: 0,
    };
  }

  // Ngày thứ mấy của chu kỳ: ngày bắt đầu là ngày 1.
  const elapsed = calendarDaysBetween(new Date(lastStartMs), today);
  const dayOfCycle = elapsed + 1;

  const nextStartMs = lastStartMs + cycleDays * MS_PER_DAY;
  const daysUntilNext = calendarDaysBetween(today, new Date(nextStartMs));

  // Kỳ đang diễn ra: người dùng đã ghi ngày kết thúc thì tin vào đó, chưa ghi
  // thì dùng độ dài trung bình.
  const openEntry = entries.find((e) => floatingDateToMs(e.startDate) === lastStartMs);
  const actualLength = openEntry ? periodLength(openEntry.startDate, openEntry.endDate) : null;
  const inPeriod = dayOfCycle >= 1 && dayOfCycle <= (actualLength ?? periodDays);

  return {
    phase: inPeriod ? 'PERIOD' : phaseFor(dayOfCycle, cycleDays),
    dayOfCycle: dayOfCycle >= 1 ? dayOfCycle : null,
    nextStartDate: msToFloatingDate(nextStartMs),
    daysUntilNext,
    cycleDays,
    periodDays,
    basedOnCycles: auto.samples,
  };
}

/**
 * Giai đoạn theo ngày của chu kỳ.
 *
 * Rụng trứng ước tính rơi vào khoảng 14 ngày TRƯỚC kỳ sau (giai đoạn hoàng thể
 * ổn định hơn giai đoạn nang trứng, nên đếm ngược cho sai số nhỏ hơn là đếm
 * xuôi từ ngày đầu kỳ). Cửa sổ dễ thụ thai lấy 5 ngày trước tới 1 ngày sau.
 */
function phaseFor(dayOfCycle: number, cycleDays: number): CyclePhase {
  const ovulation = cycleDays - 14;
  if (dayOfCycle >= ovulation - 5 && dayOfCycle <= ovulation + 1) return 'FERTILE';
  if (dayOfCycle < ovulation) return 'FOLLICULAR';
  return 'LUTEAL';
}

function clampInt(value: number | null, min: number, max: number, fallback: number): number {
  if (value === null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Cắt gọt dự đoán theo mức chia sẻ, để gửi cho NGƯỜI ẤY.
 *
 * Hàm này là nơi DUY NHẤT quyết định người kia thấy gì — server gọi nó, client
 * không bao giờ tự lọc. Ở mức `SUMMARY` thì ngay cả số ngày còn lại cũng không
 * đi ra, vì biết "còn 3 ngày" là suy ngược ra được ngày cụ thể.
 */
export function partnerView(
  level: CycleShareLevel,
  name: string,
  prediction: CyclePrediction,
): CyclePartnerResponse {
  if (level === 'OFF') {
    return { shared: false, level, name: null, phase: null, nextStartDate: null, daysUntilNext: null };
  }

  if (level === 'SUMMARY') {
    const soon =
      prediction.daysUntilNext !== null &&
      prediction.daysUntilNext >= 0 &&
      prediction.daysUntilNext <= CYCLE_SOON_DAYS;
    return {
      shared: true,
      level,
      name,
      phase: prediction.phase === 'PERIOD' ? 'PERIOD' : soon ? 'LUTEAL' : null,
      nextStartDate: null,
      daysUntilNext: null,
    };
  }

  return {
    shared: true,
    level,
    name,
    phase: prediction.phase,
    nextStartDate: prediction.nextStartDate,
    daysUntilNext: prediction.daysUntilNext,
  };
}
