import { useEffect, useState } from 'react';

/**
 * Mức pin — thứ mọi app đồng hồ để bàn đều hiện.
 *
 * Có lý do thật, không phải trang trí: người ta dựng máy trên bàn hàng giờ với
 * màn hình bị giữ sáng (`useWakeLock`), nên "còn bao nhiêu pin" là thông tin
 * đúng lúc nhất có thể có trên màn hình đó.
 *
 * Battery Status API chỉ có ở Chrome/Edge. Safari và Firefox không trả lời —
 * Firefox đã gỡ hẳn vì API này giúp nhận dạng máy. Không có thì trả `null` và
 * giao diện ẩn hẳn phần này đi, không hiện "—%".
 */
export interface BatteryState {
  /** 0–1, hoặc `null` khi trình duyệt không trả lời. */
  level: number | null;
  charging: boolean;
}

export function useBattery(enabled: boolean): BatteryState {
  const [state, setState] = useState<BatteryState>({ level: null, charging: false });

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getBattery) {
      // Tắt rồi thì XOÁ giá trị cũ: giữ lại thì bật lại lần sau sẽ thấy mức pin
      // của mười phút trước trong một nhịp trước khi API kịp trả lời.
      setState({ level: null, charging: false });
      return;
    }

    let cancelled = false;
    let manager: BatteryManager | null = null;

    const sync = () => {
      if (!manager || cancelled) return;
      setState({ level: clamp01(manager.level), charging: manager.charging });
    };

    void navigator
      .getBattery()
      .then((b) => {
        if (cancelled) return;
        manager = b;
        sync();
        /*
         * Nghe cả hai sự kiện. Thiếu `chargingchange` thì cắm sạc vào mà biểu
         * tượng vẫn là cục pin rỗng cho tới lần đổi phần trăm kế — mà ở mức
         * pin cao thì lần đó có thể cách nhau mười phút.
         */
        b.addEventListener('levelchange', sync);
        b.addEventListener('chargingchange', sync);
      })
      // Bị từ chối (ngữ cảnh không an toàn, hoặc người dùng chặn) — im lặng.
      .catch(() => undefined);

    return () => {
      cancelled = true;
      manager?.removeEventListener('levelchange', sync);
      manager?.removeEventListener('chargingchange', sync);
    };
  }, [enabled]);

  return state;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
