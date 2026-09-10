import type { CropRegion } from './image-compress';

/**
 * Hình học của khung cắt ảnh.
 *
 * Tách khỏi component để tính được bằng ngòi bút và kiểm bằng unit test —
 * đây là chỗ dễ sai nhất của tính năng cắt ảnh: lệch một dấu trừ là ảnh cắt ra
 * không khớp với thứ người dùng nhìn thấy trên màn hình.
 *
 * ── Quy ước ─────────────────────────────────────────────────────────────────
 * Khung cắt đứng yên giữa màn hình, ẢNH di chuyển phía sau nó.
 * `offset` là độ dời của TÂM ảnh so với TÂM khung, tính bằng pixel màn hình.
 * `zoom = 1` nghĩa là ảnh vừa đủ phủ kín khung (không có mép trống).
 */

export interface CropView {
  /** Kích thước ảnh gốc (đã xoay theo EXIF). */
  imageW: number;
  imageH: number;
  /** Kích thước khung cắt trên màn hình. */
  frameW: number;
  frameH: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/** Tỉ lệ để ảnh vừa đủ PHỦ KÍN khung (không chừa mép trống). */
export function coverScale(view: Pick<CropView, 'imageW' | 'imageH' | 'frameW' | 'frameH'>): number {
  if (view.imageW <= 0 || view.imageH <= 0) return 1;
  return Math.max(view.frameW / view.imageW, view.frameH / view.imageH);
}

/**
 * Độ dời tối đa theo mỗi trục, để ảnh không bao giờ hở mép ra khỏi khung.
 *
 * Ở mức `zoom = 1` thì một trong hai trục luôn bằng 0 — ảnh vừa khít chiều đó,
 * kéo thêm là lòi nền ra.
 */
export function maxOffset(view: CropView): { x: number; y: number } {
  const s = coverScale(view) * Math.max(1, view.zoom);
  return {
    x: Math.max(0, (view.imageW * s - view.frameW) / 2),
    y: Math.max(0, (view.imageH * s - view.frameH) / 2),
  };
}

/** Kẹp độ dời vào biên hợp lệ. Gọi sau MỖI lần kéo và mỗi lần đổi mức phóng. */
export function clampOffset(view: CropView): { x: number; y: number } {
  const max = maxOffset(view);
  return {
    x: Math.min(max.x, Math.max(-max.x, view.offsetX)),
    y: Math.min(max.y, Math.max(-max.y, view.offsetY)),
  };
}

/**
 * Vùng ảnh gốc đang lọt vào khung cắt.
 *
 * Suy ra từ đúng phép biến hình mà CSS đang dùng để vẽ ảnh, nên "cắt ra" luôn
 * bằng đúng "nhìn thấy". Kết quả đã được kẹp trong biên ảnh.
 */
export function cropRegionFor(view: CropView): CropRegion {
  const s = coverScale(view) * Math.max(1, view.zoom);
  if (!Number.isFinite(s) || s <= 0) {
    return { sx: 0, sy: 0, sw: view.imageW, sh: view.imageH };
  }

  const offset = clampOffset(view);

  // Mép trái của khung, đo từ mép trái ảnh, quy về pixel của ẢNH GỐC.
  const sx = (view.imageW * s) / 2 / s - view.frameW / 2 / s - offset.x / s;
  const sy = (view.imageH * s) / 2 / s - view.frameH / 2 / s - offset.y / s;

  const sw = view.frameW / s;
  const sh = view.frameH / s;

  return {
    sx: Math.max(0, Math.min(sx, view.imageW - 1)),
    sy: Math.max(0, Math.min(sy, view.imageH - 1)),
    sw: Math.max(1, Math.min(sw, view.imageW)),
    sh: Math.max(1, Math.min(sh, view.imageH)),
  };
}

/**
 * Kích thước khung cắt lớn nhất vừa trong một vùng cho trước, giữ đúng tỉ lệ.
 *
 * Mobile-first (R2): bề rộng là thứ khan hiếm ở khung 390px, nên ưu tiên lấp
 * hết chiều ngang rồi mới hạ xuống nếu chiều cao vượt trần.
 */
export function fitFrame(
  aspect: number,
  availableW: number,
  maxH: number,
): { width: number; height: number } {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return { width: availableW, height: Math.min(availableW, maxH) };
  }
  let width = availableW;
  let height = width / aspect;
  if (height > maxH) {
    height = maxH;
    width = height * aspect;
  }
  return { width: Math.round(width), height: Math.round(height) };
}
