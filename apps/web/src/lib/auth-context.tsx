import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, LoginInput, RegisterInput, SelfUser } from '@beside/shared';
import {
  api,
  setAccessToken,
  setUnauthenticatedHandler,
} from './api-client';

interface AuthState {
  user: SelfUser | null;
  /** true trong lúc đang khôi phục phiên lúc mở app — chưa biết đăng nhập hay chưa. */
  isRestoring: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Cập nhật user trong bộ nhớ sau khi ghép đôi / sửa hồ sơ. */
  patchUser: (patch: Partial<SelfUser>) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SelfUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const queryClient = useQueryClient();

  const applySession = useCallback((res: AuthResponse) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  /**
   * Kết thúc phiên — **chỗ duy nhất** dọn dấu vết của người vừa dùng máy.
   *
   * `queryClient.clear()` là phần dễ quên nhất. `queryClient` sống ở
   * `main.tsx`, ngoài cả `AuthProvider`, nên nó KHÔNG bị dựng lại khi đổi
   * người: không dọn thì người đăng nhập kế tiếp mở app lên là thấy ngay bản
   * cache của người trước — vị trí, kỷ niệm, lịch, ván bài — cho tới khi từng
   * `useQuery` tải xong bản mới. Với app chứa dữ liệu vị trí thì đó là rò rỉ
   * thật, không phải chuyện nhấp nháy giao diện (R3).
   *
   * Gọi cho CẢ hai đường: bấm đăng xuất, và phiên hỏng hẳn (`setUnauthenticatedHandler`).
   */
  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // Khôi phục phiên khi mở app: access token nằm trong RAM nên đã mất sau khi
  // tải lại trang; refresh token nằm trong cookie httpOnly nên vẫn còn.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await api.post<AuthResponse>('/auth/refresh', undefined, {
          skipRefresh: true,
        });
        if (!cancelled) applySession(res);
      } catch {
        // Chưa đăng nhập hoặc phiên đã hết hạn — trạng thái bình thường, không báo lỗi.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  // Khi api-client phát hiện phiên hỏng hẳn thì đá về màn đăng nhập.
  useEffect(() => {
    setUnauthenticatedHandler(() => clearSession());
    return () => setUnauthenticatedHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      const res = await api.post<AuthResponse>('/auth/login', input, {
        skipRefresh: true,
      });
      applySession(res);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const res = await api.post<AuthResponse>('/auth/register', input, {
        skipRefresh: true,
      });
      applySession(res);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post<void>('/auth/logout');
    } finally {
      // Dù server lỗi vẫn phải đăng xuất ở máy này.
      clearSession();
      clearOfflineCache();
    }
  }, [clearSession]);

  const patchUser = useCallback((patch: Partial<SelfUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, isRestoring, login, register, logout, patchUser }),
    [user, isRestoring, login, register, logout, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong <AuthProvider>');
  return ctx;
}

/**
 * Xoá kho dữ liệu offline khi đăng xuất.
 *
 * Service worker giữ bản sao của lịch, kỷ niệm, địa điểm… để xem được lúc mất
 * mạng. Dữ liệu riêng tư của một cặp đôi thì không nên nằm lại trên máy sau khi
 * họ đã chủ động thoát.
 *
 * Nuốt mọi lỗi: máy không có service worker (Safari cũ, chế độ ẩn danh) vẫn phải
 * đăng xuất được bình thường.
 */
function clearOfflineCache(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' });
  } catch {
    /* không có service worker thì thôi */
  }
}
