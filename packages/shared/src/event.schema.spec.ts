import { describe, expect, it } from 'vitest';
import {
  createEventSchema,
  eventRangeSchema,
  eventsOverlap,
  floatingDateToMs,
  msToFloatingDate,
  normalizeEventTimes,
} from './event.schema';

/** Lấy thông báo lỗi của một trường, để test đọc dễ hơn. */
function errorOn(result: ReturnType<typeof createEventSchema.safeParse>, field: string) {
  if (result.success) return null;
  return result.error.issues.find((i) => i.path[0] === field)?.message ?? null;
}

describe('ngày trôi nổi', () => {
  it('đi và về không mất mát', () => {
    expect(msToFloatingDate(floatingDateToMs('2026-09-08'))).toBe('2026-09-08');
    expect(msToFloatingDate(floatingDateToMs('2024-02-29'))).toBe('2024-02-29');
  });

  it('KHÔNG bị lệch ngày dù đọc lúc nào trong ngày', () => {
    // Đây là lý do tồn tại của ngày trôi nổi: 00:00 UTC đọc theo UTC luôn ra
    // đúng ngày đó, không phụ thuộc múi giờ của máy đang chạy.
    const ms = floatingDateToMs('2026-09-08');
    expect(new Date(ms).toISOString()).toBe('2026-09-08T00:00:00.000Z');
  });

  it('từ chối ngày không có thật', () => {
    expect(Number.isNaN(floatingDateToMs('2026-02-31'))).toBe(true);
    expect(Number.isNaN(floatingDateToMs('2025-02-29'))).toBe(true); // 2025 không nhuận
    expect(Number.isNaN(floatingDateToMs('2026-13-01'))).toBe(true);
    expect(Number.isNaN(floatingDateToMs('không phải ngày'))).toBe(true);
  });

  it('chấp nhận 29/02 của năm nhuận', () => {
    expect(Number.isNaN(floatingDateToMs('2024-02-29'))).toBe(false);
  });
});

describe('createEventSchema — sự kiện có giờ', () => {
  const base = { title: 'Ăn tối', startAt: '2026-09-08T12:00:00.000Z' };

  it('happy path', () => {
    const r = createEventSchema.safeParse({
      ...base,
      endAt: '2026-09-08T14:00:00.000Z',
      remindMinBefore: 60,
    });
    expect(r.success).toBe(true);
  });

  it('cắt khoảng trắng thừa ở tên', () => {
    const r = createEventSchema.safeParse({ ...base, title: '   Ăn tối   ' });
    expect(r.success && r.data.title).toBe('Ăn tối');
  });

  it('thiếu giờ bắt đầu', () => {
    const r = createEventSchema.safeParse({ title: 'Ăn tối' });
    expect(errorOn(r, 'startAt')).toBe('Sự kiện cần giờ bắt đầu');
  });

  it('giờ kết thúc TRƯỚC giờ bắt đầu', () => {
    const r = createEventSchema.safeParse({
      ...base,
      endAt: '2026-09-08T10:00:00.000Z',
    });
    expect(errorOn(r, 'endAt')).toBe('Giờ kết thúc phải sau giờ bắt đầu');
  });

  it('giờ kết thúc TRÙNG giờ bắt đầu cũng bị từ chối', () => {
    const r = createEventSchema.safeParse({ ...base, endAt: base.startAt });
    expect(errorOn(r, 'endAt')).toBe('Giờ kết thúc phải sau giờ bắt đầu');
  });

  it('sự kiện dài hơn 30 ngày — thường là gõ nhầm năm', () => {
    const r = createEventSchema.safeParse({
      ...base,
      endAt: '2027-09-08T12:00:00.000Z',
    });
    expect(errorOn(r, 'endAt')).toContain('30 ngày');
  });

  it('sự kiện trong QUÁ KHỨ vẫn hợp lệ — người ta hay ghi lại việc đã xảy ra', () => {
    const r = createEventSchema.safeParse({
      title: 'Đi Đà Lạt',
      startAt: '2020-01-01T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('tên rỗng', () => {
    const r = createEventSchema.safeParse({ ...base, title: '   ' });
    expect(errorOn(r, 'title')).toBe('Sự kiện cần có tên');
  });

  it('chuỗi thời gian vô nghĩa bị chặn ở schema, không lọt xuống Date.parse', () => {
    const r = createEventSchema.safeParse({ title: 'X', startAt: 'hôm nào đó' });
    expect(r.success).toBe(false);
  });
});

describe('createEventSchema — sự kiện cả ngày', () => {
  it('happy path', () => {
    const r = createEventSchema.safeParse({
      title: 'Sinh nhật',
      allDay: true,
      startDate: '2026-09-08',
    });
    expect(r.success).toBe(true);
    expect(r.success && normalizeEventTimes(r.data).startAtMs).toBe(
      Date.parse('2026-09-08T00:00:00.000Z'),
    );
  });

  it('cả ngày mà lại gửi giờ thì vẫn hợp lệ — giờ bị bỏ qua', () => {
    const r = createEventSchema.safeParse({
      title: 'Sinh nhật',
      allDay: true,
      startDate: '2026-09-08',
      startAt: '2026-09-08T05:00:00.000Z',
    });
    expect(r.success).toBe(true);
    expect(r.success && normalizeEventTimes(r.data).startAtMs).toBe(
      Date.parse('2026-09-08T00:00:00.000Z'),
    );
  });

  it('thiếu ngày bắt đầu', () => {
    const r = createEventSchema.safeParse({ title: 'Sinh nhật', allDay: true });
    expect(errorOn(r, 'startDate')).toBe('Sự kiện cả ngày cần ngày bắt đầu');
  });

  it('ngày kết thúc trước ngày bắt đầu', () => {
    const r = createEventSchema.safeParse({
      title: 'Đi chơi',
      allDay: true,
      startDate: '2026-09-08',
      endDate: '2026-09-07',
    });
    expect(errorOn(r, 'endDate')).toBe('Ngày kết thúc không được trước ngày bắt đầu');
  });

  it('cùng một ngày thì hợp lệ (sự kiện cả ngày, kéo dài 1 ngày)', () => {
    const r = createEventSchema.safeParse({
      title: 'Đi chơi',
      allDay: true,
      startDate: '2026-09-08',
      endDate: '2026-09-08',
    });
    expect(r.success).toBe(true);
  });

  it('đúng 30 ngày thì được, 31 ngày thì không', () => {
    const ok = createEventSchema.safeParse({
      title: 'Du lịch dài',
      allDay: true,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    expect(ok.success).toBe(true);

    const tooLong = createEventSchema.safeParse({
      title: 'Du lịch dài',
      allDay: true,
      startDate: '2026-09-01',
      endDate: '2026-10-01',
    });
    expect(errorOn(tooLong, 'endDate')).toContain('30 ngày');
  });

  it('ngày 31/02 bị từ chối chứ không âm thầm trôi sang 03/03', () => {
    const r = createEventSchema.safeParse({
      title: 'X',
      allDay: true,
      startDate: '2026-02-31',
    });
    expect(errorOn(r, 'startDate')).toBe('Ngày này không có thật');
  });
});

describe('eventRangeSchema', () => {
  it('happy path', () => {
    const r = eventRangeSchema.safeParse({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('khoảng ngược', () => {
    const r = eventRangeSchema.safeParse({
      from: '2026-09-30T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });

  it('quét quá 400 ngày bị chặn', () => {
    const r = eventRangeSchema.safeParse({
      from: '2020-01-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });
});

describe('eventsOverlap', () => {
  const at = (s: string, e: string | null) => ({ startAt: s, endAt: e });

  it('hai khoảng chồng nhau', () => {
    expect(
      eventsOverlap(
        at('2026-09-08T09:00:00.000Z', '2026-09-08T11:00:00.000Z'),
        at('2026-09-08T10:00:00.000Z', '2026-09-08T12:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('nối tiếp nhau (chạm mép) KHÔNG tính là chồng', () => {
    expect(
      eventsOverlap(
        at('2026-09-08T09:00:00.000Z', '2026-09-08T10:00:00.000Z'),
        at('2026-09-08T10:00:00.000Z', '2026-09-08T11:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('hai cuộc hẹn đặt TRÙNG ĐÚNG một giờ, cả hai đều không có giờ kết thúc', () => {
    // Công thức giao khoảng thông thường trả false ở đây — đúng cái bẫy.
    expect(
      eventsOverlap(
        at('2026-09-08T09:00:00.000Z', null),
        at('2026-09-08T09:00:00.000Z', null),
      ),
    ).toBe(true);
  });

  it('một mốc nằm trong một khoảng', () => {
    expect(
      eventsOverlap(
        at('2026-09-08T10:00:00.000Z', null),
        at('2026-09-08T09:00:00.000Z', '2026-09-08T11:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('một mốc đúng lúc khoảng kia kết thúc thì không chồng', () => {
    expect(
      eventsOverlap(
        at('2026-09-08T11:00:00.000Z', null),
        at('2026-09-08T09:00:00.000Z', '2026-09-08T11:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('dữ liệu hỏng thì trả false chứ không ném lỗi', () => {
    expect(eventsOverlap(at('không phải giờ', null), at('cũng không', null))).toBe(false);
  });
});
