import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CyclePartnerResponse,
  CycleSelfResponse,
  CycleSettingsInput,
  PeriodEntryInput,
} from '@beside/shared';
import { api } from './api-client';

export const cycleKeys = {
  me: ['cycle', 'me'] as const,
  partner: ['cycle', 'partner'] as const,
};

/**
 * F14 — chu kỳ kinh nguyệt.
 *
 * Mọi mutation đều trả về NGUYÊN hồ sơ mới (server tính lại dự đoán sau mỗi
 * thay đổi), nên client chỉ việc đặt thẳng vào cache — không phải nạp lại, và
 * cũng không có cửa cho client tự tính ra một dự đoán khác với server.
 */
export function useCycleMe(enabled = true) {
  return useQuery({
    queryKey: cycleKeys.me,
    queryFn: () => api.get<CycleSelfResponse>('/cycle/me'),
    enabled,
    retry: false,
  });
}

/** Phần người ấy chia sẻ — server đã cắt gọt theo mức họ chọn. */
export function useCyclePartner(enabled = true) {
  return useQuery({
    queryKey: cycleKeys.partner,
    queryFn: () => api.get<CyclePartnerResponse>('/cycle/partner'),
    enabled,
    retry: false,
  });
}

export function useSaveCycleSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CycleSettingsInput) =>
      api.put<CycleSelfResponse>('/cycle/settings', input),
    onSuccess: (data) => {
      qc.setQueryData(cycleKeys.me, data);
      // Đổi mức chia sẻ là đổi thứ người ấy nhìn thấy.
      void qc.invalidateQueries({ queryKey: cycleKeys.partner });
    },
  });
}

export function useAddPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PeriodEntryInput) => api.post<CycleSelfResponse>('/cycle/periods', input),
    onSuccess: (data) => {
      qc.setQueryData(cycleKeys.me, data);
      void qc.invalidateQueries({ queryKey: cycleKeys.partner });
    },
  });
}

export function useUpdatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PeriodEntryInput }) =>
      api.patch<CycleSelfResponse>(`/cycle/periods/${id}`, input),
    onSuccess: (data) => {
      qc.setQueryData(cycleKeys.me, data);
      void qc.invalidateQueries({ queryKey: cycleKeys.partner });
    },
  });
}

export function useDeletePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<CycleSelfResponse>(`/cycle/periods/${id}`),
    onSuccess: (data) => {
      qc.setQueryData(cycleKeys.me, data);
      void qc.invalidateQueries({ queryKey: cycleKeys.partner });
    },
  });
}

/** Xoá sạch. Không hoàn tác được. */
export function useWipeCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/cycle/me'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cycle'] });
    },
  });
}
