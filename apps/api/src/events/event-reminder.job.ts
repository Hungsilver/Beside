import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DISPLAY_TIMEZONE, type PushPayload } from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { PushService } from '../push/push.service';

/**
 * Nhắc trước mỗi cuộc hẹn (F4 + F7).
 *
 * Chạy mỗi phút và tự hỏi: "sự kiện nào đã tới mốc nhắc mà chưa được nhắc?".
 * Cách này bền hơn hẳn so với hẹn một job riêng cho từng sự kiện:
 *
 *   - Server tắt 10 phút rồi bật lại → job hẹn giờ đã mất; vòng quét vẫn thấy.
 *   - Người dùng đổi giờ sự kiện → không phải đi huỷ job cũ, chỉ cần đặt lại
 *     `reminderSentAt = null` (EventsService.update làm việc đó).
 *   - Không cần BullMQ, không cần Redis cho việc này.
 *
 * Đổi lại: độ chính xác chỉ tới từng phút. Với lời nhắc "trước 1 tiếng" thì
 * lệch vài chục giây là không ai nhận ra.
 */
@Injectable()
export class EventReminderJob {
  private readonly logger = new Logger(EventReminderJob.name);

  /**
   * Bỏ qua sự kiện đã quá hạn nhắc hơn 2 tiếng.
   *
   * Không có mốc này thì sau một đợt server chết nửa ngày, lúc bật lại người
   * dùng sẽ bị dội một loạt thông báo về những cuộc hẹn đã xong từ lâu.
   */
  private static readonly STALE_AFTER_MS = 2 * 60 * 60 * 1000;

  /** Chặn hai vòng quét chồng lên nhau nếu một vòng chạy lâu bất thường. */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Cron('0 * * * * *', { name: 'event-reminder' })
  async run(): Promise<void> {
    if (this.running || !this.push.isEnabled()) return;
    this.running = true;
    try {
      const sent = await this.sweep(new Date());
      if (sent > 0) this.logger.log(`Đã gửi ${sent} lời nhắc lịch`);
    } catch (err) {
      // Nhắc lịch hỏng không được làm sập tiến trình — phút sau quét lại.
      this.logger.error(`Quét nhắc lịch thất bại: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Tách riêng khỏi `run()` để test được với một mốc thời gian cho trước,
   * thay vì phải chờ đồng hồ thật.
   */
  async sweep(now: Date): Promise<number> {
    const nowMs = now.getTime();

    /*
     * Không lọc được mốc nhắc bằng SQL vì nó là phép tính giữa hai cột
     * (`startAt - remindMinBefore`). Prisma không diễn đạt được điều đó, nên
     * thu hẹp bằng `startAt` trước — chỉ những sự kiện bắt đầu trong khoảng
     * [now - 2h, now + 7 ngày] mới có thể tới mốc nhắc, vì trần nhắc trước là
     * 7 ngày (xem event.schema.ts). Rồi mới lọc chính xác trong bộ nhớ.
     */
    const candidates = await this.prisma.event.findMany({
      where: {
        reminderSentAt: null,
        remindMinBefore: { not: null },
        startAt: {
          gte: new Date(nowMs - EventReminderJob.STALE_AFTER_MS),
          lte: new Date(nowMs + 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        title: true,
        emoji: true,
        startAt: true,
        allDay: true,
        remindMinBefore: true,
        visibility: true,
        createdById: true,
        coupleId: true,
        couple: { select: { members: { select: { id: true } } } },
      },
      take: 500,
    });

    let sent = 0;

    for (const e of candidates) {
      const remindMs = e.startAt.getTime() - (e.remindMinBefore ?? 0) * 60_000;
      if (remindMs > nowMs) continue; // chưa tới giờ nhắc

      /*
       * Đánh dấu TRƯỚC khi gửi, và chỉ khi còn NULL. Nếu có hai tiến trình API
       * cùng chạy job này thì chỉ đúng một cái đổi được `count = 1` — cái kia
       * bỏ qua. Đánh dấu sau khi gửi thì cả hai đều kịp gửi trước khi ghi.
       */
      const claimed = await this.prisma.event.updateMany({
        where: { id: e.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claimed.count === 0) continue;

      const payload: PushPayload = {
        kind: 'EVENT_REMINDER',
        title: `${e.emoji} ${e.title}`,
        body: this.describeWhen(e.startAt, e.allDay, e.remindMinBefore ?? 0),
        url: '/lich',
        // Cùng một sự kiện thì gộp lại, không xếp chồng trong khay thông báo.
        tag: `event:${e.id}`,
        at: nowMs,
      };

      // Việc chung thì nhắc cả hai; việc riêng chỉ nhắc người tạo.
      const targets =
        e.visibility === 'SHARED'
          ? e.couple.members.map((m) => m.id)
          : [e.createdById];

      for (const userId of targets) {
        sent += await this.push.sendToUser(userId, payload);
      }
    }

    return sent;
  }

  /** "Bắt đầu lúc 19:00 hôm nay" / "Cả ngày mai" — câu chữ cho thông báo. */
  private describeWhen(startAt: Date, allDay: boolean, remindMinBefore: number): string {
    if (allDay) {
      /*
       * Sự kiện cả ngày là ngày trôi nổi: đọc theo UTC, không đổi múi giờ.
       *
       * Ghép chuỗi tay chứ không dùng `toLocaleDateString('vi-VN')`: dấu ngăn
       * cách phụ thuộc bộ dữ liệu ICU của từng bản Node — máy dev ra "09-09",
       * container ra "09/09". Thông báo gửi cho người dùng thì phải giống nhau
       * ở mọi nơi.
       */
      const dd = String(startAt.getUTCDate()).padStart(2, '0');
      const mm = String(startAt.getUTCMonth() + 1).padStart(2, '0');
      return `Cả ngày ${dd}/${mm}`;
    }

    // en-GB cho ra đúng "HH:mm" 24 giờ ở mọi bản ICU; múi giờ mới là thứ quan trọng.
    const time = startAt.toLocaleTimeString('en-GB', {
      timeZone: DISPLAY_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    if (remindMinBefore === 0) return `Bắt đầu bây giờ (${time})`;
    if (remindMinBefore < 60) return `Còn ${remindMinBefore} phút nữa — ${time}`;
    if (remindMinBefore < 1440) return `Còn ${Math.round(remindMinBefore / 60)} tiếng nữa — ${time}`;
    return `Ngày mai lúc ${time}`;
  }
}
