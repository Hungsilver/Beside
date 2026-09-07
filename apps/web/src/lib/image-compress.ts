import { CLIENT_MAX_EDGE } from '@beside/shared';

/**
 * Nén ảnh NGAY TRÊN MÁY trước khi tải lên.
 *
 * Ảnh gốc từ điện thoại thường 4–12MB. Gửi thẳng lên qua mạng di động vừa lâu
 * vừa tốn data của người dùng, mà server cũng nén lại xuống 2048px ngay sau đó.
 * Nén trước ở client giảm khoảng 90% dung lượng truyền.
 *
 * Đây KHÔNG phải biện pháp bảo mật — server vẫn tự kiểm tra và tự nén lại,
 * vì client có thể bị bỏ qua.
 */
export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
}

export async function compressImage(
  file: File,
  maxEdge: number = CLIENT_MAX_EDGE,
): Promise<CompressResult> {
  const bitmap = await loadBitmap(file);

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không dựng được canvas');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    );
    if (!blob) throw new Error('Không nén được ảnh');

    return {
      blob,
      width,
      height,
      originalBytes: file.size,
      compressedBytes: blob.size,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Đọc ảnh thành bitmap, ĐÃ xoay theo thẻ EXIF.
 *
 * `imageOrientation: 'from-image'` là mấu chốt: không có nó thì ảnh dọc chụp
 * bằng iPhone sẽ bị vẽ nằm ngang lên canvas, và vì canvas không giữ EXIF nên
 * ảnh gửi lên server đã sai hướng vĩnh viễn — server có xoay lại cũng vô ích.
 */
async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Không đọc được ảnh này');
  }
}

/** Chuỗi dung lượng dễ đọc, dùng để báo cho người dùng biết đã tiết kiệm bao nhiêu. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
