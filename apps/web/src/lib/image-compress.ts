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

/** Vùng cắt, tính bằng pixel trên ẢNH GỐC (đã xoay theo EXIF). */
export interface CropRegion {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Chất lượng WebP. 0.85 gần như không phân biệt được bằng mắt ở cỡ điện thoại. */
const WEBP_QUALITY = 0.85;

export async function compressImage(
  file: File,
  maxEdge: number = CLIENT_MAX_EDGE,
): Promise<CompressResult> {
  const bitmap = await loadBitmap(file);

  try {
    return await renderRegion(
      bitmap,
      { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height },
      file.size,
      maxEdge,
    );
  } finally {
    bitmap.close();
  }
}

/**
 * Cắt một vùng của ảnh rồi nén — dùng cho màn chỉnh tỉ lệ trước khi đăng.
 *
 * Nhận thẳng `ImageBitmap` chứ không nhận `File`: màn cắt ảnh đã giữ sẵn bitmap
 * để vẽ xem trước, giải mã lại tấm ảnh 12MB lần nữa chỉ để cắt là phí vài trăm
 * mili-giây và một lượng bộ nhớ không nhỏ trên máy yếu.
 *
 * `originalBytes` do nơi gọi truyền vào (dung lượng tệp gốc) để câu "đã tiết
 * kiệm bao nhiêu" vẫn đúng sau khi cắt.
 */
export async function cropBitmap(
  bitmap: ImageBitmap,
  region: CropRegion,
  originalBytes: number,
  maxEdge: number = CLIENT_MAX_EDGE,
): Promise<CompressResult> {
  return renderRegion(bitmap, region, originalBytes, maxEdge);
}

/**
 * Vẽ một vùng của bitmap ra canvas rồi mã hoá WebP.
 *
 * Vùng cắt được kẹp lại trong biên ảnh trước khi vẽ: `drawImage` với toạ độ
 * nguồn nằm ngoài ảnh không báo lỗi, nó lặng lẽ vẽ ra viền trong suốt — ảnh
 * đăng lên sẽ có một dải đen/trong ở mép mà không ai hiểu từ đâu ra.
 */
async function renderRegion(
  bitmap: ImageBitmap,
  region: CropRegion,
  originalBytes: number,
  maxEdge: number,
): Promise<CompressResult> {
  const sx = clamp(Math.round(region.sx), 0, bitmap.width - 1);
  const sy = clamp(Math.round(region.sy), 0, bitmap.height - 1);
  const sw = clamp(Math.round(region.sw), 1, bitmap.width - sx);
  const sh = clamp(Math.round(region.sh), 1, bitmap.height - sy);

  // Thu nhỏ nếu vùng cắt còn lớn hơn trần; KHÔNG bao giờ phóng to (ảnh nhỏ
  // phóng lên chỉ vỡ hạt mà tệp lại nặng thêm).
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không dựng được canvas');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
  );
  if (!blob) throw new Error('Không nén được ảnh');

  return { blob, width, height, originalBytes, compressedBytes: blob.size };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Đọc ảnh thành bitmap, ĐÃ xoay theo thẻ EXIF.
 *
 * `imageOrientation: 'from-image'` là mấu chốt: không có nó thì ảnh dọc chụp
 * bằng iPhone sẽ bị vẽ nằm ngang lên canvas, và vì canvas không giữ EXIF nên
 * ảnh gửi lên server đã sai hướng vĩnh viễn — server có xoay lại cũng vô ích.
 *
 * Nơi gọi phải tự `close()` bitmap khi dùng xong.
 */
export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
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
