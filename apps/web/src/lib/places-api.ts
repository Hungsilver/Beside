import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePlaceInput, PlaceResponse } from '@beside/shared';
import { api } from './api-client';

export const placeKeys = {
  all: ['places'] as const,
};

export function usePlaces() {
  return useQuery({
    queryKey: placeKeys.all,
    queryFn: () => api.get<PlaceResponse[]>('/places'),
    retry: false,
    // Ai đang ở trong hàng rào đổi theo thời gian thực; nạp lại khi quay lại màn.
    refetchOnWindowFocus: true,
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlaceInput) => api.post<PlaceResponse>('/places', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeKeys.all }),
  });
}

export function useUpdatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreatePlaceInput }) =>
      api.patch<PlaceResponse>(`/places/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeKeys.all }),
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/places/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeKeys.all }),
  });
}

/**
 * Lấy vị trí hiện tại một lần, để đặt địa điểm mới ngay tại chỗ đang đứng.
 *
 * Trả về câu lỗi tiếng Việt thay vì mã lỗi của trình duyệt — người dùng cần
 * biết phải làm gì tiếp, không cần biết `PERMISSION_DENIED` nghĩa là gì.
 */
export function getCurrentCoords(): Promise<{ lat: number; lng: number; accuracyM: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Trình duyệt này không lấy được vị trí'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Bạn đã chặn quyền vị trí — mở lại trong cài đặt trình duyệt'));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Lấy vị trí quá lâu — thử lại ở chỗ thoáng hơn nhé'));
        } else {
          reject(new Error('Không lấy được vị trí lúc này'));
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}
