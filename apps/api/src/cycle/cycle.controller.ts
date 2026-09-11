import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  cycleSettingsSchema,
  periodEntrySchema,
  type CyclePartnerResponse,
  type CycleSelfResponse,
  type CycleSettingsInput,
  type PeriodEntryInput,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { CycleService } from './cycle.service';

/**
 * F14 — chu kỳ kinh nguyệt.
 *
 * Mọi endpoint ở đây thao tác trên dữ liệu của CHÍNH người gọi, trừ
 * `GET /cycle/partner` — và đường đó chỉ trả về phần người kia đã đồng ý chia sẻ.
 */
@Controller('cycle')
export class CycleController {
  constructor(private readonly cycle: CycleService) {}

  @Get('me')
  async me(@CurrentUserId() userId: string): Promise<CycleSelfResponse> {
    return this.cycle.me(userId);
  }

  @Put('settings')
  async saveSettings(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(cycleSettingsSchema)) dto: CycleSettingsInput,
  ): Promise<CycleSelfResponse> {
    return this.cycle.saveSettings(userId, dto);
  }

  @Post('periods')
  async add(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(periodEntrySchema)) dto: PeriodEntryInput,
  ): Promise<CycleSelfResponse> {
    return this.cycle.addEntry(userId, dto);
  }

  @Patch('periods/:id')
  async update(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(periodEntrySchema)) dto: PeriodEntryInput,
  ): Promise<CycleSelfResponse> {
    return this.cycle.updateEntry(userId, id, dto);
  }

  @Delete('periods/:id')
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CycleSelfResponse> {
    return this.cycle.removeEntry(userId, id);
  }

  /** Xoá sạch dữ liệu chu kỳ. Không hoàn tác được. */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async wipe(@CurrentUserId() userId: string): Promise<void> {
    await this.cycle.wipe(userId);
  }

  @Get('partner')
  async partner(@CurrentUserId() userId: string): Promise<CyclePartnerResponse> {
    return this.cycle.forPartner(userId);
  }
}
