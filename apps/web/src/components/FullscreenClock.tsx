import { useCallback, useEffect, useRef, useState } from 'react';
import { STUDY_PHASE_LABELS, type StudySessionResponse } from '@beside/shared';
import FlipClock from '@/components/FlipClock';
import { useSecondsLeft } from '@/lib/study-api';
import { useLandscape } from '@/lib/use-landscape';
import { useSlideAdjust } from '@/lib/use-slide-adjust';
import { useWakeLock } from '@/lib/use-wake-lock';
import { useWallClock } from '@/lib/use-wall-clock';
import { NOISE_PRESETS, type NoiseControls } from '@/lib/use-noise';

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
  /** Độ tối của lớp phủ, 0 = sáng nhất. Xem `MAX_DIM`. */
  dim: number;
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
const MAX_DIM = 0.82;

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
          // Giá trị hỏng (chuỗi, NaN, số ngoài khoảng) đều quy về sáng nhất —
          // mở app lên mà màn hình đen sì thì không ai biết vì sao.
          dim:
            typeof p.dim === 'number' && Number.isFinite(p.dim)
              ? Math.min(MAX_DIM, Math.max(0, p.dim))
              : 0,
        };
      }
    }
  } catch {
    /* localStorage bị chặn (chế độ riêng tư) — dùng mặc định */
  }
  return { showSeconds: true, hour12: false, dim: 0 };
}

export default function FullscreenClock({
  session,
  noise,
  onClose,
}: {
  /** Phiên đang chạy, `null` thì chỉ còn chế độ xem giờ. */
  session: StudySessionResponse | null;
  /**
   * Tiếng ồn nền dùng chung với màn hình phía dưới.
   *
   * Truyền vào chứ không tự gọi `useNoise()` ở đây: gọi lại sẽ dựng một
   * `AudioContext` thứ hai, và tiếng đang kêu ở màn kia không tắt đi — hai
   * luồng nhiễu chồng lên nhau.
   */
  noise: NoiseControls;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [mode, setMode] = useState<Mode>(session ? 'countdown' : 'clock');
  const [chromeVisible, setChromeVisible] = useState(true);
  const [panel, setPanel] = useState(false);
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

  const setDim = useCallback(
    // Thanh trượt nói "độ sáng" nên phải LẬT ngược: sáng 1.0 = tối 0.
    (brightness: number) =>
      setPrefs((p) => ({ ...p, dim: (1 - brightness) * MAX_DIM })),
    [],
  );
  const brightness = 1 - prefs.dim / MAX_DIM;

  const slide = useSlideAdjust({
    getLeft: () => brightness,
    getRight: () => noise.volume,
    onLeft: setDim,
    onRight: noise.setVolume,
    enabled: true,
  });

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

      {/*
        Mặt đồng hồ chiếm hết phần giữa, và cũng là VÙNG VUỐT: nửa trái chỉnh
        độ sáng, nửa phải chỉnh âm lượng. Đặt cử chỉ ở đây chứ không ở lớp gốc
        để các nút ở hai đầu màn hình vẫn bấm được bình thường.
        `touch-none` để trình duyệt không hiểu nhầm thành cuộn trang.
      */}
      <div
        className="flip-stage flex min-h-0 flex-1 touch-none select-none items-center justify-center px-2"
        {...slide.handlers}
      >
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

            <Toggle on={panel} onClick={() => setPanel((v) => !v)}>
              🔅 Sáng &amp; tiếng
            </Toggle>
          </div>

          {/*
            Thanh trượt THẬT, bên cạnh cử chỉ vuốt.
            Cử chỉ không tự nói cho ai biết là nó tồn tại, và người dùng trình
            đọc màn hình thì không vuốt được — nên hai đường vào phải cùng có.
          */}
          {panel && (
            <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-white/[0.07] px-3.5 py-3">
              <Slider
                icon="🔅"
                label="Độ sáng"
                value={brightness}
                onChange={setDim}
              />
              <Slider
                icon="🔊"
                label="Âm lượng tiếng nền"
                value={noise.volume}
                onChange={noise.setVolume}
              />

              {noise.supported && (
                <div className="flex gap-2">
                  {NOISE_PRESETS.map((p) => {
                    const on = noise.playing === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => noise.toggle(p.id)}
                        className={`h-11 flex-1 rounded-xl text-[12.5px] font-bold transition ${
                          on ? 'bg-white text-[#0B0710]' : 'bg-white/10 text-white/75'
                        }`}
                      >
                        {p.emoji} {p.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-center text-[11px] leading-relaxed text-white/35">
            Vuốt dọc nửa trái để chỉnh sáng, nửa phải để chỉnh tiếng
            {!landscape.canLock && landscape.portrait
              ? ' · xoay ngang máy để đồng hồ to hết cỡ'
              : wake.held
                ? ' · màn hình đang được giữ sáng'
                : ''}
          </p>
        </div>
      </Chrome>

      {/*
        Lớp làm tối. Nằm TRÊN mọi thứ (kể cả nút bấm) vì đó mới giống giảm độ
        sáng thật, nhưng DƯỚI bảng báo giá trị — đang vuốt mà không đọc được số
        phần trăm thì chỉnh bằng cảm giác.
        `pointer-events-none` để nó không nuốt cú chạm nào.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-black transition-opacity duration-200"
        style={{ opacity: prefs.dim }}
      />

      {slide.active !== null && (
        <Hud
          side={slide.active}
          value={slide.active === 'left' ? brightness : noise.volume}
          muted={slide.active === 'right' && noise.playing === null}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Slider({
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
        className="h-11 min-w-0 flex-1 accent-white"
      />
      <span className="w-[38px] shrink-0 text-right text-[11.5px] tabular-nums text-white/50">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

/** Bảng báo giá trị khi đang vuốt. Nổi trên cả lớp làm tối. */
function Hud({
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
      <div className="flex min-w-[136px] flex-col items-center gap-2 rounded-3xl bg-black/70 px-6 py-5 backdrop-blur-sm">
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
