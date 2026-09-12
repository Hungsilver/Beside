import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  CHEER_COOLDOWN_MS,
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
  type StudyCheerCode,
  type StudyCheerEvent,
  type StudyTaskResponse,
  type UpdateTaskInput,
} from '@beside/shared';
import { api, getAccessToken } from './api-client';

export const studyKeys = {
  all: ['study'] as const,
  summary: () => ['study', 'summary'] as const,
};

/**
 * Tổng hợp phòng học.
 *
 * `enabled` để module Đồng hồ tắt hẳn truy vấn khi người dùng chưa ghép đôi:
 * `/dong-ho` mở được cả khi chưa có couple (một cái đồng hồ không cần người thứ
 * hai), mà `GET /study/summary` thì đòi couple — bật bừa thì mỗi lần mở đồng hồ
 * là một lần gọi API trả 4xx.
 */
export function useStudySummary({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: studyKeys.summary(),
    queryFn: () => api.get<StudySummaryResponse>('/study/summary'),
    retry: false,
    enabled,
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
export function useStudyChannel(myId: string | null): StudyChannel {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [cheer, setCheer] = useState<StudyCheerEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastSentRef = useRef(0);
  const clearRef = useRef<number | null>(null);

  /*
   * `myId` đọc qua ref chứ không đọc thẳng trong bộ lắng nghe.
   *
   * Bộ lắng nghe được gắn đúng một lần lúc mở socket, nên nó sẽ khoá cứng giá
   * trị `myId` của lần dựng đầu tiên — mà lần đầu ấy rất có thể là `null` vì
   * hồ sơ người dùng chưa tải xong. Lúc đó tiếng vọng của chính mình sẽ lọt
   * qua bộ lọc.
   */
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

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

      socket.on(STUDY_RT_EVENTS.CHEER, (event: StudyCheerEvent) => {
        // Server phát cho cả phòng kể cả người gửi; bỏ qua tiếng vọng của
        // chính mình, nếu không bấm một cái lại thấy hình nổi lên ở máy mình.
        if (!event || event.fromUserId === myIdRef.current) return;
        setCheer(event);
        if (clearRef.current !== null) window.clearTimeout(clearRef.current);
        clearRef.current = window.setTimeout(() => setCheer(null), CHEER_VISIBLE_MS);
      });
    });

    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
      socketRef.current = null;
      setConnected(false);
      if (clearRef.current !== null) window.clearTimeout(clearRef.current);
    };
    // `myId` cố tình không nằm trong danh sách phụ thuộc — đổi nó không đáng
    // phải dựng lại cả kết nối; bộ lắng nghe đọc qua `myIdRef` để luôn thấy
    // giá trị mới nhất.
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

  /**
   * Gửi một lời cổ vũ.
   *
   * Chặn bấm liên tục ở CẢ client, dù server cũng chặn: người dùng cần thấy nút
   * mờ đi ngay lập tức, chứ không phải bấm ba lần rồi không hiểu vì sao chỉ một
   * lần có tác dụng.
   */
  const sendCheer = useCallback((code: StudyCheerCode): boolean => {
    const now = Date.now();
    if (now - lastSentRef.current < CHEER_COOLDOWN_MS) return false;
    const socket = socketRef.current;
    if (!socket?.connected) return false;
    lastSentRef.current = now;
    socket.emit(STUDY_RT_EVENTS.CHEER, { code });
    return true;
  }, []);

  return { connected, cheer, sendCheer };
}

/** Lời cổ vũ nằm trên màn hình bao lâu trước khi tự tan. */
const CHEER_VISIBLE_MS = 4000;

export interface StudyChannel {
  connected: boolean;
  /** Lời cổ vũ vừa nhận từ người ấy, `null` khi không có gì đang hiện. */
  cheer: StudyCheerEvent | null;
  /** Trả `false` khi bị chặn vì bấm quá nhanh hoặc socket đang rớt. */
  sendCheer: (code: StudyCheerCode) => boolean;
}

/** Số giây còn lại của chặng hiện tại, làm tròn lên. */
export function useSecondsLeft(endsAt: number | null): number {
  const [left, setLeft] = useState(() => secondsUntil(endsAt));

  useEffect(() => {
    if (endsAt === null) {
      setLeft(0);
      return;
    }

    let timer: number | null = null;

    /*
     * Hẹn giờ ĐÚNG vào lúc con số sắp đổi, không hỏi lại mỗi 500ms.
     *
     * Bản đầu gọi `setInterval(…, 500)`: con số vẫn đúng, nhưng khoảnh khắc nó
     * ĐỔI lệch khỏi giây thật tới nửa giây, và độ lệch đó không đều giữa các
     * lần. Trên mặt số lật thì thấy ngay — các cú lật rơi lệch nhịp nhau, có
     * lúc dồn sát, có lúc thưa ra.
     */
    const tick = () => {
      const remaining = endsAt - Date.now();
      setLeft(Math.max(0, Math.ceil(remaining / 1000)));
      if (remaining <= 0) return;
      // Mốc đổi kế tiếp nằm ở bội số 1000 gần nhất phía dưới `remaining`.
      // Cộng 25ms để chắc chắn đã qua mốc, tránh hẹn lại đúng một giá trị cũ.
      const step = remaining % 1000 === 0 ? 1000 : remaining % 1000;
      timer = window.setTimeout(tick, step + 25);
    };
    tick();

    /*
     * Trình duyệt treo bộ hẹn giờ khi trang bị ẩn. Quay lại app là đọc lại
     * ngay, nếu không mặt đồng hồ còn đứng ở con số của lúc khoá máy.
     */
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer !== null) window.clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [endsAt]);

  return left;
}

function secondsUntil(endsAt: number | null): number {
  if (endsAt === null) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}
