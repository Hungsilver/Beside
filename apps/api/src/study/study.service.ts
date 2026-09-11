import { Injectable, Logger } from '@nestjs/common';
import { Prisma, StudyPhase, StudyStatus, type StudySession } from '@prisma/client';
import {
  DISPLAY_TIMEZONE,
  ERROR_CODES,
  MAX_DAILY_GOAL_MIN,
  STATS_DAYS,
  nextPhase,
  normalizeSubject,
  phaseDurationMs,
  recentDayKeys,
  studyStreak,
  ymdInTimeZone,
  ymdToUtcMidnight,
  type SetStudyGoalInput,
  type StartStudyInput,
  type StudyDayBucket,
  type StudySessionResponse,
  type StudySubjectBucket,
  type StudySummaryResponse,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';
import { PushService } from '../push/push.service';

type SessionWithCouple = StudySession & {
  couple: { members: { id: string; displayName: string }[] };
};

const COUPLE_INCLUDE = {
  couple: { select: { members: { select: { id: true, displayName: true } } } },
} as const;

/**
 * Phòng học chung (F12).
 *
 * Mỗi couple chỉ có **một** phiên đang chạy — hai phiên song song giữa đúng hai
 * người là vô nghĩa, mà lại đẻ ra câu hỏi "phiên nào là phiên đang học" ở mọi
 * màn hình. Cùng lý do đã áp cho ván chơi.
 */
@Injectable()
export class StudyService {
  private readonly logger = new Logger(StudyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly push: PushService,
  ) {}

  // ------------------------------------------------------------------

  async start(userId: string, input: StartStudyInput): Promise<StudySessionResponse> {
    const ctx = await this.locations.getContext(userId);

    const running = await this.findRunning(ctx.coupleId);
    if (running) {
      // Đã có người mở phòng thì vào cùng luôn, đừng báo lỗi: bấm "bắt đầu"
      // đúng lúc người kia vừa bấm là chuyện rất dễ xảy ra.
      return this.join(userId, running.id);
    }

    const now = Date.now();
    // Đi qua `normalizeSubject` một lần nữa dù Zod đã làm: service còn được gọi
    // từ chỗ khác ngoài controller, và "không đặt tên" phải luôn là `null`.
    const subject = normalizeSubject(input.subject);

    const session = await this.prisma.studySession.create({
      data: {
        coupleId: ctx.coupleId,
        startedById: userId,
        phase: StudyPhase.FOCUS,
        focusMin: input.focusMin,
        breakMin: input.breakMin,
        subject,
        endsAt: new Date(now + input.focusMin * 60_000),
        presentUserIds: [userId] as unknown as Prisma.InputJsonValue,
      },
      include: COUPLE_INCLUDE,
    });

    void this.push.sendToPartner(userId, {
      kind: 'STUDY_INVITE',
      title: subject
        ? `${ctx.displayName} đang học ${subject}`
        : `${ctx.displayName} vừa mở phòng học`,
      body: `Phiên ${input.focusMin} phút vừa bắt đầu — vào học cùng nhé`,
      url: '/hoc-cung-nhau',
      tag: `study:${session.id}`,
      at: Date.now(),
    });

    return this.toResponse(session);
  }

  async join(userId: string, sessionId: string): Promise<StudySessionResponse> {
    const session = await this.load(userId, sessionId);
    if (session.status !== StudyStatus.RUNNING) {
      throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, 'Phiên học này đã kết thúc');
    }

    const present = new Set(parsePresent(session.presentUserIds));
    if (present.has(userId)) return this.toResponse(session);

    present.add(userId);
    const saved = await this.prisma.studySession.update({
      where: { id: sessionId },
      data: { presentUserIds: [...present] as unknown as Prisma.InputJsonValue },
      include: COUPLE_INCLUDE,
    });
    return this.toResponse(saved);
  }

  async leave(userId: string, sessionId: string): Promise<StudySessionResponse | null> {
    const session = await this.load(userId, sessionId);
    if (session.status !== StudyStatus.RUNNING) return this.toResponse(session);

    const present = parsePresent(session.presentUserIds).filter((id) => id !== userId);

    /*
     * Người cuối cùng rời phòng thì phiên đóng lại.
     *
     * Để phiên chạy tiếp trong một căn phòng trống nghĩa là mấy chục phút sau
     * cả hai nhận thông báo "hết giờ học" cho buổi học không ai ngồi.
     */
    if (present.length === 0) return this.cancel(userId, sessionId);

    const saved = await this.prisma.studySession.update({
      where: { id: sessionId },
      data: { presentUserIds: present as unknown as Prisma.InputJsonValue },
      include: COUPLE_INCLUDE,
    });
    return this.toResponse(saved);
  }

  /**
   * Dừng hẳn phiên.
   *
   * Ai trong hai người cũng dừng được, khác với sự kiện trên lịch (chỉ người
   * tạo mới sửa). Phòng học là hoạt động chung chứ không phải đồ của riêng ai,
   * và người còn lại trong phòng cần thoát được mà không phải chờ người kia.
   */
  async cancel(userId: string, sessionId: string): Promise<StudySessionResponse> {
    const session = await this.load(userId, sessionId);
    if (session.status !== StudyStatus.RUNNING) return this.toResponse(session);

    const saved = await this.prisma.studySession.update({
      where: { id: sessionId },
      data: {
        status: StudyStatus.CANCELLED,
        finishedAt: new Date(),
        presentUserIds: [] as unknown as Prisma.InputJsonValue,
      },
      include: COUPLE_INCLUDE,
    });
    return this.toResponse(saved);
  }

  // ------------------------------------------------------------------

  async summary(userId: string): Promise<StudySummaryResponse> {
    const ctx = await this.locations.getContext(userId);

    const [running, logs, members] = await Promise.all([
      this.findRunning(ctx.coupleId),
      this.prisma.studyLog.findMany({
        where: { coupleId: ctx.coupleId },
        select: {
          userId: true,
          minutes: true,
          day: true,
          sessionId: true,
          round: true,
          subject: true,
        },
      }),
      this.prisma.user.findMany({
        where: { coupleId: ctx.coupleId },
        select: { id: true, displayName: true, studyGoalMin: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const windowKeys = recentDayKeys(STATS_DAYS);
    const todayKey = windowKeys[windowKeys.length - 1] ?? ymdKey(new Date());

    const people = members.map((m) => {
      const mine = logs.filter((l) => l.userId === m.id);
      const inWindow = mine.filter((l) => windowKeys.includes(ymdKey(l.day)));
      return {
        userId: m.id,
        displayName: m.displayName,
        totalMinutes: mine.reduce((sum, l) => sum + l.minutes, 0),
        todayMinutes: mine
          .filter((l) => ymdKey(l.day) === todayKey)
          .reduce((sum, l) => sum + l.minutes, 0),
        streakDays: studyStreak(mine.map((l) => ymdKey(l.day))),
        goalMin: m.studyGoalMin,
        days: bucketByDay(inWindow, windowKeys),
        subjects: bucketBySubject(inWindow),
      };
    });

    /*
     * "Học cùng nhau" đếm những chặng CẢ HAI cùng ngồi.
     *
     * Nhóm theo cặp `(sessionId, round)` — khoá tự nhiên của một chặng. Nhóm
     * theo ngày và số phút thì hai chặng 25 phút trong cùng một buổi sẽ bị gộp
     * làm một, và con số đếm ra sẽ thấp hơn sự thật.
     */
    const roundUsers = new Map<string, Set<string>>();
    const roundMinutes = new Map<string, number>();
    for (const l of logs) {
      if (!l.sessionId) continue;
      const key = `${l.sessionId}#${l.round}`;
      roundUsers.set(key, (roundUsers.get(key) ?? new Set()).add(l.userId));
      roundMinutes.set(key, l.minutes);
    }
    let togetherMinutes = 0;
    for (const [key, users] of roundUsers) {
      if (users.size >= 2) togetherMinutes += roundMinutes.get(key) ?? 0;
    }

    return {
      current: running ? this.toResponse(running) : null,
      people,
      togetherMinutes,
      statsFrom: windowKeys[0] ?? todayKey,
    };
  }

  /**
   * Đặt mục tiêu phút mỗi ngày cho CHÍNH MÌNH.
   *
   * Không nhận `userId` mục tiêu từ client (R3): mục tiêu của người kia là
   * chuyện của người kia, thấy được nhưng không sửa được.
   */
  async setGoal(userId: string, input: SetStudyGoalInput): Promise<number> {
    const minutes = Math.min(MAX_DAILY_GOAL_MIN, Math.max(0, Math.round(input.dailyGoalMin)));
    const saved = await this.prisma.user.update({
      where: { id: userId },
      data: { studyGoalMin: minutes },
      select: { studyGoalMin: true },
    });
    return saved.studyGoalMin;
  }

  /** Couple của một người — gateway cần nó để biết phát vào phòng nào. */
  async coupleIdOf(userId: string): Promise<string> {
    const ctx = await this.locations.getContext(userId);
    return ctx.coupleId;
  }

  async current(userId: string): Promise<StudySessionResponse | null> {
    const ctx = await this.locations.getContext(userId);
    const running = await this.findRunning(ctx.coupleId);
    return running ? this.toResponse(running) : null;
  }

  // ------------------------------------------------------------------
  // Đồng hồ — gọi từ cron
  // ------------------------------------------------------------------

  /** Các phiên đang chạy đã quá mốc `endsAt`. */
  async findExpired(): Promise<string[]> {
    const rows = await this.prisma.studySession.findMany({
      where: { status: StudyStatus.RUNNING, endsAt: { lte: new Date() } },
      select: { id: true },
      take: 20,
    });
    return rows.map((r) => r.id);
  }

  /**
   * Chặng vừa hết giờ → ghi công (nếu là chặng học) rồi sang chặng kế.
   *
   * Đồng hồ này **không dừng** khi người dùng khoá màn hình, khác hẳn đồng hồ
   * ván bài. Nên chặng kết thúc lúc app đang đóng là chuyện bình thường, và
   * thông báo đẩy là đường báo tin duy nhất còn hoạt động lúc đó.
   */
  async advance(sessionId: string): Promise<SessionWithCouple | null> {
    const session = await this.prisma.studySession.findUnique({
      where: { id: sessionId },
      include: COUPLE_INCLUDE,
    });
    if (!session || session.status !== StudyStatus.RUNNING) return null;
    if (session.endsAt.getTime() > Date.now()) return null;

    const present = parsePresent(session.presentUserIds);
    const wasFocus = session.phase === StudyPhase.FOCUS;

    // Chỉ ghi công cho chặng HỌC chạy hết giờ. Bỏ dở giữa chừng thì không tính
    // — để con số thống kê nói đúng sự thật.
    if (wasFocus && present.length > 0) {
      await this.prisma.studyLog.createMany({
        data: present.map((uid) => ({
          coupleId: session.coupleId,
          userId: uid,
          sessionId: session.id,
          round: session.roundsDone + 1,
          minutes: session.focusMin,
          subject: session.subject,
          day: new Date(ymdToUtcMidnight(ymdInTimeZone(session.endsAt))),
        })),
      });
    }

    const next = nextPhase(session.phase, session.roundsDone);
    const now = Date.now();

    const saved = await this.prisma.studySession.update({
      where: { id: sessionId },
      data: next.finished
        ? {
            status: StudyStatus.DONE,
            roundsDone: next.roundsDone,
            finishedAt: new Date(),
            presentUserIds: [] as unknown as Prisma.InputJsonValue,
          }
        : {
            phase: next.phase,
            roundsDone: next.roundsDone,
            endsAt: new Date(
              now + phaseDurationMs(next.phase, session.focusMin, session.breakMin),
            ),
          },
      include: COUPLE_INCLUDE,
    });

    const body = next.finished
      ? 'Phiên học đã xong. Nghỉ ngơi thôi!'
      : next.phase === 'BREAK'
        ? `Hết ${session.focusMin} phút học — nghỉ ${session.breakMin} phút nhé`
        : `Hết giờ nghỉ — quay lại học ${session.focusMin} phút tiếp nào`;

    for (const uid of present) {
      void this.push.sendToUser(uid, {
        kind: 'STUDY_PHASE',
        title: next.finished ? 'Xong buổi học rồi 🎉' : wasFocus ? 'Giải lao thôi ☕' : 'Vào học tiếp 📚',
        body,
        url: '/hoc-cung-nhau',
        // Gộp theo PHIÊN: nhiều chặng liên tiếp thì trong khay chỉ còn thông
        // báo mới nhất, không phải một chồng.
        tag: `study:${session.id}`,
        at: Date.now(),
      });
    }

    this.logger.log(
      `Phiên ${sessionId}: ${session.phase} → ${next.finished ? 'DONE' : next.phase}`,
    );
    return saved;
  }

  // ------------------------------------------------------------------

  private async findRunning(coupleId: string): Promise<SessionWithCouple | null> {
    return this.prisma.studySession.findFirst({
      where: { coupleId, status: StudyStatus.RUNNING },
      orderBy: { startedAt: 'desc' },
      include: COUPLE_INCLUDE,
    });
  }

  /**
   * Nạp phiên và chốt quyền truy cập.
   *
   * "Phiên không tồn tại" và "phiên của cặp đôi khác" trả về CÙNG một 404 —
   * giống mọi module khác, không để ai dò được id nào có thật.
   */
  private async load(userId: string, sessionId: string): Promise<SessionWithCouple> {
    const ctx = await this.locations.getContext(userId);
    const session = await this.prisma.studySession.findUnique({
      where: { id: sessionId },
      include: COUPLE_INCLUDE,
    });
    if (!session || session.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiên học này');
    }
    return session;
  }

  toResponse(session: SessionWithCouple): StudySessionResponse {
    return {
      id: session.id,
      status: session.status,
      phase: session.phase,
      focusMin: session.focusMin,
      breakMin: session.breakMin,
      subject: session.subject,
      endsAt: session.endsAt.getTime(),
      roundsDone: session.roundsDone,
      startedById: session.startedById,
      presentUserIds: parsePresent(session.presentUserIds),
      startedAt: session.startedAt.toISOString(),
    };
  }
}

function parsePresent(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

type MinuteRow = { minutes: number; day: Date; subject: string | null };

/**
 * Gom số phút theo ngày, trả về ĐÚNG một phần tử cho mỗi ngày trong `dayKeys`.
 *
 * Ngày không học vẫn phải có mặt với `0`: thiếu nó thì biểu đồ tuần co lại còn
 * mấy cột và hai người nhìn vào tưởng mình học đều hơn thực tế.
 */
function bucketByDay(rows: MinuteRow[], dayKeys: string[]): StudyDayBucket[] {
  const sums = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  for (const r of rows) {
    const key = ymdKey(r.day);
    const current = sums.get(key);
    if (current !== undefined) sums.set(key, current + r.minutes);
  }
  return dayKeys.map((day) => ({ day, minutes: sums.get(day) ?? 0 }));
}

/**
 * Gom số phút theo môn, nhiều phút xếp trước.
 *
 * Buổi không đặt tên gom hết vào một nhóm `null` và LUÔN xếp cuối — nó không
 * phải một môn, để nó chen lên đầu chỉ làm nhiễu bảng.
 */
function bucketBySubject(rows: MinuteRow[]): StudySubjectBucket[] {
  const named = new Map<string, number>();
  let unnamed = 0;
  for (const r of rows) {
    const subject = normalizeSubject(r.subject);
    if (subject === null) unnamed += r.minutes;
    else named.set(subject, (named.get(subject) ?? 0) + r.minutes);
  }

  const out: StudySubjectBucket[] = [...named.entries()]
    .map(([subject, minutes]) => ({ subject, minutes }))
    .sort((a, b) => b.minutes - a.minutes || a.subject.localeCompare(b.subject, 'vi'));

  if (unnamed > 0) out.push({ subject: null, minutes: unnamed });
  return out;
}

/** `YYYY-MM-DD` theo ngày lịch giờ Việt Nam. */
function ymdKey(date: Date): string {
  const { year, month, day } = ymdInTimeZone(date, DISPLAY_TIMEZONE);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
