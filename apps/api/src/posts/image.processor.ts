import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ERROR_CODES } from '@beside/shared';
import { AppError } from '../common/errors/app-error';

export interface ProcessedImage {
  keyOrig: string;
  keyMd: string;
  keyThumb: string;
  width: number;
  height: number;
  /** Ảnh 20px nhúng thẳng dạng data URI, hiện lên trong lúc ảnh thật đang tải. */
  placeholder: string;
  files: { key: string; body: Buffer; contentType: string }[];
}

/** Kích thước cạnh dài nhất của từng mức. */
const SIZES = { orig: 2048, md: 1080, thumb: 320 } as const;

/** Ảnh mờ đặt chỗ: 20px là đủ để gợi màu mà data URI vẫn dưới 1KB. */
const PLACEHOLDER_SIZE = 20;

const ALLOWED_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'heif', 'avif', 'gif']);

/** Trần dung lượng một tệp. Client đã nén trước, đây là chốt chặn phía server. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Trần kích thước ảnh, chống "ảnh bom nén" (file nhỏ nhưng giải nén ra khổng lồ). */
const MAX_PIXELS = 60_000_000;

@Injectable()
export class ImageProcessor {
  private readonly logger = new Logger(ImageProcessor.name);

  /**
   * Nén ảnh thành 3 mức WebP + ảnh đặt chỗ.
   *
   * Hai điểm quan trọng về quyền riêng tư và hiển thị:
   *
   * 1. **Xoá sạch EXIF.** Ảnh chụp bằng điện thoại nhúng sẵn toạ độ GPS, model máy,
   *    số sê-ri. sharp mặc định KHÔNG giữ metadata (chỉ giữ khi gọi `.withMetadata()`),
   *    nên chỉ cần không gọi hàm đó. Toạ độ check-in được lưu riêng trong DB và chỉ
   *    khi người dùng bật "ghim lên bản đồ".
   *
   * 2. **Phải `.rotate()` TRƯỚC khi xoá EXIF.** Hướng ảnh nằm trong thẻ EXIF
   *    Orientation; xoá metadata mà chưa xoay thì ảnh dọc chụp bằng iPhone sẽ
   *    hiển thị nằm ngang. `.rotate()` không tham số = tự xoay theo EXIF rồi bỏ thẻ đó.
   */
  async process(file: { buffer: Buffer; mimetype: string }): Promise<ProcessedImage> {
    if (file.buffer.length === 0) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_FAILED, 'Tệp ảnh rỗng');
    }
    if (file.buffer.length > MAX_FILE_BYTES) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Ảnh quá lớn (tối đa ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB)`,
      );
    }

    // Đọc thông tin bằng chính sharp, KHÔNG tin mimetype client gửi lên —
    // đổi đuôi tệp là qua được mọi phép kiểm tra dựa trên tên.
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer).metadata();
    } catch {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Không đọc được tệp này — có phải ảnh không?',
      );
    }

    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Định dạng "${meta.format ?? 'không rõ'}" không được hỗ trợ`,
      );
    }
    if (!meta.width || !meta.height) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_FAILED, 'Ảnh không có kích thước');
    }
    if (meta.width * meta.height > MAX_PIXELS) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Ảnh có độ phân giải quá lớn',
      );
    }

    // Kích thước SAU khi xoay theo EXIF — đây mới là kích thước người dùng nhìn thấy.
    const rotated = meta.orientation !== undefined && meta.orientation >= 5;
    const displayWidth = rotated ? meta.height : meta.width;
    const displayHeight = rotated ? meta.width : meta.height;

    const id = randomUUID();
    const [orig, md, thumb, placeholderBuf] = await Promise.all([
      this.resize(file.buffer, SIZES.orig, 82),
      this.resize(file.buffer, SIZES.md, 78),
      this.resize(file.buffer, SIZES.thumb, 70),
      this.resize(file.buffer, PLACEHOLDER_SIZE, 40),
    ]);

    return {
      keyOrig: `photos/${id}/orig.webp`,
      keyMd: `photos/${id}/md.webp`,
      keyThumb: `photos/${id}/thumb.webp`,
      width: displayWidth,
      height: displayHeight,
      placeholder: `data:image/webp;base64,${placeholderBuf.toString('base64')}`,
      files: [
        { key: `photos/${id}/orig.webp`, body: orig, contentType: 'image/webp' },
        { key: `photos/${id}/md.webp`, body: md, contentType: 'image/webp' },
        { key: `photos/${id}/thumb.webp`, body: thumb, contentType: 'image/webp' },
      ],
    };
  }

  private async resize(input: Buffer, maxEdge: number, quality: number): Promise<Buffer> {
    return (
      sharp(input)
        // Tự xoay theo EXIF rồi bỏ thẻ Orientation. PHẢI đứng trước resize.
        .rotate()
        .resize({
          width: maxEdge,
          height: maxEdge,
          fit: 'inside',
          // Ảnh nhỏ hơn mức đích thì giữ nguyên, không phóng to cho vỡ hạt.
          withoutEnlargement: true,
        })
        // Không gọi .withMetadata() → toàn bộ EXIF (kể cả GPS) bị loại bỏ.
        .webp({ quality, effort: 4 })
        .toBuffer()
    );
  }
}
