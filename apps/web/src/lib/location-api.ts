import { useQuery } from '@tanstack/react-query';
import type { PartnerLatestLocation, PartnerTrail } from '@beside/shared';
import { api } from './api-client';

export const locationKeys = {
  partnerLatest: ['locations', 'partner', 'latest'] as const,
  partnerTrail: ['locations', 'partner', 'trail'] as const,
};

export interface PartnerLatestResponse {
  location: PartnerLatestLocation | null;
  distanceM: number | null;
}

/**
 * Vị trí gần nhất của đối phương.
 *
 * Đây là nguồn dữ liệu lúc MỚI MỞ bản đồ; sau đó WebSocket sẽ đẩy điểm mới.
 * Vẫn hỏi lại mỗi 60 giây để phòng trường hợp socket rớt mà chưa kịp nối lại.
 */
export function usePartnerLatest(enabled = true) {
  return useQuery({
    queryKey: locationKeys.partnerLatest,
    enabled,
    retry: false,
    refetchInterval: 60_000,
    queryFn: () => api.get<PartnerLatestResponse>('/locations/partner/latest'),
  });
}

/** Vệt đường của đối phương trong 12 giờ gần nhất. */
export function usePartnerTrail(enabled = true) {
  return useQuery({
    queryKey: locationKeys.partnerTrail,
    enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: () => api.get<PartnerTrail>('/locations/partner/trail?limit=500'),
  });
}
