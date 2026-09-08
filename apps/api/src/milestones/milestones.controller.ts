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
} from '@nestjs/common';
import {
  createMilestoneSchema,
  type CreateMilestoneInput,
  type MilestoneItem,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { MilestonesService } from './milestones.service';

@Controller('milestones')
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  /**
   * Mốc sắp tới — trộn mốc tự sinh (ngày yêu, sinh nhật) với mốc tự thêm.
   *
   * Ghi/sửa/xoá đều trả về LẠI cả danh sách: thêm một mốc có thể chen vào giữa
   * và đổi thứ tự mọi thứ, nên client nhận nguyên danh sách mới là gọn nhất.
   */
  @Get()
  async upcoming(@CurrentUserId() userId: string): Promise<MilestoneItem[]> {
    return this.milestones.upcoming(userId);
  }

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(createMilestoneSchema)) dto: CreateMilestoneInput,
  ): Promise<MilestoneItem[]> {
    return this.milestones.create(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(createMilestoneSchema)) dto: CreateMilestoneInput,
  ): Promise<MilestoneItem[]> {
    return this.milestones.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.milestones.remove(userId, id);
  }
}
