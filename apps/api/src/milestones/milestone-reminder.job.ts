import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { type MilestoneItem, type PushPayload } from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { PushService } from '../push/push.service';
import { MilestonesService } from './milestones.service';

/**
 * Nhắc mốc kỷ niệm (F5 + F7).
 *
 * Chạy **một lần mỗi ngày lúc 08:00 giờ Việt Nam** — khác hẳn nhắc lịch (quét
 * mỗi phút). Mốc kỷ niệm là chuyện của cả một ngày, không phải một giờ hẹn:
 * bắn thông báo lúc 3 giờ sáng chỉ làm người ta khó chịu.
 *
 * Không cần cột "đã gửi chưa" như `Event.reminderSentAt`: mỗi mốc chỉ nằm trong
 * đúng một khung ngày báo trước, và cron chạy đúng một lần mỗi ngày. Nếu server
 * chết qua 08:00 thì mất lời nhắc hôm đó — chấp nhận được, vì hôm sau vẫn còn
 * nhắc lại (mốc 7 ngày → 3 ngày → 1 ngày → hôm nay).
 */
@Injectable()
export class MilestoneReminderJob {
  private readonly logger = new Logger(MilestoneReminderJob.name);

  /**
   * Báo trước ở những mốc này. Nhiều nấc để người ta còn kịp chuẩn bị quà,
   * nhưng không nhắc mỗi ngày cho đỡ phiền.
   */
  private static readonly NOTIFY_AT_DAYS_LEFT = [7, 3, 1, 0];

  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly milestones: MilestonesService,
  ) {}

  @Cron('0 0 8 * * *', { timeZone: 'Asia/Ho_Chi_Minh', name: 'milestone-reminder' })
  async run(): Promise<void> {
    if (this.running || !this.push.isEnabled()) return;
    this.running = true;
    try {
      const sent = await this.sweep(new Date());
      if (sent > 0) this.logger.log(`Đã gửi ${sent} lời nhắc mốc kỷ niệm`);
    } catch (err) {
      // Nhắc kỷ niệm hỏng không được làm sập tiến trình — mai chạy lại.
      this.logger.error(`Quét mốc kỷ niệm thất bại: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Tách khỏi `run()` để test được với một mốc thời gian cho trước. */
  async sweep(now: Date): Promise<number> {
    // Chỉ những couple đã đủ hai người mới có gì để nhắc.
    const couples = await this.prisma.couple.findMany({
      select: { id: true, members: { select: { id: true } } },
    });

    let sent = 0;

    for (const couple of couples) {
      const anyMember = couple.members[0];
      if (!anyMember) continue;

      let items: MilestoneItem[];
      try {
        // Danh sách giống hệt nhau với cả hai người trong couple (mốc là của
        // chung), nên tính một lần rồi gửi cho cả hai.
        items = await this.milestones.upcoming(anyMember.id, now);
      } catch {
        continue; // couple hỏng dữ liệu thì bỏ qua, không chặn couple khác
      }

      const due = items.filter((i) =>
        MilestoneReminderJob.NOTIFY_AT_DAYS_LEFT.includes(i.daysLeft),
      );

      for (const item of due) {
        const payload: PushPayload = {
          kind: 'MILESTONE',
          title: `${item.emoji} ${item.title}`,
          body: this.describe(item.daysLeft),
          url: '/ngay-yeu',
          // Gộp theo mốc + ngày: chạy lại trong cùng ngày cũng chỉ hiện một cái.
          tag: `milestone:${item.title}:${item.date.slice(0, 10)}`,
          at: now.getTime(),
        };
        for (const member of couple.members) {
          sent += await this.push.sendToUser(member.id, payload);
        }
      }
    }

    return sent;
  }

  private describe(daysLeft: number): string {
    if (daysLeft === 0) return 'Là hôm nay đó 💕';
    if (daysLeft === 1) return 'Ngày mai rồi — chuẩn bị gì chưa?';
    return `Còn ${daysLeft} ngày nữa`;
  }
}
