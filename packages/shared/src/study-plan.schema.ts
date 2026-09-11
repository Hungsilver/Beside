import { z } from 'zod';
import { calendarDaysBetween, ymdInTimeZone, ymdToUtcMidnight } from './datetime';

/**
 * F12 đợt 2 — ba thứ bao quanh buổi học: mốc đếm ngược, việc cần làm, nhật ký.
 *
 * Tách khỏi `study.schema.ts` vì đó là luật của ĐỒNG HỒ (chặng, pha, ghi công),
 * còn đây là những thứ sống độc lập với đồng hồ: mốc thi vẫn đếm khi không ai
 * học, việc cần làm vẫn còn đó sau khi phiên đóng.
 */

// ---------------------------------------------------------------------------
// Mốc đếm ngược
// ---------------------------------------------------------------------------

export const MAX_DDAY_TITLE_LEN = 40;

/**
 * Trần số mốc mỗi người. Năm mốc là đã quá đủ cho một mùa thi; nhiều hơn thì
 * danh sách dài hơn màn hình và không mốc nào còn nổi bật nữa — mà nổi bật
 * chính là toàn bộ công dụng của nó.
 */
export const MAX_DDAYS_PER_USER = 5;

/**
 * Mốc xa nhất nhận được: 5 năm. Không phải để cấm ai, mà để một cú gõ nhầm năm
 * ("2206") không đẻ ra con số đếm ngược sáu chữ số nằm mãi trên màn hình.
 */
export const MAX_DDAY_YEARS_AHEAD = 5;

/** `YYYY-MM-DD` — ngày trên tờ lịch, không kèm giờ. */
const ymdString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((v) => parseYmd(v) !== null, 'Ngày không có thật');

export const createDDaySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Hãy đặt tên cho mốc này')
    .max(MAX_DDAY_TITLE_LEN, `Tên mốc tối đa ${MAX_DDAY_TITLE_LEN} ký tự`),
  date: ymdString,
});
export type CreateDDayInput = z.infer<typeof createDDaySchema>;

export interface StudyDDayResponse {
  id: string;
  userId: string;
  title: string;
  /** `YYYY-MM-DD` theo lịch giờ Việt Nam. */
  date: string;
  /**
   * Số ngày lịch còn lại: `0` là hôm nay, số âm là đã qua.
   *
   * Tính ở SERVER chứ không để client tự trừ — máy người dùng có thể lệch giờ
   * hoặc đặt sai múi giờ, mà "còn mấy ngày nữa thi" thì không được phép sai.
   */
  daysLeft: number;
}

/**
 * Số ngày lịch từ hôm nay tới `ymd`, theo giờ Việt Nam.
 *
 * Đếm theo NGÀY LỊCH chứ không theo số giờ chia 24: 23h hôm nay tới 1h ngày mai
 * chỉ cách nhau 2 tiếng nhưng vẫn là "còn 1 ngày".
 */
export function daysUntil(ymd: string, now: Date = new Date()): number | null {
  const parsed = parseYmd(ymd);
  if (parsed === null) return null;
  return calendarDaysBetween(now, new Date(parsed));
}

/** `2` → `còn 2 ngày` · `0` → `hôm nay` · `-3` → `đã qua 3 ngày`. */
export function formatDaysLeft(daysLeft: number): string {
  if (!Number.isFinite(daysLeft)) return '—';
  const d = Math.round(daysLeft);
  if (d === 0) return 'Hôm nay';
  if (d > 0) return `Còn ${d} ngày`;
  return `Đã qua ${-d} ngày`;
}

/**
 * Nhãn ngắn kiểu bảng đếm ngược: `D-12` · `D-DAY` · `D+3`.
 *
 * Giữ đúng cách viết quen thuộc của các app đếm ngược mùa thi, để người đã dùng
 * app khác nhìn vào là hiểu ngay không cần học lại.
 */
export function formatDDayBadge(daysLeft: number): string {
  if (!Number.isFinite(daysLeft)) return 'D';
  const d = Math.round(daysLeft);
  if (d === 0) return 'D-DAY';
  return d > 0 ? `D-${d}` : `D+${-d}`;
}

/**
 * `YYYY-MM-DD` → mốc UTC nửa đêm, hoặc `null` nếu ngày không có thật.
 *
 * Tự dựng bằng `Date.UTC` rồi KIỂM TRA NGƯỢC thay vì tin `new Date(chuỗi)`:
 * `Date.UTC(2026, 1, 31)` lặng lẽ trôi sang 03/03 chứ không báo lỗi, nên
 * "31/02" sẽ lọt qua nếu không so lại ba thành phần.
 */
export function parseYmd(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/** `Date` → `YYYY-MM-DD` theo lịch giờ Việt Nam. */
export function toYmdKey(date: Date): string {
  const { year, month, day } = ymdInTimeZone(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Mốc UTC nửa đêm của ngày hôm nay theo lịch giờ Việt Nam. */
export function todayUtcMidnight(now: Date = new Date()): number {
  return ymdToUtcMidnight(ymdInTimeZone(now));
}

// ---------------------------------------------------------------------------
// Việc cần làm
// ---------------------------------------------------------------------------

export const MAX_TASK_TITLE_LEN = 80;

/**
 * Trần số việc đang mở của mỗi người.
 *
 * Danh sách việc cần làm dài quá 40 dòng thì không ai đọc nữa, và nó cũng là
 * hàng rào duy nhất chặn một client hỏng bơm việc vào không giới hạn.
 */
export const MAX_OPEN_TASKS = 40;

export const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Việc cần làm không được để trống')
    .max(MAX_TASK_TITLE_LEN, `Tối đa ${MAX_TASK_TITLE_LEN} ký tự`),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TASK_TITLE_LEN).optional(),
    done: z.boolean().optional(),
  })
  // Thân rỗng nghĩa là client đang gọi nhầm. Nhận im lặng rồi trả về bản ghi y
  // nguyên sẽ khiến lỗi phía gọi không bao giờ lộ ra.
  .refine((v) => v.title !== undefined || v.done !== undefined, 'Không có gì để sửa');
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export interface StudyTaskResponse {
  id: string;
  userId: string;
  title: string;
  /** Ngày việc được tạo, `YYYY-MM-DD` giờ VN. */
  day: string;
  done: boolean;
  /**
   * `true` khi việc chưa xong và được tạo từ ngày TRƯỚC hôm nay.
   *
   * Giao diện phải nói rõ điều này. Việc hôm qua âm thầm nằm lẫn trong danh
   * sách hôm nay sẽ khiến người ta tưởng mình vừa đặt ra nó sáng nay.
   */
  carriedOver: boolean;
}

// ---------------------------------------------------------------------------
// Nhật ký một dòng
// ---------------------------------------------------------------------------

export const MAX_NOTE_LEN = 140;

/**
 * Trong bao lâu sau khi chặng kết thúc thì còn hỏi "vừa rồi làm được gì".
 *
 * Ba tiếng: đủ dài để người khoá máy đi học rồi mở lại app vẫn ghi kịp, đủ ngắn
 * để không bật lên hỏi về một chặng học từ sáng hôm trước.
 */
export const NOTE_PROMPT_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Số dòng nhật ký gần nhất trả về cùng bản tổng hợp. */
export const RECENT_NOTES_LIMIT = 8;

export const setLogNoteSchema = z.object({
  note: z
    .string()
    .trim()
    .max(MAX_NOTE_LEN, `Ghi chú tối đa ${MAX_NOTE_LEN} ký tự`)
    // Xoá trắng ô rồi lưu = gỡ ghi chú. Cho `null` đi qua để có một cách duy
    // nhất diễn đạt "không có ghi chú".
    .transform((v) => (v.length === 0 ? null : v)),
});
export type SetLogNoteInput = z.infer<typeof setLogNoteSchema>;

export interface StudyNoteResponse {
  /** Id của `StudyLog` — dạng chuỗi vì khoá chính là `BigInt`. */
  logId: string;
  /** `YYYY-MM-DD` giờ VN. */
  day: string;
  round: number;
  minutes: number;
  subject: string | null;
  note: string | null;
}
