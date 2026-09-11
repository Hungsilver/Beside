import { z } from 'zod';
import { calendarDaysBetween, ymdInTimeZone, ymdToUtcMidnight } from './datetime';
import type {
  StudyDDayResponse,
  StudyNoteResponse,
  StudyTaskResponse,
} from './study-plan.schema';

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

/**
 * Độ dài tối đa tên môn. 40 ký tự vừa đủ "Ôn thi cuối kỳ môn Giải tích 2" mà
 * vẫn không tràn dòng trên khung 390px.
 */
export const MAX_SUBJECT_LEN = 40;

/**
 * Gợi ý môn học. Chỉ là GỢI Ý — người dùng gõ gì cũng được, danh sách này chỉ
 * để khỏi phải gõ trong 90% trường hợp. Không ràng buộc ở tầng validate, nếu
 * không thì một người học môn không có trong danh sách sẽ bị chặn vô cớ.
 */
export const STUDY_SUBJECT_PRESETS = [
  { emoji: '📐', label: 'Toán' },
  { emoji: '📖', label: 'Văn' },
  { emoji: '🔤', label: 'Tiếng Anh' },
  { emoji: '🧲', label: 'Vật lý' },
  { emoji: '⚗️', label: 'Hoá' },
  { emoji: '🧬', label: 'Sinh' },
  { emoji: '🏛️', label: 'Lịch sử' },
  { emoji: '💻', label: 'Lập trình' },
  { emoji: '📚', label: 'Đọc sách' },
  { emoji: '📝', label: 'Làm bài tập' },
  { emoji: '🎯', label: 'Ôn thi' },
  { emoji: '💼', label: 'Việc riêng' },
] as const;

/**
 * Trần mục tiêu mỗi ngày: 16 giờ. Không phải để ngăn ai học nhiều, mà để một ô
 * nhập gõ nhầm ("6000") không sinh ra thanh tiến độ vĩnh viễn 0%.
 */
export const MAX_DAILY_GOAL_MIN = 16 * 60;

/** Các mức mục tiêu cho bấm nhanh, phút. 0 = tắt mục tiêu. */
export const DAILY_GOAL_OPTIONS = [0, 30, 60, 120, 180, 240] as const;

/** Số ngày biểu đồ thống kê nhìn lại. Một tuần vừa đủ rộng cho khung 390px. */
export const STATS_DAYS = 7;

/**
 * Làm sạch tên môn. Chuỗi rỗng / toàn khoảng trắng ⇒ `null` chứ không phải `""`
 * — "không đặt tên" phải có đúng MỘT cách biểu diễn, nếu không mọi chỗ đếm theo
 * môn sẽ đẻ ra một nhóm rỗng vô nghĩa bên cạnh nhóm `null`.
 */
export function normalizeSubject(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_SUBJECT_LEN);
}

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
  /** Môn / việc sắp học. Bỏ trống cũng được. */
  subject: z
    .string()
    .max(MAX_SUBJECT_LEN, `Tên môn tối đa ${MAX_SUBJECT_LEN} ký tự`)
    .nullish()
    .transform((v) => normalizeSubject(v)),
});
export type StartStudyInput = z.infer<typeof startStudySchema>;

export interface StudySessionResponse {
  id: string;
  status: StudyStatus;
  phase: StudyPhase;
  focusMin: number;
  breakMin: number;
  /** Môn / việc đang học, `null` khi buổi học không đặt tên. */
  subject: string | null;
  /** Mốc kết thúc chặng hiện tại (epoch ms). Client đếm ngược từ đây. */
  endsAt: number;
  /** Số chặng học đã hoàn thành trong phiên này. */
  roundsDone: number;
  startedById: string;
  /** Ai đang ở trong phòng, kể cả người vừa vào giữa chừng. */
  presentUserIds: string[];
  startedAt: string;
}

/** Một cột trên biểu đồ tuần. */
export interface StudyDayBucket {
  /** `YYYY-MM-DD` theo ngày lịch giờ Việt Nam. */
  day: string;
  minutes: number;
}

/** Một dòng trong bảng phân bổ theo môn. */
export interface StudySubjectBucket {
  /** `null` = những buổi học không đặt tên môn. */
  subject: string | null;
  minutes: number;
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
  /**
   * Mục tiêu phút mỗi ngày, `0` = chưa đặt.
   *
   * Mục tiêu của CẢ HAI đều gửi về: đây là app cho hai người, thấy mục tiêu của
   * người kia mới biết hôm nay người ta còn thiếu bao nhiêu để mà rủ học tiếp.
   */
  goalMin: number;
  /**
   * Đúng `STATS_DAYS` phần tử, cũ → mới, ngày không học vẫn có mặt với `0`.
   * Trả đủ ở server để client không phải tự đoán ngày nào bị thiếu — và nhờ vậy
   * biểu đồ không bao giờ nhảy cột.
   */
  days: StudyDayBucket[];
  /** Phân bổ theo môn trong cùng khoảng `days`, nhiều phút xếp trước. */
  subjects: StudySubjectBucket[];
}

export interface StudySummaryResponse {
  /** Phiên đang chạy, `null` nếu không có. */
  current: StudySessionResponse | null;
  people: StudyPersonStats[];
  /** Tổng số phút hai người đã học cùng nhau. */
  togetherMinutes: number;
  /** Ngày đầu của khoảng biểu đồ, `YYYY-MM-DD`. Client dựng nhãn trục từ đây. */
  statsFrom: string;

  // --- Đợt 2 ---------------------------------------------------------------
  /** Mốc đếm ngược của CẢ HAI, gần tới hạn xếp trước. */
  ddays: StudyDDayResponse[];
  /** Việc đang mở của mình + việc mình đã xong hôm nay. */
  tasks: StudyTaskResponse[];
  /**
   * Chặng vừa học xong mà mình chưa kịp ghi nhật ký, `null` nếu không có.
   * Giao diện lấy nó để hỏi "vừa rồi làm được gì".
   */
  pendingNote: StudyNoteResponse | null;
  /** Vài dòng nhật ký gần nhất của mình, mới → cũ. */
  recentNotes: StudyNoteResponse[];
}

/** Đặt mục tiêu phút mỗi ngày cho CHÍNH MÌNH. */
export const setStudyGoalSchema = z.object({
  dailyGoalMin: z
    .number()
    .int('Mục tiêu phải là số nguyên phút')
    .min(0, 'Mục tiêu không thể âm')
    .max(MAX_DAILY_GOAL_MIN, `Mục tiêu tối đa ${MAX_DAILY_GOAL_MIN / 60} giờ mỗi ngày`),
});
export type SetStudyGoalInput = z.infer<typeof setStudyGoalSchema>;

/**
 * Dãy `YYYY-MM-DD` của `days` ngày gần nhất tính tới `now`, cũ → mới.
 *
 * Đi lùi bằng cách trừ 24h trên mốc nửa đêm UTC của ngày Việt Nam, chứ không
 * trừ trên `now`: trừ trên `now` thì một ngày có đổi giờ hoặc một `now` lúc
 * 00:30 sẽ cho ra hai phần tử trùng nhau và biểu đồ mất một cột.
 */
export function recentDayKeys(days: number, now: Date = new Date()): string[] {
  const count = Math.max(0, Math.floor(days));
  if (count === 0) return [];

  const todayMs = ymdToUtcMidnight(ymdInTimeZone(now));
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(todayMs - i * 86_400_000);
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`,
    );
  }
  return keys;
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
