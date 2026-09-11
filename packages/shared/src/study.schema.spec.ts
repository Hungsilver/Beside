import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BREAK_MIN,
  DEFAULT_FOCUS_MIN,
  MAX_DAILY_GOAL_MIN,
  MAX_ROUNDS,
  MAX_SUBJECT_LEN,
  STATS_DAYS,
  nextPhase,
  normalizeSubject,
  phaseDurationMs,
  recentDayKeys,
  setStudyGoalSchema,
  startStudySchema,
  studyStreak,
} from './study.schema';

/** Giữa trưa giờ VN ngày 09/09/2026 — xa hai đầu ngày để không lẫn múi giờ. */
const NOW = new Date('2026-09-09T05:00:00.000Z');

describe('startStudySchema', () => {
  it('không truyền gì thì lấy mặc định 25/5', () => {
    const r = startStudySchema.safeParse({});
    expect(r.success && r.data.focusMin).toBe(DEFAULT_FOCUS_MIN);
    expect(r.success && r.data.breakMin).toBe(DEFAULT_BREAK_MIN);
  });

  it('nhận các mức cho sẵn', () => {
    expect(startStudySchema.safeParse({ focusMin: 50, breakMin: 10 }).success).toBe(true);
  });

  it('mức tự chế bị từ chối', () => {
    expect(startStudySchema.safeParse({ focusMin: 37 }).success).toBe(false);
    expect(startStudySchema.safeParse({ breakMin: 90 }).success).toBe(false);
  });

  it('số âm và số thập phân bị từ chối', () => {
    expect(startStudySchema.safeParse({ focusMin: -25 }).success).toBe(false);
    expect(startStudySchema.safeParse({ focusMin: 25.5 }).success).toBe(false);
  });
});

describe('nextPhase', () => {
  it('học xong thì nghỉ, và đếm thêm một chặng', () => {
    expect(nextPhase('FOCUS', 0)).toEqual({ phase: 'BREAK', roundsDone: 1, finished: false });
  });

  it('nghỉ xong thì học tiếp, KHÔNG đếm thêm chặng', () => {
    expect(nextPhase('BREAK', 1)).toEqual({ phase: 'FOCUS', roundsDone: 1, finished: false });
  });

  it('chạm trần số chặng thì phiên kết thúc', () => {
    const r = nextPhase('FOCUS', MAX_ROUNDS - 1);
    expect(r.roundsDone).toBe(MAX_ROUNDS);
    expect(r.finished).toBe(true);
  });
});

describe('phaseDurationMs', () => {
  it('trả về đúng độ dài theo từng chặng', () => {
    expect(phaseDurationMs('FOCUS', 25, 5)).toBe(25 * 60_000);
    expect(phaseDurationMs('BREAK', 25, 5)).toBe(5 * 60_000);
  });
});

describe('studyStreak', () => {
  it('chưa học ngày nào thì chuỗi bằng 0', () => {
    expect(studyStreak([], NOW)).toBe(0);
  });

  it('học đúng hôm nay thì chuỗi bằng 1', () => {
    expect(studyStreak(['2026-09-09'], NOW)).toBe(1);
  });

  it('ba ngày liên tiếp tính tới hôm nay', () => {
    expect(studyStreak(['2026-09-07', '2026-09-08', '2026-09-09'], NOW)).toBe(3);
  });

  it('thứ tự đầu vào lộn xộn không ảnh hưởng', () => {
    expect(studyStreak(['2026-09-09', '2026-09-07', '2026-09-08'], NOW)).toBe(3);
  });

  it('ngày trùng lặp chỉ tính một lần', () => {
    expect(studyStreak(['2026-09-08', '2026-09-08', '2026-09-09'], NOW)).toBe(2);
  });

  it('HÔM NAY chưa học nhưng hôm qua có thì chuỗi vẫn còn', () => {
    // Ngày mới vừa bắt đầu — cắt chuỗi ngay lúc 0h là phạt người ta vì chưa
    // kịp làm gì. Chuỗi chỉ đứt khi bỏ trọn một ngày.
    expect(studyStreak(['2026-09-07', '2026-09-08'], NOW)).toBe(2);
  });

  it('bỏ trọn một ngày thì chuỗi đứt', () => {
    expect(studyStreak(['2026-09-05', '2026-09-06'], NOW)).toBe(0);
  });

  it('chỉ đếm đoạn liên tiếp gần nhất, không cộng dồn các đoạn cũ', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-08', '2026-09-09'];
    expect(studyStreak(days, NOW)).toBe(2);
  });

  it('chuỗi vắt qua đầu tháng vẫn đúng', () => {
    const now = new Date('2026-10-02T05:00:00.000Z');
    expect(studyStreak(['2026-09-30', '2026-10-01', '2026-10-02'], now)).toBe(3);
  });

  it('chuỗi vắt qua ngày 29/02 năm nhuận vẫn đúng', () => {
    const now = new Date('2028-03-01T05:00:00.000Z');
    expect(studyStreak(['2028-02-28', '2028-02-29', '2028-03-01'], now)).toBe(3);
  });

  it('học lúc 0h30 giờ VN tính là NGÀY HÔM NAY, không phải hôm qua', () => {
    /*
     * 0h30 ngày 09/09 giờ VN = 17h30 ngày 08/09 UTC. Nếu hàm lỡ so bằng
     * timestamp UTC thì hôm nay sẽ bị coi là 08/09 và chuỗi tính sai —
     * đúng cái bẫy ADR 2026-09-07 đã ghi.
     */
    const nuaDem = new Date('2026-09-08T17:30:00.000Z');
    expect(studyStreak(['2026-09-09'], nuaDem)).toBe(1);
  });

  it('ngày ở TƯƠNG LAI không kéo dài chuỗi', () => {
    expect(studyStreak(['2026-09-20'], NOW)).toBe(0);
  });

  it('chuỗi ngày hỏng định dạng thì bỏ qua, không làm sập', () => {
    expect(studyStreak(['khong-phai-ngay'], NOW)).toBe(0);
    expect(studyStreak(['2026-09-09', 'hong'], NOW)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Đợt 1: môn học · mục tiêu ngày · khoảng ngày cho biểu đồ
// ---------------------------------------------------------------------------

describe('normalizeSubject', () => {
  it('cắt khoảng trắng thừa và gộp khoảng trắng giữa chừng', () => {
    expect(normalizeSubject('  Toán   cao  cấp ')).toBe('Toán cao cấp');
  });

  it('chuỗi rỗng / toàn khoảng trắng / null / undefined đều cho null', () => {
    // "Không đặt tên" phải có ĐÚNG MỘT cách biểu diễn, nếu không thống kê sẽ
    // đẻ ra một nhóm rỗng nằm cạnh nhóm null.
    expect(normalizeSubject('')).toBeNull();
    expect(normalizeSubject('   ')).toBeNull();
    expect(normalizeSubject(null)).toBeNull();
    expect(normalizeSubject(undefined)).toBeNull();
  });

  it('cắt bớt khi dài quá trần', () => {
    const long = 'x'.repeat(MAX_SUBJECT_LEN + 30);
    expect(normalizeSubject(long)).toHaveLength(MAX_SUBJECT_LEN);
  });
});

describe('startStudySchema — môn học', () => {
  it('bỏ trống môn thì ra null, không phải chuỗi rỗng', () => {
    const r = startStudySchema.safeParse({ subject: '   ' });
    expect(r.success && r.data.subject).toBeNull();
  });

  it('không truyền môn cũng hợp lệ', () => {
    const r = startStudySchema.safeParse({});
    expect(r.success && r.data.subject).toBeNull();
  });

  it('môn dài quá trần bị từ chối', () => {
    expect(startStudySchema.safeParse({ subject: 'x'.repeat(MAX_SUBJECT_LEN + 1) }).success).toBe(
      false,
    );
  });
});

describe('setStudyGoalSchema', () => {
  it('0 là hợp lệ — nghĩa là tắt mục tiêu', () => {
    expect(setStudyGoalSchema.safeParse({ dailyGoalMin: 0 }).success).toBe(true);
  });

  it('từ chối số âm, số lẻ và số vượt trần', () => {
    expect(setStudyGoalSchema.safeParse({ dailyGoalMin: -30 }).success).toBe(false);
    expect(setStudyGoalSchema.safeParse({ dailyGoalMin: 30.5 }).success).toBe(false);
    expect(setStudyGoalSchema.safeParse({ dailyGoalMin: MAX_DAILY_GOAL_MIN + 1 }).success).toBe(
      false,
    );
  });
});

describe('recentDayKeys', () => {
  it('trả đúng số ngày, cũ → mới, ngày cuối là hôm nay', () => {
    const keys = recentDayKeys(STATS_DAYS, NOW);
    expect(keys).toHaveLength(STATS_DAYS);
    expect(keys[keys.length - 1]).toBe('2026-09-09');
    expect(keys[0]).toBe('2026-09-03');
  });

  it('0 ngày cho mảng rỗng, số âm cũng vậy', () => {
    expect(recentDayKeys(0, NOW)).toEqual([]);
    expect(recentDayKeys(-5, NOW)).toEqual([]);
  });

  it('lúc 00:30 giờ VN vẫn đếm "hôm nay" là ngày mới, không trùng khoá', () => {
    // 17:30 UTC = 00:30 hôm sau ở VN. Đây đúng cái bẫy ADR 2026-09-07.
    const keys = recentDayKeys(3, new Date('2026-09-08T17:30:00.000Z'));
    expect(keys).toEqual(['2026-09-07', '2026-09-08', '2026-09-09']);
    expect(new Set(keys).size).toBe(3);
  });

  it('bắc qua đầu tháng vẫn lùi đúng ngày', () => {
    expect(recentDayKeys(3, new Date('2026-03-02T05:00:00.000Z'))).toEqual([
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('năm nhuận: 29/02 không bị nhảy qua', () => {
    expect(recentDayKeys(3, new Date('2028-03-01T05:00:00.000Z'))).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});
