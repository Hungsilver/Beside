import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  GAME_RT_EVENTS,
  GAME_RT_NAMESPACE,
  type GameKind,
  type GameResponse,
  type GameSummaryResponse,
} from '@beside/shared';
import { api, getAccessToken } from './api-client';

/**
 * Ghi state mới vào cache — **chỗ duy nhất** được phép làm việc đó.
 *
 * Bỏ qua gói tin cũ hơn thứ đang có. Cần chốt này vì state về từ hai đường
 * (REST trả lời nước đi, và socket đẩy về cho cả hai người) mà thứ tự tới nơi
 * thì không ai bảo đảm: một gói tin chậm chân sẽ kéo bàn cờ lùi lại một nước,
 * và người chơi thấy lá bài mình vừa đánh nhảy ngược về tay.
 */
function putGame(qc: QueryClient, game: GameResponse): void {
  qc.setQueryData<GameResponse>(gameKeys.one(game.id), (prev) =>
    prev && prev.version > game.version ? prev : game,
  );
}

export const gameKeys = {
  all: ['games'] as const,
  list: () => ['games', 'list'] as const,
  summary: () => ['games', 'summary'] as const,
  one: (id: string) => ['games', 'one', id] as const,
};

export function useGameSummary() {
  return useQuery({
    queryKey: gameKeys.summary(),
    queryFn: () => api.get<GameSummaryResponse>('/games/summary'),
    retry: false,
  });
}

export function useGames() {
  return useQuery({
    queryKey: gameKeys.list(),
    queryFn: () => api.get<GameResponse[]>('/games'),
    retry: false,
  });
}

export function useGame(gameId: string | null) {
  return useQuery({
    queryKey: gameKeys.one(gameId ?? ''),
    enabled: Boolean(gameId),
    queryFn: () => api.get<GameResponse>(`/games/${gameId}`),
    retry: false,
  });
}

export function useCreateGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: GameKind) => api.post<GameResponse>('/games', { kind }),
    onSuccess: (game) => {
      putGame(qc, game);
      void qc.invalidateQueries({ queryKey: gameKeys.all });
    },
  });
}

/**
 * Đi một nước.
 *
 * `version` là bắt buộc: nó là khoá lạc quan chống hai người bấm cùng lúc —
 * và trường hợp thật sự xảy ra không phải hai người, mà là **đồng hồ hết giờ
 * đúng lúc mình vừa bấm**. Thiếu nó thì một trong hai bị ghi đè lặng lẽ.
 */
export function useGameMove(gameId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ version, move }: { version: number; move: unknown }) =>
      api.post<GameResponse>(`/games/${gameId}/moves`, { version, move }),
    onSuccess: (game) => {
      putGame(qc, game);
      if (game.status !== 'PLAYING') void qc.invalidateQueries({ queryKey: gameKeys.all });
    },
  });
}

export function useResign(gameId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<GameResponse>(`/games/${gameId}/resign`),
    onSuccess: (game) => {
      putGame(qc, game);
      void qc.invalidateQueries({ queryKey: gameKeys.all });
    },
  });
}

/**
 * Kênh thời gian thực của một ván.
 *
 * Không dựng thành Provider bao cả app như `realtime.tsx`: socket này chỉ cần
 * sống đúng lúc đang mở một ván, và người không chơi game thì không phải gánh
 * thêm một kết nối nào.
 *
 * Socket **không nhận nước đi** — nước đi đi bằng REST. Nó làm hai việc:
 *   1. nhận state mới rồi vá thẳng vào cache của TanStack Query, để màn hình
 *      chỉ đọc từ một nguồn duy nhất;
 *   2. báo server biết khi nào mình ẩn app, để đồng hồ dừng lại.
 */
export function useGameChannel(gameId: string | null): { connected: boolean } {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!gameId) return;

    // `socket.io-client` nạp động — cùng lý do với `realtime.tsx`: nó là một
    // trong những thư viện nặng nhất, không được nằm trong gói tải đầu.
    let socket: Socket | null = null;
    let cancelled = false;

    void import('socket.io-client').then(({ io }) => {
      if (cancelled) return;

      socket = io(GAME_RT_NAMESPACE, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        // Lấy token TẠI THỜI ĐIỂM kết nối: access token sống 15 phút nên lần
        // nối lại phải dùng token mới.
        auth: (cb) => cb({ token: getAccessToken() ?? '' }),
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        // Nối lại sau khi rớt cũng phải xin xem lại — server không nhớ giùm.
        socket?.emit(GAME_RT_EVENTS.WATCH, { gameId });
      });
      socket.on('disconnect', () => setConnected(false));

      socket.on(GAME_RT_EVENTS.STATE, (game: GameResponse) => {
        putGame(qc, game);
      });

      socket.on(GAME_RT_EVENTS.OVER, () => {
        void qc.invalidateQueries({ queryKey: gameKeys.all });
      });
    });

    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [gameId, qc]);

  /*
   * Báo CHỦ ĐỘNG khi tab bị ẩn, không đợi socket rớt.
   *
   * Socket.IO mất khoảng 20 giây mới nhận ra mất kết nối — trên đồng hồ 30 giây
   * thì đó là quá muộn, người khoá màn hình vẫn kịp mất gần hết lượt.
   */
  useEffect(() => {
    if (!gameId) return;

    const onVisibility = () => {
      const s = socketRef.current;
      if (!s?.connected) return;
      s.emit(
        document.visibilityState === 'visible' ? GAME_RT_EVENTS.BACK : GAME_RT_EVENTS.AWAY,
      );
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [gameId]);

  return { connected };
}

/**
 * Số giây còn lại của lượt hiện tại.
 *
 * `null` khi đồng hồ đang tạm dừng — màn hình phải nói rõ lý do chứ không để
 * đồng hồ đứng im một cách khó hiểu.
 */
export function useCountdown(deadlineAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadlineAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [deadlineAt]);

  if (deadlineAt === null) return null;
  // Kẹp về 0: đồng hồ máy có thể chạy nhanh hơn server, và "-3 giây" thì vô nghĩa.
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}
