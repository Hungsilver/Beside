/**
 * Tuỳ chọn của module Đồng hồ — đọc/ghi `localStorage`.
 *
 * Tách khỏi component vì màn hình, bảng cài đặt và hàng nút đều cần tới, mà cả
 * ba đều là tệp riêng. Đọc lại từ `localStorage` chứ không giữ ở server: đây là
 * cách người này thích xem đồng hồ TRÊN MÁY NÀY, không phải dữ liệu của couple.
 */

import { DEFAULT_THEME_ID } from './clock-themes';

export type ClockMode = 'clock' | 'countdown' | 'timer' | 'stopwatch';

export interface ClockPrefs {
  showSeconds: boolean;
  hour12: boolean;
  /** Độ tối của lớp phủ, 0 = sáng nhất. Xem `MAX_DIM`. */
  dim: number;
  themeId: string;
  /** Kêu một tiếng "tách" mỗi lần thẻ lật. */
  tickSound: boolean;
  /** Tự làm tối trong khung giờ đêm. */
  autoNight: boolean;
  /** Dịch nhẹ đồng hồ theo chu kỳ để màn OLED không in vệt. */
  antiBurnIn: boolean;
  /** Giữ màn hình không tự tắt. */
  keepAwake: boolean;
  /** Hiện dòng ngày/thứ phía trên mặt số. */
  showDate: boolean;
  /** Hiện mức pin — thứ mọi app đồng hồ để bàn đều có. */
  showBattery: boolean;
}

/**
 * Trần độ tối.
 *
 * Web KHÔNG chỉnh được độ sáng phần cứng — không có API nào cả. Thứ duy nhất
 * làm được là phủ một lớp đen lên trên, và đó cũng là cách mọi app đồng hồ chạy
 * trong trình duyệt làm.
 *
 * Chặn ở 0.82 là để tự cứu mình: cho tối 100% thì nút thoát biến mất hẳn và
 * người dùng kẹt trong một màn hình đen không biết bấm vào đâu.
 */
export const MAX_DIM = 0.82;

/** Độ tối tối thiểu khi chế độ đêm tự bật. */
export const NIGHT_DIM = 0.45;

/** Khung giờ đêm, theo giờ hiển thị (21:00 tới trước 6:00). */
export const NIGHT_FROM_HOUR = 21;
export const NIGHT_TO_HOUR = 6;

/** Các mức hẹn giờ bấm nhanh, tính bằng phút. */
export const TIMER_PRESETS = [1, 3, 5, 10, 15, 30] as const;

/**
 * Biên cho ô gõ số phút tuỳ ý.
 *
 * Trần 600 phút (10 giờ) chứ không mở vô hạn: hẹn giờ ở đây neo vào máy này và
 * chỉ báo khi app còn mở (xem `use-timer.ts`), nên một mốc 3 ngày là lời hứa
 * chắc chắn không giữ được.
 */
export const TIMER_MIN_MINUTES = 1;
export const TIMER_MAX_MINUTES = 600;

export const DEFAULT_CLOCK_PREFS: ClockPrefs = {
  showSeconds: true,
  hour12: false,
  dim: 0,
  themeId: DEFAULT_THEME_ID,
  tickSound: false,
  autoNight: false,
  antiBurnIn: true,
  keepAwake: true,
  showDate: true,
  showBattery: false,
};

const PREFS_KEY = 'beside:clock-prefs';

export function readClockPrefs(): ClockPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Partial<ClockPrefs>;
        return {
          ...DEFAULT_CLOCK_PREFS,
          ...bool(p, 'showSeconds'),
          ...bool(p, 'hour12'),
          ...bool(p, 'tickSound'),
          ...bool(p, 'autoNight'),
          ...bool(p, 'antiBurnIn'),
          ...bool(p, 'keepAwake'),
          ...bool(p, 'showDate'),
          ...bool(p, 'showBattery'),
          themeId:
            typeof p.themeId === 'string' ? p.themeId : DEFAULT_CLOCK_PREFS.themeId,
          // Giá trị hỏng (chuỗi, NaN, số ngoài khoảng) đều quy về sáng nhất —
          // mở app lên mà màn hình đen sì thì không ai biết vì sao.
          dim: clampDim(p.dim),
        };
      }
    }
  } catch {
    /* localStorage bị chặn (chế độ riêng tư) — dùng mặc định */
  }
  return DEFAULT_CLOCK_PREFS;
}

export function writeClockPrefs(prefs: ClockPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* bỏ qua — không đáng để làm vỡ màn hình vì một tuỳ chọn không lưu được */
  }
}

export function clampDim(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_DIM, Math.max(0, value));
}

/** Khung giờ đêm BẮC QUA nửa đêm, nên là phép HOẶC chứ không phải một khoảng. */
export function isNightHour(hour24: number): boolean {
  if (!Number.isFinite(hour24)) return false;
  return hour24 >= NIGHT_FROM_HOUR || hour24 < NIGHT_TO_HOUR;
}

/** Chỉ nhận khoá nào thật sự là boolean; còn lại để mặc định lo. */
function bool<K extends keyof ClockPrefs>(
  p: Partial<ClockPrefs>,
  key: K,
): Partial<ClockPrefs> {
  return typeof p[key] === 'boolean' ? ({ [key]: p[key] } as Partial<ClockPrefs>) : {};
}
