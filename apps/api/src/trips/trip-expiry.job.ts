import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TripsService } from './trips.service';

/**
 * Dọn các chuyến "đang trên đường về" đã quá hạn.
 *
 * Cùng cách làm với đồng hồ ván bài: một cron cố định, KHÔNG phải `setTimeout`
 * cho từng chuyến — `setTimeout` chết theo tiến trình, khởi động lại API là mọi
 * chuyến treo vĩnh viễn trên màn hình người kia.
 *
 * Mỗi 10 phút là đủ: hạn là 3 giờ, lệch thêm 10 phút không ai để ý.
 */
@Injectable()
export class TripExpiryJob {
  private readonly logger = new Logger(TripExpiryJob.name);

  constructor(private readonly trips: TripsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    try {
      await this.trips.expireStale();
    } catch (err) {
      // Job nền hỏng thì chỉ log, không được làm sập tiến trình.
      this.logger.warn(`Quét chuyến đi quá hạn thất bại: ${(err as Error).message}`);
    }
  }
}
