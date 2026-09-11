import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  MAX_DDAYS_PER_USER,
  MAX_DDAY_YEARS_AHEAD,
  MAX_OPEN_TASKS,
  NOTE_PROMPT_WINDOW_MS,
  RECENT_NOTES_LIMIT,
  daysUntil,
  parseYmd,
  todayUtcMidnight,
  toYmdKey,
  type CreateDDayInput,
  type CreateTaskInput,
  type SetLogNoteInput,
  type StudyDDayResponse,
  type StudyNoteResponse,
  type StudyTaskResponse,
  type UpdateTaskInput,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';

/**
 * Mốc đếm ngược · việc cần làm · nhật ký một dòng (F12 đợt 2).
 *
 * Tách khỏi `StudyService` vì nó không đụng gì tới đồng hồ: không có chặng,
 * không có pha, không có cron. Gộp chung chỉ làm một service vốn đã dài phải
 * gánh thêm ba nhóm nghiệp vụ chẳng liên quan.
 *
 * **Quyền (R3):** mọi truy vấn đều lọc theo `coupleId` lấy từ token, và mọi
 * thao tác SỬA đều lọc thêm `userId` — thấy được mốc của người ấy, nhưng không
 * xoá được nó.
 */
@Injectable()
export class StudyPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  // ------------------------------------------------------------------
  // Mốc đếm ngược
  // ------------------------------------------------------------------

  /** Mốc của CẢ HAI người, gần tới hạn xếp trước. */
  async ddaysOf(coupleId: string, now: Date = new Date()): Promise<StudyDDayResponse[]> {
    const rows = await this.prisma.studyDDay.findMany({
      where: { coupleId },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => toDDayResponse(r, now));
  }

  async createDDay(userId: string, input: CreateDDayInput): Promise<StudyDDayResponse> {
    const ctx = await this.locations.getContext(userId);
    const now = new Date();

    const ms = parseYmd(input.date);
    if (ms === null) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_FAILED, 'Ngày không có thật');
    }

    /*
     * Chặn mốc quá xa ở tầng service chứ không chỉ ở Zod.
     *
     * Zod không biết "hôm nay" là ngày nào nên không kiểm được khoảng cách —
     * mà một mốc gõ nhầm năm sẽ nằm lại mãi trên màn hình với con số sáu chữ số.
     */
    const left = daysUntil(input.date, now);
    if (left !== null && left > MAX_DDAY_YEARS_AHEAD * 366) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Mốc xa nhất là ${MAX_DDAY_YEARS_AHEAD} năm — kiểm tra lại năm xem có gõ nhầm không`,
      );
    }

    const mine = await this.prisma.studyDDay.count({ where: { coupleId: ctx.coupleId, userId } });
    if (mine >= MAX_DDAYS_PER_USER) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `Mỗi người giữ tối đa ${MAX_DDAYS_PER_USER} mốc — xoá bớt một mốc cũ đi nhé`,
      );
    }

    const saved = await this.prisma.studyDDay.create({
      data: {
        coupleId: ctx.coupleId,
        userId,
        title: input.title,
        date: new Date(ms),
      },
    });
    return toDDayResponse(saved, now);
  }

  /** Chỉ xoá được mốc của CHÍNH MÌNH — người ấy thấy nhưng không đụng vào được. */
  async deleteDDay(userId: string, id: string): Promise<void> {
    const ctx = await this.locations.getContext(userId);
    const deleted = await this.prisma.studyDDay.deleteMany({
      where: { id, coupleId: ctx.coupleId, userId },
    });
    // "Không tồn tại" và "của người khác" trả CÙNG một 404, giống mọi module
    // khác — không để ai dò được id nào có thật.
    if (deleted.count === 0) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy mốc này');
    }
  }

  // ------------------------------------------------------------------
  // Việc cần làm
  // ------------------------------------------------------------------

  /**
   * Việc của một người: mọi việc CHƯA XONG (dù tạo từ hôm nào) cộng với việc
   * ĐÃ XONG hôm nay.
   *
   * Việc chưa xong không biến mất lúc nửa đêm. Danh sách bó cứng vào "hôm nay"
   * nghe thì gọn, nhưng nó âm thầm nuốt mất đúng những việc người ta đang nợ —
   * và người dùng chỉ phát hiện ra khi đã quên hẳn.
   */
  async tasksOf(
    coupleId: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<StudyTaskResponse[]> {
    const today = new Date(todayUtcMidnight(now));
    const rows = await this.prisma.studyTask.findMany({
      where: {
        coupleId,
        userId,
        OR: [{ doneAt: null }, { day: today }],
      },
      orderBy: [{ day: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => toTaskResponse(r, today));
  }

  async createTask(userId: string, input: CreateTaskInput): Promise<StudyTaskResponse> {
    const ctx = await this.locations.getContext(userId);
    const now = new Date();
    const today = new Date(todayUtcMidnight(now));

    const open = await this.prisma.studyTask.count({
      where: { coupleId: ctx.coupleId, userId, doneAt: null },
    });
    if (open >= MAX_OPEN_TASKS) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `Đang có ${open} việc chưa xong — làm bớt hoặc xoá bớt trước đã`,
      );
    }

    const saved = await this.prisma.studyTask.create({
      data: { coupleId: ctx.coupleId, userId, title: input.title, day: today },
    });
    return toTaskResponse(saved, today);
  }

  async updateTask(
    userId: string,
    id: string,
    input: UpdateTaskInput,
  ): Promise<StudyTaskResponse> {
    const ctx = await this.locations.getContext(userId);
    const now = new Date();

    /*
     * `updateMany` + bộ lọc quyền trong CÙNG một câu lệnh, không đọc rồi mới
     * ghi: hai bước thì giữa chúng có một khe hở, và khe hở ấy là chỗ mọi lỗi
     * đua sự kiện chui vào (§10, bài học từ lúc ghép đôi).
     */
    const changed = await this.prisma.studyTask.updateMany({
      where: { id, coupleId: ctx.coupleId, userId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.done !== undefined ? { doneAt: input.done ? now : null } : {}),
      },
    });
    if (changed.count === 0) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy việc này');
    }

    /*
     * Đọc lại bằng `findUnique` chứ không `findUniqueOrThrow`: người dùng có
     * thể bấm "xong" rồi bấm "xoá" gần như cùng lúc, và lúc đó bản ghi đã biến
     * mất giữa hai câu lệnh. Đó là 404, không phải lỗi máy chủ.
     */
    const saved = await this.prisma.studyTask.findUnique({ where: { id } });
    if (!saved) throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy việc này');
    return toTaskResponse(saved, new Date(todayUtcMidnight(now)));
  }

  async deleteTask(userId: string, id: string): Promise<void> {
    const ctx = await this.locations.getContext(userId);
    const deleted = await this.prisma.studyTask.deleteMany({
      where: { id, coupleId: ctx.coupleId, userId },
    });
    if (deleted.count === 0) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy việc này');
    }
  }

  // ------------------------------------------------------------------
  // Nhật ký một dòng
  // ------------------------------------------------------------------

  /**
   * Chặng vừa xong mà chưa kịp ghi nhật ký.
   *
   * Chỉ lấy chặng nằm trong cửa sổ `NOTE_PROMPT_WINDOW_MS`. Không giới hạn thời
   * gian thì mở app sau một tuần sẽ bị hỏi về buổi học tuần trước — lúc ấy
   * chẳng ai còn nhớ mình đã làm được gì để mà ghi.
   */
  async pendingNote(coupleId: string, userId: string): Promise<StudyNoteResponse | null> {
    const since = new Date(Date.now() - NOTE_PROMPT_WINDOW_MS);
    const row = await this.prisma.studyLog.findFirst({
      where: { coupleId, userId, note: null, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toNoteResponse(row) : null;
  }

  /** Vài dòng nhật ký gần nhất của một người, mới → cũ. */
  async recentNotes(coupleId: string, userId: string): Promise<StudyNoteResponse[]> {
    const rows = await this.prisma.studyLog.findMany({
      where: { coupleId, userId, note: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_NOTES_LIMIT,
    });
    return rows.map(toNoteResponse);
  }

  /**
   * Ghi / sửa / gỡ nhật ký của một chặng.
   *
   * `logId` tới dưới dạng chuỗi vì khoá chính là `BigInt` — JSON không chở được
   * `BigInt`. Chuỗi không đổi được sang số nguyên thì coi như không tìm thấy,
   * đừng để `BigInt()` ném ra một lỗi 500 vô nghĩa.
   */
  async setNote(userId: string, logId: string, input: SetLogNoteInput): Promise<StudyNoteResponse> {
    const ctx = await this.locations.getContext(userId);

    let id: bigint;
    try {
      id = BigInt(logId);
    } catch {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy chặng học này');
    }

    const changed = await this.prisma.studyLog.updateMany({
      where: { id, coupleId: ctx.coupleId, userId },
      data: { note: input.note },
    });
    if (changed.count === 0) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy chặng học này');
    }

    const saved = await this.prisma.studyLog.findUnique({ where: { id } });
    if (!saved) throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy chặng học này');
    return toNoteResponse(saved);
  }
}

// ---------------------------------------------------------------------------

function toDDayResponse(
  row: { id: string; userId: string; title: string; date: Date },
  now: Date,
): StudyDDayResponse {
  const date = toYmdKey(row.date);
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    date,
    daysLeft: daysUntil(date, now) ?? 0,
  };
}

function toTaskResponse(
  row: { id: string; userId: string; title: string; day: Date; doneAt: Date | null },
  today: Date,
): StudyTaskResponse {
  const done = row.doneAt !== null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    day: toYmdKey(row.day),
    done,
    // Việc đã xong thì không còn là "nợ từ hôm qua" nữa, dù tạo từ bao giờ.
    carriedOver: !done && row.day.getTime() < today.getTime(),
  };
}

function toNoteResponse(row: {
  id: bigint;
  day: Date;
  round: number;
  minutes: number;
  subject: string | null;
  note: string | null;
}): StudyNoteResponse {
  return {
    logId: row.id.toString(),
    day: toYmdKey(row.day),
    round: row.round,
    minutes: row.minutes,
    subject: row.subject,
    note: row.note,
  };
}
