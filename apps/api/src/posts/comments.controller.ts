import {
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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  commentQuerySchema,
  createCommentSchema,
  type CommentListResponse,
  type CommentQuery,
  type CommentResponse,
  type CreateCommentInput,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { CommentsService } from './comments.service';

/**
 * Bình luận trong một khoảnh khắc.
 *
 * Tách khỏi `PostsController` vì tiền tố đường dẫn khác nhau. Không đụng vào
 * route `posts/photos/:photoId/:size`: đường dẫn ở đây luôn có 3–4 đoạn với
 * đoạn thứ ba cố định là "comments", còn `postId` bị `ParseUUIDPipe` chặn nên
 * "photos" không bao giờ lọt vào được.
 */
@Controller('posts/:postId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /**
   * Trần 120 lần/giờ: rộng rãi cho người thật gõ tay, nhưng chặn được một vòng
   * lặp hỏng ở client trước khi nó kịp bơm đầy bảng.
   */
  @Post()
  @Throttle({ default: { limit: 120, ttl: 3_600_000 } })
  async create(
    @CurrentUserId() userId: string,
    @Param('postId', new ParseUUIDPipe()) postId: string,
    @Body(new ZodBody(createCommentSchema)) dto: CreateCommentInput,
  ): Promise<CommentResponse> {
    return this.comments.create(userId, postId, dto);
  }

  @Get()
  async list(
    @CurrentUserId() userId: string,
    @Param('postId', new ParseUUIDPipe()) postId: string,
    @Query(new ZodBody(commentQuerySchema)) query: CommentQuery,
  ): Promise<CommentListResponse> {
    return this.comments.list(userId, postId, query);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('postId', new ParseUUIDPipe()) postId: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
  ): Promise<void> {
    await this.comments.remove(userId, postId, commentId);
  }
}
