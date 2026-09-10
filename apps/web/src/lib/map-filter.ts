import {
  DISPLAY_TIMEZONE,
  endOfDayMs,
  floatingDateToMs,
  MS_PER_DAY,
  startOfDayMs,
} from '@beside/shared';

/**
 * Bộ lọc thời gian của các ghim check-in trên bản đồ.
 *
 * Mọi ranh giới đều là ranh giới NGÀY theo giờ Việt Nam, không phải "24 giờ
 * trước tính từ bây giờ": người dùng nghĩ theo tờ lịch — chọn "7 ngày" là muốn
 * thấy cả tấm ảnh chụp lúc 6 giờ sáng của ngày đầu tiên trong khoảng đó.
 *
 * Quy đổi sang epoch ms ngay tại client rồi mới gửi lên (`?from=&to=`), vì chỉ
 * client mới biết người dùng đang xem theo múi giờ nào.
 */

export type MapRangeId = 'all' | '7d' | '30d' | '90d' | '365d' | 'custom';

export interface MapRangePreset {
  id: MapRangeId;
  label: string;
  /** Số ngày lịch tính CẢ hôm nay. `null` = không giới hạn / tự chọn. */
  days: number | null;
}

export const MAP_RANGE_PRESETS: MapRangePreset[] = [
  { id: 'all', label: 'Tất cả', days: null },
  { id: '7d', label: '7 ngày', days: 7 },
  { id: '30d', label: '30 ngày', days: 30 },
  { id: '90d', label: '3 tháng', days: 90 },
  { id: '365d', label: '1 năm', days: 365 },
  { id: 'custom', label: 'Chọn ngày', days: null },
];

export interface MapRangeState {
  id: MapRangeId;
  /** Chỉ dùng khi `id === 'custom'`. Dạng `YYYY-MM-DD` như ô `<input type="date">`. */
  customFrom: string;
  customTo: string;
}

export const DEFAULT_MAP_RANGE: MapRangeState = { id: 'all', customFrom: '', customTo: '' };

export interface ResolvedMapRange {
  /** Mốc epoch ms gửi lên server. `null` = không chặn đầu đó. */
  from: number | null;
  to: number | null;
  /** Câu mô tả ngắn để hiện dưới chip đang chọn. */
  label: string;
  /** Câu lỗi khi khoảng tự chọn chưa hợp lệ — lúc này KHÔNG được gọi API. */
  error: string | null;
}

/** `YYYY-MM-DD` → `Date`, hoặc `null` nếu chuỗi rỗng / ngày không có thật (31/02). */
function parseDayInput(value: string): Date | null {
  if (!value) return null;
  const ms = floatingDateToMs(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** `Date` → `YYYY-MM-DD` theo giờ VN, để đổ vào ô `<input type="date">`. */
export function toDayInput(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function resolveMapRange(
  state: MapRangeState,
  now: number = Date.now(),
): ResolvedMapRange {
  if (state.id === 'custom') {
    const from = parseDayInput(state.customFrom);
    const to = parseDayInput(state.customTo);

    if (!from || !to) {
      return { from: null, to: null, label: 'Chọn ngày', error: 'Chọn đủ ngày bắt đầu và ngày kết thúc' };
    }

    const fromMs = startOfDayMs(from);
    const toMs = endOfDayMs(to);
    if (fromMs > toMs) {
      return { from: null, to: null, label: 'Chọn ngày', error: 'Ngày bắt đầu phải trước ngày kết thúc' };
    }

    return {
      from: fromMs,
      to: toMs,
      label: `${formatDay(state.customFrom)} – ${formatDay(state.customTo)}`,
      error: null,
    };
  }

  const preset =
    MAP_RANGE_PRESETS.find((p) => p.id === state.id) ?? MAP_RANGE_PRESETS[0]!;

  if (preset.days === null) {
    return { from: null, to: null, label: 'Tất cả khoảnh khắc đã ghim', error: null };
  }

  // Trừ `days - 1` vì khoảng ĐÃ tính cả ngày hôm nay: "7 ngày" = hôm nay + 6 ngày trước.
  const from = startOfDayMs(new Date(now - (preset.days - 1) * MS_PER_DAY));
  return { from, to: null, label: `${preset.days} ngày gần đây`, error: null };
}

/** `2026-09-10` → `10/09` — đủ để đọc trên chip hẹp của khung 390px. */
function formatDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}` : ymd;
}

// ---------------------------------------------------------------------------
// Ghi nhớ lựa chọn
// ---------------------------------------------------------------------------

const RANGE_KEY = 'beside:map-range';

/**
 * Đọc/ghi qua `localStorage`, bọc try/catch — chế độ ẩn danh của vài trình duyệt
 * ném lỗi ngay khi chạm vào, và mất lựa chọn thì chỉ là bất tiện nhỏ, không được
 * để nó làm hỏng cả màn bản đồ. Cùng cách làm với `map-styles.ts`.
 */
export function readSavedRange(): MapRangeState {
  try {
    const raw = localStorage.getItem(RANGE_KEY);
    if (!raw) return DEFAULT_MAP_RANGE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_MAP_RANGE;

    const o = parsed as Partial<MapRangeState>;
    const id = MAP_RANGE_PRESETS.some((p) => p.id === o.id)
      ? (o.id as MapRangeId)
      : DEFAULT_MAP_RANGE.id;

    return {
      id,
      customFrom: typeof o.customFrom === 'string' ? o.customFrom : '',
      customTo: typeof o.customTo === 'string' ? o.customTo : '',
    };
  } catch {
    return DEFAULT_MAP_RANGE;
  }
}

export function saveRange(state: MapRangeState): void {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify(state));
  } catch {
    /* bỏ qua */
  }
}
