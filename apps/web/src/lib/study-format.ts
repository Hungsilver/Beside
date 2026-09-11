/**
 * Hàm định dạng dùng chung cho phòng học.
 *
 * Tách khỏi component vì hai lý do: kiểm thử được mà không phải dựng DOM, và
 * file component giữ đúng một thứ để xuất ra (`react-refresh` cảnh báo khi một
 * file vừa xuất component vừa xuất hằng số/hàm).
 */

/** `750` → `12 giờ 30 phút`. Số âm / không hợp lệ quy về `0 phút`. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} giờ` : `${h} giờ ${rest} phút`;
}

export type ClockPart = { id: 'h' | 'm' | 's'; digits: string[] };

/**
 * Tách số giây thành các nhóm hai chữ số cho đồng hồ số lật.
 *
 * Nhóm giờ chỉ xuất hiện khi thật sự có giờ — hiện `00:` thường trực làm đồng
 * hồ trên khung 390px hẹp lại một cách vô ích. Đổi số nhóm giữa chừng không gây
 * nháy vì `key` ở component bám theo TÊN nhóm chứ không phải vị trí.
 */
export function splitClock(seconds: number): ClockPart[] {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const pad = (n: number): string[] => String(n).padStart(2, '0').split('');
  const parts: ClockPart[] = [];
  if (h > 0) parts.push({ id: 'h', digits: pad(h) });
  parts.push({ id: 'm', digits: pad(m) });
  parts.push({ id: 's', digits: pad(s) });
  return parts;
}

/** Chuỗi cho trình đọc màn hình — đọc "5 phút 3 giây", không đọc "05:03". */
export function spokenTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const bits: string[] = [];
  if (h > 0) bits.push(`${h} giờ`);
  if (m > 0) bits.push(`${m} phút`);
  bits.push(`${s} giây`);
  return bits.join(' ');
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * Nhãn thứ cho một khoá `YYYY-MM-DD`.
 *
 * Dựng mốc bằng `Date.UTC` rồi đọc `getUTCDay()`, không dùng `new Date(chuỗi)`
 * + `getDay()`: chuỗi ngày trần được đọc là UTC còn `getDay()` lại quy về múi
 * giờ máy, lệch đúng một ngày ở phía tây bán cầu (R2 — không `new Date()` trên
 * chuỗi không rõ định dạng).
 */
export function weekdayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return WEEKDAYS[d.getUTCDay()] ?? '';
}

/** `2026-09-11` → `11/09`. Khoá hỏng thì trả nguyên chuỗi, không ném lỗi. */
export function dayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}` : ymd;
}

// ---------------------------------------------------------------------------
// Dải thời gian trong ngày
// ---------------------------------------------------------------------------

/** Số khoảng giữa các vạch giờ trên trục. Bốn nhãn là vừa cho khung 390px. */
export const TICK_SEGMENTS = 3;

/**
 * Chọn khung giờ hiển thị và các mốc trên trục của dải thời gian.
 *
 * Khung co theo dữ liệu thật thay vì luôn vẽ đủ 24 tiếng: một buổi học 50 phút
 * trên khung cả ngày chỉ còn là vạch 8px — đúng tỉ lệ nhưng không đọc được gì.
 *
 * Khung LUÔN chia hết cho `TICK_SEGMENTS`, vì các nhãn được rải đều bằng
 * `justify-between`. Không chia hết thì nhãn cuối nằm ở mép 100% trong khi giờ
 * nó chỉ tới nằm ở 90% — cả trục nói dối mà nhìn vẫn thấy cân đối.
 *
 * Khi phần mở thêm vượt quá nửa đêm thì lùi MÉP TRÁI lại chứ không cắt mép
 * phải: cắt thì span lẻ và trục lệch trở lại.
 */
export function buildAxis(
  earliest: number,
  latest: number,
): { from: number; to: number; span: number; ticks: number[] } {
  const DAY = 24 * 60;
  const lo = Number.isFinite(earliest) ? Math.max(0, Math.min(DAY, earliest)) : 0;
  const hi = Number.isFinite(latest) ? Math.max(lo, Math.min(DAY, latest)) : lo;

  const roughFrom = Math.max(0, Math.floor((lo - 60) / 60) * 60);
  const roughTo = Math.min(DAY, Math.ceil((hi + 60) / 60) * 60);

  // Làm tròn LÊN theo giờ tròn cho mỗi khoảng, tối thiểu 1 giờ mỗi khoảng.
  const step = Math.max(60, Math.ceil((roughTo - roughFrom) / TICK_SEGMENTS / 60) * 60);
  const span = Math.min(DAY, step * TICK_SEGMENTS);

  const from = roughFrom + span > DAY ? Math.max(0, DAY - span) : roughFrom;
  const to = from + span;

  const ticks: number[] = [];
  for (let i = 0; i <= TICK_SEGMENTS; i += 1) ticks.push(from + (span / TICK_SEGMENTS) * i);
  return { from, to, span, ticks };
}

/** `100` → `1h40` · `45` → `45p`. Dạng ngắn cho cột hẹp bên phải dải. */
export function formatShortDuration(minutes: number): string {
  const m = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, '0')}`;
}

/** `540` → `9h` — nhãn trên trục giờ. */
export function formatHour(minutes: number): string {
  return `${Math.floor(minutes / 60)}h`;
}

/** `545` → `9:05` — giờ chính xác trong chú thích của một khối. */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
