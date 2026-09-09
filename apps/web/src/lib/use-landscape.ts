import { useCallback, useEffect, useState } from 'react';

/**
 * `lock()` chưa có trong lib DOM của TypeScript, và `unlock()` thì có nhưng lại
 * khai là luôn tồn tại — iOS Safari không cài đặt cả hai. Khai lại tại chỗ cho
 * đúng thực tế: cả hai đều có thể vắng mặt.
 */
interface LockableOrientation {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

function orientation(): LockableOrientation | null {
  if (typeof screen === 'undefined') return null;
  return screen.orientation as unknown as LockableOrientation;
}

export interface LandscapeControl {
  /** Máy đang cầm DỌC — lá bài sẽ nhỏ hơn hẳn. */
  portrait: boolean;
  /** Trình duyệt có cho khoá màn hình ngang không. iOS Safari: không. */
  canLock: boolean;
  /** Đang toàn màn hình do chính mình bật. */
  immersive: boolean;
  /** Bật / tắt toàn màn hình ngang. Gọi từ một cú CHẠM, xem chú thích dưới. */
  toggle: () => void;
}

/**
 * Xoay ngang màn hình khi vào ván bài.
 *
 * Ván tiến lên cần bề ngang: 13 lá xếp cạnh nhau ở khổ dọc 390px thì mỗi lá chỉ
 * còn hở 20px, nhìn không ra chất mà chạm cũng dễ trượt.
 *
 * Ba mức, tự rơi xuống mức thấp hơn khi trình duyệt không cho:
 *
 *   1. **Khoá ngang thật** — `requestFullscreen()` rồi `orientation.lock()`.
 *      Chỉ chạy được trong toàn màn hình, và **phải xuất phát từ một cú chạm**:
 *      chuyển route không tính là cử chỉ người dùng, nên lần thử lúc mở màn
 *      thường trượt. Đó là lý do vẫn phải có nút bấm tay.
 *   2. **Người dùng tự xoay máy** — ta chỉ nhắc một dòng.
 *   3. **Máy đang khoá xoay** (rất phổ biến) — không làm gì được, nên bố cục
 *      khổ dọc vẫn phải chơi được bình thường, chỉ là lá bài nhỏ hơn.
 *
 * Vì thế hàm này KHÔNG bao giờ chặn màn hình bằng tấm "hãy xoay máy".
 */
export function useLandscape(): LandscapeControl {
  const [portrait, setPortrait] = useState(() => isPortrait());
  const [immersive, setImmersive] = useState(false);

  const canLock =
    typeof orientation()?.lock === 'function' &&
    typeof document.documentElement.requestFullscreen === 'function';

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)');
    const onChange = () => setPortrait(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const onFull = () => setImmersive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);

  /*
   * Rời màn chơi thì trả màn hình về như cũ — không để cả app kẹt ở chế độ
   * ngang chỉ vì người ta bấm nút "về sảnh".
   */
  useEffect(
    () => () => {
      void release();
    },
    [],
  );

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void exitLandscape();
    else requestLandscape();
  }, []);

  return { portrait, canLock, immersive, toggle };
}

/**
 * Xin toàn màn hình ngang.
 *
 * **Phải gọi NGAY trong trình xử lý một cú chạm**, trước bất kỳ `await` nào:
 * trình duyệt chỉ cho vào toàn màn hình khi lệnh xuất phát từ cử chỉ người dùng,
 * mà một cú chạm chỉ "còn hiệu lực" trong đúng nhịp xử lý đầu tiên. Đó là lý do
 * sảnh trò chơi gọi hàm này lúc bấm nút, chứ không phải màn ván bài gọi lúc mở
 * lên — lúc đó đã qua một vòng gọi API, cử chỉ hết hiệu lực rồi.
 */
export function requestLandscape(): void {
  void document.documentElement
    .requestFullscreen()
    .then(() => orientation()?.lock?.('landscape'))
    // Trình duyệt từ chối là chuyện bình thường (iOS Safari không có API này) —
    // im lặng rơi về mức "người dùng tự xoay máy".
    .catch(() => undefined);
}

/** Trả màn hình về như cũ. */
export async function exitLandscape(): Promise<void> {
  await release();
}

function isPortrait(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(orientation: portrait)').matches;
}

async function release(): Promise<void> {
  try {
    orientation()?.unlock?.();
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Thoát toàn màn hình hỏng thì cũng không có gì để cứu.
  }
}
