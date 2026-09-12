import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Bấm giờ đếm LÊN, có ghi vòng.
 *
 * Neo vào `Date.now()` chứ không cộng dồn từng nhịp: cộng dồn thì mỗi nhịp trễ
 * một chút và sai số tích lại: sau nửa tiếng đã lệch vài giây. Quan trọng hơn,
 * trình duyệt treo hẳn bộ hẹn giờ khi trang bị ẩn — với cách cộng dồn thì khoá
 * màn hình năm phút là mất trắng năm phút đó.
 */

export interface Lap {
  index: number;
  /** Tổng thời gian tính từ lúc bắt đầu, mili-giây. */
  totalMs: number;
  /** Chênh với vòng trước, mili-giây. */
  splitMs: number;
}

export interface Stopwatch {
  elapsedMs: number;
  running: boolean;
  laps: Lap[];
  start: () => void;
  pause: () => void;
  reset: () => void;
  lap: () => void;
}

/** Nhịp vẽ lại. 60ms đủ mượt cho hai chữ số phần trăm giây. */
const TICK_MS = 60;

/** Trần số vòng giữ lại — danh sách dài hơn màn hình thì không ai đọc nữa. */
const MAX_LAPS = 50;

export function useStopwatch(): Stopwatch {
  const [elapsedMs, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]);

  /** Mốc bắt đầu của lần chạy hiện tại; `null` khi đang tạm dừng. */
  const startedAtRef = useRef<number | null>(null);
  /** Tổng đã tích luỹ qua các lần chạy trước. */
  const baseRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const read = useCallback((): number => {
    const started = startedAtRef.current;
    return started === null ? baseRef.current : baseRef.current + (Date.now() - started);
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsed(read());
    tick();
    timerRef.current = window.setInterval(tick, TICK_MS);

    // Quay lại app thì đọc lại ngay: số đã đúng sẵn (neo vào `Date.now()`),
    // chỉ là nhịp vẽ bị treo nên màn hình còn đứng ở con số cũ.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, read]);

  const start = useCallback(() => {
    if (startedAtRef.current !== null) return;
    startedAtRef.current = Date.now();
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    if (startedAtRef.current === null) return;
    baseRef.current += Date.now() - startedAtRef.current;
    startedAtRef.current = null;
    setRunning(false);
    setElapsed(baseRef.current);
  }, []);

  const reset = useCallback(() => {
    startedAtRef.current = null;
    baseRef.current = 0;
    setRunning(false);
    setElapsed(0);
    setLaps([]);
  }, []);

  const lap = useCallback(() => {
    const total = read();
    if (total === 0) return;
    setLaps((prev) => {
      const last = prev[0]?.totalMs ?? 0;
      const next: Lap = {
        index: prev.length + 1,
        totalMs: total,
        splitMs: total - last,
      };
      // Vòng mới lên ĐẦU: vòng vừa bấm là thứ người ta muốn đọc ngay.
      return [next, ...prev].slice(0, MAX_LAPS);
    });
  }, [read]);

  return { elapsedMs, running, laps, start, pause, reset, lap };
}
