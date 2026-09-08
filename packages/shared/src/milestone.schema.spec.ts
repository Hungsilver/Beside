import { describe, expect, it } from 'vitest';
import {
  buildUpcomingMilestones,
  createMilestoneSchema,
  nextYearlyOccurrence,
  type MilestoneSource,
} from './milestone.schema';

/** Ngày trôi nổi: 00:00 UTC của ngày lịch đó. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** 08/09/2026 lúc 10:00 giờ VN (= 03:00 UTC). */
const NOW = new Date('2026-09-08T03:00:00.000Z');

function source(over: Partial<MilestoneSource> = {}): MilestoneSource {
  return {
    anniversaryAt: day('2023-02-14'),
    members: [],
    custom: [],
    ...over,
  };
}

describe('nextYearlyOccurrence', () => {
  const today = { year: 2026, month: 9, day: 8 };

  it('ngày trong năm nay còn ở phía trước', () => {
    expect(nextYearlyOccurrence({ year: 1998, month: 12, day: 25 }, today)).toEqual({
      year: 2026,
      month: 12,
      day: 25,
    });
  });

  it('ngày đã qua trong năm nay → sang năm sau', () => {
    expect(nextYearlyOccurrence({ year: 1998, month: 3, day: 1 }, today)).toEqual({
      year: 2027,
      month: 3,
      day: 1,
    });
  });

  it('ĐÚNG HÔM NAY vẫn tính là lần tới (0 ngày nữa), không nhảy sang năm sau', () => {
    expect(nextYearlyOccurrence({ year: 1998, month: 9, day: 8 }, today)).toEqual({
      year: 2026,
      month: 9,
      day: 8,
    });
  });

  it('NĂM NHUẬN: sinh 29/02, năm không nhuận thì kẹp về 28/02', () => {
    // Không kẹp thì Date sẽ trôi sang 01/03 — sinh nhật tự đổi ngày.
    expect(nextYearlyOccurrence({ year: 2000, month: 2, day: 29 }, today)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
  });

  it('NĂM NHUẬN: năm nhuận thì giữ nguyên 29/02', () => {
    expect(
      nextYearlyOccurrence({ year: 2000, month: 2, day: 29 }, { year: 2028, month: 1, day: 1 }),
    ).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('ngày 31 của tháng chỉ có 30 ngày bị kẹp', () => {
    expect(
      nextYearlyOccurrence({ year: 2000, month: 3, day: 31 }, { year: 2026, month: 4, day: 1 }),
    ).toEqual({ year: 2027, month: 3, day: 31 });
  });
});

describe('buildUpcomingMilestones — mốc ngày', () => {
  it('yêu từ 14/02/2023, tới 08/09/2026 là 1302 ngày → mốc kế tiếp là 1460', () => {
    const items = buildUpcomingMilestones(source(), NOW);
    const dayMark = items.find((i) => i.kind === 'AUTO_DAYS');
    expect(dayMark?.title).toBe('1.460 ngày bên nhau');
    expect(dayMark?.daysLeft).toBe(158);
  });

  it('mốc ngày rơi đúng ngày mà daysTogether === mốc', () => {
    // 14/02/2023 + 100 ngày = 25/05/2023
    const items = buildUpcomingMilestones(source(), new Date('2023-05-20T03:00:00.000Z'));
    const m = items.find((i) => i.title === '100 ngày bên nhau');
    expect(m?.date).toBe('2023-05-25T00:00:00.000Z');
    expect(m?.daysLeft).toBe(5);
  });

  it('ĐÚNG NGÀY mốc thì daysLeft = 0, vẫn còn trong danh sách', () => {
    const items = buildUpcomingMilestones(source(), new Date('2023-05-25T03:00:00.000Z'));
    const m = items.find((i) => i.title === '100 ngày bên nhau');
    expect(m?.daysLeft).toBe(0);
  });

  it('không hiện mốc đã qua', () => {
    const items = buildUpcomingMilestones(source(), new Date('2023-05-26T03:00:00.000Z'));
    expect(items.some((i) => i.title === '100 ngày bên nhau')).toBe(false);
  });

  it('chỉ nhìn trước 400 ngày', () => {
    const items = buildUpcomingMilestones(source(), NOW);
    expect(items.every((i) => i.daysLeft <= 400)).toBe(true);
  });

  it('vượt hết bảng dựng sẵn thì tiếp tục bằng bội số 500', () => {
    // 3000 là mốc cuối trong AUTO_MILESTONE_DAYS.
    const items = buildUpcomingMilestones(
      source({ anniversaryAt: day('2015-01-01') }),
      new Date('2024-01-01T03:00:00.000Z'),
    );
    const marks = items.filter((i) => i.kind === 'AUTO_DAYS').map((i) => i.title);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]).toMatch(/\d/);
  });
});

describe('buildUpcomingMilestones — kỷ niệm hằng năm', () => {
  it('kỷ niệm 4 năm rơi vào 14/02/2027', () => {
    const items = buildUpcomingMilestones(source(), NOW);
    const a = items.find((i) => i.kind === 'ANNIVERSARY');
    expect(a?.title).toBe('Kỷ niệm 4 năm');
    expect(a?.date).toBe('2027-02-14T00:00:00.000Z');
  });

  it('KHÔNG gọi ngày bắt đầu là "kỷ niệm 0 năm"', () => {
    // Ngay hôm bắt đầu yêu.
    const items = buildUpcomingMilestones(
      source({ anniversaryAt: day('2026-09-08') }),
      NOW,
    );
    expect(items.some((i) => i.kind === 'ANNIVERSARY')).toBe(false);
  });
});

describe('buildUpcomingMilestones — sinh nhật', () => {
  const withBirthdays = source({
    members: [
      { displayName: 'An', birthday: day('1998-05-12') },
      { displayName: 'Bình', birthday: day('1999-09-20') },
    ],
  });

  it('sinh nhật gần hơn đứng trước', () => {
    const items = buildUpcomingMilestones(withBirthdays, NOW);
    const birthdays = items.filter((i) => i.kind === 'BIRTHDAY');
    expect(birthdays[0]?.title).toBe('Sinh nhật Bình'); // 20/09 gần hơn 12/05
    expect(birthdays[0]?.daysLeft).toBe(12);
  });

  it('tính đúng số tuổi sẽ tròn', () => {
    const items = buildUpcomingMilestones(withBirthdays, NOW);
    expect(items.find((i) => i.title === 'Sinh nhật Bình')?.subtitle).toBe('Tròn 27 tuổi');
  });

  it('người chưa nhập ngày sinh thì bỏ qua, không lỗi', () => {
    const items = buildUpcomingMilestones(
      source({ members: [{ displayName: 'An', birthday: null }] }),
      NOW,
    );
    expect(items.some((i) => i.kind === 'BIRTHDAY')).toBe(false);
  });
});

describe('buildUpcomingMilestones — mốc tự thêm', () => {
  it('mốc hằng năm luôn có lần tới', () => {
    const items = buildUpcomingMilestones(
      source({
        custom: [
          { id: 'm1', title: 'Lần đầu đi Đà Lạt', emoji: '✈️', date: day('2024-03-02'), yearly: true },
        ],
      }),
      NOW,
    );
    const m = items.find((i) => i.id === 'm1');
    expect(m?.date).toBe('2027-03-02T00:00:00.000Z');
    expect(m?.subtitle).toBe('Tròn 3 năm');
  });

  it('mốc MỘT LẦN đã qua thì biến mất khỏi danh sách', () => {
    const items = buildUpcomingMilestones(
      source({
        custom: [
          { id: 'm2', title: 'Đám cưới bạn', emoji: '🎉', date: day('2026-01-01'), yearly: false },
        ],
      }),
      NOW,
    );
    expect(items.some((i) => i.id === 'm2')).toBe(false);
  });

  it('mốc một lần còn ở phía trước thì vẫn hiện', () => {
    const items = buildUpcomingMilestones(
      source({
        custom: [
          { id: 'm3', title: 'Đám cưới bạn', emoji: '🎉', date: day('2026-10-01'), yearly: false },
        ],
      }),
      NOW,
    );
    expect(items.find((i) => i.id === 'm3')?.daysLeft).toBe(23);
  });

  it('mốc tự thêm có id để sửa/xoá, mốc tự sinh thì không', () => {
    const items = buildUpcomingMilestones(
      source({
        custom: [
          { id: 'm4', title: 'Ngày cưới', emoji: '💍', date: day('2025-11-11'), yearly: true },
        ],
      }),
      NOW,
    );
    expect(items.find((i) => i.id === 'm4')).toBeDefined();
    expect(items.filter((i) => i.kind === 'AUTO_DAYS').every((i) => i.id === null)).toBe(true);
  });
});

describe('buildUpcomingMilestones — thứ tự', () => {
  it('sắp xếp theo ngày gần nhất trước', () => {
    const items = buildUpcomingMilestones(
      source({
        members: [{ displayName: 'Bình', birthday: day('1999-09-20') }],
        custom: [
          { id: 'x', title: 'Xa', emoji: '⭐', date: day('2024-12-25'), yearly: true },
        ],
      }),
      NOW,
    );
    const left = items.map((i) => i.daysLeft);
    expect(left).toEqual([...left].sort((a, b) => a - b));
  });
});

describe('createMilestoneSchema', () => {
  const base = { title: 'Ngày cưới', date: '2025-11-11' };

  it('happy path, mặc định lặp hằng năm', () => {
    const r = createMilestoneSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.yearly).toBe(true);
      expect(r.data.emoji).toBe('💖');
    }
  });

  it('cắt khoảng trắng thừa', () => {
    const r = createMilestoneSchema.safeParse({ ...base, title: '  Ngày cưới  ' });
    expect(r.success && r.data.title).toBe('Ngày cưới');
  });

  it('tên rỗng bị từ chối', () => {
    expect(createMilestoneSchema.safeParse({ ...base, title: ' ' }).success).toBe(false);
  });

  it('ngày sai định dạng bị từ chối', () => {
    expect(createMilestoneSchema.safeParse({ ...base, date: '11/11/2025' }).success).toBe(false);
  });
});
