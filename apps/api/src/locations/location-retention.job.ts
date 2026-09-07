import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LocationsService } from './locations.service';

/**
 * Dọn lịch sử vị trí theo chính sách ở ARCHITECTURE.md §6:
 *   - giữ 7 ngày ở độ phân giải đầy đủ
 *   - 7–90 ngày: nén còn 1 điểm mỗi 15 phút
 *   - quá 90 ngày: xoá hẳn
 *
 * Đây là một LỜI HỨA VỚI NGƯỜI DÙNG chứ không chỉ là dọn dẹp ổ đĩa,
 * nên nó đi kèm ngay trong phase sinh ra dữ liệu, không để lại sau.
 *
 * Dùng @nestjs/schedule thay vì BullMQ: đây là một việc lặp cố định, không cần
 * hàng đợi, không cần retry phân tán. BullMQ sẽ cần ở Phase 4 cho nhắc lịch
 * theo từng sự kiện (mỗi sự kiện một job hẹn giờ riêng) — lúc đó mới đáng.
 */
@Injectable()
export class LocationRetentionJob {
  private readonly logger = new Logger(LocationRetentionJob.name);

  constructor(private readonly locations: LocationsService) {}

  // 03:00 mỗi ngày theo giờ Việt Nam
  @Cron('0 0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh', name: 'location-retention' })
  async run(): Promise<void> {
    try {
      const { deleted, thinned } = await this.locations.pruneOldLocations();
      this.logger.log(
        `Dọn lịch sử vị trí: xoá ${deleted} điểm quá 90 ngày, nén bỏ ${thinned} điểm trong khoảng 7–90 ngày`,
      );
    } catch (err) {
      // Dọn dẹp thất bại không được làm sập tiến trình — mai chạy lại.
      this.logger.error(`Dọn lịch sử vị trí thất bại: ${(err as Error).message}`);
    }
  }
}
