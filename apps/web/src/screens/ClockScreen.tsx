import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { STUDY_PHASE_LABELS, type StudySessionResponse } from '@beside/shared';
import FlipClock from '@/components/FlipClock';
import ClockBottomBar, { PANEL_ID } from '@/components/clock/ClockBottomBar';
import ClockSheet from '@/components/clock/ClockSheet';
import ClockTimerSetup from '@/components/clock/ClockTimerSetup';
import { Chrome, Hud, IconButton, TimerDone } from '@/components/clock/ClockBits';
import { playTick } from '@/lib/audio-cues';
import { centis } from '@/lib/clock-format';
import { useAuth } from '@/lib/auth-context';
import { findTheme, isLightTheme } from '@/lib/clock-themes';
import {
  MAX_DIM,
  NIGHT_DIM,
  isNightHour,
  readClockPrefs,
  writeClockPrefs,
  type ClockMode,
  type ClockPrefs,
} from '@/lib/clock-prefs';
import { useSecondsLeft, useStudySummary } from '@/lib/study-api';
import { useBattery } from '@/lib/use-battery';
import { useLandscape } from '@/lib/use-landscape';
import { useNoise } from '@/lib/use-noise';
import { useSlideAdjust } from '@/lib/use-slide-adjust';
import { useStopwatch } from '@/lib/use-stopwatch';
import { useTimer } from '@/lib/use-timer';
import { useWakeLock } from '@/lib/use-wake-lock';
import { useWallClock } from '@/lib/use-wall-clock';

/**
 * Module **Đồng hồ** — màn hình riêng ở `/dong-ho`, ngang hàng với Phòng học.
 *
 * Trước đây đây là một lớp phủ nằm bên trong `StudyScreen` và phải được màn đó
 * truyền `session` + `noise` vào. Tách ra vì nó không phụ thuộc gì vào việc học:
 * thứ dùng thường xuyên nhất là dựng máy trên bàn mà xem giờ.
 *
 * **Bố cục** — ưu tiên tuyệt đối cho mặt số, theo dáng các app Flip Clock:
 *
 *   ┌──────────────────────────┐
 *   │ Thứ Sáu, 12/09   ⟳ ⚙ ✕ │  ← thanh mảnh, tự mờ sau 4 giây
 *   │   ████  ████  ████       │  ← mặt số chiếm HẾT phần giữa
 *   │ [Giờ][Hẹn giờ][Bấm][Học] │  ← MỘT hàng tab, không gì khác
 *   └──────────────────────────┘
 *
 * Mọi cài đặt nằm trong bảng trượt lên (`ClockSheet`). Bản trước bày chúng
 * thành ba hàng chip dưới đáy và mặt số chỉ còn hơn nửa màn hình.
 *
 * Bốn chế độ dùng chung MỘT mặt số:
 *   · **Giờ** — đồng hồ để bàn, xem được cả khi không học.
 *   · **Hẹn giờ** — đếm ngược tự do, không dính gì tới phiên học.
 *   · **Bấm giờ** — đếm lên, có ghi vòng.
 *   · **Phiên học** — đếm ngược chặng đang chạy. Chỉ có khi đang có phiên.
 *
 * Cỡ chữ do `FlipClock size="fluid"` tự tính theo số thẻ và KHUNG CHỨA, nên xoay
 * ngang hay mở hàng nút của chế độ hẹn giờ thì đồng hồ tự co giãn.
 *
 * Khoá màn hình ngang chỉ là MỘT MỨC trong ba mức của `useLandscape()`: iOS
 * Safari không có API đó, và rất nhiều máy đang bật khoá xoay. Vì vậy màn này
 * phải đẹp ở cả hai chiều và **không bao giờ** chặn màn hình bằng tấm "hãy xoay
 * máy" — đúng nguyên tắc đã áp cho bàn Tiến lên.
 */
export default function ClockScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const [prefs, setPrefs] = useState<ClockPrefs>(readClockPrefs);
  // Vào từ Phòng học thì `?che-do=phien-hoc` — không auto nhảy sang phiên học
  // khi vào từ trang chủ: người ta bấm "Đồng hồ" thì muốn xem GIỜ.
  const [mode, setMode] = useState<ClockMode>(() =>
    params.get('che-do') === 'phien-hoc' ? 'countdown' : 'clock',
  );
  const [chromeVisible, setChromeVisible] = useState(true);
  const [sheet, setSheet] = useState(false);
  const hideRef = useRef<number | null>(null);

  /*
   * Phiên học chỉ có khi đã ghép đôi. Route này KHÔNG bọc trong `RequireCouple`
   * (một cái đồng hồ không cần người thứ hai), nên phải tự tắt truy vấn — bật
   * mà chưa ghép thì mỗi lần mở đồng hồ là một lần gọi API trả 4xx.
   */
  const summary = useStudySummary({ enabled: Boolean(user?.coupleId) });
  const session = summary.data?.current ?? null;

  const landscape = useLandscape();
  const wake = useWakeLock(prefs.keepAwake);
  const noise = useNoise();
  const battery = useBattery(prefs.showBattery);

  const secondsLeft = useSecondsLeft(session?.endsAt ?? null);
  const wall = useWallClock({ showSeconds: prefs.showSeconds, hour12: prefs.hour12 });
  const timer = useTimer({ soundOn: true });
  const stopwatch = useStopwatch();

  const theme = useMemo(() => findTheme(prefs.themeId), [prefs.themeId]);
  const light = isLightTheme(theme);

  /*
   * Không có phiên thì rơi về xem giờ, không đóng màn: người ta đặt máy dựng
   * trên bàn, tự nhiên màn hình nhảy về danh sách thống kê là thứ không ai muốn
   * nhìn lúc đang nghỉ.
   *
   * Chờ `isLoading` xong mới xét: vào bằng `?che-do=phien-hoc` thì lúc đầu
   * `session` còn là `null` vì truy vấn chưa về, xét sớm là đá người dùng khỏi
   * đúng chế độ họ vừa xin.
   */
  useEffect(() => {
    if (!summary.isLoading && !session && mode === 'countdown') setMode('clock');
  }, [summary.isLoading, session, mode]);

  useEffect(() => writeClockPrefs(prefs), [prefs]);

  const exit = useCallback(() => {
    /*
     * Quay lại chỗ vừa tới. Mở trực tiếp bằng đường dẫn (lối tắt PWA, hoặc dán
     * link) thì không có trang trước — `location.key` là `'default'` đúng ở
     * trường hợp đó — nên rơi về trang chủ thay vì đẩy người dùng ra khỏi app.
     */
    if (location.key === 'default') void navigate('/');
    else void navigate(-1);
  }, [location.key, navigate]);

  // Esc để thoát — bàn phím ngoài cắm vào máy tính bảng vẫn phải dùng được.
  // Bảng cài đặt đang mở thì Esc là của nó, không phải của màn hình.
  useEffect(() => {
    if (sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit, sheet]);

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

  /*
   * Đang đặt hẹn giờ hoặc bảng cài đặt đang mở thì KHÔNG cho các nút tự mờ —
   * đang gõ số phút mà giao diện biến mất là thứ khó chịu nhất có thể làm với
   * người dùng.
   */
  const settingTimer = mode === 'timer' && timer.totalMs === 0;
  const pinned = sheet || settingTimer || mode === 'stopwatch';
  useEffect(() => {
    if (!pinned) return;
    setChromeVisible(true);
    if (hideRef.current !== null) window.clearTimeout(hideRef.current);
  }, [pinned]);

  const counting = mode === 'countdown' && session !== null;

  /*
   * Khổ DỌC thì xếp chồng, khổ ngang thì nằm một hàng.
   *
   * Ba thẻ nhóm xếp ngang trên khung 390px cho mỗi thẻ ~120px, trong khi nửa
   * trên và nửa dưới màn hình bỏ trống — xếp chồng làm chữ số to lên gấp hơn
   * hai lần mà không phải bỏ bớt thông tin nào.
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
    // Màn đặt hẹn giờ có nút bấm và một ô gõ số — vuốt ở đó phải là vuốt
    // thường, không phải cử chỉ chỉnh sáng.
    enabled: !settingTimer,
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

  const note = statusLine({ nightActive, landscape, wake });

  const modes: { id: ClockMode; icon: string; label: string }[] = [
    { id: 'clock', icon: '🕐', label: 'Giờ' },
    { id: 'timer', icon: '⏳', label: 'Hẹn giờ' },
    { id: 'stopwatch', icon: '⏱', label: 'Bấm giờ' },
    ...(session ? [{ id: 'countdown' as ClockMode, icon: '📚', label: 'Phiên học' }] : []),
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
      {/*
        Thanh trên MẢNH: một dòng chữ nhỏ bên trái, các nút tròn bên phải. Không
        có tiêu đề to, không có thẻ nào — mỗi pixel ở đây là pixel lấy khỏi mặt
        số.
      */}
      <Chrome visible={chromeVisible}>
        <div className="flex items-center justify-end gap-1.5 px-3 pt-2">
          <div className="min-w-0 flex-1 pr-1">
            <Heading
              mode={mode}
              session={session}
              wall={wall}
              timer={timer}
              showDate={prefs.showDate}
              batteryLevel={battery.level}
              charging={battery.charging}
            />
          </div>

          {landscape.canLock && (
            <IconButton
              onClick={landscape.toggle}
              label={landscape.immersive ? 'Về khổ dọc' : 'Xoay ngang toàn màn hình'}
            >
              {landscape.immersive ? '↩' : '⟳'}
            </IconButton>
          )}
          <IconButton onClick={() => setSheet(true)} label="Cài đặt đồng hồ">
            ⚙
          </IconButton>
          <IconButton onClick={exit} label="Thoát đồng hồ">
            ✕
          </IconButton>
        </div>
      </Chrome>

      {/*
        Mặt đồng hồ chiếm hết phần giữa, và cũng là VÙNG VUỐT: nửa trái chỉnh
        độ sáng, nửa phải chỉnh âm lượng. Đặt cử chỉ ở đây chứ không ở lớp gốc
        để các nút ở hai đầu màn hình vẫn bấm được bình thường.
        `touch-none` để trình duyệt không hiểu nhầm thành cuộn trang.
      */}
      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-label={modes.find((m) => m.id === mode)?.label ?? 'Đồng hồ'}
        /*
          Lúc đang ĐẶT hẹn giờ thì bỏ `flip-stage`: không có mặt số nào để đo
          theo khung chứa, mà `container-type: size` lại làm khung này phớt lờ
          chiều cao nội dung — ở khổ ngang (~250px) màn đặt sẽ tràn ra ngoài
          màn hình mà không cuộn được tới. Thay bằng cuộn dọc bình thường.
        */
        className={`relative flex min-h-0 flex-1 select-none items-center justify-center px-2 ${
          settingTimer ? 'overflow-y-auto py-2' : 'flip-stage touch-none'
        }`}
        {...slide.handlers}
      >
        {settingTimer ? (
          <ClockTimerSetup onStart={timer.start} />
        ) : (
          <>
            <div
              className="flip-drift"
              style={{ transform: `translate(${drift.x}px, ${drift.y}px)` }}
            >
              {counting ? (
                <FlipClock seconds={secondsLeft} size="fluid" layout={layout} card="group" />
              ) : mode === 'timer' ? (
                <FlipClock
                  seconds={Math.ceil(timer.remainingMs / 1000)}
                  size="fluid"
                  layout={layout}
                  card="group"
                  label={`Còn lại ${Math.ceil(timer.remainingMs / 1000)} giây`}
                />
              ) : mode === 'stopwatch' ? (
                <FlipClock
                  seconds={Math.floor(stopwatch.elapsedMs / 1000)}
                  size="fluid"
                  layout={layout}
                  card="group"
                  label={`Đã đi ${Math.floor(stopwatch.elapsedMs / 1000)} giây`}
                />
              ) : (
                <FlipClock
                  parts={wall.parts}
                  size="fluid"
                  layout={layout}
                  card="group"
                  label={`Bây giờ là ${wall.spoken}`}
                />
              )}
            </div>

            {/*
              Phần trăm giây và SA/CH đặt TÁCH khỏi dòng bố cục của mặt đồng hồ.

              Để chúng làm anh em trong cùng một flex thì mặt đồng hồ bị đẩy lệch
              và tràn hẳn ra ngoài mép — `FlipClock` tự tính cỡ theo khung chứa,
              nó không biết có ai đứng cạnh. Neo tuyệt đối vào góc thì mặt đồng
              hồ giữ nguyên kích thước lớn nhất có thể.
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
          </>
        )}
      </div>

      <Chrome visible={chromeVisible}>
        <ClockBottomBar
          mode={mode}
          modes={modes}
          onMode={setMode}
          /*
            Dòng trạng thái chỉ hiện khi thật sự có gì để nói. Dòng "vuốt để
            chỉnh sáng" đã dọn vào bảng cài đặt: nó là hướng dẫn đọc một lần,
            không phải thứ cần nằm trên màn hình mãi.
          */
          note={note}
          progressPct={
            counting && session
              ? phaseProgress(session, secondsLeft)
              : mode === 'timer' && timer.totalMs > 0
                ? ((timer.totalMs - timer.remainingMs) / timer.totalMs) * 100
                : null
          }
          timer={timer}
          stopwatch={stopwatch}
        />
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

      {sheet && (
        <ClockSheet
          prefs={prefs}
          setPrefs={setPrefs}
          brightness={brightness}
          setBrightness={setBrightness}
          noise={noise}
          onClose={() => setSheet(false)}
        />
      )}

      {timer.finished && <TimerDone onDismiss={timer.dismiss} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Tiến độ chặng học. Chặng nghỉ DÀI có mốc riêng. */
function phaseProgress(session: StudySessionResponse, secondsLeft: number): number {
  // Lấy nhầm `breakMin` thì thanh chạy hết trong 5 phút rồi đứng im suốt phần
  // còn lại của chặng nghỉ dài.
  const phaseMin =
    session.phase === 'FOCUS'
      ? session.focusMin
      : session.longBreak
        ? session.longBreakMin
        : session.breakMin;
  const totalSec = phaseMin * 60;
  return totalSec > 0 ? ((totalSec - secondsLeft) / totalSec) * 100 : 0;
}

function statusLine({
  nightActive,
  landscape,
  wake,
}: {
  nightActive: boolean;
  landscape: { canLock: boolean; portrait: boolean };
  wake: { held: boolean };
}): string | null {
  if (nightActive) return 'Đang ở chế độ đêm';
  if (!landscape.canLock && landscape.portrait) return 'Xoay ngang máy để đồng hồ to hết cỡ';
  if (wake.held) return 'Màn hình đang được giữ sáng';
  return null;
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

function Heading({
  mode,
  session,
  wall,
  timer,
  showDate,
  batteryLevel,
  charging,
}: {
  mode: ClockMode;
  session: StudySessionResponse | null;
  wall: { dateLabel: string };
  timer: { running: boolean; totalMs: number };
  showDate: boolean;
  batteryLevel: number | null;
  charging: boolean;
}) {
  const battery =
    batteryLevel === null ? null : (
      <span className="whitespace-nowrap tabular-nums">
        {charging ? '⚡' : '🔋'} {Math.round(batteryLevel * 100)}%
      </span>
    );

  if (mode === 'countdown' && session) {
    const focus = session.phase === 'FOCUS';
    return (
      <>
        <p className="flex items-baseline gap-2 text-[11.5px] font-bold tracking-[1.2px] text-[color:var(--clk-soft)]">
          <span className="truncate">
            {(session.longBreak ? 'Nghỉ dài' : STUDY_PHASE_LABELS[session.phase]).toUpperCase()}
            {session.roundsDone > 0 && ` · CHẶNG ${session.roundsDone + (focus ? 1 : 0)}`}
          </span>
          {battery}
        </p>
        {session.subject && (
          <p className="mt-0.5 truncate text-[13px] font-bold">{session.subject}</p>
        )}
      </>
    );
  }

  if (mode === 'timer') {
    return (
      <p className="flex items-baseline gap-2 text-[12px] text-[color:var(--clk-soft)]">
        {/*
          Chưa đặt gì thì KHÔNG nói "Đang tạm dừng" — chẳng có gì đang dừng cả,
          và màn đặt ngay bên dưới đã tự hỏi "Hẹn giờ trong bao lâu?".
        */}
        {timer.totalMs > 0 && (
          <span className="truncate">
            {timer.running ? 'Đang đếm ngược' : 'Đang tạm dừng'}
          </span>
        )}
        {battery}
      </p>
    );
  }

  if (mode === 'stopwatch') {
    return (
      <p className="flex items-baseline gap-2 text-[12px] text-[color:var(--clk-soft)]">
        <span className="truncate">Bấm giờ</span>
        {battery}
      </p>
    );
  }

  return (
    <p className="flex items-baseline gap-2 text-[12px] text-[color:var(--clk-soft)]">
      {showDate && <span className="truncate">{wall.dateLabel}</span>}
      {battery}
    </p>
  );
}
