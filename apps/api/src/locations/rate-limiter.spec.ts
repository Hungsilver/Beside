import { describe, expect, it } from 'vitest';
import { SlidingWindowRateLimiter } from './rate-limiter';

describe('SlidingWindowRateLimiter', () => {
  it('cho qua đúng số lượt trong cửa sổ', () => {
    const rl = new SlidingWindowRateLimiter(2, 3000);
    expect(rl.allow('an', 1000)).toBe(true);
    expect(rl.allow('an', 1100)).toBe(true);
    expect(rl.allow('an', 1200)).toBe(false);
    expect(rl.allow('an', 1300)).toBe(false);
  });

  it('cửa sổ trượt: hết hạn thì lại cho qua', () => {
    const rl = new SlidingWindowRateLimiter(2, 3000);
    rl.allow('an', 1000);
    rl.allow('an', 1100);
    expect(rl.allow('an', 3900)).toBe(false); // lượt lúc 1000 vẫn còn trong cửa sổ
    expect(rl.allow('an', 4001)).toBe(true); // lượt lúc 1000 đã rơi ra ngoài
  });

  it('mỗi người một hạn mức riêng', () => {
    const rl = new SlidingWindowRateLimiter(1, 3000);
    expect(rl.allow('an', 1000)).toBe(true);
    expect(rl.allow('an', 1100)).toBe(false);
    // Bình bị chặn oan là lỗi nghiêm trọng — mất bản đồ trực tiếp
    expect(rl.allow('binh', 1100)).toBe(true);
  });

  it('bắn dồn dập không làm vỡ bộ đếm', () => {
    const rl = new SlidingWindowRateLimiter(2, 3000);
    let allowed = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (rl.allow('an', 1000 + i)) allowed += 1;
    }
    expect(allowed).toBe(2);
  });

  it('không rò rỉ bộ nhớ: khoá của người đã ngừng gửi được dọn', () => {
    const rl = new SlidingWindowRateLimiter(2, 1000);
    for (let i = 0; i < 5000; i += 1) {
      rl.allow(`user-${i}`, 1000 + i * 10);
    }
    // Chạm vào bộ đếm ở thời điểm rất xa để kích hoạt lần dọn
    rl.allow('cuoi-cung', 10_000_000);

    const size = (rl as unknown as { hits: Map<string, number[]> }).hits.size;
    expect(size).toBeLessThan(100);
  });

  it('hoạt động đúng với thời gian thực (không truyền now)', () => {
    const rl = new SlidingWindowRateLimiter(3, 60_000);
    expect(rl.allow('an')).toBe(true);
    expect(rl.allow('an')).toBe(true);
    expect(rl.allow('an')).toBe(true);
    expect(rl.allow('an')).toBe(false);
  });
});
