/**
 * Những mảnh nhỏ dùng lại trong module Đồng hồ.
 *
 * Gom vào một tệp vì cả màn hình, thanh đáy và bảng cài đặt đều cần — và vì
 * chúng chỉ có nghĩa bên trong bảng màu của module (`--clk-*`), không dùng được
 * ở màn nào khác của app.
 */

/**
 * Lớp nút bấm tự mờ đi.
 *
 * Khi đã mờ thì `pointer-events-none`: cú chạm rơi xuống lớp gốc và chỉ GỌI các
 * nút hiện lại. Thiếu chỗ này thì hàng tab trong suốt vẫn ăn cú chạm đó và
 * người dùng đổi chế độ mà không hề nhìn thấy mình bấm vào đâu — hàng tab chiếm
 * hết bề ngang màn hình nên gần như chạm đâu cũng trúng.
 *
 * Chỉ làm mờ chứ không gỡ khỏi cây DOM, và `pointer-events` không ảnh hưởng tới
 * trình đọc màn hình hay phím Tab — đường thoát bằng bàn phím vẫn còn.
 */
export function Chrome({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`shrink-0 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

/** Nút tròn dạng chip. Cao 44px theo R2. */
export function Chip({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  /** Nhãn cho trình đọc màn hình khi nội dung chỉ là biểu tượng. */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`h-11 whitespace-nowrap rounded-full px-4 text-[13px] font-bold transition ${
        on
          ? 'bg-[color:var(--clk-on-bg)] text-[color:var(--clk-on-fg)]'
          : 'bg-[color:var(--clk-chip)] text-[color:var(--clk-soft)]'
      }`}
    >
      {children}
    </button>
  );
}

/** Nút tròn 44×44 chỉ có biểu tượng — dùng ở thanh trên. */
export function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--clk-chip)] text-[15px] text-[color:var(--clk-fg)]"
    >
      {children}
    </button>
  );
}

/** Một dòng bật/tắt trong bảng cài đặt: nhãn bên trái, công tắc bên phải. */
export function Switch({
  label,
  hint,
  on,
  onClick,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex min-h-11 w-full items-center justify-between gap-3 py-1 text-left text-[13px] font-bold"
    >
      <span className="min-w-0">
        <span className={on ? '' : 'text-[color:var(--clk-soft)]'}>{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[10.5px] font-normal leading-snug text-[color:var(--clk-faint)]">
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-[3px] transition ${
          on ? 'bg-[color:var(--clk-on-bg)]' : 'bg-[color:var(--clk-chip)]'
        }`}
      >
        <i
          className={`block size-[18px] rounded-full transition-transform ${
            on ? 'translate-x-4 bg-[color:var(--clk-on-fg)]' : 'bg-[color:var(--clk-soft)]'
          }`}
        />
      </span>
    </button>
  );
}

export function Slider({
  icon,
  label,
  value,
  onChange,
}: {
  icon: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="w-5 shrink-0 text-center text-[14px]">
        {icon}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="h-11 min-w-0 flex-1 accent-[color:var(--clk-fg)]"
      />
      <span className="w-[38px] shrink-0 text-right text-[11.5px] tabular-nums text-[color:var(--clk-faint)]">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

/** Thanh tiến độ mảnh. */
export function Bar({ pct }: { pct: number }) {
  const safe = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div className="h-[5px] overflow-hidden rounded-full bg-[color:var(--clk-chip)]">
      <i
        className="block h-full rounded-full bg-[color:var(--clk-fg)] transition-all"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

/** Bảng báo giá trị khi đang vuốt. Nổi trên cả lớp làm tối. */
export function Hud({
  side,
  value,
  muted,
}: {
  side: 'left' | 'right';
  value: number;
  muted: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
    >
      <div className="flex min-w-[136px] flex-col items-center gap-2 rounded-3xl bg-black/70 px-6 py-5 text-white backdrop-blur-sm">
        <span aria-hidden className="text-[30px] leading-none">
          {side === 'left' ? (value > 0.5 ? '🔆' : '🔅') : pct === 0 ? '🔇' : '🔊'}
        </span>
        <b className="text-[22px] tabular-nums">{pct}%</b>
        <div className="h-1.5 w-[104px] overflow-hidden rounded-full bg-white/20">
          <i className="block h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] text-white/55">
          {side === 'left' ? 'Độ sáng' : muted ? 'Tiếng nền đang tắt' : 'Âm lượng'}
        </span>
      </div>
    </div>
  );
}

/** Báo hết giờ. Nằm trên lớp làm tối để không bị nuốt mất trong đêm. */
export function TimerDone({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-label="Hết giờ"
      className="absolute inset-0 z-30 flex items-center justify-center px-6"
    >
      <div className="tl-pop flex w-full max-w-[300px] flex-col items-center gap-3 rounded-3xl bg-white px-6 py-6 text-[#0b0710] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <span aria-hidden className="text-[38px] leading-none">
          ⏰
        </span>
        <b className="text-[18px]">Hết giờ rồi!</b>
        <button
          type="button"
          onClick={onDismiss}
          className="h-12 w-full rounded-2xl bg-[#0b0710] text-[14px] font-bold text-white"
        >
          Đã biết
        </button>
      </div>
    </div>
  );
}
