import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  RT_EVENTS,
  RT_NAMESPACE,
  type PartnerLocationEvent,
  type PresenceEvent,
} from '@beside/shared';
import { getAccessToken } from './api-client';
import { useAuth } from './auth-context';

interface RealtimeState {
  connected: boolean;
  /** Vị trí đối phương mới nhất nhận qua WebSocket (null khi chưa có). */
  partnerLocation: PartnerLocationEvent | null;
  partnerPresence: PresenceEvent | null;
  /** Đưa vị trí của mình lên server. Trả false nếu chưa kết nối. */
  sendLocation: (payload: unknown) => boolean;
  setLive: (live: boolean) => void;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocationEvent | null>(null);
  const [partnerPresence, setPartnerPresence] = useState<PresenceEvent | null>(null);

  const coupleId = user?.coupleId ?? null;
  const myId = user?.id ?? null;

  useEffect(() => {
    // Chưa ghép đôi thì không có gì để nghe.
    if (!coupleId) return;

    const socket = io(RT_NAMESPACE, {
      // Đường dẫn tương đối → dev đi qua proxy của Vite, production đi qua Caddy.
      // Không bao giờ hardcode domain (xem ARCHITECTURE.md phần đầu).
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      // Lấy token TẠI THỜI ĐIỂM kết nối, không phải lúc dựng component:
      // access token chỉ sống 15 phút nên lần nối lại phải dùng token mới.
      auth: (cb) => cb({ token: getAccessToken() ?? '' }),
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on(RT_EVENTS.LOC_PARTNER, (e: PartnerLocationEvent) => {
      // Bỏ qua sự kiện của chính mình (khi mở app trên hai thiết bị).
      if (e.userId === myId) return;
      setPartnerLocation((prev) => {
        // Gói tin có thể tới không đúng thứ tự khi mạng chập chờn —
        // không được để điểm cũ ghi đè điểm mới.
        if (prev && e.ts < prev.ts) return prev;
        return e;
      });
    });

    socket.on(RT_EVENTS.PRESENCE, (e: PresenceEvent) => {
      if (e.userId === myId) return;
      setPartnerPresence(e);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [coupleId, myId]);

  const sendLocation = useCallback((payload: unknown): boolean => {
    const s = socketRef.current;
    if (!s?.connected) return false;
    s.emit(RT_EVENTS.LOC_UPDATE, payload);
    return true;
  }, []);

  const setLive = useCallback((live: boolean) => {
    socketRef.current?.emit(live ? RT_EVENTS.LIVE_START : RT_EVENTS.LIVE_STOP);
  }, []);

  const value = useMemo<RealtimeState>(
    () => ({ connected, partnerLocation, partnerPresence, sendLocation, setLive }),
    [connected, partnerLocation, partnerPresence, sendLocation, setLive],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime phải nằm trong <RealtimeProvider>');
  return ctx;
}
