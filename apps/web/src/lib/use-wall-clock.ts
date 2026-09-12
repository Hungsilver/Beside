import { useEffect, useRef, useState } from 'react';
import { DISPLAY_TIMEZONE } from '@beside/shared';
import type { ClockPart } from './study-format';

/**
 * Giờ hiện tại, dựng sẵn thành các nhóm chữ số cho đồng hồ số lật.
 *
 * Đọc theo **giờ Việt Nam** chứ không theo đồng hồ máy (CLAUDE.md R2: hiển thị
 * theo `Asia/Ho_Chi_Minh`). Cả app đã nói giờ VN ở mọi chỗ khác — một mặt đồng
 * hồ nói giờ khác với dòng "cập nhật 5 phút trước" ngay bên cạnh sẽ khiến người
 * dùng không tin cái nào nữa.
 */
export interface WallClock {
  parts: ClockPart[];
  /** `SA` / `CH` khi đang ở chế độ 12 giờ, `null` khi 24 giờ. */
  meridiem: string | null;
  /** `Thứ Sáu, 12/09/2026`. */
  dateLabel: string;
  /**
   * Giờ theo đồng hồ 24h, BẤT KỂ người dùng đang xem ở chế độ 12 hay 24 giờ.
   *
   * Chế độ đêm tự động cần con số này. Đọc `hour` của mặt đồng hồ thì lúc đang
   * ở chế độ 12 giờ, 9 giờ tối sẽ ra `9` và khung giờ đêm không bao giờ khớp.
   */
  hour24: number;
  /** Chuỗi cho trình đọc màn hình: `9 giờ 05 phút`. */
  spoken: string;
}

export function useWallClock({
  showSeconds,
  hour12,
}: {
  showSeconds: boolean;
  hour12: boolean;
}): WallClock {
  const [now, setNow] = useState(() => new Date());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    /*
     * Nhịp đầu canh đúng vào đầu giây kế, sau đó mới chạy đều mỗi giây.
     *
     * `setInterval(…, 1000)` trần thì mốc bấm giờ lệch dần khỏi giây thật của
     * đồng hồ hệ thống, và có lúc một giây bị bỏ qua hẳn — trên đồng hồ số lật
     * thì đó là một thẻ đứng im hai giây rồi nhảy hai số cùng lúc.
     */
    const tick = () => setNow(new Date());
    const align = 1000 - (Date.now() % 1000);
    let interval: number | null = null;

    timerRef.current = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 1000);
      timerRef.current = interval;
    }, align);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (interval !== null) window.clearInterval(interval);
    };
  }, []);

  /*
   * Quay lại app thì đọc lại giờ ngay.
   *
   * Trình duyệt treo bộ hẹn giờ khi trang bị ẩn, nên mở lại sau vài phút sẽ
   * thấy mặt đồng hồ đứng ở giờ cũ cho tới nhịp kế — ở chế độ toàn màn hình thì
   * đó là thứ đập vào mắt đầu tiên.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const { hour, minute, second, dayPeriod } = readParts(now, hour12);
  // Đọc riêng một lần nữa ở hệ 24 giờ — rẻ, và không phải suy ngược từ `SA/CH`.
  const hour24 = hour12 ? readParts(now, false).hour : hour;

  const parts: ClockPart[] = [
    { id: 'h', digits: pad(hour) },
    { id: 'm', digits: pad(minute) },
  ];
  if (showSeconds) parts.push({ id: 's', digits: pad(second) });

  return {
    parts,
    meridiem: hour12 ? dayPeriod : null,
    dateLabel: formatDate(now),
    hour24,
    spoken: `${hour} giờ ${String(minute).padStart(2, '0')} phút`,
  };
}

// ---------------------------------------------------------------------------

function readParts(
  date: Date,
  hour12: boolean,
): { hour: number; minute: number; second: number; dayPeriod: string } {
  const fmt = new Intl.DateTimeFormat('vi-VN', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `h23` cho chế độ 24 giờ: mặc định `h24` trả về "24" ở đúng mốc nửa đêm,
    // và mặt đồng hồ sẽ hiện `24:00` thay vì `00:00`.
    hourCycle: hour12 ? 'h12' : 'h23',
  });

  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '0';

  return {
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    // `vi-VN` cho ra "SA"/"CH"; máy nào trả chuỗi khác thì vẫn hiện nguyên văn.
    dayPeriod: parts.find((p) => p.type === 'dayPeriod')?.value ?? '',
  };
}

/** `Thứ Sáu, 12/09/2026`. */
function formatDate(date: Date): string {
  const text = new Intl.DateTimeFormat('vi-VN', {
    timeZone: DISPLAY_TIMEZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  // `vi-VN` cho ra "thứ sáu, 12/09/2026" — viết hoa chữ đầu cho ra dáng một
  // dòng tiêu đề chứ không phải một mẩu câu.
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pad(n: number): string[] {
  return String(Math.max(0, n)).padStart(2, '0').split('');
}
