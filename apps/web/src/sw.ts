/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
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
  // App gọi khi người dùng đồng ý cập nhật (registerType: 'prompt').
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
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
