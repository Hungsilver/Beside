import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  STUDY_RT_EVENTS,
  STUDY_RT_NAMESPACE,
  type CreateDDayInput,
  type CreateTaskInput,
  type SetLogNoteInput,
  type SetStudyGoalInput,
  type StartStudyInput,
  type StudyDDayResponse,
  type StudyNoteResponse,
  type StudySessionResponse,
  type StudySummaryResponse,
  type StudyTaskResponse,
  type UpdateTaskInput,
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

/**
 * Đặt mục tiêu phút mỗi ngày.
 *
 * Server chỉ cho sửa mục tiêu của chính người gọi nên không cần gửi `userId`;
 * xong thì nạp lại tổng hợp để vòng tiến độ đổi theo ngay.
 */
export function useSetStudyGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetStudyGoalInput) =>
      api.put<{ dailyGoalMin: number }>('/study/goal', input),
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

// ---------------------------------------------------------------------------
// Đợt 2 — mốc đếm ngược · việc cần làm · nhật ký
//
// Tất cả đều nạp lại `studyKeys.all` sau khi ghi: ba thứ này đi chung một lượt
// gọi `/study/summary`, nên làm mới cả cụm là đúng một vòng mạng chứ không phải
// ba. Bù lại con số thống kê cũng luôn khớp với thứ vừa bấm.
// ---------------------------------------------------------------------------

export function useCreateDDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDDayInput) => api.post<StudyDDayResponse>('/study/ddays', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

export function useDeleteDDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/study/ddays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.post<StudyTaskResponse>('/study/tasks', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTaskInput & { id: string }) =>
      api.patch<StudyTaskResponse>(`/study/tasks/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/study/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.all }),
  });
}

export function useSetLogNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ logId, ...input }: SetLogNoteInput & { logId: string }) =>
      api.put<StudyNoteResponse>(`/study/logs/${logId}/note`, input),
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
