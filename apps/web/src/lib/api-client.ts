import type { ApiError } from '@beside/shared';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/**
 * Access token chỉ nằm trong BỘ NHỚ, không lưu localStorage.
 * Lý do: localStorage đọc được bằng JavaScript nên chỉ cần một lỗ XSS là mất token.
 * Refresh token nằm trong cookie httpOnly — JS không đọc được — nên khi tải lại
 * trang ta gọi /auth/refresh để lấy access token mới.
 */
let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthenticatedHandler(fn: (() => void) | null): void {
  onUnauthenticated = fn;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Lỗi của một trường cụ thể, dùng để hiển thị ngay dưới ô nhập. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors?.[field]?.[0];
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Không tự gọi refresh khi gặp 401 (dùng cho chính endpoint refresh/login). */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

/**
 * Chỉ cho phép MỘT lần gọi refresh tại một thời điểm.
 * Nếu 3 request cùng nhận 401 một lúc mà mỗi cái tự gọi refresh, token sẽ bị
 * xoay vòng 3 lần và 2 lần sau bị coi là "token dùng lại" → đăng xuất oan.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      // Nhả khoá ở tick sau để các request đang chờ kịp đọc kết quả.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

async function parseError(res: Response): Promise<ApiRequestError> {
  let body: Partial<ApiError> = {};
  try {
    body = (await res.json()) as Partial<ApiError>;
  } catch {
    // Phản hồi không phải JSON (ví dụ 502 từ proxy) — dùng thông báo mặc định.
  }
  return new ApiRequestError(
    res.status,
    body.code ?? 'HTTP_ERROR',
    body.message ?? 'Không kết nối được máy chủ. Kiểm tra lại mạng nhé.',
    body.fieldErrors,
  );
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, skipRefresh = false, signal } = options;

  // FormData phải để trình duyệt tự đặt Content-Type, vì nó cần kèm chuỗi
  // `boundary` do chính nó sinh ra. Tự đặt "multipart/form-data" là hỏng —
  // server sẽ không tách được các phần của form.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const doFetch = async (): Promise<Response> =>
    fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(
      0,
      'NETWORK_ERROR',
      'Mất kết nối mạng. Thử lại khi có sóng nhé.',
    );
  }

  // Access token hết hạn → làm mới đúng một lần rồi thử lại.
  if (res.status === 401 && !skipRefresh) {
    const ok = await refreshAccessToken();
    if (ok) {
      res = await doFetch();
    } else {
      accessToken = null;
      onUnauthenticated?.();
      throw await parseError(res);
    }
  }

  if (!res.ok) throw await parseError(res);

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    apiRequest<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown, opts?: { skipRefresh?: boolean }) =>
    apiRequest<T>(path, { method: 'POST', body, ...opts }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'DELETE', body }),
};

/**
 * Tải một ảnh nằm sau lớp xác thực rồi đổi sang blob URL.
 *
 * `<img src="/api/v1/...">` thẳng sẽ bị 401: thẻ img không gửi được header
 * Authorization. Dùng cho cả ảnh check-in lẫn ảnh đại diện.
 *
 * Nơi gọi chịu trách nhiệm `URL.revokeObjectURL()` khi không dùng nữa — không
 * thu hồi thì mỗi lần vẽ lại là rò thêm một blob trong bộ nhớ.
 */
export async function fetchImageObjectUrl(path: string): Promise<string> {
  const token = getAccessToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Không tải được ảnh (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
