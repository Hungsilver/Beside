import { DISPLAY_TIMEZONE } from '@beside/shared';

/**
 * "vừa xong" · "12 phút trước" · "3 ngày trước" · "09/09/2026".
 *
 * Mọi mốc thời gian trong app đều là ISO-8601 UTC do server sinh ra (R2: lưu
 * UTC, hiện theo giờ Việt Nam). Quá bảy ngày thì con số tương đối hết ý nghĩa
 * nên đổi sang ngày tháng thật, ép về `Asia/Ho_Chi_Minh` chứ không theo múi giờ
 * của máy — người dùng đi nước ngoài vẫn phải thấy đúng ngày ở nhà.
 *
 * Chuỗi rỗng khi mốc thời gian hỏng: thà thiếu một dòng phụ còn hơn hiện
 * "Invalid Date" dưới tấm ảnh.
 */
export function formatWhen(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const diffMin = Math.round((now - d.getTime()) / 60_000);

  // Lệch đồng hồ giữa máy và server có thể cho ra số âm — "-2 phút trước" là
  // vô nghĩa, gộp luôn vào "vừa xong".
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)} giờ trước`;
  if (diffMin < 60 * 24 * 7) return `${Math.round(diffMin / 60 / 24)} ngày trước`;

  return d.toLocaleDateString('vi-VN', {
    timeZone: DISPLAY_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
