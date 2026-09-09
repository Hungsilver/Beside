import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GamesService } from './games.service';
import { GamesGateway } from './games.gateway';

/**
 * Trọng tài đồng hồ.
 *
 * Vì sao là một VÒNG QUÉT chứ không phải `setTimeout` hẹn riêng cho từng ván:
 * `setTimeout` chết theo tiến trình, nên khởi động lại API là mọi ván đang chạy
 * treo vĩnh viễn ở lượt của một người. Đây đúng là bài học đã ghi trong ADR của
 * job nhắc lịch (2026-09-08) — dùng lại cùng một cách giải.
 *
 * Đổi lại: độ chính xác chỉ tới 5 giây. Với đồng hồ 30 giây thì chấp nhận được,
 * và người dùng luôn được lợi chứ không bao giờ bị thiệt vì phần dư đó.
 */
@Injectable()
export class GameClockJob {
  private readonly logger = new Logger(GameClockJob.name);
  /** Chặn hai lượt quét chồng nhau nếu một lượt chạy lâu hơn chu kỳ. */
  private running = false;

  constructor(
    private readonly games: GamesService,
    private readonly gateway: GamesGateway,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.expireTurns();
      await this.abandonStale();
    } catch (err) {
      // Job hỏng không được làm sập tiến trình — ván vẫn chơi tay được.
      this.logger.error(`Vòng quét đồng hồ lỗi: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Ván hết giờ → xử thua người đang tới lượt.
   *
   * Chỉ những ván có `turnDeadlineAt` mới bị quét. Ván đang TẠM DỪNG có
   * `turnDeadlineAt = NULL` nên không lọt vào đây — đó chính là chỗ cơ chế
   * chống phạt oan phát huy tác dụng (ARCHITECTURE.md §1.3: iOS treo JS khi
   * khoá màn hình).
   */
  private async expireTurns(): Promise<void> {
    const expired = await this.games.findExpired();
    for (const gameId of expired) {
      /*
       * Bọc TỪNG ván: `timeout()` ném lỗi xung đột khi người chơi bấm đánh
       * đúng vào giây hết giờ — cả hai cùng ghi, khoá lạc quan cho một bên
       * thua. Đó là kết quả ĐÚNG (ván không đi hai nước cho một lượt), nhưng
       * để lỗi thoát ra ngoài thì nó cắt luôn vòng quét và các ván còn lại
       * trong lượt này bị bỏ qua.
       */
      try {
        const result = await this.games.timeout(gameId);
        if (!result) continue;

        if (result.finished) {
          await this.gateway.broadcastOver(gameId, {
            gameId,
            winnerId: result.winnerId,
            endReason: result.endReason ?? 'HET_GIO',
          });
          this.logger.log(`Ván ${gameId}: hết giờ, kết thúc (${result.endReason})`);
        } else {
          /*
           * Tiến lên: hết giờ chỉ mất lượt, ván đi tiếp. Lượt vừa đổi tay nên
           * phải đồng bộ đồng hồ — người tới lượt có thể cũng đang không mở app,
           * và nếu vậy thì đồng hồ phải dừng chứ không chạy tiếp cho họ.
           */
          await this.gateway.syncAndBroadcast(gameId, result.game.turnUserId);
          this.logger.log(`Ván ${gameId}: hết giờ, tự đi thay`);
        }
      } catch (err) {
        this.logger.warn(`Bỏ qua ván ${gameId}: ${(err as Error).message}`);
      }
    }
  }

  /** Ván không ai đi quá lâu → dọn đi cho danh sách khỏi tích rác. */
  private async abandonStale(): Promise<void> {
    const ids = await this.games.abandonStale();
    for (const gameId of ids) {
      await this.gateway.broadcastOver(gameId, {
        gameId,
        winnerId: null,
        endReason: 'BO_DO',
      });
    }
    if (ids.length > 0) this.logger.log(`Bỏ dở ${ids.length} ván quá hạn`);
  }
}
