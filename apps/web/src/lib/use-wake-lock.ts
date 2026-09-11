import { useEffect, useRef, useState } from 'react';

/**
 * Giữ màn hình không tự tắt.
 *
 * Dùng cho chế độ đồng hồ toàn màn hình: để điện thoại dựng trên bàn mà màn
 * hình tắt sau 30 giây thì cái đồng hồ chẳng để làm gì.
 *
 * `navigator.wakeLock` vắng mặt ở kha khá trình duyệt (iOS Safari chỉ có từ
 * 16.4). Không có thì im lặng bỏ qua — người dùng vẫn xem được đồng hồ, chỉ là
 * phải chạm vào màn hình thỉnh thoảng.
 */
export function useWakeLock(active: boolean): { held: boolean } {
  const [held, setHeld] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    let cancelled = false;

    const acquire = async (): Promise<void> => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release().catch(() => undefined);
          return;
        }
        lockRef.current = lock;
        setHeld(true);
        /*
         * Hệ điều hành tự thu hồi khoá khi chuyển sang app khác. Phải XOÁ ref
         * chứ không chỉ đổi cờ hiển thị — lần quay lại sau đó kiểm tra
         * `lockRef.current === null` để biết có cần xin lại hay không, mà ref
         * còn trỏ vào cái khoá đã chết thì nó sẽ không xin lại bao giờ.
         */
        lock.addEventListener('release', () => {
          lockRef.current = null;
          setHeld(false);
        });
      } catch {
        // Bị từ chối (pin yếu, tab đang ẩn) — không có gì phải cứu.
        setHeld(false);
      }
    };

    void acquire();

    /*
     * Quay lại app thì XIN LẠI khoá.
     *
     * Khoá bị thu hồi mỗi lần trang bị ẩn và KHÔNG tự quay lại. Thiếu đoạn này
     * thì màn hình chỉ được giữ sáng đúng một lần đầu, sau đó lặng lẽ tắt như
     * chưa hề có tính năng.
     */
    const onVisible = () => {
      if (document.visibilityState === 'visible' && lockRef.current === null) {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
      setHeld(false);
    };
  }, [active]);

  return { held };
}
