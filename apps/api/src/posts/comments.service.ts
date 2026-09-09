import { Injectable } from '@nestjs/common';
import type { Comment, User } from '@prisma/client';
import {
  ERROR_CODES,
  MAX_COMMENTS_PER_POST,
  type CommentListResponse,
  type CommentQuery,
  type CommentResponse,
  type CreateCommentInput,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';
import { PushService } from '../push/push.service';

type CommentWithAuthor = Comment & { author: Pick<User, 'id' | 'displayName'> };

const AUTHOR_SELECT = { select: { id: true, displayName: true } } as const;

/**
 * Bình luận trong một khoảnh khắc.
 *
 * Mọi đường vào đều phải đi qua `loadPost()` — kiểm tra quyền theo `coupleId`
 * ở TẦNG SERVICE (R3), không phải ở controller. Bình luận nằm dưới ảnh check-in,
 * là dữ liệu riêng tư của đúng một cặp đôi.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly push: PushService,
  ) {}

  // ------------------------------------------------------------------

  async create(
    userId: string,
    postId: string,
    input: CreateCommentInput,
  ): Promise<CommentResponse> {
    const { ctx, post } = await this.loadPost(userId, postId);

    /*
     * Trần số bình luận mỗi bài. Hai người thì không bao giờ chạm tới, nhưng
     * một vòng lặp hỏng ở client thì có — và không có trần thì nó bơm được
     * vô hạn dòng vào DB trước khi ai kịp nhận ra.
     *
     * Đếm rồi mới ghi nên về lý thuyết hai request song song có thể cùng lọt
     * qua ở đúng dòng thứ 300. Chấp nhận: sai lệch tối đa một dòng, không đáng
     * để đánh đổi bằng một khoá ghi.
     */
    const count = await this.prisma.comment.count({ where: { postId } });
    if (count >= MAX_COMMENTS_PER_POST) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `Khoảnh khắc này đã có ${MAX_COMMENTS_PER_POST} bình luận rồi`,
      );
    }

    const comment = await this.prisma.comment.create({
      data: { postId, authorId: userId, body: input.body },
      include: { author: AUTHOR_SELECT },
    });

    /*
     * Chỉ báo cho người ấy khi họ có liên quan thật: hoặc bài là của họ, hoặc
     * họ đã từng bình luận trong bài đó. Vừa đăng ảnh xong rồi tự chú thích
     * thêm một câu dưới bài của chính mình mà bắn thông báo đi là làm phiền
     * vô cớ — người ấy còn chưa kịp mở bài ra xem.
     */
    const partnerCares =
      post.authorId !== userId ||
      (ctx.partnerId !== null &&
        (await this.prisma.comment.count({
          where: { postId, authorId: ctx.partnerId },
        })) > 0);

    // Cố tình KHÔNG await — thông báo hỏng không được làm hỏng việc chính.
    if (partnerCares) {
      void this.push.sendToPartner(userId, {
        kind: 'PARTNER_COMMENT',
        title: `${comment.author.displayName} vừa bình luận`,
        body: input.body.slice(0, 120),
        url: '/ky-niem',
        // Gộp theo BÀI chứ không theo bình luận: gõ liền ba câu thì trong khay
        // chỉ còn một thông báo mới nhất, không phải ba cái xếp chồng.
        tag: `comment:${postId}`,
        at: Date.now(),
      });
    }

    return this.toResponse(comment, userId, post.authorId);
  }

  // ------------------------------------------------------------------

  async list(
    userId: string,
    postId: string,
    query: CommentQuery,
  ): Promise<CommentListResponse> {
    const { post } = await this.loadPost(userId, postId);

    /*
     * Trả về MỚI → CŨ, rồi client đảo lại khi vẽ.
     *
     * Nhìn thì ngược đời vì bình luận đọc như hội thoại (câu trước nằm trên
     * câu sau), nhưng sắp xếp cũ → mới ở đây thì trang đầu là những dòng CŨ
     * NHẤT — bài đã có 25 bình luận, viết thêm một câu, câu đó rơi vào trang
     * thứ hai và người vừa gõ không thấy nó đâu cả. Lấy trang mới nhất trước,
     * "xem thêm" nạp dần lên phía trên, giống mọi khung bình luận khác.
     *
     * Phân trang bằng con trỏ (createdAt, id) như dòng kỷ niệm: thêm một dòng
     * giữa lúc người dùng đang cuộn thì offset sẽ làm trang sau lặp lại dòng
     * đã thấy.
     */
    const cursor = parseCursor(query.cursor);

    const rows = await this.prisma.comment.findMany({
      where: {
        postId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // Lấy dư một dòng để biết còn trang sau hay không, khỏi phải đếm tổng.
      take: query.limit + 1,
      include: { author: AUTHOR_SELECT },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    const total = await this.prisma.comment.count({ where: { postId } });

    return {
      items: page.map((c) => this.toResponse(c, userId, post.authorId)),
      nextCursor: hasMore && last ? `${last.createdAt.getTime()}_${last.id}` : null,
      total,
    };
  }

  // ------------------------------------------------------------------

  async remove(userId: string, postId: string, commentId: string): Promise<void> {
    const { post } = await this.loadPost(userId, postId);

    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });

    // Cùng một câu trả lời cho "không tồn tại" và "thuộc bài khác" — không để
    // ai dò được id nào có thật.
    if (!comment || comment.postId !== postId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy bình luận này');
    }
    if (!canDelete(comment.authorId, post.authorId, userId)) {
      throw AppError.forbidden(
        ERROR_CODES.FORBIDDEN,
        'Chỉ người viết hoặc chủ khoảnh khắc mới xoá được bình luận này',
      );
    }

    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  // ------------------------------------------------------------------

  /**
   * Lấy bài viết cha và chốt quyền truy cập.
   *
   * "Bài không tồn tại" và "bài của cặp đôi khác" trả về CÙNG một lỗi 404:
   * phân biệt hai trường hợp là để lộ ra rằng một id có thật trong hệ thống.
   */
  private async loadPost(userId: string, postId: string) {
    const ctx = await this.locations.getContext(userId);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, coupleId: true, authorId: true },
    });
    if (!post || post.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy khoảnh khắc này');
    }

    return { ctx, post };
  }

  private toResponse(
    comment: CommentWithAuthor,
    viewerId: string,
    postAuthorId: string,
  ): CommentResponse {
    return {
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      authorName: comment.author.displayName,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      canDelete: canDelete(comment.authorId, postAuthorId, viewerId),
    };
  }
}

/**
 * Chủ khoảnh khắc cũng xoá được bình luận trong bài của mình, không chỉ người
 * viết ra nó — bài là của họ, họ phải dọn được phần hiện dưới ảnh của mình.
 */
function canDelete(commentAuthorId: string, postAuthorId: string, viewerId: string): boolean {
  return commentAuthorId === viewerId || postAuthorId === viewerId;
}

function parseCursor(raw?: string): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf('_');
  if (idx <= 0) return null;
  const ms = Number(raw.slice(0, idx));
  const id = raw.slice(idx + 1);
  // Con trỏ hỏng thì coi như không có, trả về trang đầu — người dùng chẳng làm
  // gì sai và cũng không sửa được, ném lỗi ra chỉ làm màn hình trắng.
  if (!Number.isFinite(ms) || !id) return null;
  return { createdAt: new Date(ms), id };
}
