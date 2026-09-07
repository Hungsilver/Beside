import {
  DISPLAY_TIMEZONE,
  MS_PER_DAY,
  msToFloatingDate,
  ymdInTimeZone,
  type EventResponse,
} from '@beside/shared';

/** Khoá ô lịch: `"YYYY-MM-DD"`. */
export type DayKey = string;

export function dayKeyOf(date: Date, timeZone = DISPLAY_TIMEZONE): DayKey {
  const { year, month, day } = ymdInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Ô lịch của hôm nay, theo giờ Việt Nam. */
export function todayKey(): DayKey {
  return dayKeyOf(new Date());
}

/**
 * Một sự kiện phủ lên những ô lịch nào.
 *
 * Hai loại sự kiện đọc theo hai múi giờ khác nhau — đây chính là lý do
 * `event.schema.ts` tách "ngày trôi nổi" ra khỏi mốc thời gian thật:
 *
 *   allDay = false → đổi sang Asia/Ho_Chi_Minh rồi mới lấy ngày.
 *   allDay = true  → đọc thẳng theo UTC, KHÔNG đổi múi giờ (nếu đổi thì
 *                    "sinh nhật 12/09" sẽ nhảy về ô ngày 11).
 */
export function dayKeysOf(event: EventResponse): DayKey[] {
  const startMs = Date.parse(event.startAt);
  if (Number.isNaN(startMs)) return [];

  const endMs = event.endAt ? Date.parse(event.endAt) : startMs;
  if (Number.isNaN(endMs)) return [];

  if (event.allDay) {
    const keys: DayKey[] = [];
    for (let ms = startMs; ms <= endMs; ms += MS_PER_DAY) {
      keys.push(msToFloatingDate(ms));
      if (keys.length > 40) break; // trần 30 ngày ở schema, chừa dư an toàn
    }
    return keys;
  }

  const keys: DayKey[] = [];
  let cursor = startMs;
  const lastKey = dayKeyOf(new Date(endMs));
  for (;;) {
    const key = dayKeyOf(new Date(cursor));
    keys.push(key);
    if (key === lastKey || keys.length > 40) break;
    cursor += MS_PER_DAY;
  }
  return keys;
}

/** Gom sự kiện theo ô lịch để lưới tháng tra cứu bằng O(1). */
export function groupByDay(events: EventResponse[]): Map<DayKey, EventResponse[]> {
  const map = new Map<DayKey, EventResponse[]>();
  for (const e of events) {
    for (const key of dayKeysOf(e)) {
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
  }
  return map;
}

/** "19:00" theo giờ VN. Sự kiện cả ngày trả về "Cả ngày". */
export function timeLabel(event: EventResponse): string {
  if (event.allDay) return 'Cả ngày';
  const start = new Date(event.startAt);
  if (Number.isNaN(start.getTime())) return '';
  const fmt = (d: Date) =>
    d.toLocaleTimeString('vi-VN', {
      timeZone: DISPLAY_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  return event.endAt ? `${fmt(start)} – ${fmt(new Date(event.endAt))}` : fmt(start);
}

/** "Thứ ba, 08/09/2026" — tiêu đề danh sách sự kiện trong ngày. */
export function longDayLabel(key: DayKey): string {
  // `noUncheckedIndexedAccess` coi phần tử mảng là có thể undefined — dùng
  // slice cố định thay vì destructure để kiểu luôn là number.
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  const text = date.toLocaleDateString('vi-VN', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

/** Nhãn 7 cột, tuần bắt đầu từ THỨ HAI theo thói quen ở Việt Nam. */
export const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * 42 ô của lưới lịch tháng (6 tuần × 7 ngày), luôn đủ để chứa mọi tháng.
 * Dùng UTC toàn bộ vì đây chỉ là phép đếm ô trên tờ lịch, không phải mốc thời gian.
 */
export function monthGrid(year: number, month: number): DayKey[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay: 0 = Chủ nhật. Đổi sang "thứ hai = 0".
  const offset = (first.getUTCDay() + 6) % 7;
  const start = Date.UTC(year, month - 1, 1) - offset * MS_PER_DAY;

  return Array.from({ length: 42 }, (_, i) => msToFloatingDate(start + i * MS_PER_DAY));
}

export function monthOfKey(key: DayKey): number {
  return Number(key.slice(5, 7));
}

export function dayOfKey(key: DayKey): number {
  return Number(key.slice(8, 10));
}

// ---------------------------------------------------------------------------
// Ô nhập ngày/giờ ↔ ISO
// ---------------------------------------------------------------------------

/**
 * Việt Nam là UTC+7 cố định, không có giờ mùa hè — nên ghép chuỗi offset là
 * cách chuyển đổi chính xác và đọc được.
 *
 * Không dùng `new Date("2026-09-10T19:00")` (không có offset): trình duyệt sẽ
 * hiểu theo múi giờ của MÁY. Điện thoại đang để múi giờ khác — hoặc người dùng
 * đang đi nước ngoài — là giờ hẹn lệch đi vài tiếng mà không ai biết.
 */
export const VN_UTC_OFFSET = '+07:00';

/** `("2026-09-10", "19:00")` → ISO UTC. Trả `null` nếu ô nhập chưa hợp lệ. */
export function vnWallToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const ms = Date.parse(`${date}T${time}:00.000${VN_UTC_OFFSET}`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** ISO UTC → `{ date: "2026-09-10", time: "19:00" }` theo giờ VN. */
export function isoToVnWall(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date: dayKeyOf(d), time };
}

/**
 * Giờ gợi ý khi mở form tạo sự kiện: tròn giờ kế tiếp theo giờ VN, dài 1 tiếng.
 * Đỡ cho người dùng phải sửa cả bốn ô mỗi lần thêm một cuộc hẹn.
 */
export function defaultTimes(now = new Date()): { startTime: string; endTime: string } {
  const hourNow = Number(
    now.toLocaleString('en-GB', {
      timeZone: DISPLAY_TIMEZONE,
      hour: '2-digit',
      hour12: false,
    }),
  );
  // 23h thì giờ kế tiếp rơi sang ngày mai — lùi về 22:00 để sự kiện vẫn nằm
  // trong đúng ngày người dùng đang chọn trên lịch.
  const start = Math.min(hourNow + 1, 22);
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return { startTime: pad(start), endTime: pad(start + 1) };
}
