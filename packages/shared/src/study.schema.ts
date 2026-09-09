import { z } from 'zod';
import { calendarDaysBetween, ymdInTimeZone, ymdToUtcMidnight } from './datetime';

/**
 * Phòng học chung (F12) — Pomodoro cho hai người.
 *
 * Một người bấm bắt đầu, người kia vào cùng. Đồng hồ chạy đồng bộ vì cả hai máy
 * đọc chung một mốc `endsAt` do server đặt — không máy nào tự đếm giờ của mình.
 *
 * ── Khác đồng hồ của trò chơi ở một điểm quan trọng ────────────────────────
 *
 * Đồng hồ ván bài **dừng lại** khi người tới lượt khoá màn hình (§1.3: iOS treo
 * JS). Đồng hồ học thì **ngược lại: phải chạy tiếp**. Khoá màn hình điện thoại
 * để khỏi bị phân tâm chính là điều người ta làm khi ngồi học — dừng đồng hồ
 * lúc đó là phá đúng thứ tính năng này phục vụ.
 *
 * Hệ quả: hết giờ phải báo bằng **Web Push**, vì rất có thể app đang đóng.
 */

export const STUDY_PHASES = ['FOCUS', 'BREAK'] as const;
export type StudyPhase = (typeof STUDY_PHASES)[number];

export const STUDY_PHASE_LABELS: Record<StudyPhase, string> = {
  FOCUS: 'Đang học',
  BREAK: 'Giải lao',
};

export const STUDY_STATUSES = ['RUNNING', 'DONE', 'CANCELLED'] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** Các mức thời gian cho chọn. 25 phút là Pomodoro chuẩn; 50 cho bài dài. */
export const FOCUS_OPTIONS = [15, 25, 50] as const;
export const BREAK_OPTIONS = [5, 10] as const;

export const DEFAULT_FOCUS_MIN = 25;
export const DEFAULT_BREAK_MIN = 5;

/**
 * Trần một phiên. Không phải để chặn ai, mà để một client hỏng không đặt được
 * `endsAt` cách đây mười năm rồi treo phòng học vĩnh viễn.
 */
export const MAX_ROUNDS = 16;

export const startStudySchema = z.object({
  focusMin: z
    .number()
    .int()
    .refine((v) => (FOCUS_OPTIONS as readonly number[]).includes(v), 'Thời lượng học không hợp lệ')
    .default(DEFAULT_FOCUS_MIN),
  breakMin: z
    .number()
    .int()
    .refine((v) => (BREAK_OPTIONS as readonly number[]).includes(v), 'Thời lượng nghỉ không hợp lệ')
    .default(DEFAULT_BREAK_MIN),
});
export type StartStudyInput = z.infer<typeof startStudySchema>;

export interface StudySessionResponse {
  id: string;
  status: StudyStatus;
  phase: StudyPhase;
  focusMin: number;
  breakMin: number;
  /** Mốc kết thúc chặng hiện tại (epoch ms). Client đếm ngược từ đây. */
  endsAt: number;
  /** Số chặng học đã hoàn thành trong phiên này. */
  roundsDone: number;
  startedById: string;
  /** Ai đang ở trong phòng, kể cả người vừa vào giữa chừng. */
  presentUserIds: string[];
  startedAt: string;
}

export interface StudyPersonStats {
  userId: string;
  displayName: string;
  /** Tổng số phút đã học, cộng dồn mọi phiên đã hoàn thành. */
  totalMinutes: number;
  /** Số phút học hôm nay (theo ngày lịch giờ Việt Nam). */
  todayMinutes: number;
  /** Số ngày học liên tiếp tính tới hôm nay. */
  streakDays: number;
}

export interface StudySummaryResponse {
  /** Phiên đang chạy, `null` nếu không có. */
  current: StudySessionResponse | null;
  people: StudyPersonStats[];
  /** Tổng số phút hai người đã học cùng nhau. */
  togetherMinutes: number;
}

/**
 * Chuỗi ngày học liên tiếp tính tới hôm nay.
 *
 * Đếm theo **ngày lịch giờ Việt Nam**, không phải theo mốc thời gian: học lúc
 * 0h30 là của hôm nay chứ không phải hôm qua. Đây đúng là cái bẫy ADR
 * 2026-09-07 đã ghi — so bằng timestamp làm "hôm nay" bị tính nhầm trong
 * khoảng 00:00–07:00 giờ VN.
 *
 * Hôm nay chưa học thì chuỗi vẫn còn nếu **hôm qua có học** — ngày mới chỉ vừa
 * bắt đầu, cắt chuỗi ngay lúc 0h là phạt người ta vì chưa kịp làm gì.
 *
 * @param days danh sách ngày có học, dạng `YYYY-MM-DD`, không cần sắp xếp
 */
export function studyStreak(days: string[], now: Date = new Date()): number {
  if (days.length === 0) return 0;

  const toMs = (ymd: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return null;
    return ymdToUtcMidnight({
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
    });
  };

  /*
   * Lọc ngày hỏng TRƯỚC khi sắp xếp.
   *
   * Lọc sau thì một chuỗi rác như "hong" sắp lên đầu danh sách (ký tự 'h' đứng
   * sau chữ số), hàm đọc nó ra `null` rồi kết luận chuỗi bằng 0 — mất sạch
   * những ngày học có thật phía sau.
   */
  const sorted = [...new Set(days)]
    .map((ymd) => toMs(ymd))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => b - a);

  const newestMs = sorted[0];
  if (newestMs === undefined) return 0;

  const todayMs = ymdToUtcMidnight(ymdInTimeZone(now));
  const gapFromToday = calendarDaysBetween(new Date(newestMs), new Date(todayMs));
  // Ngày học gần nhất phải là hôm nay hoặc hôm qua, nếu không chuỗi đã đứt.
  if (gapFromToday > 1 || gapFromToday < 0) return 0;

  let streak = 1;
  let previousMs = newestMs;
  for (const ms of sorted.slice(1)) {
    if (calendarDaysBetween(new Date(ms), new Date(previousMs)) !== 1) break;
    streak += 1;
    previousMs = ms;
  }
  return streak;
}

/**
 * Chặng kế tiếp sau khi chặng hiện tại hết giờ.
 *
 * Học xong thì nghỉ, nghỉ xong thì học tiếp — cho tới khi chạm trần số chặng
 * hoặc có người bấm dừng.
 */
export function nextPhase(
  phase: StudyPhase,
  roundsDone: number,
): { phase: StudyPhase; roundsDone: number; finished: boolean } {
  if (phase === 'FOCUS') {
    const done = roundsDone + 1;
    return { phase: 'BREAK', roundsDone: done, finished: done >= MAX_ROUNDS };
  }
  return { phase: 'FOCUS', roundsDone, finished: false };
}

/** Độ dài chặng, tính bằng mili-giây. */
export function phaseDurationMs(
  phase: StudyPhase,
  focusMin: number,
  breakMin: number,
): number {
  return (phase === 'FOCUS' ? focusMin : breakMin) * 60_000;
}

// ---------------------------------------------------------------------------
// WebSocket — namespace riêng, cùng lý do với `/rtg` của trò chơi
// ---------------------------------------------------------------------------

export const STUDY_RT_NAMESPACE = '/rts';

export const STUDY_RT_EVENTS = {
  /**
   * Vào nghe phòng học của couple mình. KHÔNG kèm id phiên nào cả.
   *
   * Nghe theo couple chứ không theo phiên là có chủ ý: người kia bấm "bắt đầu"
   * lúc mình đang mở app thì mình phải thấy ngay. Nghe theo phiên thì lúc chưa
   * có phiên nào, client chẳng có gì để nghe — và đúng khoảnh khắc cần biết
   * nhất lại là khoảnh khắc không nghe được.
   */
  WATCH: 's:watch',
  /** Trạng thái phiên hiện tại, hoặc `null` khi không có phiên nào. */
  STATE: 's:state',
  ERROR: 's:error',
} as const;
