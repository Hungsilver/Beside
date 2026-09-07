import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  createCoupleSchema,
  ERROR_CODES,
  joinCoupleSchema,
  updateCoupleSchema,
  type CoupleResponse,
  type LoveSummary,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { AppError } from '../common/errors/app-error';
import { CurrentUserId } from '../auth/current-user.decorator';
import { CouplesService } from './couples.service';

/** Huỷ ghép đôi là thao tác không thể hoàn tác → bắt buộc xác nhận tường minh. */
const unpairSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Cần xác nhận trước khi huỷ ghép đôi' }),
  }),
});

@Controller('couples')
export class CouplesController {
  constructor(private readonly couples: CouplesService) {}

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(createCoupleSchema)) dto: { anniversaryAt: Date },
  ): Promise<CoupleResponse> {
    return this.couples.create(userId, dto.anniversaryAt);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  // Chặn dò mã ghép đôi bằng cách thử hàng loạt: 10 lần / 10 phút.
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async join(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(joinCoupleSchema)) dto: { inviteCode: string },
  ): Promise<CoupleResponse> {
    return this.couples.join(userId, dto.inviteCode);
  }

  @Get('me')
  async findMine(@CurrentUserId() userId: string): Promise<CoupleResponse> {
    return this.couples.findMine(userId);
  }

  @Patch('me')
  async update(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(updateCoupleSchema)) dto: { anniversaryAt?: Date },
  ): Promise<CoupleResponse> {
    if (!dto.anniversaryAt) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Không có thay đổi nào để cập nhật',
      );
    }
    return this.couples.updateAnniversary(userId, dto.anniversaryAt);
  }

  @Post('me/invite')
  @HttpCode(HttpStatus.OK)
  async regenerateInvite(
    @CurrentUserId() userId: string,
  ): Promise<CoupleResponse> {
    return this.couples.regenerateInvite(userId);
  }

  @Get('me/love-summary')
  async loveSummary(@CurrentUserId() userId: string): Promise<LoveSummary> {
    return this.couples.loveSummary(userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unpair(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(unpairSchema)) _dto: { confirm: true },
  ): Promise<void> {
    await this.couples.unpair(userId);
  }
}
