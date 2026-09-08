import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import {
  describeDevice,
  ERROR_CODES,
  type PushPayload,
  type PushSubscribeInput,
  type PushSubscriptionSummary,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';

/**
 * Gửi thông báo đẩy qua giao thức Web Push.
 *
 * Nguyên tắc: **thông báo hỏng không được làm hỏng việc chính**. Mọi lỗi gửi
 * đều bị nuốt và ghi log — người dùng vẫn tạo được sự kiện, vẫn check-in được,
 * kể cả khi dịch vụ đẩy của Apple/Google đang chết.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  private publicKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY') ?? '';
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY') ?? '';
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

    if (!publicKey || !privateKey) {
      this.logger.warn('Chưa cấu hình VAPID — thông báo đẩy TẮT, app vẫn chạy bình thường');
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
    this.enabled = true;
    this.logger.log('Thông báo đẩy đã bật');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  // ------------------------------------------------------------------

  async subscribe(userId: string, input: PushSubscribeInput): Promise<void> {
    if (!this.enabled) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Máy chủ chưa bật thông báo đẩy',
      );
    }

    /*
     * `endpoint` là unique toàn hệ thống, nên `upsert` xử lý luôn trường hợp
     * hai người dùng chung một máy: người thứ hai đăng ký thì bản ghi được
     * CHUYỂN sang họ, chứ không tạo bản trùng rồi vỡ ràng buộc unique.
     * Nếu không làm vậy, người đăng nhập sau sẽ nhận thông báo của người trước.
     */
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    // Chỉ xoá đăng ký của CHÍNH mình — nếu không thì biết endpoint của người
    // khác là tắt được thông báo của họ.
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async listForUser(
    userId: string,
    currentEndpoint?: string,
  ): Promise<PushSubscriptionSummary[]> {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true },
    });

    return rows.map((r) => ({
      id: r.id,
      device: describeDevice(r.userAgent),
      createdAt: r.createdAt.toISOString(),
      current: currentEndpoint !== undefined && r.endpoint === currentEndpoint,
    }));
  }

  // ------------------------------------------------------------------

  /**
   * Gửi tới mọi thiết bị của một người. Trả về số thiết bị nhận được.
   * KHÔNG bao giờ ném lỗi ra ngoài.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) return 0;

    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return 0;

    const body = JSON.stringify(payload);
    let sent = 0;
    const dead: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            { TTL: 60 * 60 * 24 },
          );
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          /*
           * 404/410 = trình duyệt đã huỷ đăng ký này (gỡ app, xoá dữ liệu site).
           * Phải dọn, không thì mỗi lần gửi lại tốn một vòng mạng vô ích mãi mãi.
           * Các mã khác (429, 5xx) là tạm thời — giữ lại để lần sau thử tiếp.
           */
          if (status === 404 || status === 410) dead.push(sub.endpoint);
          else this.logger.warn(`Gửi thông báo lỗi ${status ?? '?'} (${payload.kind})`);
        }
      }),
    );

    if (dead.length > 0) {
      await this.prisma.pushSubscription
        .deleteMany({ where: { endpoint: { in: dead } } })
        .catch(() => undefined);
      this.logger.log(`Đã dọn ${dead.length} đăng ký chết`);
    }

    return sent;
  }

  /** Gửi cho người ấy trong cùng couple. Trả 0 nếu chưa ghép đôi. */
  async sendToPartner(userId: string, payload: PushPayload): Promise<number> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { coupleId: true, couple: { select: { members: { select: { id: true } } } } },
    });
    const partnerId = me?.couple?.members.find((m) => m.id !== userId)?.id;
    if (!partnerId) return 0;
    return this.sendToUser(partnerId, payload);
  }
}
