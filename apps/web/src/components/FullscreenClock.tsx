import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STUDY_PHASE_LABELS, type StudySessionResponse } from '@beside/shared';
import FlipClock from '@/components/FlipClock';
import { playTick } from '@/lib/audio-cues';
import { CLOCK_THEMES, DEFAULT_THEME_ID, findTheme, isLightTheme } from '@/lib/clock-themes';
import { useSecondsLeft } from '@/lib/study-api';
import { useLandscape } from '@/lib/use-landscape';
import { NOISE_PRESETS, type NoiseControls } from '@/lib/use-noise';
import { useSlideAdjust } from '@/lib/use-slide-adjust';
import { useStopwatch } from '@/lib/use-stopwatch';
import { useTimer } from '@/lib/use-timer';
import { useWakeLock } from '@/lib/use-wake-lock';
import { useWallClock } from '@/lib/use-wall-clock';

/**
 * Đồng hồ toàn màn hình — đặt máy dựng trên bàn mà nhìn.
 *
 * Bốn chế độ dùng chung MỘT mặt số:
 *   · **Giờ hiện tại** — đồng hồ để bàn, xem được cả khi không học.
 *   · **Phiên học** — đếm ngược chặng đang chạy. Chỉ có khi đang có phiên.
 *   · **Hẹn giờ** — đếm ngược tự do, không dính gì tới phiên học.
 *   · **Bấm giờ** — đếm lên, có ghi vòng.
 *
 * Cỡ chữ do `FlipClock size="fluid"` tự tính theo số thẻ và KHUNG CHỨA, nên xoay
 * ngang hay mở bảng cài đặt thì đồng hồ tự co giãn, không cần bố cục riêng.
 *
 * Khoá màn hình ngang chỉ là MỘT MỨC trong ba mức của `useLandscape()`: iOS
 * Safari không có API đó, và rất nhiều máy đang bật khoá xoay. Vì vậy lớp phủ
 * này phải đẹp ở cả hai chiều và **không bao giờ** chặn màn hình bằng tấm
 * "hãy xoay máy" — đúng nguyên tắc đã áp cho bàn Tiến lên.
 */

type Mode = 'clock' | 'countdown' | 'timer' | 'stopwatch';

const PREFS_KEY = 'beside:clock-prefs';

interface Prefs {
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

/** Độ tối tối thiểu khi chế độ đêm tự bật. */
const NIGHT_DIM = 0.45;

/** Khung giờ đêm, theo giờ hiển thị (21:00 tới trước 6:00). */
const NIGHT_FROM_HOUR = 21;
const NIGHT_TO_HOUR = 6;

/** Các mức hẹn giờ bấm nhanh, tính bằng phút. */
const TIMER_PRESETS = [1, 3, 5, 10, 15, 30] as const;

const DEFAULT_PREFS: Prefs = {
  showSeconds: true,
  hour12: false,
  dim: 0,
  themeId: DEFAULT_THEME_ID,
  tickSound: false,
  autoNight: false,
  antiBurnIn: true,
};

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Partial<Prefs>;
        return {
          ...DEFAULT_PREFS,
          ...bool(p, 'showSeconds'),
          ...bool(p, 'hour12'),
          ...bool(p, 'tickSound'),
          ...bool(p, 'autoNight'),
          ...bool(p, 'antiBurnIn'),
          themeId: typeof p.themeId === 'string' ? p.themeId : DEFAULT_THEME_ID,
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
  return DEFAULT_PREFS;
}

/** Chỉ nhận khoá nào thật sự là boolean; còn lại để mặc định lo. */
function bool<K extends keyof Prefs>(p: Partial<Prefs>, key: K): Partial<Prefs> {
  return typeof p[key] === 'boolean' ? ({ [key]: p[key] } as Partial<Prefs>) : {};
}

export default function FullscreenClock({
  session,
  noise,
  onClose,
}: {
  /** Phiên đang chạy, `null` thì không có chế độ "phiên học". */
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
  const timer = useTimer({ soundOn: true });
  const stopwatch = useStopwatch();

  const theme = useMemo(() => findTheme(prefs.themeId), [prefs.themeId]);
  const light = isLightTheme(theme);

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

  // Bảng cài đặt mở thì không cho các nút tự mờ đi — đang kéo thanh trượt mà
  // giao diện biến mất là thứ khó chịu nhất có thể làm với người dùng.
  useEffect(() => {
    if (panel) {
      setChromeVisible(true);
      if (hideRef.current !== null) window.clearTimeout(hideRef.current);
    }
  }, [panel]);

  const counting = mode === 'countdown' && session !== null;

  /*
   * Khổ DỌC thì xếp chồng, khổ ngang thì nằm một hàng.
   *
   * Sáu thẻ xếp ngang trên khung 390px cho ra mỗi thẻ 45px, trong khi nửa trên
   * và nửa dưới màn hình bỏ trống — xếp chồng làm chữ số to lên gấp hơn hai lần
   * mà không phải bỏ bớt thông tin nào.
   */
  const layout = landscape.portrait ? 'stack' : 'row';

  // ---------------------------------------------------------------- độ sáng

  const setBrightness = useCallback(
    // Thanh trượt nói "độ sáng" nên phải LẬT ngược: sáng 1.0 = tối 0.
    (value: number) => setPrefs((p) => ({ ...p, dim: (1 - value) * MAX_DIM })),
    [],
  );
  const brightness = 1 - prefs.dim / MAX_DIM;

  /*
   * Chế độ đêm chỉ ĐẶT SÀN, không ghi đè lựa chọn của người dùng.
   *
   * Ghi đè thì ai vừa kéo sáng lên sẽ thấy màn hình tự tối lại sau một nhịp —
   * trông như app đang cãi lại mình.
   */
  const nightActive = prefs.autoNight && isNightHour(wall.hour24);
  const effectiveDim = nightActive ? Math.max(prefs.dim, NIGHT_DIM) : prefs.dim;

  const slide = useSlideAdjust({
    getLeft: () => brightness,
    getRight: () => noise.volume,
    onLeft: setBrightness,
    onRight: noise.setVolume,
  });

  // ---------------------------------------------------- tiếng tách khi lật

  /** Chuỗi chữ số đang hiện — đổi chuỗi nghĩa là có thẻ vừa lật. */
  const faceKey = counting
    ? String(secondsLeft)
    : mode === 'timer'
      ? String(Math.ceil(timer.remainingMs / 1000))
      : mode === 'stopwatch'
        ? String(Math.floor(stopwatch.elapsedMs / 1000))
        : wall.parts.map((p) => p.digits.join('')).join(':');

  const lastFaceRef = useRef(faceKey);
  useEffect(() => {
    if (lastFaceRef.current === faceKey) return;
    lastFaceRef.current = faceKey;
    if (prefs.tickSound) playTick(0.3);
  }, [faceKey, prefs.tickSound]);

  // ------------------------------------------------------- chống lưu ảnh

  const drift = useAntiBurnIn(prefs.antiBurnIn);

  // ------------------------------------------------------------------ vẽ

  const modes: { id: Mode; label: string }[] = [
    { id: 'clock', label: '🕐 Giờ' },
    ...(session ? [{ id: 'countdown' as Mode, label: '📚 Phiên học' }] : []),
    { id: 'timer', label: '⏳ Hẹn giờ' },
    { id: 'stopwatch', label: '⏱ Bấm giờ' },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-[color:var(--clk-bg)] text-[color:var(--clk-fg)]"
      onPointerDown={poke}
      style={
        {
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
          // Chủ đề đi vào bằng BIẾN CSS: `.flip-digit` nằm sâu trong component
          // và còn được dùng ở màn phòng học, nên đây là chỗ duy nhất đổi được
          // màu mà không phải sửa component.
          '--flip-top': theme.top,
          '--flip-bottom': theme.bottom,
          '--flip-ink': theme.ink,
          '--clk-bg': theme.page,
          '--clk-fg': light ? '#211a16' : '#ffffff',
          '--clk-soft': light ? 'rgba(33,26,22,0.6)' : 'rgba(255,255,255,0.6)',
          '--clk-faint': light ? 'rgba(33,26,22,0.38)' : 'rgba(255,255,255,0.35)',
          '--clk-chip': light ? 'rgba(33,26,22,0.1)' : 'rgba(255,255,255,0.12)',
          '--clk-on-bg': light ? '#211a16' : '#ffffff',
          '--clk-on-fg': light ? '#f3ece7' : '#0b0710',
        } as React.CSSProperties
      }
    >
      <Chrome visible={chromeVisible}>
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <div className="min-w-0">
            <Heading mode={mode} session={session} wall={wall} timer={timer} />
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Thoát toàn màn hình"
            className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--clk-chip)] text-[15px]"
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
        className="flip-stage relative flex min-h-0 flex-1 touch-none select-none items-center justify-center px-2"
        {...slide.handlers}
      >
        <div className="flip-drift" style={{ transform: `translate(${drift.x}px, ${drift.y}px)` }}>
          {counting ? (
            <FlipClock seconds={secondsLeft} size="fluid" layout={layout} />
          ) : mode === 'timer' ? (
            <FlipClock
              seconds={Math.ceil(timer.remainingMs / 1000)}
              size="fluid"
              layout={layout}
              label={`Còn lại ${Math.ceil(timer.remainingMs / 1000)} giây`}
            />
          ) : mode === 'stopwatch' ? (
            <FlipClock
              seconds={Math.floor(stopwatch.elapsedMs / 1000)}
              size="fluid"
              layout={layout}
              label={`Đã đi ${Math.floor(stopwatch.elapsedMs / 1000)} giây`}
            />
          ) : (
            <FlipClock
              parts={wall.parts}
              size="fluid"
              layout={layout}
              label={`Bây giờ là ${wall.spoken}`}
            />
          )}
        </div>

        {/*
          Phần trăm giây và SA/CH đặt TÁCH khỏi dòng bố cục của mặt đồng hồ.

          Để chúng làm anh em trong cùng một flex thì mặt đồng hồ bị đẩy lệch và
          tràn hẳn ra ngoài mép — `FlipClock` tự tính cỡ theo khung chứa, nó
          không biết có ai đứng cạnh. Neo tuyệt đối vào góc thì mặt đồng hồ giữ
          nguyên kích thước lớn nhất có thể.
        */}
        {mode === 'stopwatch' && (
          <span className="pointer-events-none absolute bottom-1 right-3 text-[20px] font-extrabold tabular-nums text-[color:var(--clk-soft)]">
            ,{centis(stopwatch.elapsedMs)}
          </span>
        )}
        {mode === 'clock' && wall.meridiem !== null && (
          <span className="pointer-events-none absolute bottom-1 right-3 text-[20px] font-bold text-[color:var(--clk-soft)]">
            {wall.meridiem}
          </span>
        )}
      </div>

      <Chrome visible={chromeVisible}>
        <div className="px-4 pb-3">
          {counting && session && <Progress session={session} secondsLeft={secondsLeft} />}
          {mode === 'timer' && timer.totalMs > 0 && (
            <Bar pct={((timer.totalMs - timer.remainingMs) / timer.totalMs) * 100} />
          )}

          {/* Chọn chế độ */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {modes.map((m) => (
              <Toggle key={m.id} on={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </Toggle>
            ))}
          </div>

          {/* Nút riêng của từng chế độ */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {mode === 'clock' && (
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

            {mode === 'timer' && (
              <TimerControls timer={timer} />
            )}

            {mode === 'stopwatch' && (
              <>
                <Toggle
                  on={stopwatch.running}
                  onClick={() => (stopwatch.running ? stopwatch.pause() : stopwatch.start())}
                >
                  {stopwatch.running ? '⏸ Tạm dừng' : '▶ Bắt đầu'}
                </Toggle>
                <Toggle on={false} onClick={stopwatch.lap}>
                  🏁 Vòng
                </Toggle>
                <Toggle on={false} onClick={stopwatch.reset}>
                  ↺ Xoá
                </Toggle>
              </>
            )}

            {landscape.canLock && (
              <Toggle on={landscape.immersive} onClick={landscape.toggle}>
                {landscape.immersive ? '↩ Về dọc' : '⟳ Xoay ngang'}
              </Toggle>
            )}

            <Toggle on={panel} onClick={() => setPanel((v) => !v)}>
              ⚙ Cài đặt
            </Toggle>
          </div>

          {mode === 'stopwatch' && stopwatch.laps.length > 0 && (
            <LapList laps={stopwatch.laps} />
          )}

          {panel && (
            <SettingsPanel
              prefs={prefs}
              setPrefs={setPrefs}
              brightness={brightness}
              setBrightness={setBrightness}
              noise={noise}
            />
          )}

          <p className="mt-2 text-center text-[11px] leading-relaxed text-[color:var(--clk-faint)]">
            Vuốt dọc nửa trái để chỉnh sáng, nửa phải để chỉnh tiếng
            {nightActive
              ? ' · đang ở chế độ đêm'
              : !landscape.canLock && landscape.portrait
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
        style={{ opacity: effectiveDim }}
      />

      {slide.active !== null && (
        <Hud
          side={slide.active}
          value={slide.active === 'left' ? brightness : noise.volume}
          muted={slide.active === 'right' && noise.playing === null}
        />
      )}

      {timer.finished && <TimerDone onDismiss={timer.dismiss} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chống lưu ảnh
// ---------------------------------------------------------------------------

/**
 * Dịch mặt đồng hồ vài pixel theo chu kỳ.
 *
 * Màn OLED để nguyên một mặt đồng hồ hàng giờ sẽ in vệt chữ số lại vĩnh viễn.
 * Đi theo hình thoi bốn đỉnh chứ không nhảy ngẫu nhiên: ngẫu nhiên có thể rơi
 * hai lần liền vào cùng một chỗ, mà mục đích ở đây là điểm ảnh nào cũng được
 * nghỉ.
 */
const DRIFT_STEPS = [
  { x: -6, y: -4 },
  { x: 6, y: -4 },
  { x: 6, y: 4 },
  { x: -6, y: 4 },
];
const DRIFT_INTERVAL_MS = 60_000;

function useAntiBurnIn(enabled: boolean): { x: number; y: number } {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % DRIFT_STEPS.length),
      DRIFT_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return { x: 0, y: 0 };
  return DRIFT_STEPS[step] ?? { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------

function isNightHour(hour24: number): boolean {
  if (!Number.isFinite(hour24)) return false;
  // Khung giờ BẮC QUA nửa đêm, nên là phép HOẶC chứ không phải một khoảng.
  return hour24 >= NIGHT_FROM_HOUR || hour24 < NIGHT_TO_HOUR;
}

/** Hai chữ số phần trăm giây. */
function centis(ms: number): string {
  const v = Math.floor((Math.max(0, ms) % 1000) / 10);
  return String(v).padStart(2, '0');
}

/** `754300` → `12:34,30`. Dùng cho danh sách vòng. */
function lapClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const head = h > 0 ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0');
  return `${head}:${String(s).padStart(2, '0')},${centis(ms)}`;
}

// ---------------------------------------------------------------------------

function Heading({
  mode,
  session,
  wall,
  timer,
}: {
  mode: Mode;
  session: StudySessionResponse | null;
  wall: { dateLabel: string };
  timer: { running: boolean; totalMs: number };
}) {
  if (mode === 'countdown' && session) {
    const focus = session.phase === 'FOCUS';
    return (
      <>
        <p className="text-[11.5px] font-bold tracking-[1.2px] text-[color:var(--clk-soft)]">
          {(session.longBreak ? 'Nghỉ dài' : STUDY_PHASE_LABELS[session.phase]).toUpperCase()}
          {session.roundsDone > 0 && ` · CHẶNG ${session.roundsDone + (focus ? 1 : 0)}`}
        </p>
        {session.subject && (
          <p className="mt-0.5 truncate text-[13px] font-bold">{session.subject}</p>
        )}
      </>
    );
  }

  if (mode === 'timer') {
    return (
      <p className="text-[12.5px] text-[color:var(--clk-soft)]">
        {timer.totalMs === 0
          ? 'Chọn một mức để bắt đầu hẹn giờ'
          : timer.running
            ? 'Đang đếm ngược · chuông chỉ kêu khi app còn mở'
            : 'Đang tạm dừng'}
      </p>
    );
  }

  if (mode === 'stopwatch') {
    return <p className="text-[12.5px] text-[color:var(--clk-soft)]">Bấm giờ</p>;
  }

  return <p className="text-[12.5px] text-[color:var(--clk-soft)]">{wall.dateLabel}</p>;
}

function TimerControls({
  timer,
}: {
  timer: ReturnType<typeof useTimer>;
}) {
  // Chưa đặt gì thì hiện các mức bấm nhanh; đang chạy thì hiện nút điều khiển.
  if (timer.totalMs === 0) {
    return (
      <>
        {TIMER_PRESETS.map((m) => (
          <Toggle key={m} on={false} onClick={() => timer.start(m * 60_000)}>
            {m} phút
          </Toggle>
        ))}
      </>
    );
  }

  return (
    <>
      <Toggle
        on={timer.running}
        onClick={() => (timer.running ? timer.pause() : timer.resume())}
      >
        {timer.running ? '⏸ Tạm dừng' : '▶ Tiếp tục'}
      </Toggle>
      <Toggle on={false} onClick={timer.reset}>
        ↺ Đặt lại
      </Toggle>
    </>
  );
}

function LapList({ laps }: { laps: { index: number; totalMs: number; splitMs: number }[] }) {
  return (
    <ul className="mt-2 max-h-[112px] overflow-y-auto rounded-2xl bg-[color:var(--clk-chip)] px-3 py-2">
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

function SettingsPanel({
  prefs,
  setPrefs,
  brightness,
  setBrightness,
  noise,
}: {
  prefs: Prefs;
  setPrefs: React.Dispatch<React.SetStateAction<Prefs>>;
  brightness: number;
  setBrightness: (v: number) => void;
  noise: NoiseControls;
}) {
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-[color:var(--clk-chip)] px-3.5 py-3">
      {/*
        Thanh trượt THẬT, bên cạnh cử chỉ vuốt.
        Cử chỉ không tự nói cho ai biết là nó tồn tại, và người dùng trình đọc
        màn hình thì không vuốt được — nên hai đường vào phải cùng có.
      */}
      <Slider icon="🔅" label="Độ sáng" value={brightness} onChange={setBrightness} />
      <Slider
        icon="🔊"
        label="Âm lượng tiếng nền"
        value={noise.volume}
        onChange={noise.setVolume}
      />

      {noise.supported && (
        <div className="flex gap-2">
          {NOISE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={noise.playing === p.id}
              onClick={() => noise.toggle(p.id)}
              // Nhãn ở đây dài hơn nút tròn thường (`Ồn trắng`), nên chữ nhỏ hơn
              // và `whitespace-nowrap` — xuống dòng thì chữ tràn khỏi nút cao 44px.
              className={`h-11 flex-1 whitespace-nowrap rounded-full px-2 text-[11.5px] font-bold transition ${
                noise.playing === p.id
                  ? 'bg-[color:var(--clk-on-bg)] text-[color:var(--clk-on-fg)]'
                  : 'bg-[color:var(--clk-chip)] text-[color:var(--clk-soft)]'
              }`}
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {CLOCK_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={`Chủ đề ${t.label}`}
            aria-pressed={prefs.themeId === t.id}
            onClick={() => setPrefs((p) => ({ ...p, themeId: t.id }))}
            className={`h-11 flex-1 overflow-hidden rounded-xl text-[11.5px] font-bold ring-offset-2 transition ${
              prefs.themeId === t.id ? 'ring-2 ring-[color:var(--clk-fg)]' : ''
            }`}
            style={{
              background: `linear-gradient(${t.top} 0 50%, ${t.bottom} 50% 100%)`,
              color: t.ink,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/*
        Ba tuỳ chọn này xếp DỌC, không nhồi thành ba nút cạnh nhau: nhãn của
        chúng dài (`Tự tối ban đêm`) nên nút ba cột sẽ xuống dòng và chữ tràn ra
        khỏi khung. Xếp dọc cũng đúng kiểu một bảng cài đặt hơn.
      */}
      <div className="flex flex-col">
        <Switch
          label="🔈 Tiếng lật"
          on={prefs.tickSound}
          onClick={() => setPrefs((p) => ({ ...p, tickSound: !p.tickSound }))}
        />
        <Switch
          label="🌙 Tự tối ban đêm"
          on={prefs.autoNight}
          onClick={() => setPrefs((p) => ({ ...p, autoNight: !p.autoNight }))}
        />
        <Switch
          label="🛡 Chống lưu ảnh"
          on={prefs.antiBurnIn}
          onClick={() => setPrefs((p) => ({ ...p, antiBurnIn: !p.antiBurnIn }))}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-[color:var(--clk-faint)]">
        Chế độ đêm tự làm tối từ {NIGHT_FROM_HOUR}h tới {NIGHT_TO_HOUR}h — nó chỉ đặt sàn,
        kéo sáng lên lúc nào cũng được. Chống lưu ảnh dịch đồng hồ vài pixel mỗi phút để màn
        OLED không in vệt chữ số.
      </p>
    </div>
  );
}

/** Một dòng bật/tắt trong bảng cài đặt: nhãn bên trái, công tắc bên phải. */
function Switch({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[13px] font-bold"
    >
      <span className={on ? '' : 'text-[color:var(--clk-soft)]'}>{label}</span>
      <span
        aria-hidden
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-[3px] transition ${
          on ? 'bg-[color:var(--clk-on-bg)]' : 'bg-[color:var(--clk-chip)]'
        }`}
      >
        <i
          className={`block size-[18px] rounded-full transition-transform ${
            on
              ? 'translate-x-4 bg-[color:var(--clk-on-fg)]'
              : 'bg-[color:var(--clk-soft)]'
          }`}
        />
      </span>
    </button>
  );
}

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
        className="h-11 min-w-0 flex-1 accent-[color:var(--clk-fg)]"
      />
      <span className="w-[38px] shrink-0 text-right text-[11.5px] tabular-nums text-[color:var(--clk-faint)]">
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
function TimerDone({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-label="Hết giờ"
      className="absolute inset-0 z-20 flex items-center justify-center px-6"
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

function Bar({ pct }: { pct: number }) {
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
  return <Bar pct={totalSec > 0 ? ((totalSec - secondsLeft) / totalSec) * 100 : 0} />;
}
