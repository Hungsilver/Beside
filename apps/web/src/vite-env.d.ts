/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Mã số bản dựng, do `vite.config.ts` chèn vào lúc build (dạng `YYYYMMDDHHmm`).
 * Dùng ở màn "Bộ nhớ & cập nhật" để biết máy đang chạy bản nào.
 */
declare const __BUILD_ID__: string;

/**
 * Safari cũ (và iOS tới bản 14.5) chỉ có `webkitAudioContext`.
 *
 * Không nằm trong `lib.dom.d.ts` vì đó là tiền tố riêng của một hãng, nên phải
 * tự khai ở đây. `useNoise()` hỏi cả hai rồi mới quyết có bật được tiếng không.
 */
interface Window {
  webkitAudioContext?: typeof AudioContext;
}
