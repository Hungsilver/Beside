import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StudyService } from './study.service';
import { StudyGateway } from './study.gateway';

/**
 * Đẩy phiên học sang chặng kế khi hết giờ.
 *
 * Quét mỗi 10 giây chứ không phải 5 như đồng hồ ván bài: chặng học tính bằng
 * chục phút nên chậm vài giây không ai nhận ra, mà lại đỡ được một nửa số lần
 * đánh thức tiến trình.
 *
 * Vẫn là VÒNG QUÉT chứ không phải `setTimeout` hẹn riêng từng phiên —
 * `setTimeout` chết theo tiến trình, khởi động lại API là mọi phiên treo giữa
 * chừng. Cùng bài học đã ghi ở job nhắc lịch và đồng hồ ván bài.
 */
@Injectable()
export class StudyClockJob {
  private readonly logger = new Logger(StudyClockJob.name);
  private running = false;

  constructor(
    private readonly study: StudyService,
    private readonly gateway: StudyGateway,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const sessionId of await this.study.findExpired()) {
        // Bọc từng phiên: một phiên hỏng không được cắt cả vòng quét.
        try {
          const advanced = await this.study.advance(sessionId);
          if (advanced) await this.gateway.broadcastCouple(advanced.coupleId);
        } catch (err) {
          this.logger.warn(`Bỏ qua phiên ${sessionId}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      // Job hỏng không được làm sập tiến trình.
      this.logger.error(`Vòng quét phòng học lỗi: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
