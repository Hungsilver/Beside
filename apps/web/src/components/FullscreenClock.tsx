import { useCallback, useEffect, useRef, useState } from 'react';
import { STUDY_PHASE_LABELS, type StudySessionResponse } from '@beside/shared';
import FlipClock from '@/components/FlipClock';
import { useSecondsLeft } from '@/lib/study-api';
import { useLandscape } from '@/lib/use-landscape';
import { useWakeLock } from '@/lib/use-wake-lock';
import { useWallClock } from '@/lib/use-wall-clock';

/**
 * Đồng hồ toàn màn hình — đặt máy dựng trên bàn mà nhìn.
 *
 * Hai chế độ dùng chung một mặt số:
 *   · **Đếm ngược** — chặng học/nghỉ đang chạy. Chỉ có khi đang có phiên.
 *   · **Giờ hiện tại** — đồng hồ để bàn thuần tuý, xem được cả khi không học.
 *
 * Cỡ chữ do `FlipClock size="fluid"` tự tính theo số thẻ và khung nhìn, nên xoay
 * ngang là đồng hồ tự phình ra chứ không cần bố cục riêng cho mỗi chiều.
 *
 * Khoá màn hình ngang chỉ là MỘT MỨC trong ba mức của `useLandscape()`: iOS
 * Safari không có API đó, và rất nhiều máy đang bật khoá xoay. Vì vậy lớp phủ
 * này phải đẹp ở cả hai chiều và **không bao giờ** chặn màn hình bằng tấm
 * "hãy xoay máy" — đúng nguyên tắc đã áp cho bàn Tiến lên.
 */

type Mode = 'countdown' | 'clock';

const PREFS_KEY = 'beside:clock-prefs';

interface Prefs {
  showSeconds: boolean;
  hour12: boolean;
}

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Partial<Prefs>;
        return {
          showSeconds: typeof p.showSeconds === 'boolean' ? p.showSeconds : true,
          hour12: typeof p.hour12 === 'boolean' ? p.hour12 : false,
        };
      }
    }
  } catch {
    /* localStorage bị chặn (chế độ riêng tư) — dùng mặc định */
  }
  return { showSeconds: true, hour12: false };
}

export default function FullscreenClock({
  session,
  onClose,
}: {
  /** Phiên đang chạy, `null` thì chỉ còn chế độ xem giờ. */
  session: StudySessionResponse | null;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [mode, setMode] = useState<Mode>(session ? 'countdown' : 'clock');
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideRef = useRef<number | null>(null);

  const landscape = useLandscape();
  const wake = useWakeLock(true);

  const secondsLeft = useSecondsLeft(session?.endsAt ?? null);
  const wall = useWallClock({ showSeconds: prefs.showSeconds, hour12: prefs.hour12 });

  /*
   * Phiên kết thúc trong lúc đang mở toàn màn hình thì rơi về xem giờ, không
   * đóng lớp phủ: người ta đặt máy dựng trên bàn, tự nhiên màn hình nhảy về
   * danh sách thống kê là thứ không ai muốn nhìn lúc đang nghỉ.
   */
  useEffect(() => {
    if (!session && mode === 'countdown') setMode('clock');
  }, [session, mode]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* bỏ qua */
    }
  }, [prefs]);

  // Esc để thoát — bàn phím ngoài cắm vào máy tính bảng vẫn phải dùng được.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /*
   * Các nút mờ đi sau 4 giây không chạm, chạm lại thì hiện.
   *
   * Giống trình phát video, và vì cùng một lý do: thứ người ta mở lên để NHÌN
   * thì mọi nút bấm đều là vật cản. Chỉ làm mờ chứ không gỡ khỏi cây DOM —
   * gỡ hẳn thì trình đọc màn hình mất luôn đường thoát.
   */
  const poke = useCallback(() => {
    setChromeVisible(true);
    if (hideRef.current !== null) window.clearTimeout(hideRef.current);
    hideRef.current = window.setTimeout(() => setChromeVisible(false), 4000);
  }, []);

  useEffect(() => {
    poke();
    return () => {
      if (hideRef.current !== null) window.clearTimeout(hideRef.current);
    };
  }, [poke]);

  const counting = mode === 'countdown' && session !== null;
  const focus = session?.phase === 'FOCUS';

  /*
   * Khổ DỌC thì xếp chồng, khổ ngang thì nằm một hàng.
   *
   * Sáu thẻ xếp ngang trên khung 390px cho ra mỗi thẻ 45px, trong khi nửa trên
   * và nửa dưới màn hình bỏ trống — xếp chồng làm chữ số to lên gấp hơn hai lần
   * mà không phải bỏ bớt thông tin nào.
   */
  const layout = landscape.portrait ? 'stack' : 'row';

  return (
    <div
      // Nền tối đặc: đây là thứ để trên bàn lúc học đêm, nền sáng thì chói mắt.
      className="fixed inset-0 z-[60] flex flex-col bg-[#0B0710] text-white"
      onPointerDown={poke}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <Chrome visible={chromeVisible}>
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <div className="min-w-0">
            {counting && session ? (
              <>
                <p className="text-[11.5px] font-bold tracking-[1.2px] text-white/60">
                  {(session.longBreak
                    ? 'Nghỉ dài'
                    : STUDY_PHASE_LABELS[session.phase]
                  ).toUpperCase()}
                  {session.roundsDone > 0 &&
                    ` · CHẶNG ${session.roundsDone + (focus ? 1 : 0)}`}
                </p>
                {session.subject && (
                  <p className="mt-0.5 truncate text-[13px] font-bold">{session.subject}</p>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-white/60">{wall.dateLabel}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Thoát toàn màn hình"
            className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-[15px]"
          >
            ✕
          </button>
        </div>
      </Chrome>

      {/* Mặt đồng hồ chiếm hết phần giữa và tự căn giữa ở cả hai chiều. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {counting ? (
          <FlipClock seconds={secondsLeft} size="fluid" layout={layout} />
        ) : (
          <div
            className={`flex items-end justify-center gap-2 ${layout === 'stack' ? 'flex-col' : ''}`}
          >
            <FlipClock
              parts={wall.parts}
              size="fluid"
              layout={layout}
              label={`Bây giờ là ${wall.spoken}`}
            />
            {wall.meridiem !== null && (
              <span className="pb-[0.2em] text-[20px] font-bold text-white/60">
                {wall.meridiem}
              </span>
            )}
          </div>
        )}
      </div>

      <Chrome visible={chromeVisible}>
        <div className="px-4 pb-3">
          {counting && session && <Progress session={session} secondsLeft={secondsLeft} />}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {session && (
              <Toggle
                on={mode === 'countdown'}
                onClick={() => setMode(mode === 'countdown' ? 'clock' : 'countdown')}
              >
                {mode === 'countdown' ? '⏳ Đếm ngược' : '🕐 Giờ hiện tại'}
              </Toggle>
            )}

            {!counting && (
              <>
                <Toggle
                  on={prefs.showSeconds}
                  onClick={() => setPrefs((p) => ({ ...p, showSeconds: !p.showSeconds }))}
                >
                  Giây
                </Toggle>
                <Toggle
                  on={prefs.hour12}
                  onClick={() => setPrefs((p) => ({ ...p, hour12: !p.hour12 }))}
                >
                  12 giờ
                </Toggle>
              </>
            )}

            {landscape.canLock && (
              <Toggle on={landscape.immersive} onClick={landscape.toggle}>
                {landscape.immersive ? '↩ Về dọc' : '⟳ Xoay ngang'}
              </Toggle>
            )}
          </div>

          <p className="mt-2 text-center text-[11px] text-white/35">
            {!landscape.canLock && landscape.portrait
              ? 'Xoay ngang điện thoại để đồng hồ to hết cỡ'
              : wake.held
                ? 'Màn hình được giữ sáng'
                : ''}
          </p>
        </div>
      </Chrome>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Lớp nút bấm tự mờ đi. Vẫn nhận được chạm khi mờ — chạm để gọi nó hiện lại. */
function Chrome({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`shrink-0 transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {children}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-11 rounded-full px-4 text-[13px] font-bold transition ${
        on ? 'bg-white text-[#0B0710]' : 'bg-white/12 text-white/80'
      }`}
    >
      {children}
    </button>
  );
}

function Progress({
  session,
  secondsLeft,
}: {
  session: StudySessionResponse;
  secondsLeft: number;
}) {
  // Chặng nghỉ DÀI có mốc riêng — lấy nhầm `breakMin` thì thanh chạy hết trong
  // 5 phút rồi đứng im suốt phần còn lại.
  const phaseMin =
    session.phase === 'FOCUS'
      ? session.focusMin
      : session.longBreak
        ? session.longBreakMin
        : session.breakMin;
  const totalSec = phaseMin * 60;
  const pct = totalSec > 0 ? Math.min(100, ((totalSec - secondsLeft) / totalSec) * 100) : 0;

  return (
    <div className="h-[5px] overflow-hidden rounded-full bg-white/15">
      <i
        className="block h-full rounded-full bg-white transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
