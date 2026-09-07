import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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

  const applySession = useCallback((res: AuthResponse) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

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
