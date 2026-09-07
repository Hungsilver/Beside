import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Privacy, SelfUser, UpdateProfileInput } from '@beside/shared';
import { api } from './api-client';
import { coupleKeys } from './couple-api';

export function useUpdateProfile(onUpdated?: (user: SelfUser) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.patch<SelfUser>('/me', input),
    onSuccess: (user) => {
      onUpdated?.(user);
      // Người ấy nhìn thấy tên/handle của mình qua GET /couples/me → phải nạp lại.
      void qc.invalidateQueries({ queryKey: coupleKeys.me });
    },
  });
}

/**
 * Cài đặt riêng tư (F8). Có hiệu lực NGAY ở điểm vị trí kế tiếp —
 * server đọc lại quyền riêng tư mỗi lần nhận, không cache.
 */
export function useUpdatePrivacy(onUpdated?: (user: SelfUser) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Privacy>) => api.patch<SelfUser>('/me/privacy', patch),
    onSuccess: (user) => {
      onUpdated?.(user);
      void qc.invalidateQueries({ queryKey: coupleKeys.me });
    },
  });
}

export function useUpdateAnniversary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (anniversaryAt: string) =>
      api.patch('/couples/me', { anniversaryAt }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: coupleKeys.me });
      void qc.invalidateQueries({ queryKey: coupleKeys.loveSummary });
    },
  });
}
