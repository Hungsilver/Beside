import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Cập nhật app và dọn bộ nhớ đệm.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────────
 * Beside là PWA: service worker giữ sẵn toàn bộ vỏ app trong máy để mở được
 * lúc mất mạng. Mặt trái là sau mỗi lần deploy, bản service worker mới cài
 * xong rồi **nằm chờ** cho tới khi mọi tab của app đóng hết — mà trên điện
 * thoại thì gần như không bao giờ. Người dùng mở app vẫn thấy giao diện cũ và
 * tưởng deploy hỏng.
 *
 * Ở đây giải quyết bằng ba lớp:
 *   1. Tự đăng ký service worker và LẮNG NGHE sự kiện "có bản mới" → hiện dải
 *      mời tải lại (`UpdateBanner`).
 *   2. Tự hỏi lại server mỗi lần app quay về tiền cảnh và mỗi 30 phút.
 *   3. Nút tay "Xoá bộ nhớ đệm & tải lại" ở Cài đặt — lối thoát cuối cùng khi
 *      hai lớp trên vì lý do gì đó không ăn.
 */

/** Hỏi lại server xem có bản mới không, mỗi 30 phút. */
const UPDATE_POLL_MS = 30 * 60_000;

type UpdateFn = (reload?: boolean) => Promise<void>;

let updateSW: UpdateFn | null = null;
let needRefresh = false;
let registration: ServiceWorkerRegistration | undefined;
const listeners = new Set<(value: boolean) => void>();

function emit(): void {
  for (const fn of listeners) fn(needRefresh);
}

/**
 * Đăng ký service worker. Gọi MỘT LẦN lúc app khởi động.
 *
 * Đặt ngoài React vì `registerSW` phải chạy đúng một lần cho cả vòng đời trang,
 * còn component thì có thể bị dựng lại (StrictMode dựng hai lần ngay ở chế độ dev).
 */
export function initAppUpdate(): void {
  if (updateSW) return;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      emit();
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (!reg) return;

      // Quay lại tiền cảnh là lúc đáng hỏi nhất: người dùng vừa mở app sau một
      // lúc, và đó cũng là lúc bản deploy mới hay vừa lên.
      const onVisible = () => {
        if (document.visibilityState === 'visible') void reg.update();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.setInterval(() => void reg.update(), UPDATE_POLL_MS);
    },
  });
}

/**
 * Trạng thái cập nhật cho giao diện.
 *
 * `update()` bảo service worker đang chờ nhảy vào thay thế rồi tải lại trang —
 * đây là việc DUY NHẤT khiến bản mới có hiệu lực ngay.
 */
export function useAppUpdate(): {
  needRefresh: boolean;
  update: () => void;
  check: () => Promise<boolean>;
} {
  const [value, setValue] = useState(needRefresh);

  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  const update = useCallback(() => {
    if (updateSW) {
      void updateSW(true);
      return;
    }
    // Không có service worker (trình duyệt không hỗ trợ, hoặc chạy dev) thì
    // tải lại trang cũng là đủ.
    window.location.reload();
  }, []);

  /** Hỏi server ngay lập tức. Trả về `true` nếu phát hiện bản mới. */
  const check = useCallback(async () => {
    if (!registration) return false;
    await registration.update();
    // `onNeedRefresh` chạy bất đồng bộ sau khi bản mới cài xong; chờ một nhịp
    // ngắn rồi mới đọc, nếu không lần nào cũng trả về "chưa có gì".
    await new Promise((r) => setTimeout(r, 1200));
    return needRefresh;
  }, []);

  return { needRefresh: value, update, check };
}

/**
 * Xoá SẠCH bộ nhớ đệm của app rồi tải lại.
 *
 * Gỡ hẳn service worker và xoá mọi kho cache — kể cả kho ảnh bản đồ và kho dữ
 * liệu đọc ngoại tuyến. KHÔNG đụng tới token đăng nhập (nằm trong bộ nhớ và
 * cookie refresh), nên người dùng không bị đăng xuất.
 *
 * Trả về số kho đã xoá, để màn hình nói được "đã dọn mấy thứ".
 */
export async function clearAppCaches(): Promise<number> {
  let cleared = 0;

  if ('caches' in window) {
    const keys = await caches.keys();
    for (const key of keys) {
      if (await caches.delete(key)) cleared += 1;
    }
  }

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    // Gỡ đăng ký để lần tải sau nhận bản service worker mới hoàn toàn, không
    // phải bản đang nằm chờ.
    await Promise.all(regs.map((r) => r.unregister()));
  }

  return cleared;
}
