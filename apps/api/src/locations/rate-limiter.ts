/**
 * Hạn mức trong bộ nhớ tiến trình cho luồng vị trí.
 *
 * Vì sao cần dù đã có Redis: `RedisService` cố tình "mở" khi Redis chết
 * (trả 0 = không chặn ai), để mất cache không làm sập bản đồ trực tiếp của
 * người dùng thật. Nhưng như vậy nghĩa là KHÔNG còn hàng rào nào cả — một
 * client lỗi hoặc cố ý có thể bắn hàng nghìn điểm mỗi giây và làm ngập
 * đệm ghi DB. Trace Phase 2 (TC-58) đã lộ đúng chỗ này.
 *
 * Bộ đếm này luôn chạy, không phụ thuộc hạ tầng ngoài. Redis chỉ thêm phần
 * đồng bộ giữa nhiều tiến trình — thứ hiện chưa cần, nhưng sẽ cần nếu sau
 * này chạy nhiều instance.
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** true = được phép, false = vượt hạn mức. */
  allow(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const times = this.hits.get(key);

    if (!times) {
      this.hits.set(key, [now]);
      this.maybeSweep(now);
      return true;
    }

    // Bỏ các lần nằm ngoài cửa sổ
    let i = 0;
    while (i < times.length && times[i]! <= cutoff) i += 1;
    if (i > 0) times.splice(0, i);

    if (times.length >= this.limit) return false;

    times.push(now);
    this.maybeSweep(now);
    return true;
  }

  /**
   * Dọn khoá của những người đã ngừng gửi.
   * Không dọn thì Map phình mãi theo số user từng kết nối — rò rỉ bộ nhớ chậm
   * nhưng chắc chắn xảy ra với tiến trình chạy nhiều tháng.
   */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < this.windowMs * 10) return;
    this.lastSweep = now;

    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      if (times.length === 0 || times[times.length - 1]! <= cutoff) {
        this.hits.delete(key);
      }
    }
  }

  /** Chỉ dùng cho test. */
  reset(): void {
    this.hits.clear();
    this.lastSweep = 0;
  }
}
