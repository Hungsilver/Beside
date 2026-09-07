import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CoupleResponse, LoveSummary } from '@beside/shared';
import { api, ApiRequestError } from './api-client';

export const coupleKeys = {
  me: ['couple', 'me'] as const,
  loveSummary: ['couple', 'love-summary'] as const,
};

/**
 * Couple hiện tại. Trả `null` (chứ không phải lỗi) khi người dùng chưa ghép đôi —
 * đó là trạng thái hợp lệ, không phải sự cố.
 */
export function useCouple(enabled = true) {
  return useQuery({
    queryKey: coupleKeys.me,
    enabled,
    retry: false,
    queryFn: async (): Promise<CoupleResponse | null> => {
      try {
        return await api.get<CoupleResponse>('/couples/me');
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'NOT_IN_COUPLE') {
          return null;
        }
        throw err;
      }
    },
  });
}

export function useLoveSummary(enabled = true) {
  return useQuery({
    queryKey: coupleKeys.loveSummary,
    enabled,
    retry: false,
    queryFn: () => api.get<LoveSummary>('/couples/me/love-summary'),
  });
}

export function useCreateCouple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (anniversaryAt: string) =>
      api.post<CoupleResponse>('/couples', { anniversaryAt }),
    onSuccess: (couple) => {
      qc.setQueryData(coupleKeys.me, couple);
      void qc.invalidateQueries({ queryKey: coupleKeys.loveSummary });
    },
  });
}

export function useJoinCouple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      api.post<CoupleResponse>('/couples/join', { inviteCode }),
    onSuccess: (couple) => {
      qc.setQueryData(coupleKeys.me, couple);
      void qc.invalidateQueries({ queryKey: coupleKeys.loveSummary });
    },
  });
}

export function useRegenerateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CoupleResponse>('/couples/me/invite'),
    onSuccess: (couple) => qc.setQueryData(coupleKeys.me, couple),
  });
}

export function useUnpair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/couples/me', { confirm: true }),
    onSuccess: () => {
      qc.setQueryData(coupleKeys.me, null);
      qc.removeQueries({ queryKey: coupleKeys.loveSummary });
    },
  });
}
