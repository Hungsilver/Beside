import { useCallback, useEffect, useState } from 'react';
import type { PushConfigResponse } from '@beside/shared';
import { api } from './api-client';

/**
 * Bật/tắt thông báo đẩy trên CHÍNH thiết bị này.
 *
 * Ba thứ phải cùng đúng thì mới nhận được thông báo, và người dùng hay nhầm
 * lẫn giữa chúng — nên `reason` nói rõ đang thiếu cái nào:
 *   1. trình duyệt hỗ trợ (iOS chỉ hỗ trợ khi app đã được CÀI lên màn hình chính)
 *   2. người dùng đã cấp quyền
 *   3. thiết bị đã đăng ký với server
 */

export type PushState =
  | 'checking'
  | 'unsupported' // trình duyệt không có Push API
  | 'need-install' // iOS: phải cài lên màn hình chính trước
  | 'server-off' // server chưa cấu hình VAPID
  | 'denied' // người dùng đã chặn — phải vào cài đặt trình duyệt mở lại
  | 'off' // chưa bật
  | 'on';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * iOS chỉ cho phép Web Push khi trang đang chạy ở chế độ standalone
 * (đã "Thêm vào màn hình chính"). Mở trong Safari thường thì `PushManager`
 * vẫn tồn tại nhưng `subscribe()` sẽ ném lỗi — nên phải chặn trước và nói rõ.
 */
function iosNeedsInstall(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  if (!isIos) return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !standalone;
}

/**
 * Khoá VAPID dạng base64url → Uint8Array mà `subscribe()` yêu cầu.
 *
 * Phải cấp phát ArrayBuffer tường minh: `new Uint8Array(số)` có kiểu
 * `Uint8Array<ArrayBufferLike>`, mà `applicationServerKey` chỉ nhận
 * `ArrayBuffer` thật (không nhận SharedArrayBuffer).
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePush() {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supported()) {
      setState(iosNeedsInstall() ? 'need-install' : 'unsupported');
      return;
    }
    if (iosNeedsInstall()) {
      setState('need-install');
      return;
    }

    try {
      const config = await api.get<PushConfigResponse>('/push/public-key');
      if (!config.enabled || !config.publicKey) {
        setState('server-off');
        return;
      }
    } catch {
      setState('server-off');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setState(sub ? 'on' : 'off');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const config = await api.get<PushConfigResponse>('/push/public-key');
      if (!config.enabled || !config.publicKey) {
        setState('server-off');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      // Đã có đăng ký cũ thì dùng lại — gọi subscribe() hai lần với khoá khác
      // nhau sẽ bị trình duyệt từ chối.
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        }));

      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Trình duyệt trả về đăng ký thiếu dữ liệu');
      }

      await api.post<void>('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent.slice(0, 300),
      });
      setState('on');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không bật được thông báo');
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Báo server TRƯỚC rồi mới huỷ ở trình duyệt: huỷ trước mà mạng lỗi thì
        // server còn giữ một endpoint đã chết, gửi mãi không tới.
        await api
          .delete<void>('/push/subscribe', { endpoint: sub.endpoint })
          .catch(() => undefined);
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tắt được thông báo');
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ sent: number }>('/push/test');
      if (r.sent === 0) {
        setError('Không có thiết bị nào nhận được — thử tắt rồi bật lại');
      }
    } catch {
      setError('Không gửi thử được');
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable, sendTest, refresh };
}
