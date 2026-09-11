import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DISPLAY_TIMEZONE } from '@beside/shared';
import { PushService } from '../push/push.service';
import { CycleService } from './cycle.service';

/**
 * Nhắc trước kỳ (F14).
 *
 * Chạy MỘT LẦN mỗi ngày lúc 8 giờ sáng giờ Việt Nam — không phải mỗi giờ: đây
 * là loại thông báo mà nhắc thừa một lần cũng đủ khó chịu để người dùng tắt
 * hẳn tính năng.
 *
 * `timeZone` phải khai báo tường minh: container chạy theo UTC, để mặc định là
 * thông báo rơi vào 3 giờ chiều giờ VN.
 */
@Injectable()
export class CycleReminderJob {
  private readonly logger = new Logger(CycleReminderJob.name);

  constructor(
    private readonly cycle: CycleService,
    private readonly push: PushService,
  ) {}

  @Cron('0 8 * * *', { timeZone: DISPLAY_TIMEZONE })
  async run(): Promise<void> {
    try {
      const due = await this.cycle.dueReminders();

      for (const item of due) {
        const when = item.daysUntil === 0 ? 'hôm nay' : 'ngày mai';

        if (item.remindMe) {
          await this.push.sendToUser(item.userId, {
            kind: 'CYCLE_REMINDER',
            title: 'Nhắc nhẹ nhàng',
            body: `Kỳ của bạn dự kiến bắt đầu ${when}.`,
            url: '/chu-ky',
            tag: 'cycle:self',
            at: Date.now(),
          });
        }

        // Người ấy chỉ nhận khi CHỦ DỮ LIỆU bật cả chia sẻ lẫn nhắc — xem
        // `dueReminders()`, nơi `partnerId` bị đặt null nếu đang không chia sẻ.
        if (item.remindPartner && item.partnerId) {
          await this.push.sendToUser(item.partnerId, {
            kind: 'CYCLE_REMINDER',
            title: `Kỳ của ${item.name} sắp tới`,
            body: `Dự kiến ${when} — nhớ quan tâm nhé 💕`,
            url: '/',
            tag: 'cycle:partner',
            at: Date.now(),
          });
        }
      }

      if (due.length > 0) this.logger.log(`Đã nhắc ${due.length} người về chu kỳ`);
    } catch (err) {
      // Job nền hỏng thì chỉ log — không được làm sập tiến trình.
      this.logger.warn(`Nhắc chu kỳ thất bại: ${(err as Error).message}`);
    }
  }
}
