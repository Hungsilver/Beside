import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BREAK_MIN,
  DEFAULT_FOCUS_MIN,
  MAX_ROUNDS,
  nextPhase,
  phaseDurationMs,
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
