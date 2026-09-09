import { describe, expect, it } from 'vitest';
import { formatWhen } from './relative-time';

const NOW = Date.parse('2026-09-09T10:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('formatWhen', () => {
  it('dưới một phút → "vừa xong"', () => {
    expect(formatWhen(minutesAgo(0), NOW)).toBe('vừa xong');
    expect(formatWhen(minutesAgo(0.4), NOW)).toBe('vừa xong');
  });

  it('mốc trong tương lai (lệch đồng hồ máy) cũng về "vừa xong"', () => {
    // Đồng hồ máy chậm hơn server vài giây là chuyện thường. "-2 phút trước"
    // thì vô nghĩa, còn "vừa xong" thì vẫn đúng tinh thần.
    expect(formatWhen(new Date(NOW + 90_000).toISOString(), NOW)).toBe('vừa xong');
  });

  it('vài phút trước', () => {
    expect(formatWhen(minutesAgo(12), NOW)).toBe('12 phút trước');
    expect(formatWhen(minutesAgo(59), NOW)).toBe('59 phút trước');
  });

  it('vài giờ trước', () => {
    expect(formatWhen(minutesAgo(60), NOW)).toBe('1 giờ trước');
    expect(formatWhen(minutesAgo(60 * 5), NOW)).toBe('5 giờ trước');
  });

  it('vài ngày trước', () => {
    expect(formatWhen(minutesAgo(60 * 24), NOW)).toBe('1 ngày trước');
    expect(formatWhen(minutesAgo(60 * 24 * 6), NOW)).toBe('6 ngày trước');
  });

  it('quá bảy ngày → ngày tháng thật', () => {
    const out = formatWhen(minutesAgo(60 * 24 * 30), NOW);
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('hiện theo giờ Việt Nam, không theo múi giờ của máy', () => {
    // 17:30 UTC ngày 08/09 = 00:30 ngày 09/09 ở Việt Nam. Nếu hàm lỡ dùng múi
    // giờ của máy (CI chạy ở UTC) thì kết quả sẽ ra 08/09.
    const out = formatWhen('2026-09-08T17:30:00.000Z', Date.parse('2026-10-20T00:00:00.000Z'));
    expect(out).toBe('09/09/2026');
  });

  it('mốc thời gian hỏng → chuỗi rỗng, không phải "Invalid Date"', () => {
    expect(formatWhen('không-phải-ngày', NOW)).toBe('');
    expect(formatWhen('', NOW)).toBe('');
  });
});
