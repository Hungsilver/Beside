import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { Env } from '../../config/env';

/**
 * Lưu ảnh check-in vào MinIO (tương thích S3).
 *
 * Ảnh KHÔNG được phơi công khai và cũng KHÔNG dùng link ký sẵn (presigned URL).
 * API tự đọc rồi truyền lại cho trình duyệt, sau khi đã kiểm tra người xem
 * thuộc đúng couple.
 *
 * Vì sao bỏ link ký sẵn — đã thử và hỏng:
 *   1. Chữ ký S3 phủ cả tên host. Trong Docker, API nói chuyện với MinIO qua
 *      `http://minio:9000`, nhưng trình duyệt không phân giải được tên đó.
 *      Ký bằng host công khai rồi để Caddy chuyển tiếp thì đường dẫn lệch,
 *      chữ ký hỏng ngay.
 *   2. Link ký sẵn là "ai có link thì xem được" — không phải phân quyền thật.
 *      Link lọt ra ngoài rất dễ (lịch sử trình duyệt, chia sẻ nhầm màn hình).
 *   3. Link đổi mỗi giờ nên trình duyệt không cache được ảnh.
 *
 * Truyền qua API thì URL cố định (cache vĩnh viễn được), và mỗi lượt xem đều
 * bị kiểm tra quyền thật. Với quy mô 2 người, chi phí băng thông không đáng kể.
 *
 * Dùng SDK S3 chuẩn thay vì thư viện riêng của MinIO: sau này muốn chuyển sang
 * S3 thật hay Cloudflare R2 thì chỉ đổi biến môi trường, không sửa code.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private ready = false;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit(): Promise<void> {
    const endpoint = this.config.get('S3_ENDPOINT', { infer: true });
    this.bucket = this.config.get('S3_BUCKET', { infer: true });

    this.client = new S3Client({
      endpoint,
      region: 'us-east-1', // MinIO không dùng region, nhưng SDK bắt buộc phải có
      // MinIO chỉ hiểu kiểu địa chỉ path (endpoint/bucket/key), không hiểu
      // kiểu subdomain (bucket.endpoint) như S3 thật.
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get('MINIO_ROOT_USER', { infer: true }),
        secretAccessKey: this.config.get('MINIO_ROOT_PASSWORD', { infer: true }),
      },
    });

    await this.ensureBucket();
  }

  /** Tạo bucket nếu chưa có, để không phải chạy thêm container khởi tạo. */
  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.ready = true;
      this.logger.log(`Bucket "${this.bucket}" đã sẵn sàng`);
      return;
    } catch {
      /* chưa có — tạo bên dưới */
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.ready = true;
      this.logger.log(`Đã tạo bucket "${this.bucket}"`);
    } catch (err) {
      // Không làm sập app: mọi tính năng khác vẫn chạy, chỉ check-in ảnh là hỏng.
      this.logger.error(
        `Không chuẩn bị được bucket "${this.bucket}": ${(err as Error).message}`,
      );
    }
  }

  get available(): boolean {
    return this.ready;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Ảnh đã có hash trong tên nên nội dung không bao giờ đổi.
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
  }

  /** Đọc một tệp về dạng luồng, để truyền thẳng cho trình duyệt. */
  async getStream(
    key: string,
  ): Promise<{ body: Readable; contentType: string; contentLength?: number; etag?: string } | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) return null;
      return {
        body: res.Body as Readable,
        contentType: res.ContentType ?? 'application/octet-stream',
        ...(res.ContentLength !== undefined ? { contentLength: res.ContentLength } : {}),
        ...(res.ETag ? { etag: res.ETag } : {}),
      };
    } catch {
      // Tệp không có (đã xoá, hoặc key sai) — để tầng trên trả 404.
      return null;
    }
  }

  /** Xoá nhiều tệp một lần. Dùng khi xoá bài check-in. */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    } catch (err) {
      // Bản ghi trong DB đã xoá rồi; tệp mồ côi trong MinIO không ảnh hưởng
      // người dùng, chỉ tốn dung lượng. Ghi log để còn dọn sau.
      this.logger.error(
        `Không xoá được ${keys.length} tệp: ${(err as Error).message}. Tệp mồ côi: ${keys.join(', ')}`,
      );
    }
  }
}
