import { useCallback, useEffect, useRef, useState } from 'react';
import { buzz, playChime } from './audio-cues';

/**
 * Hẹn giờ đếm ngược TỰ DO — không dính gì tới phiên học.
 *
 * Khác đồng hồ Pomodoro ở một điểm quyết định: mốc kết thúc nằm ở MÁY NÀY, không
 * ở server. Nên nó chỉ báo được khi app còn mở. Giao diện phải nói thẳng điều
 * đó — hứa một cái chuông rồi không kêu thì tệ hơn là không có chuông.
 *
 * Vẫn neo vào `Date.now()` nên khoá màn hình rồi mở lại, con số vẫn đúng; chỉ
 * là tiếng chuông sẽ kêu muộn, đúng lúc quay lại app.
 */

export interface Timer {
  /** Mili-giây còn lại. `0` khi chưa đặt hoặc đã hết. */
  remainingMs: number;
  running: boolean;
  /** Tổng thời lượng đã đặt, để vẽ thanh tiến độ. */
  totalMs: number;
  /** Vừa hết giờ và chưa được xác nhận — giao diện nháy báo ở trạng thái này. */
  finished: boolean;
  start: (ms: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /** Tắt chuông / bỏ trạng thái vừa hết giờ. */
  dismiss: () => void;
}

const TICK_MS = 100;

export function useTimer({ soundOn }: { soundOn: boolean }): Timer {
  const [remainingMs, setRemaining] = useState(0);
  const [totalMs, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  /** Mốc kết thúc khi đang chạy; `null` khi tạm dừng hoặc chưa đặt. */
  const endsAtRef = useRef<number | null>(null);
  /** Phần còn lại lúc bấm tạm dừng. */
  const pausedRef = useRef(0);
  const firedRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const finish = useCallback(() => {
    // Chốt bằng cờ chứ không dựa vào "đúng một nhịp": nhịp có thể chạy hai lần
    // liên tiếp sau khi tab được đánh thức, và người dùng sẽ nghe chuông đôi.
    if (firedRef.current) return;
    firedRef.current = true;
    endsAtRef.current = null;
    setRemaining(0);
    setRunning(false);
    setFinished(true);
    if (soundRef.current) playChime();
    buzz();
  }, []);

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      const endsAt = endsAtRef.current;
      if (endsAt === null) return;
      const left = endsAt - Date.now();
      if (left <= 0) {
        finish();
        return;
      }
      setRemaining(left);
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, finish]);

  const start = useCallback((ms: number) => {
    const safe = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
    if (safe === 0) return;
    firedRef.current = false;
    pausedRef.current = 0;
    endsAtRef.current = Date.now() + safe;
    setTotal(safe);
    setRemaining(safe);
    setFinished(false);
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt === null) return;
    pausedRef.current = Math.max(0, endsAt - Date.now());
    endsAtRef.current = null;
    setRemaining(pausedRef.current);
    setRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (pausedRef.current <= 0) return;
    endsAtRef.current = Date.now() + pausedRef.current;
    pausedRef.current = 0;
    setRunning(true);
  }, []);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    pausedRef.current = 0;
    firedRef.current = false;
    setRemaining(0);
    setTotal(0);
    setRunning(false);
    setFinished(false);
  }, []);

  const dismiss = useCallback(() => setFinished(false), []);

  return { remainingMs, totalMs, running, finished, start, pause, resume, reset, dismiss };
}
