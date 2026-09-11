import { describe, expect, it } from 'vitest';
import {
  MAX_DDAY_TITLE_LEN,
  MAX_NOTE_LEN,
  MAX_TASK_TITLE_LEN,
  createDDaySchema,
  createTaskSchema,
  daysUntil,
  formatDDayBadge,
  formatDaysLeft,
  parseYmd,
  setLogNoteSchema,
  todayUtcMidnight,
  toYmdKey,
  updateTaskSchema,
} from './study-plan.schema';

/** Giữa trưa giờ VN ngày 11/09/2026 — xa hai đầu ngày để không lẫn múi giờ. */
const NOW = new Date('2026-09-11T05:00:00.000Z');

describe('parseYmd', () => {
  it('đọc được ngày hợp lệ', () => {
    expect(parseYmd('2026-09-11')).toBe(Date.UTC(2026, 8, 11));
  });

  it('từ chối ngày KHÔNG CÓ THẬT thay vì để nó trôi sang tháng sau', () => {
    // `Date.UTC(2026, 1, 31)` lặng lẽ cho ra 03/03. Không kiểm ngược thì
    // "31/02" lọt qua và mốc đếm ngược lệch hai ngày.
    expect(parseYmd('2026-02-31')).toBeNull();
    expect(parseYmd('2026-04-31')).toBeNull();
    expect(parseYmd('2026-13-01')).toBeNull();
    expect(parseYmd('2026-00-10')).toBeNull();
    expect(parseYmd('2026-09-00')).toBeNull();
  });

  it('29/02 hợp lệ ở năm nhuận, không hợp lệ ở năm thường', () => {
    expect(parseYmd('2028-02-29')).toBe(Date.UTC(2028, 1, 29));
    expect(parseYmd('2026-02-29')).toBeNull();
  });

  it('sai định dạng thì null, không ném lỗi', () => {
    expect(parseYmd('')).toBeNull();
    expect(parseYmd('11/09/2026')).toBeNull();
    expect(parseYmd('2026-9-1')).toBeNull();
    expect(parseYmd('hong')).toBeNull();
  });
});

describe('daysUntil', () => {
  it('hôm nay là 0, mai là 1, hôm qua là -1', () => {
    expect(daysUntil('2026-09-11', NOW)).toBe(0);
    expect(daysUntil('2026-09-12', NOW)).toBe(1);
    expect(daysUntil('2026-09-10', NOW)).toBe(-1);
  });

  it('đếm theo NGÀY LỊCH, không theo số giờ chia 24', () => {
    // 23h50 giờ VN ngày 11/09 (= 16:50 UTC). Tới 12/09 chỉ còn 10 phút đồng hồ
    // nhưng vẫn phải là "còn 1 ngày".
    const lateNight = new Date('2026-09-11T16:50:00.000Z');
    expect(daysUntil('2026-09-12', lateNight)).toBe(1);
  });

  it('00:30 giờ VN đã là ngày mới — đúng cái bẫy ADR 2026-09-07', () => {
    // 17:30 UTC ngày 11/09 = 00:30 ngày 12/09 giờ VN.
    const afterMidnight = new Date('2026-09-11T17:30:00.000Z');
    expect(daysUntil('2026-09-12', afterMidnight)).toBe(0);
  });

  it('bắc qua năm và qua 29/02 vẫn đúng', () => {
    expect(daysUntil('2027-01-01', new Date('2026-12-25T05:00:00.000Z'))).toBe(7);
    expect(daysUntil('2028-03-01', new Date('2028-02-28T05:00:00.000Z'))).toBe(2);
  });

  it('ngày hỏng cho null', () => {
    expect(daysUntil('2026-02-31', NOW)).toBeNull();
    expect(daysUntil('hong', NOW)).toBeNull();
  });
});

describe('formatDDayBadge', () => {
  it('đúng cách viết quen thuộc của bảng đếm ngược', () => {
    expect(formatDDayBadge(12)).toBe('D-12');
    expect(formatDDayBadge(0)).toBe('D-DAY');
    expect(formatDDayBadge(-3)).toBe('D+3');
  });

  it('số hỏng không làm vỡ nhãn', () => {
    expect(formatDDayBadge(Number.NaN)).toBe('D');
  });
});

describe('formatDaysLeft', () => {
  it('nói bằng tiếng Việt tự nhiên', () => {
    expect(formatDaysLeft(0)).toBe('Hôm nay');
    expect(formatDaysLeft(5)).toBe('Còn 5 ngày');
    expect(formatDaysLeft(-2)).toBe('Đã qua 2 ngày');
  });
});

describe('createDDaySchema', () => {
  it('nhận mốc hợp lệ và cắt khoảng trắng ở tên', () => {
    const r = createDDaySchema.safeParse({ title: '  Thi cuối kỳ  ', date: '2026-12-20' });
    expect(r.success && r.data.title).toBe('Thi cuối kỳ');
  });

  it('từ chối tên rỗng, tên quá dài và ngày không có thật', () => {
    expect(createDDaySchema.safeParse({ title: '   ', date: '2026-12-20' }).success).toBe(false);
    expect(
      createDDaySchema.safeParse({ title: 'x'.repeat(MAX_DDAY_TITLE_LEN + 1), date: '2026-12-20' })
        .success,
    ).toBe(false);
    expect(createDDaySchema.safeParse({ title: 'Thi', date: '2026-02-31' }).success).toBe(false);
    expect(createDDaySchema.safeParse({ title: 'Thi', date: '20/12/2026' }).success).toBe(false);
  });

  it('mốc trong QUÁ KHỨ vẫn hợp lệ', () => {
    // Người ta có quyền ghi lại một ngày đã qua; giao diện hiện "D+n".
    expect(createDDaySchema.safeParse({ title: 'Đã thi xong', date: '2020-01-01' }).success).toBe(
      true,
    );
  });
});

describe('createTaskSchema', () => {
  it('cắt khoảng trắng, từ chối rỗng và quá dài', () => {
    const r = createTaskSchema.safeParse({ title: '  Làm bài 3  ' });
    expect(r.success && r.data.title).toBe('Làm bài 3');
    expect(createTaskSchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x'.repeat(MAX_TASK_TITLE_LEN + 1) }).success).toBe(
      false,
    );
  });
});

describe('updateTaskSchema', () => {
  it('sửa riêng tên hoặc riêng trạng thái đều được', () => {
    expect(updateTaskSchema.safeParse({ done: true }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ title: 'Đổi tên' }).success).toBe(true);
  });

  it('thân RỖNG bị từ chối — đó là dấu hiệu phía gọi đang gọi nhầm', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });
});

describe('setLogNoteSchema', () => {
  it('ghi chú rỗng nghĩa là GỠ ghi chú, cho ra null', () => {
    const r = setLogNoteSchema.safeParse({ note: '   ' });
    expect(r.success && r.data.note).toBeNull();
  });

  it('cắt khoảng trắng hai đầu', () => {
    const r = setLogNoteSchema.safeParse({ note: '  xong 12 bài  ' });
    expect(r.success && r.data.note).toBe('xong 12 bài');
  });

  it('quá dài thì từ chối', () => {
    expect(setLogNoteSchema.safeParse({ note: 'x'.repeat(MAX_NOTE_LEN + 1) }).success).toBe(false);
  });
});

describe('toYmdKey / todayUtcMidnight', () => {
  it('đọc theo lịch GIỜ VIỆT NAM, không theo UTC', () => {
    // 17:30 UTC ngày 11/09 = 00:30 ngày 12/09 giờ VN.
    expect(toYmdKey(new Date('2026-09-11T17:30:00.000Z'))).toBe('2026-09-12');
    expect(toYmdKey(new Date('2026-09-11T05:00:00.000Z'))).toBe('2026-09-11');
  });

  it('cột DATE của Postgres về dạng UTC nửa đêm vẫn ra đúng ngày', () => {
    // Prisma trả cột `@db.Date` thành `Date` ở mốc UTC 00:00 — ở giờ VN đó là
    // 07:00 CÙNG ngày, nên khoá phải khớp chứ không lùi một ngày.
    expect(toYmdKey(new Date(Date.UTC(2026, 8, 11)))).toBe('2026-09-11');
  });

  it('mốc nửa đêm hôm nay khớp với khoá ngày hôm nay', () => {
    expect(toYmdKey(new Date(todayUtcMidnight(NOW)))).toBe('2026-09-11');
  });
});
