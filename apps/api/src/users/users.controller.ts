import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  updatePrivacySchema,
  updateProfileSchema,
  type Privacy,
  type SelfUser,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { UsersService, type UpdateProfileData } from './users.service';
import { MAX_FILE_BYTES, type AvatarSize } from '../posts/image.processor';

const AVATAR_SIZES = new Set<AvatarSize>(['md', 'thumb']);

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

  /**
   * Đổi ảnh đại diện. Gửi dạng multipart, trường `avatar`.
   *
   * Trần dung lượng đặt ngay ở interceptor để tệp quá lớn bị chặn TRƯỚC khi nạp
   * hết vào RAM — giống hệt lý do ở phần đăng ảnh check-in.
   */
  @Post('avatar')
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @UseInterceptors(
    FileInterceptor('avatar', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }),
  )
  async setAvatar(
    @CurrentUserId() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<SelfUser> {
    if (!file) throw new BadRequestException('Chưa chọn ảnh nào');
    return this.users.setAvatar(userId, { buffer: file.buffer, mimetype: file.mimetype });
  }

  @Delete('avatar')
  async removeAvatar(@CurrentUserId() userId: string): Promise<SelfUser> {
    return this.users.removeAvatar(userId);
  }
}

/**
 * Ảnh đại diện phải đọc được của CẢ người ấy, nên đường dẫn mang id người dùng
 * và không nằm dưới `/me` được. Quyền vẫn kiểm ở tầng service (R3).
 */
@Controller('users')
export class AvatarController {
  constructor(private readonly users: UsersService) {}

  @Get(':userId/avatar/:size')
  async avatar(
    @CurrentUserId() viewerId: string,
    @Param('userId', new ParseUUIDPipe()) ownerId: string,
    @Param('size') size: string,
    @Query('v') version: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!AVATAR_SIZES.has(size as AvatarSize)) {
      throw new BadRequestException('Kích thước ảnh không hợp lệ');
    }

    const file = await this.users.avatarStream(
      viewerId,
      ownerId,
      size as AvatarSize,
      version,
    );

    res.setHeader('Content-Type', file.contentType);
    if (file.contentLength !== undefined) {
      res.setHeader('Content-Length', String(file.contentLength));
    }
    if (file.etag) res.setHeader('ETag', file.etag);
    // URL đã mang `?v=<avatarId>` nên nội dung ứng với URL này không bao giờ đổi.
    // `private` để proxy dùng chung không giữ lại ảnh riêng tư của người khác.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

    file.body.pipe(res);
  }
}
