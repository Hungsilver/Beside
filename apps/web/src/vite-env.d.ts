/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Mã số bản dựng, do `vite.config.ts` chèn vào lúc build (dạng `YYYYMMDDHHmm`).
 * Dùng ở màn "Bộ nhớ & cập nhật" để biết máy đang chạy bản nào.
 */
declare const __BUILD_ID__: string;
