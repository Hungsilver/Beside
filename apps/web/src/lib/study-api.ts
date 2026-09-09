import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  STUDY_RT_EVENTS,
  STUDY_RT_NAMESPACE,
  type StartStudyInput,
  type StudySessionResponse,
  type StudySummaryResponse,
} from '@beside/shared';
import { api, getAccessToken } from './api-client';

export const studyKeys = {
  all: ['study'] as const,
  summary: () => ['study', 'summary'] as const,
};

export function useStudySummary() {
  return useQuery({
    queryKey: studyKeys.summary(),
    queryFn: () => api.get<StudySummaryResponse>('/study/summary'),
    retry: false,
  });
}

export function useStartStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartStudyInput) =>
      api.post<StudySessionResponse>('/study', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

export function useJoinStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<StudySessionResponse>(`/study/${id}/join`),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

export function useLeaveStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<StudySessionResponse | null>(`/study/${id}/leave`),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

export function useCancelStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<StudySessionResponse>(`/study/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

/**
 * Kênh thời gian thực của phòng học.
 *
 * Mở ngay khi vào màn học, **kể cả lúc chưa có phiên nào** — vì đúng khoảnh
 * khắc cần biết nhất là lúc người kia vừa bấm "bắt đầu". Server cho nghe theo
 * couple chứ không theo phiên nên không cần id gì cả.
 *
 * Chỉ mở ở màn này, giống socket của trò chơi: người không học thì không phải
 * gánh thêm một kết nối.
 *
 * **Không** báo "away" khi ẩn app, khác hẳn phòng game — đồng hồ học phải chạy
 * tiếp lúc người ta khoá màn hình để tập trung.
 */
export function useStudyChannel(): { connected: boolean } {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

    void import('socket.io-client').then(({ io }) => {
      if (cancelled) return;

      socket = io(STUDY_RT_NAMESPACE, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth: (cb) => cb({ token: getAccessToken() ?? '' }),
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        socket?.emit(STUDY_RT_EVENTS.WATCH);
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on(STUDY_RT_EVENTS.STATE, () => {
        // Chặng vừa đổi — nạp lại tổng hợp để lấy cả thống kê mới.
        void qc.invalidateQueries({ queryKey: studyKeys.all });
      });
    });

    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [qc]);

  /*
   * Quay lại app thì nạp lại ngay.
   *
   * Đồng hồ vẫn chạy trong lúc màn hình khoá, nên rất có thể đã sang chặng khác
   * — và socket lúc đó đã bị treo cùng tiến trình JS nên không nhận được gì.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: studyKeys.all });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);

  return { connected };
}

/** Số giây còn lại của chặng hiện tại, làm tròn lên. */
export function useSecondsLeft(endsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);

  if (endsAt === null) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
