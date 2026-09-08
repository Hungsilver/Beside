import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  type PushConfigResponse,
  type PushSubscribeInput,
  type PushSubscriptionSummary,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { Public } from '../auth/jwt-auth.guard';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /**
   * Khoá công khai VAPID.
   *
   * Trả qua API chứ KHÔNG nhúng vào bản build web: web là file tĩnh, nhúng vào
   * nghĩa là mỗi môi trường phải build lại một bản riêng. Khoá này công khai
   * theo đúng thiết kế của Web Push nên phơi ra là an toàn.
   */
  @Get('public-key')
  @Public()
  config(): PushConfigResponse {
    return { publicKey: this.push.getPublicKey(), enabled: this.push.isEnabled() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(pushSubscribeSchema)) dto: PushSubscribeInput,
  ): Promise<void> {
    await this.push.subscribe(userId, dto);
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(pushUnsubscribeSchema)) dto: { endpoint: string },
  ): Promise<void> {
    await this.push.unsubscribe(userId, dto.endpoint);
  }

  @Get('devices')
  async devices(
    @CurrentUserId() userId: string,
    @Query('endpoint') endpoint?: string,
  ): Promise<PushSubscriptionSummary[]> {
    return this.push.listForUser(userId, endpoint);
  }

  /** Gửi thử để người dùng tự kiểm tra đã bật đúng chưa. */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async test(@CurrentUserId() userId: string): Promise<{ sent: number }> {
    const sent = await this.push.sendToUser(userId, {
      kind: 'TEST',
      title: 'Beside',
      body: 'Thông báo đã bật đúng rồi 💕',
      url: '/cai-dat',
      tag: 'test',
      at: Date.now(),
    });
    return { sent };
  }
}
