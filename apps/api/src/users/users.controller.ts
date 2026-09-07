import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  updatePrivacySchema,
  updateProfileSchema,
  type Privacy,
  type SelfUser,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { UsersService, type UpdateProfileData } from './users.service';

/**
 * Hồ sơ của chính người đang đăng nhập.
 * Không có endpoint đọc/sửa hồ sơ người khác — người ấy chỉ hiện ra
 * qua `GET /couples/me` (trường `partner`).
 */
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async findMe(@CurrentUserId() userId: string): Promise<SelfUser> {
    return this.users.findMe(userId);
  }

  @Patch()
  async updateProfile(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(updateProfileSchema)) dto: UpdateProfileData,
  ): Promise<SelfUser> {
    return this.users.updateProfile(userId, dto);
  }

  /** Quyền riêng tư (F8): chế độ ẩn danh, chia sẻ trực tiếp, làm mờ vị trí. */
  @Patch('privacy')
  async updatePrivacy(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(updatePrivacySchema)) dto: Partial<Privacy>,
  ): Promise<SelfUser> {
    return this.users.updatePrivacy(userId, dto);
  }
}
