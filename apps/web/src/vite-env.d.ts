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

/**
 * Battery Status API — Chrome/Edge trên Android và máy tính có, Safari và
 * Firefox thì KHÔNG (Firefox đã gỡ hẳn vì lo bị dùng để nhận dạng máy).
 *
 * Không nằm trong `lib.dom.d.ts` nên phải tự khai. `useBattery()` hỏi bằng
 * `'getBattery' in navigator` trước khi gọi, và module Đồng hồ ẩn hẳn mức pin
 * đi khi trình duyệt không trả lời.
 */
interface BatteryManager extends EventTarget {
  /** 0–1. */
  readonly level: number;
  readonly charging: boolean;
}

interface Navigator {
  getBattery?: () => Promise<BatteryManager>;
}
