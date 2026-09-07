import { describe, expect, it } from 'vitest';
import type { EventResponse } from '@beside/shared';
import {
  dayKeysOf,
  defaultTimes,
  groupByDay,
  isoToVnWall,
  monthGrid,
  timeLabel,
  vnWallToIso,
} from './event-display';

function ev(partial: Partial<EventResponse>): EventResponse {
  return {
    id: 'e1',
    title: 'X',
    note: null,
    emoji: '📅',
    allDay: false,
    startAt: '2026-09-08T02:00:00.000Z',
    endAt: null,
    placeId: null,
    lat: null,
    lng: null,
    remindMinBefore: null,
    visibility: 'SHARED',
    createdById: 'u1',
    createdByName: 'An',
    canEdit: true,
    ...partial,
  };
}

describe('dayKeysOf — sự kiện có giờ (đổi sang giờ VN)', () => {
  it('09:00 giờ VN nằm đúng ngày đó', () => {
    // 02:00 UTC = 09:00 giờ VN ngày 08
    expect(dayKeysOf(ev({ startAt: '2026-09-08T02:00:00.000Z' }))).toEqual(['2026-09-08']);
  });

  it('BẪY MÚI GIỜ: 18:00 UTC là 01:00 sáng NGÀY HÔM SAU ở Việt Nam', () => {
    // Nếu đọc theo UTC thì sự kiện này rơi nhầm vào ô ngày 08 trên lịch,
    // trong khi người dùng đặt nó lúc 1 giờ sáng ngày 09.
    expect(dayKeysOf(ev({ startAt: '2026-09-08T18:00:00.000Z' }))).toEqual(['2026-09-09']);
  });

  it('BẪY MÚI GIỜ: 23:30 giờ VN vẫn thuộc ngày hôm đó, không nhảy sang hôm sau', () => {
    // 16:30 UTC = 23:30 giờ VN ngày 08
    expect(dayKeysOf(ev({ startAt: '2026-09-08T16:30:00.000Z' }))).toEqual(['2026-09-08']);
  });

  it('sự kiện vắt qua nửa đêm phủ lên hai ô lịch', () => {
    const keys = dayKeysOf(
      ev({
        startAt: '2026-09-08T16:30:00.000Z', // 23:30 ngày 08
        endAt: '2026-09-08T18:30:00.000Z', // 01:30 ngày 09
      }),
    );
    expect(keys).toEqual(['2026-09-08', '2026-09-09']);
  });

  it('sự kiện 3 ngày phủ đủ 3 ô', () => {
    const keys = dayKeysOf(
      ev({
        startAt: '2026-09-08T02:00:00.000Z',
        endAt: '2026-09-10T02:00:00.000Z',
      }),
    );
    expect(keys).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
  });

  it('dữ liệu hỏng trả mảng rỗng chứ không ném lỗi', () => {
    expect(dayKeysOf(ev({ startAt: 'không phải giờ' }))).toEqual([]);
  });
});

describe('dayKeysOf — sự kiện cả ngày (ngày trôi nổi, KHÔNG đổi múi giờ)', () => {
  it('sinh nhật 12/09 nằm đúng ô ngày 12', () => {
    // Nếu ai đó "sửa cho tiện" bằng cách đổi sang giờ VN, mốc này thành 07:00
    // ngày 12 — vẫn đúng. Nhưng nếu lưu theo 00:00 giờ VN thì mốc là 17:00 ngày
    // 11 UTC và ô lịch nhảy về ngày 11. Test này khoá đúng chỗ đó.
    const keys = dayKeysOf(
      ev({ allDay: true, startAt: '2026-09-12T00:00:00.000Z', endAt: null }),
    );
    expect(keys).toEqual(['2026-09-12']);
  });

  it('chuyến đi 01→03/10 phủ đủ ba ngày, tính CẢ ngày cuối', () => {
    const keys = dayKeysOf(
      ev({
        allDay: true,
        startAt: '2026-10-01T00:00:00.000Z',
        endAt: '2026-10-03T00:00:00.000Z',
      }),
    );
    expect(keys).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
});

describe('groupByDay', () => {
  it('một sự kiện nhiều ngày xuất hiện ở mọi ô nó phủ', () => {
    const trip = ev({
      id: 'trip',
      allDay: true,
      startAt: '2026-10-01T00:00:00.000Z',
      endAt: '2026-10-02T00:00:00.000Z',
    });
    const map = groupByDay([trip]);
    expect(map.get('2026-10-01')?.[0]?.id).toBe('trip');
    expect(map.get('2026-10-02')?.[0]?.id).toBe('trip');
    expect(map.get('2026-10-03')).toBeUndefined();
  });
});

describe('timeLabel', () => {
  it('sự kiện cả ngày', () => {
    expect(timeLabel(ev({ allDay: true }))).toBe('Cả ngày');
  });

  it('12:00 UTC hiện là 19:00 giờ VN', () => {
    expect(timeLabel(ev({ startAt: '2026-09-08T12:00:00.000Z' }))).toBe('19:00');
  });

  it('có giờ kết thúc thì hiện cả khoảng', () => {
    expect(
      timeLabel(
        ev({ startAt: '2026-09-08T12:00:00.000Z', endAt: '2026-09-08T14:00:00.000Z' }),
      ),
    ).toBe('19:00 – 21:00');
  });
});

describe('vnWallToIso / isoToVnWall', () => {
  it('19:00 giờ VN = 12:00 UTC, không phụ thuộc múi giờ của máy', () => {
    expect(vnWallToIso('2026-09-10', '19:00')).toBe('2026-09-10T12:00:00.000Z');
  });

  it('00:30 giờ VN thuộc ngày hôm đó, mốc UTC lùi về hôm trước', () => {
    expect(vnWallToIso('2026-09-10', '00:30')).toBe('2026-09-09T17:30:00.000Z');
  });

  it('đi và về không mất mát', () => {
    const iso = vnWallToIso('2026-09-10', '19:00') as string;
    expect(isoToVnWall(iso)).toEqual({ date: '2026-09-10', time: '19:00' });
  });

  it('ô nhập chưa điền thì trả null chứ không dựng ra Invalid Date', () => {
    expect(vnWallToIso('', '19:00')).toBeNull();
    expect(vnWallToIso('2026-09-10', '')).toBeNull();
  });
});

describe('monthGrid', () => {
  it('luôn 42 ô', () => {
    expect(monthGrid(2026, 9)).toHaveLength(42);
  });

  it('bắt đầu từ thứ hai — 01/09/2026 là thứ ba nên ô đầu là 31/08', () => {
    expect(monthGrid(2026, 9)[0]).toBe('2026-08-31');
  });

  it('tháng bắt đầu đúng thứ hai thì không có ô đệm', () => {
    // 01/06/2026 là thứ hai
    expect(monthGrid(2026, 6)[0]).toBe('2026-06-01');
  });

  it('tháng 2 năm nhuận có ngày 29', () => {
    expect(monthGrid(2024, 2)).toContain('2024-02-29');
  });

  it('chứa đủ mọi ngày của tháng', () => {
    const grid = monthGrid(2026, 9);
    expect(grid).toContain('2026-09-01');
    expect(grid).toContain('2026-09-30');
  });
});

describe('defaultTimes', () => {
  it('gợi ý tròn giờ kế tiếp, dài 1 tiếng', () => {
    // 07:00 UTC = 14:00 giờ VN → gợi ý 15:00–16:00
    expect(defaultTimes(new Date('2026-09-08T07:00:00.000Z'))).toEqual({
      startTime: '15:00',
      endTime: '16:00',
    });
  });

  it('gần nửa đêm thì lùi về 22:00 để sự kiện không rơi sang ngày hôm sau', () => {
    // 16:00 UTC = 23:00 giờ VN
    expect(defaultTimes(new Date('2026-09-08T16:00:00.000Z'))).toEqual({
      startTime: '22:00',
      endTime: '23:00',
    });
  });
});
