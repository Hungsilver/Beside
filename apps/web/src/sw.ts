/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import type { PushPayload } from '@beside/shared';

/**
 * Service worker của Beside.
 *
 * Trước Phase 4, file này được `vite-plugin-pwa` sinh tự động (chiến lược
 * `generateSW`). Thông báo đẩy bắt buộc phải có `addEventListener('push')` do
 * mình viết, mà bản sinh tự động thì không chèn code riêng vào được — nên
 * chuyển sang `injectManifest`: plugin chỉ chèn danh sách file cần nạp sẵn vào
 * `self.__WB_MANIFEST`, phần còn lại là code ở đây.
 *
 * Đây là nơi DUY NHẤT chạy khi app đã đóng. Không có React, không có store,
 * không có token — chỉ có đúng đoạn JSON server gửi sang.
 */

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// ---------------------------------------------------------------------------
// Nạp sẵn & cache
// ---------------------------------------------------------------------------

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/**
 * Điều hướng khi mất mạng.
 *
 * Đây là một SPA: mọi đường dẫn đều phải trả về `index.html`. Khi còn dùng
 * `generateSW`, plugin tự thêm phần này. Chuyển sang `injectManifest` ở Phase 4
 * (để viết được handler `push`) thì mất luôn — nghĩa là mở thẳng `/lich` lúc
 * offline sẽ hỏng, dù `/` vẫn được. Online không lộ ra vì nginx đã lo SPA
 * fallback, nên lỗi này im lặng cho tới lúc mất mạng.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    // API và Socket.IO không phải là điều hướng trang.
    denylist: [/^\/api\//, /^\/socket\.io/],
  }),
);

/** Tên kho cache dữ liệu API — cần đặt riêng để xoá được lúc đăng xuất. */
const API_CACHE = 'beside-api';

/**
 * Dữ liệu đọc được xem lại khi mất mạng.
 *
 * `NetworkFirst`: còn mạng thì luôn lấy bản mới (hành vi y như trước), mất mạng
 * mới lấy bản đã lưu. Nhờ vậy mở app lúc không có sóng vẫn thấy số ngày yêu,
 * lịch, kỷ niệm — thay vì một loạt màn trống.
 *
 * KHÔNG cache `/locations/*`. ARCHITECTURE.md đã chốt từ Phase 2: dữ liệu vị trí
 * phải luôn là mới nhất. Hiện một vị trí cũ trên bản đồ khi mất mạng dễ làm
 * người ta tin nhầm "người ấy đang ở đó", mà đó đúng là thứ nguy hiểm nhất để
 * hiểu sai trong app này.
 *
 * KHÔNG cache `/auth/*` và `/push/*`: token và đăng ký thiết bị không có nghĩa
 * gì khi lấy lại từ kho cũ.
 */
registerRoute(
  ({ url, request, sameOrigin }) =>
    sameOrigin &&
    request.method === 'GET' &&
    url.pathname.startsWith('/api/v1/') &&
    !url.pathname.startsWith('/api/v1/locations/') &&
    !url.pathname.startsWith('/api/v1/auth/') &&
    !url.pathname.startsWith('/api/v1/push/'),
  new NetworkFirst({
    cacheName: API_CACHE,
    // Mạng chậm quá thì lấy bản cũ ra trước, đỡ để người dùng nhìn màn trống.
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  }),
);

// MapLibre gần 1MB: không nạp sẵn lúc cài app, chỉ cache ở lần mở bản đồ đầu tiên.
registerRoute(
  ({ url }) => /\/assets\/(maplibre|MapScreen)-[^/]+\.(js|css)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'beside-maplibre',
    plugins: [
      new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Tile bản đồ: hiện bản cache ngay cho nhanh, đồng thời tải bản mới ở nền.
registerRoute(
  ({ url }) => url.origin === 'https://tiles.openfreemap.org',
  new StaleWhileRevalidate({
    cacheName: 'beside-map-tiles',
    plugins: [
      new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ---------------------------------------------------------------------------
// Vòng đời
// ---------------------------------------------------------------------------

self.addEventListener('message', (event) => {
  const type = (event.data as { type?: string } | undefined)?.type;

  // App gọi khi người dùng đồng ý cập nhật (registerType: 'prompt').
  if (type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }

  /*
   * Đăng xuất phải xoá sạch dữ liệu đã lưu.
   *
   * Không xoá thì lịch, kỷ niệm và địa điểm của người vừa đăng xuất vẫn nằm
   * trong kho cache của trình duyệt — người dùng tiếp theo trên cùng máy đó
   * không đọc được qua giao diện (vẫn cần token), nhưng dữ liệu riêng tư của
   * một cặp đôi thì không nên nằm lại trên máy sau khi họ đã chủ động thoát.
   */
  if (type === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Thông báo đẩy
// ---------------------------------------------------------------------------

const FALLBACK: PushPayload = {
  kind: 'TEST',
  title: 'Beside',
  body: 'Bạn có thông báo mới',
  url: '/',
  at: 0,
};

/**
 * Đọc dữ liệu đẩy một cách phòng thủ.
 *
 * Trên iOS, một thông báo đẩy KHÔNG hiện notification sẽ bị tính là "vi phạm"
 * và Safari có thể thu hồi quyền đẩy của trang. Nên dù dữ liệu hỏng thế nào
 * cũng phải hiện được một cái gì đó, tuyệt đối không ném lỗi ra ngoài.
 */
function readPayload(event: PushEvent): PushPayload {
  if (!event.data) return FALLBACK;
  try {
    const raw = event.data.json() as Partial<PushPayload>;
    return {
      kind: raw.kind ?? FALLBACK.kind,
      title: typeof raw.title === 'string' && raw.title ? raw.title : FALLBACK.title,
      body: typeof raw.body === 'string' && raw.body ? raw.body : FALLBACK.body,
      // Chỉ nhận đường dẫn tương đối trong chính app — không để dữ liệu đẩy
      // điều hướng người dùng ra một trang ngoài.
      url: typeof raw.url === 'string' && raw.url.startsWith('/') ? raw.url : FALLBACK.url,
      tag: typeof raw.tag === 'string' ? raw.tag : undefined,
      at: typeof raw.at === 'number' ? raw.at : Date.now(),
    };
  } catch {
    return FALLBACK;
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Cùng tag thì thay thế nhau thay vì xếp chồng trong khay.
      tag: payload.tag ?? payload.kind,
      renotify: Boolean(payload.tag),
      timestamp: payload.at || Date.now(),
      data: { url: payload.url },
    } as NotificationOptions),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // App đang mở sẵn thì đưa cửa sổ đó lên và điều hướng, thay vì mở thêm
      // một tab nữa — người dùng sẽ có hai bản app chạy song song.
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(target).catch(() => undefined);
          }
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});
