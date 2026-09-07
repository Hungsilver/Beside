import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateEventInput, EventResponse } from '@beside/shared';
import { api } from './api-client';

export const eventKeys = {
  /** Một tháng = một khoá cache. Đổi tháng là một truy vấn khác, không nạp lại cả năm. */
  month: (ym: string) => ['events', 'month', ym] as const,
  one: (id: string) => ['events', 'one', id] as const,
};

/**
 * Lịch của một tháng.
 *
 * Khoảng hỏi được nới thêm 7 ngày mỗi đầu: lưới lịch tháng luôn hiện vài ô của
 * tháng trước và tháng sau, nếu chỉ hỏi đúng phạm vi tháng thì mấy ô đó lúc nào
 * cũng trống dù thực ra có sự kiện.
 */
export function useMonthEvents(year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const first = Date.UTC(year, month - 1, 1);
  const last = Date.UTC(year, month, 1);
  const PAD = 7 * 86_400_000;

  return useQuery({
    queryKey: eventKeys.month(ym),
    queryFn: () => {
      const params = new URLSearchParams({
        from: new Date(first - PAD).toISOString(),
        to: new Date(last + PAD).toISOString(),
      });
      return api.get<EventResponse[]>(`/events?${params.toString()}`);
    },
    retry: false,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.post<EventResponse>('/events', input),
    // Sự kiện có thể rơi vào tháng nào cũng được (và sự kiện nhiều ngày rơi vào
    // nhiều tháng) → bỏ cache cả nhánh thay vì đoán tháng nào cần nạp lại.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateEventInput }) =>
      api.patch<EventResponse>(`/events/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}
