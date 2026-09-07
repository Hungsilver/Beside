import { z } from 'zod';
import { ymdInTimeZone, ymdToUtcMidnight, MS_PER_DAY } from './datetime';

/**
 * Lịch trình chung (F4).
 *
 * ── Quy ước thời gian, đọc kỹ trước khi sửa ─────────────────────────────────
 *
 * Có hai loại sự kiện và chúng lưu thời gian theo hai cách KHÁC NHAU:
 *
 *   allDay = false → `startAt`/`endAt` là mốc thời gian thật, lưu UTC như mọi
 *                    chỗ khác trong dự án. Hiển thị thì đổi sang Asia/Ho_Chi_Minh.
 *
 *   allDay = true  → `startAt`/`endAt` là **ngày trôi nổi** (floating date):
 *                    lưu đúng 00:00 UTC của ngày lịch đó, và khi đọc ra thì
 *                    lấy Y/M/D theo UTC, KHÔNG đổi múi giờ.
 *
 * Vì sao phải tách làm hai: "Sinh nhật 08/09" không phải một khoảnh khắc, nó là
 * một ô trên tờ lịch. Nếu lưu nó thành 00:00 giờ VN (= 17:00 UTC ngày 07/09) thì
 * người xem ở múi giờ khác — hoặc chính server khi so ngày bằng UTC — sẽ thấy nó
 * rơi vào ngày 07. Ngày trôi nổi không có lỗi đó vì nó không mang múi giờ nào cả.
 */

export const EVENT_TITLE_MAX = 120;
export const EVENT_NOTE_MAX = 1000;

/** Trần độ dài một sự kiện: 30 ngày. Dài hơn thì gần như chắc chắn là gõ nhầm năm. */
export const EVENT_MAX_DURATION_MS = 30 * MS_PER_DAY;

/** Khoảng thời gian tối đa cho một lần truy vấn lịch — chặn quét cả chục năm. */
export const EVENT_RANGE_MAX_DAYS = 400;

export const EVENT_VISIBILITIES = ['SHARED', 'PRIVATE'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

/** Các mốc nhắc trước được phép chọn, tính bằng phút. `null` = không nhắc. */
export const REMIND_OPTIONS = [0, 10, 30, 60, 120, 1440] as const;
export type RemindOption = (typeof REMIND_OPTIONS)[number];

export const REMIND_LABELS: Record<number, string> = {
  0: 'Đúng giờ',
  10: 'Trước 10 phút',
  30: 'Trước 30 phút',
  60: 'Trước 1 tiếng',
  120: 'Trước 2 tiếng',
  1440: 'Trước 1 ngày',
};

/** Bộ emoji gợi ý khi tạo sự kiện — để hai máy hiển thị giống nhau. */
export const EVENT_EMOJIS = ['📅', '🍽️', '🎬', '✈️', '🎂', '💼', '🏥', '💕'] as const;

// ---------------------------------------------------------------------------
// Chuyển đổi ngày trôi nổi
// ---------------------------------------------------------------------------

/** `"2026-09-08"` → mốc 00:00 UTC của ngày đó (ngày trôi nổi). */
export function floatingDateToMs(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return Number.NaN;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = ymdToUtcMidnight({ year, month, day });
  // Chặn ngày không tồn tại kiểu 31/02: Date sẽ tự trôi sang 03/03, nên phải
  // dựng ngược lại rồi so xem có khớp không.
  const back = ymdInTimeZone(new Date(ms), 'UTC');
  return back.year === year && back.month === month && back.day === day ? ms : Number.NaN;
}

/** Mốc UTC → `"YYYY-MM-DD"` đọc theo UTC (dùng cho sự kiện cả ngày). */
export function msToFloatingDate(ms: number): string {
  const { year, month, day } = ymdInTimeZone(new Date(ms), 'UTC');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Sự kiện cần có tên')
  .max(EVENT_TITLE_MAX, `Tên sự kiện tối đa ${EVENT_TITLE_MAX} ký tự`);

const noteSchema = z
  .string()
  .trim()
  .max(EVENT_NOTE_MAX, `Ghi chú tối đa ${EVENT_NOTE_MAX} ký tự`)
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'Thời gian không hợp lệ' });

const floatingDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD');

/**
 * Thân request tạo/sửa sự kiện.
 *
 * Toàn bộ phép kiểm tra chéo nằm trong MỘT `superRefine`, và mỗi nhánh sai đều
 * `return` ngay. Không tách thành nhiều `.refine()` nối tiếp: khi một phép kiểm
 * tra sớm thất bại, các phép sau vẫn chạy trên dữ liệu chưa hợp lệ và ném
 * TypeError → 500 thay vì 422 — đúng cái lỗi đã gặp ở `anniversarySchema`
 * (trace Phase 1, L2).
 */
const eventBodyBase = z.object({
  title: titleSchema,
  note: noteSchema,
  emoji: z.string().trim().min(1).max(8).optional(),
  allDay: z.boolean().default(false),
  /** Bắt buộc khi allDay = false. */
  startAt: isoDateTime.optional(),
  endAt: isoDateTime.optional(),
  /** Bắt buộc khi allDay = true. */
  startDate: floatingDate.optional(),
  endDate: floatingDate.optional(),
  placeId: z.string().uuid().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  remindMinBefore: z
    .number()
    .int()
    .min(0)
    .max(10_080, 'Chỉ nhắc trước tối đa 7 ngày')
    .nullable()
    .optional(),
  visibility: z.enum(EVENT_VISIBILITIES).default('SHARED'),
});

export interface NormalizedEventTimes {
  allDay: boolean;
  startAtMs: number;
  endAtMs: number | null;
}

export const createEventSchema = eventBodyBase.superRefine((v, ctx) => {
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (v.allDay) {
    if (!v.startDate) return fail('startDate', 'Sự kiện cả ngày cần ngày bắt đầu');
    const start = floatingDateToMs(v.startDate);
    if (Number.isNaN(start)) return fail('startDate', 'Ngày này không có thật');

    if (v.endDate !== undefined) {
      const end = floatingDateToMs(v.endDate);
      if (Number.isNaN(end)) return fail('endDate', 'Ngày này không có thật');
      if (end < start) return fail('endDate', 'Ngày kết thúc không được trước ngày bắt đầu');
      // Cả ngày thì hai đầu đều tính vào, nên +1 ngày mới ra độ dài thật.
      if (end - start + MS_PER_DAY > EVENT_MAX_DURATION_MS) {
        return fail('endDate', 'Sự kiện dài quá 30 ngày — có nhầm năm không?');
      }
    }
    return;
  }

  if (!v.startAt) return fail('startAt', 'Sự kiện cần giờ bắt đầu');
  const start = Date.parse(v.startAt);
  if (Number.isNaN(start)) return fail('startAt', 'Thời gian không hợp lệ');

  if (v.endAt !== undefined) {
    const end = Date.parse(v.endAt);
    if (Number.isNaN(end)) return fail('endAt', 'Thời gian không hợp lệ');
    if (end <= start) return fail('endAt', 'Giờ kết thúc phải sau giờ bắt đầu');
    if (end - start > EVENT_MAX_DURATION_MS) {
      return fail('endAt', 'Sự kiện dài quá 30 ngày — có nhầm năm không?');
    }
  }
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Sửa sự kiện: mọi trường đều tuỳ chọn, nhưng nếu đụng tới thời gian thì phải gửi đủ. */
export const updateEventSchema = createEventSchema;
export type UpdateEventInput = CreateEventInput;

/**
 * Quy về đúng hai con số để ghi vào DB.
 * Dùng CHUNG cho FE (xem trước) và BE (ghi thật) — không được có hai bản.
 */
export function normalizeEventTimes(input: CreateEventInput): NormalizedEventTimes {
  if (input.allDay) {
    const startAtMs = floatingDateToMs(input.startDate as string);
    const endAtMs =
      input.endDate === undefined ? null : floatingDateToMs(input.endDate);
    return { allDay: true, startAtMs, endAtMs };
  }
  return {
    allDay: false,
    startAtMs: Date.parse(input.startAt as string),
    endAtMs: input.endAt === undefined ? null : Date.parse(input.endAt),
  };
}

export const eventRangeSchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
  })
  .superRefine((v, ctx) => {
    const from = Date.parse(v.from);
    const to = Date.parse(v.to);
    if (to <= from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Mốc kết thúc phải sau mốc bắt đầu',
      });
      return;
    }
    if (to - from > EVENT_RANGE_MAX_DAYS * MS_PER_DAY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Chỉ xem được tối đa ${EVENT_RANGE_MAX_DAYS} ngày mỗi lần`,
      });
    }
  });
export type EventRangeQuery = z.infer<typeof eventRangeSchema>;

// ---------------------------------------------------------------------------
// Kiểu trả về
// ---------------------------------------------------------------------------

export interface EventResponse {
  id: string;
  title: string;
  note: string | null;
  emoji: string;
  allDay: boolean;
  /** ISO. Với sự kiện cả ngày thì đây là 00:00 UTC của ngày lịch (ngày trôi nổi). */
  startAt: string;
  endAt: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  remindMinBefore: number | null;
  visibility: EventVisibility;
  createdById: string;
  createdByName: string;
  /** Người đang xem có sửa/xoá được không (chỉ người tạo). */
  canEdit: boolean;
}

/**
 * Hai sự kiện có chồng giờ nhau không? Dùng để tô cảnh báo trên giao diện.
 * Sự kiện không có giờ kết thúc coi như kéo dài 0 phút (một mốc).
 */
export function eventsOverlap(
  a: { startAt: string; endAt: string | null },
  b: { startAt: string; endAt: string | null },
): boolean {
  const aStart = Date.parse(a.startAt);
  const aEnd = a.endAt ? Date.parse(a.endAt) : aStart;
  const bStart = Date.parse(b.startAt);
  const bEnd = b.endAt ? Date.parse(b.endAt) : bStart;
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;

  // Sự kiện không có giờ kết thúc là một MỐC, không phải một khoảng. Công thức
  // giao khoảng thông thường (aStart < bEnd && bStart < aEnd) luôn trả false cho
  // mốc, nên hai cuộc hẹn đặt trùng đúng một giờ sẽ không bị cảnh báo.
  const aPoint = aEnd === aStart;
  const bPoint = bEnd === bStart;
  if (aPoint && bPoint) return aStart === bStart;
  if (aPoint) return aStart >= bStart && aStart < bEnd;
  if (bPoint) return bStart >= aStart && bStart < aEnd;

  // Chạm mép không tính là chồng: 9–10h và 10–11h là hai việc nối tiếp nhau.
  return aStart < bEnd && bStart < aEnd;
}
