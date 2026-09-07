import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  createPostSchema,
  feedQuerySchema,
  MAX_PHOTOS_PER_POST,
  MAX_UPLOAD_BYTES,
  reactionSchema,
  type CreatePostInput,
  type FeedQuery,
  type FeedResponse,
  type PostResponse,
  type ReactionEmoji,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { PostsService, type PhotoSize } from './posts.service';

const PHOTO_SIZES = new Set<PhotoSize>(['thumb', 'md', 'orig']);

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  /**
   * Tạo khoảnh khắc mới. Gửi dạng multipart: `photos[]` + các trường văn bản.
   *
   * Giới hạn dung lượng đặt ngay ở interceptor để tệp quá lớn bị chặn TRƯỚC khi
   * nạp hết vào bộ nhớ — không thì ai đó gửi tệp 2GB là tiến trình hết RAM.
   */
  @Post()
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @UseInterceptors(
    FilesInterceptor('photos', MAX_PHOTOS_PER_POST, {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_PHOTOS_PER_POST },
    }),
  )
  async create(
    @CurrentUserId() userId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body(new ZodBody(createPostSchema)) dto: CreatePostInput,
  ): Promise<PostResponse> {
    return this.posts.create(
      userId,
      dto,
      (files ?? []).map((f) => ({ buffer: f.buffer, mimetype: f.mimetype })),
    );
  }

  @Get()
  async feed(
    @CurrentUserId() userId: string,
    @Query(new ZodBody(feedQuerySchema)) query: FeedQuery,
  ): Promise<FeedResponse> {
    return this.posts.feed(userId, query);
  }

  /**
   * Truyền ảnh cho trình duyệt.
   *
   * Đặt TRƯỚC route `:id` — nếu để sau, Nest sẽ khớp "photos" vào `:id`
   * rồi ParseUUIDPipe báo lỗi.
   */
  @Get('photos/:photoId/:size')
  async photo(
    @CurrentUserId() userId: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @Param('size') size: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!PHOTO_SIZES.has(size as PhotoSize)) {
      throw new BadRequestException('Kích thước ảnh không hợp lệ');
    }

    const file = await this.posts.photoStream(userId, photoId, size as PhotoSize);

    res.setHeader('Content-Type', file.contentType);
    if (file.contentLength !== undefined) {
      res.setHeader('Content-Length', String(file.contentLength));
    }
    if (file.etag) res.setHeader('ETag', file.etag);
    // Ảnh có id riêng và không bao giờ đổi nội dung → cache vĩnh viễn.
    // `private` để proxy dùng chung không giữ lại ảnh riêng tư của người khác.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

    file.body.pipe(res);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.posts.remove(userId, id);
  }

  @Post(':id/reactions')
  @HttpCode(HttpStatus.OK)
  async react(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(reactionSchema)) dto: { emoji: ReactionEmoji },
  ): Promise<PostResponse> {
    return this.posts.react(userId, id, dto.emoji);
  }
}
