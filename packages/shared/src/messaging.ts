import type { MessagingApp } from './constants';

/**
 * Nút "Nhắn tin" (F9) — không có chat trong app, chỉ mở app ngoài.
 * Xem ARCHITECTURE.md §7.3.
 *
 * Luôn dùng https:// chứ KHÔNG dùng scheme riêng (zalo://, fb-messenger://):
 * trên iOS Safari, scheme riêng bị chặn im lặng khi app chưa được cài,
 * còn link https thì tự rơi về trang web tương ứng.
 */

/** Chuẩn hoá số điện thoại VN về dạng quốc tế không dấu cộng: 0912345678 → 84912345678 */
export function normalizeVnPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;

  let national: string;
  if (digits.startsWith('+84')) national = digits.slice(3);
  else if (digits.startsWith('84') && digits.length >= 11) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;

  // Số di động VN sau khi bỏ mã vùng/số 0 đứng đầu luôn có 9 chữ số.
  if (!/^\d{9}$/.test(national)) return null;
  return `84${national}`;
}

export interface MessagingTarget {
  app: MessagingApp;
  handle: string | null;
}

/**
 * Trả về URL để mở app nhắn tin của đối phương, hoặc null nếu chưa cấu hình.
 * Giao diện phải ẩn nút khi hàm này trả null — không hiện nút bấm vào không có gì xảy ra.
 */
export function buildMessagingUrl(target: MessagingTarget): string | null {
  const handle = target.handle?.trim();
  if (!handle) return null;

  switch (target.app) {
    case 'ZALO': {
      const phone = normalizeVnPhone(handle);
      return phone ? `https://zalo.me/${phone}` : null;
    }
    case 'MESSENGER': {
      // Messenger dùng username Facebook, KHÔNG phải số điện thoại.
      //
      // Quy tắc bắt buộc phải BẮT ĐẦU BẰNG CHỮ CÁI: nếu chỉ kiểm tra
      // [A-Za-z0-9.] thì một số điện thoại như "0912345678" cũng lọt qua,
      // và người dùng nhận được link m.me/0912345678 hỏng mà không hiểu vì sao.
      // Facebook cũng không cho phép username toàn chữ số.
      const username = handle.replace(/^@/, '');
      return /^[A-Za-z][A-Za-z0-9.]{4,49}$/.test(username)
        ? `https://m.me/${username}`
        : null;
    }
    case 'PHONE': {
      const phone = normalizeVnPhone(handle);
      return phone ? `tel:+${phone}` : null;
    }
    case 'SMS': {
      const phone = normalizeVnPhone(handle);
      return phone ? `sms:+${phone}` : null;
    }
    default:
      return null;
  }
}

export const MESSAGING_APP_LABELS: Record<MessagingApp, string> = {
  ZALO: 'Zalo',
  MESSENGER: 'Messenger',
  PHONE: 'Gọi điện',
  SMS: 'Tin nhắn SMS',
};
