import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TripResponse } from '@beside/shared';
import { api } from './api-client';

export const tripKeys = {
  current: ['trips', 'current'] as const,
};

/**
 * Chuyến "đang trên đường về" đang chạy của cặp đôi (của mình hoặc của người ấy).
 *
 * ── Vì sao hỏi lại theo nhịp thay vì dùng WebSocket ─────────────────────────
 * Giờ dự kiến đổi rất chậm — vài phút một lần là đủ. Thêm một loại sự kiện vào
 * `LocationsGateway` thì phải gánh theo mọi bài học về đua sự kiện đã ghi trong
 * §10 (tạm dừng đồng hồ, thứ tự `g:watch`…) cho một thứ không cần tới độ trễ
 * mili-giây. Khoảnh khắc THẬT SỰ cần biết ngay — lúc bắt đầu và lúc tới nơi —
 * đã có thông báo đẩy lo, kể cả khi app đang đóng.
 *
 * Chỉ hỏi lại khi có chuyến đang chạy: không có chuyến thì không tốn gì.
 */
export function useCurrentTrip() {
  return useQuery({
    queryKey: tripKeys.current,
    queryFn: () => api.get<{ trip: TripResponse | null }>('/trips/current'),
    refetchInterval: (query) => (query.state.data?.trip ? 20_000 : false),
    // Mở app lên là muốn biết ngay người ấy đã về tới chưa.
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useStartTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => api.post<TripResponse>('/trips', { placeId }),
    onSuccess: (trip) => qc.setQueryData(tripKeys.current, { trip }),
  });
}

export function useArriveTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => api.post<TripResponse>(`/trips/${tripId}/arrive`, {}),
    // Chuyến đã kết thúc thì không còn "chuyến đang chạy" nào nữa.
    onSuccess: () => qc.setQueryData(tripKeys.current, { trip: null }),
  });
}

export function useCancelTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => api.delete<void>(`/trips/${tripId}`),
    onSuccess: () => qc.setQueryData(tripKeys.current, { trip: null }),
  });
}
