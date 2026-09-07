import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../../config/env';

/**
 * Redis dùng cho: vị trí gần nhất (cache), trạng thái trực tuyến, và
 * hạn mức gửi vị trí. KHÔNG dùng làm nơi lưu trữ chính — mọi thứ ở đây
 * đều có thể mất mà hệ thống vẫn chạy đúng, chỉ chậm hơn một nhịp.
 *
 * Vì vậy các hàm đọc/ghi ở đây đều "nuốt" lỗi: Redis chết thì app vẫn phải
 * xem được vị trí (đọc thẳng từ Postgres), chứ không được sập theo.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private warned = false;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const url = this.config.get('REDIS_URL', { infer: true });
    if (!url) {
      this.logger.warn('Không có REDIS_URL — chạy không cache (chấp nhận được khi dev)');
      return;
    }

    this.client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // Không để việc Redis chết làm treo request: thà bỏ cache còn hơn chờ.
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    this.client.on('error', (err) => {
      // Chỉ cảnh báo một lần cho mỗi đợt mất kết nối, tránh ngập log.
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(`Redis lỗi: ${err.message} — tạm chạy không cache`);
      }
    });
    this.client.on('ready', () => {
      this.warned = false;
      this.logger.log('Đã kết nối Redis');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }

  get available(): boolean {
    return this.client?.status === 'ready';
  }

  async get(key: string): Promise<string | null> {
    if (!this.available) return null;
    try {
      return await this.client!.get(key);
    } catch {
      return null;
    }
  }

  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.available) return;
    try {
      await this.client!.set(key, value, 'EX', ttlSeconds);
    } catch {
      /* bỏ qua — cache không phải nguồn sự thật */
    }
  }

  async del(key: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.client!.del(key);
    } catch {
      /* bỏ qua */
    }
  }

  /**
   * Đếm số lần trong một cửa sổ thời gian. Trả về số lần hiện tại.
   * Redis chết → trả 0, tức là KHÔNG chặn ai cả.
   *
   * Chọn "mở" thay vì "chặn" khi mất Redis vì đây chỉ là hạn mức chống spam
   * vị trí, không phải hàng rào bảo mật; chặn nhầm sẽ làm mất bản đồ trực tiếp
   * của người dùng thật.
   */
  async incrWindow(key: string, windowSeconds: number): Promise<number> {
    if (!this.available) return 0;
    try {
      const pipeline = this.client!.multi();
      pipeline.incr(key);
      pipeline.expire(key, windowSeconds, 'NX');
      const res = await pipeline.exec();
      const count = res?.[0]?.[1];
      return typeof count === 'number' ? count : 0;
    } catch {
      return 0;
    }
  }
}
