/**
 * Định dạng số cho module Đồng hồ.
 *
 * Để riêng khỏi component vì cả màn hình (phần trăm giây của bấm giờ) và thanh
 * đáy (danh sách vòng) đều dùng — và vì hàm thuần thì kiểm được bằng unit test.
 */

/** Hai chữ số phần trăm giây. `1234` → `23`. */
export function centis(ms: number): string {
  if (!Number.isFinite(ms)) return '00';
  const v = Math.floor((Math.max(0, ms) % 1000) / 10);
  return String(v).padStart(2, '0');
}

/**
 * Mốc thời gian của một vòng bấm giờ. `754300` → `12:34,30`.
 *
 * Bỏ hẳn phần giờ khi chưa tới một giờ: `00:12:34` đọc chậm hơn `12:34` đúng ở
 * chỗ không mang thêm tin gì, mà danh sách vòng là thứ người ta đọc bằng cách
 * quét mắt xuống cột số.
 */
export function lapClock(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const total = Math.floor(safe / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const head = h > 0 ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0');
  return `${head}:${String(s).padStart(2, '0')},${centis(safe)}`;
}
