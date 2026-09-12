import { lapClock } from '@/lib/clock-format';
import type { ClockMode } from '@/lib/clock-prefs';
import type { Lap, Stopwatch } from '@/lib/use-stopwatch';
import type { Timer } from '@/lib/use-timer';
import { Bar, Chip } from './ClockBits';

/**
 * Thanh đáy: thanh tiến độ + hàng nút của chế độ đang mở + MỘT hàng tab.
 *
 * Nguyên tắc của bản này: ở chế độ xem giờ và chế độ phiên học, đáy CHỈ có hàng
 * tab — không chip nào khác. Bản trước bày bốn chip chế độ, thêm một hàng nút
 * riêng, thêm nút cài đặt, thêm một dòng hướng dẫn; cộng lại chúng ăn gần một
 * phần ba chiều cao màn hình, mà thứ người ta mở app lên để xem là mặt số.
 *
 * Hàng nút riêng chỉ hiện ở hẹn giờ và bấm giờ, vì hai chế độ đó KHÔNG dùng
 * được nếu không bấm gì.
 */
/** Khớp với `id` của khung giữa trong `ClockScreen` — xem `aria-controls`. */
export const PANEL_ID = 'clock-stage';

export default function ClockBottomBar({
  mode,
  modes,
  onMode,
  progressPct,
  note,
  timer,
  stopwatch,
}: {
  mode: ClockMode;
  modes: { id: ClockMode; icon: string; label: string }[];
  onMode: (m: ClockMode) => void;
  /** Tiến độ chặng/hẹn giờ, `null` thì không vẽ thanh nào. */
  progressPct: number | null;
  /** Một dòng trạng thái, `null` thì không chiếm dòng nào. */
  note: string | null;
  timer: Timer;
  stopwatch: Stopwatch;
}) {
  return (
    <div className="px-3 pb-2">
      {progressPct !== null && <Bar pct={progressPct} />}

      {mode === 'stopwatch' && stopwatch.laps.length > 0 && (
        <LapList laps={stopwatch.laps} />
      )}

      {/* Hàng nút riêng — chỉ hẹn giờ (đã đặt) và bấm giờ mới có. */}
      {mode === 'timer' && timer.totalMs > 0 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <Chip
            on={timer.running}
            onClick={() => (timer.running ? timer.pause() : timer.resume())}
          >
            {timer.running ? '⏸ Tạm dừng' : '▶ Tiếp tục'}
          </Chip>
          <Chip on={false} onClick={timer.reset}>
            ↺ Đặt lại
          </Chip>
        </div>
      )}

      {mode === 'stopwatch' && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <Chip
            on={stopwatch.running}
            onClick={() => (stopwatch.running ? stopwatch.pause() : stopwatch.start())}
          >
            {stopwatch.running ? '⏸ Tạm dừng' : '▶ Bắt đầu'}
          </Chip>
          <Chip on={false} onClick={stopwatch.lap}>
            🏁 Vòng
          </Chip>
          <Chip on={false} onClick={stopwatch.reset}>
            ↺ Xoá
          </Chip>
        </div>
      )}

      {note !== null && (
        <p className="mt-1.5 text-center text-[10.5px] leading-none text-[color:var(--clk-faint)]">
          {note}
        </p>
      )}

      {/*
        Hàng tab. Chia đều bề ngang chứ không dùng chip co theo chữ: khe cố định
        thì ngón tay nhớ được chỗ, và ở khổ 390px bốn chip chữ sẽ xuống dòng.
      */}
      <div
        role="tablist"
        aria-label="Chế độ đồng hồ"
        className="mt-2 flex items-stretch gap-1"
      >
        {modes.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={PANEL_ID}
              onClick={() => onMode(m.id)}
              /*
                Tab đang chọn chỉ SÁNG LÊN trên một nền chip nhạt, không phải
                một khối trắng đặc: khối đặc chiếm hết đáy màn và hút mắt khỏi
                mặt số — đúng thứ bản này đang cố sửa.
              */
              className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 transition ${
                on
                  ? 'bg-[color:var(--clk-chip)] font-bold text-[color:var(--clk-fg)]'
                  : 'text-[color:var(--clk-soft)]'
              }`}
            >
              <span aria-hidden className="text-[17px] leading-none">
                {m.icon}
              </span>
              <span className="text-[10.5px] font-bold leading-none">{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LapList({ laps }: { laps: Lap[] }) {
  return (
    <ul className="mt-2 max-h-[104px] overflow-y-auto rounded-2xl bg-[color:var(--clk-chip)] px-3 py-2">
      {laps.map((l) => (
        <li
          key={l.index}
          className="flex items-baseline justify-between gap-3 py-1 text-[12.5px] tabular-nums"
        >
          <span className="text-[color:var(--clk-faint)]">Vòng {l.index}</span>
          <span className="text-[color:var(--clk-soft)]">+{lapClock(l.splitMs)}</span>
          <b>{lapClock(l.totalMs)}</b>
        </li>
      ))}
    </ul>
  );
}
