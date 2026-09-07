import { Injectable, Logger } from '@nestjs/common';
import { LocSource, Prisma, type Photo, type Post, type User } from '@prisma/client';
import {
  ERROR_CODES,
  MAX_PHOTOS_PER_POST,
  type CreatePostInput,
  type FeedQuery,
  type FeedResponse,
  type PhotoResponse,
  type PostReaction,
  type PostResponse,
  type ReactionEmoji,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';
import { ImageProcessor } from './image.processor';

type PostWithRelations = Post & { photos: Photo[]; author: Pick<User, 'id' | 'displayName'> };

/** Tiền tố đường dẫn ảnh. Khớp với route trong PostsController. */
const PHOTO_URL_PREFIX = '/api/v1/posts/photos';

export type PhotoSize = 'thumb' | 'md' | 'orig';

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly images: ImageProcessor,
    private readonly locations: LocationsService,
  ) {}

  // ------------------------------------------------------------------

  async create(
    userId: string,
    input: CreatePostInput,
    files: UploadedImage[],
  ): Promise<PostResponse> {
    const ctx = await this.locations.getContext(userId);

    if (files.length === 0) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Cần ít nhất một tấm ảnh cho khoảnh khắc này',
      );
    }
    if (files.length > MAX_PHOTOS_PER_POST) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Tối đa ${MAX_PHOTOS_PER_POST} ảnh mỗi lần`,
      );
    }
    if (!this.storage.available) {
      throw AppError.conflict(
        ERROR_CODES.INTERNAL,
        'Kho ảnh chưa sẵn sàng, thử lại sau ít phút',
      );
    }

    // Toạ độ chỉ đi kèm khi người dùng bật "ghim lên bản đồ" (client gửi hoặc không).
    // Nhưng nếu họ đang bật CHẾ ĐỘ ẨN DANH thì không được ghim, kể cả khi client gửi —
    // ẩn danh nghĩa là không để lại dấu vết vị trí nào.
    const pinned = input.lat !== undefined && input.lng !== undefined && !ctx.privacy.ghostMode;

    // Nén ảnh TRƯỚC khi mở giao dịch DB: xử lý ảnh mất vài trăm ms, giữ giao dịch
    // mở suốt thời gian đó là giam kết nối vô ích.
    const processed = await Promise.all(files.map((f) => this.images.process(f)));

    // Tải lên trước, ghi DB sau. Nếu tải hỏng thì chưa có bản ghi nào —
    // thà không có bài còn hơn có bài trỏ tới ảnh không tồn tại.
    const uploaded: string[] = [];
    try {
      for (const img of processed) {
        for (const file of img.files) {
          await this.storage.put(file.key, file.body, file.contentType);
          uploaded.push(file.key);
        }
      }
    } catch (err) {
      await this.storage.deleteMany(uploaded);
      this.logger.error(`Tải ảnh thất bại: ${(err as Error).message}`);
      throw AppError.conflict(ERROR_CODES.INTERNAL, 'Không tải được ảnh lên, thử lại nhé');
    }

    const post = await this.prisma.post.create({
      data: {
        coupleId: ctx.coupleId,
        authorId: userId,
        caption: input.caption ?? null,
        mood: input.mood ?? null,
        lat: pinned ? input.lat! : null,
        lng: pinned ? input.lng! : null,
        placeName: pinned ? (input.placeName ?? null) : null,
        photos: {
          create: processed.map((img, i) => ({
            keyOrig: img.keyOrig,
            keyMd: img.keyMd,
            keyThumb: img.keyThumb,
            width: img.width,
            height: img.height,
            placeholder: img.placeholder,
            sortOrder: i,
          })),
        },
      },
      include: { photos: true, author: { select: { id: true, displayName: true } } },
    });

    // Ghim lên bản đồ = một điểm vị trí nguồn CHECKIN. Đi qua đúng LocationsService
    // để cùng chịu mọi luật riêng tư, không ghi thẳng vào bảng.
    if (pinned) {
      await this.locations.ingest(
        ctx,
        {
          lat: input.lat!,
          lng: input.lng!,
          accuracyM: 30,
          ts: post.createdAt.getTime(),
        },
        LocSource.CHECKIN,
      );
    }

    return this.toResponse(post, userId);
  }

  // ------------------------------------------------------------------

  async feed(userId: string, query: FeedQuery): Promise<FeedResponse> {
    const ctx = await this.locations.getContext(userId);

    /*
     * Phân trang bằng CON TRỎ, không dùng offset.
     *
     * Với offset, chỉ cần có một bài mới được đăng giữa lúc người dùng cuộn là
     * mọi bài bị đẩy xuống một bậc — trang sau sẽ lặp lại bài đã thấy.
     * Con trỏ neo vào (createdAt, id) của bài cuối trang trước nên không bị lệch.
     * Kèm cả `id` vì hai bài có thể trùng mili-giây.
     */
    const cursor = this.parseCursor(query.cursor);

    const rows = await this.prisma.post.findMany({
      where: {
        coupleId: ctx.coupleId,
        ...(query.authorId ? { authorId: query.authorId } : {}),
        ...(query.pinned ? { lat: { not: null } } : {}),
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
      // Lấy dư một bài để biết còn trang sau hay không, mà không cần đếm tổng.
      take: query.limit + 1,
      include: { photos: true, author: { select: { id: true, displayName: true } } },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: await Promise.all(page.map((p) => this.toResponse(p, userId))),
      nextCursor: hasMore && last ? `${last.createdAt.getTime()}_${last.id}` : null,
    };
  }

  private parseCursor(raw?: string): { createdAt: Date; id: string } | null {
    if (!raw) return null;
    const idx = raw.indexOf('_');
    if (idx <= 0) return null;
    const ms = Number(raw.slice(0, idx));
    const id = raw.slice(idx + 1);
    // Con trỏ hỏng thì coi như không có, trả về trang đầu — không ném lỗi,
    // vì người dùng chẳng làm gì sai và cũng không sửa được.
    if (!Number.isFinite(ms) || !id) return null;
    return { createdAt: new Date(ms), id };
  }

  // ------------------------------------------------------------------

  async remove(userId: string, postId: string): Promise<void> {
    const ctx = await this.locations.getContext(userId);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { photos: true },
    });

    // Cùng một câu trả lời cho "không tồn tại" và "không thuộc couple của bạn" —
    // không để ai dò được id nào có thật.
    if (!post || post.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy khoảnh khắc này');
    }
    if (post.authorId !== userId) {
      throw AppError.forbidden(
        ERROR_CODES.FORBIDDEN,
        'Chỉ người đăng mới xoá được khoảnh khắc này',
      );
    }

    const keys = post.photos.flatMap((p) => [p.keyOrig, p.keyMd, p.keyThumb]);

    // Xoá DB trước: nếu xoá tệp hỏng thì chỉ còn tệp mồ côi (tốn ổ đĩa),
    // còn nếu làm ngược lại mà DB xoá hỏng thì bài vẫn hiện nhưng ảnh vỡ hết.
    await this.prisma.post.delete({ where: { id: postId } });
    await this.storage.deleteMany(keys);
  }

  // ------------------------------------------------------------------

  async react(userId: string, postId: string, emoji: ReactionEmoji): Promise<PostResponse> {
    const ctx = await this.locations.getContext(userId);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { photos: true, author: { select: { id: true, displayName: true } } },
    });
    if (!post || post.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy khoảnh khắc này');
    }

    const current = this.parseReactions(post.reactions);
    const mine = current.find((r) => r.userId === userId);

    // Bấm lại đúng emoji đang chọn = bỏ thả cảm xúc. Mỗi người chỉ giữ MỘT emoji.
    const next =
      mine?.emoji === emoji
        ? current.filter((r) => r.userId !== userId)
        : [...current.filter((r) => r.userId !== userId), { userId, emoji, at: Date.now() }];

    const updated = await this.prisma.post.update({
      where: { id: postId },
      // Prisma cần ép kiểu tường minh cho cột Json; mảng thuần không khớp
      // InputJsonValue dù nội dung hoàn toàn hợp lệ.
      data: { reactions: next as unknown as Prisma.InputJsonValue },
      include: { photos: true, author: { select: { id: true, displayName: true } } },
    });

    return this.toResponse(updated, userId);
  }

  private parseReactions(raw: unknown): PostReaction[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (r): r is PostReaction =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as PostReaction).userId === 'string' &&
        typeof (r as PostReaction).emoji === 'string',
    );
  }

  /**
   * Lấy tệp ảnh để truyền cho trình duyệt.
   *
   * Kiểm tra quyền ở ĐÂY, không dựa vào việc URL khó đoán: ảnh chỉ mở cho người
   * thuộc đúng couple sở hữu bài viết.
   */
  async photoStream(userId: string, photoId: string, size: PhotoSize) {
    const ctx = await this.locations.getContext(userId);

    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { post: { select: { coupleId: true } } },
    });
    if (!photo || photo.post.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy ảnh này');
    }

    const key =
      size === 'thumb' ? photo.keyThumb : size === 'md' ? photo.keyMd : photo.keyOrig;
    const file = await this.storage.getStream(key);
    if (!file) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy ảnh này');
    }
    return file;
  }

  // ------------------------------------------------------------------

  private async toResponse(post: PostWithRelations, viewerId: string): Promise<PostResponse> {
    // Đường dẫn TƯƠNG ĐỐI, đi qua API. Không phụ thuộc domain nên đổi tên miền
    // không cần sửa gì; và mỗi lượt xem đều bị kiểm tra quyền thật.
    const photos: PhotoResponse[] = [...post.photos]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({
        id: p.id,
        urlThumb: `${PHOTO_URL_PREFIX}/${p.id}/thumb`,
        urlMd: `${PHOTO_URL_PREFIX}/${p.id}/md`,
        urlOrig: `${PHOTO_URL_PREFIX}/${p.id}/orig`,
        width: p.width,
        height: p.height,
        placeholder: p.placeholder,
      }));

    return {
      id: post.id,
      authorId: post.authorId,
      authorName: post.author.displayName,
      caption: post.caption,
      mood: post.mood,
      lat: post.lat,
      lng: post.lng,
      placeName: post.placeName,
      photos,
      reactions: this.parseReactions(post.reactions),
      createdAt: post.createdAt.toISOString(),
      canDelete: post.authorId === viewerId,
    };
  }
}
