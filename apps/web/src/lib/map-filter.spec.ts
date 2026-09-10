import { describe, expect, it } from 'vitest';
import { resolveMapRange, toDayInput, type MapRangeState } from './map-filter';

/** 10/09/2026 lúc 12:34 giờ VN. Giờ VN cố định UTC+7 nên 00:00 VN = 17:00Z hôm trước. */
const NOW = Date.parse('2026-09-10T05:34:00.000Z');

const state = (over: Partial<MapRangeState> = {}): MapRangeState => ({
  id: 'all',
  customFrom: '',
  customTo: '',
  ...over,
});

describe('resolveMapRange — mốc dựng sẵn', () => {
  it('"Tất cả" không chặn đầu nào', () => {
    const r = resolveMapRange(state({ id: 'all' }), NOW);
    expect(r.from).toBeNull();
    expect(r.to).toBeNull();
    expect(r.error).toBeNull();
  });

  it('"7 ngày" bắt đầu từ 00:00 giờ VN của ngày thứ 7 tính ngược, KỂ CẢ hôm nay', () => {
    const r = resolveMapRange(state({ id: '7d' }), NOW);
    // Hôm nay 10/09 → ngày đầu khoảng là 04/09, tức 03/09 17:00Z.
    expect(new Date(r.from!).toISOString()).toBe('2026-09-03T17:00:00.000Z');
    expect(r.to).toBeNull();
  });

  it('không cắt giữa ngày: ảnh đăng lúc 6 giờ sáng ngày đầu vẫn nằm trong khoảng', () => {
    const r = resolveMapRange(state({ id: '7d' }), NOW);
    const sixAmFirstDay = Date.parse('2026-09-03T23:00:00.000Z'); // 06:00 VN ngày 04/09
    expect(sixAmFirstDay).toBeGreaterThan(r.from!);
  });

  it('mốc lạ (dữ liệu localStorage cũ) rơi về "Tất cả" thay vì vỡ', () => {
    const r = resolveMapRange(state({ id: 'khong-ton-tai' as never }), NOW);
    expect(r.from).toBeNull();
    expect(r.error).toBeNull();
  });
});

describe('resolveMapRange — khoảng tự chọn', () => {
  it('lấy trọn hai ngày đầu và cuối theo giờ VN', () => {
    const r = resolveMapRange(
      state({ id: 'custom', customFrom: '2026-09-01', customTo: '2026-09-05' }),
      NOW,
    );
    expect(new Date(r.from!).toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(new Date(r.to!).toISOString()).toBe('2026-09-05T16:59:59.999Z');
    expect(r.error).toBeNull();
  });

  it('chọn đúng một ngày vẫn ra một khoảng dài trọn ngày đó', () => {
    const r = resolveMapRange(
      state({ id: 'custom', customFrom: '2026-09-05', customTo: '2026-09-05' }),
      NOW,
    );
    expect(r.to! - r.from!).toBe(86_400_000 - 1);
    expect(r.error).toBeNull();
  });

  it('thiếu một đầu thì báo lỗi và KHÔNG dựng khoảng', () => {
    const r = resolveMapRange(state({ id: 'custom', customFrom: '2026-09-01' }), NOW);
    expect(r.from).toBeNull();
    expect(r.error).toBe('Chọn đủ ngày bắt đầu và ngày kết thúc');
  });

  it('ngày bắt đầu sau ngày kết thúc thì báo lỗi', () => {
    const r = resolveMapRange(
      state({ id: 'custom', customFrom: '2026-09-09', customTo: '2026-09-01' }),
      NOW,
    );
    expect(r.from).toBeNull();
    expect(r.error).toBe('Ngày bắt đầu phải trước ngày kết thúc');
  });

  it('ngày không có thật (31/02) bị từ chối chứ không trôi sang 03/03', () => {
    const r = resolveMapRange(
      state({ id: 'custom', customFrom: '2026-02-31', customTo: '2026-03-05' }),
      NOW,
    );
    expect(r.from).toBeNull();
    expect(r.error).not.toBeNull();
  });

  it('29/02 năm nhuận thì hợp lệ', () => {
    const r = resolveMapRange(
      state({ id: 'custom', customFrom: '2028-02-29', customTo: '2028-02-29' }),
      NOW,
    );
    expect(r.error).toBeNull();
    expect(new Date(r.from!).toISOString()).toBe('2028-02-28T17:00:00.000Z');
  });
});

describe('toDayInput', () => {
  it('đổi mốc epoch sang YYYY-MM-DD theo giờ VN', () => {
    expect(toDayInput(NOW)).toBe('2026-09-10');
  });

  it('01:00 sáng giờ VN vẫn ra đúng ngày hôm đó', () => {
    expect(toDayInput(Date.parse('2026-09-09T18:00:00.000Z'))).toBe('2026-09-10');
  });

  it('mốc hỏng trả chuỗi rỗng', () => {
    expect(toDayInput(Number.NaN)).toBe('');
  });
});
