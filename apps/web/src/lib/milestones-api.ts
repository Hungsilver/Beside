import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMilestoneInput, MilestoneItem } from '@beside/shared';
import { api } from './api-client';

export const milestoneKeys = {
  all: ['milestones'] as const,
};

export function useMilestones() {
  return useQuery({
    queryKey: milestoneKeys.all,
    queryFn: () => api.get<MilestoneItem[]>('/milestones'),
    retry: false,
    /*
     * Danh sách phụ thuộc vào "hôm nay là ngày nào": mở app qua nửa đêm mà
     * không nạp lại thì "còn 1 ngày" sẽ đứng nguyên trong khi đã là hôm nay.
     */
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Ghi/sửa/xoá đều trả về LẠI cả danh sách đã sắp xếp, nên ghi thẳng vào cache
 * thay vì gọi lại một vòng nữa.
 */
export function useCreateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMilestoneInput) =>
      api.post<MilestoneItem[]>('/milestones', input),
    onSuccess: (list) => qc.setQueryData(milestoneKeys.all, list),
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateMilestoneInput }) =>
      api.patch<MilestoneItem[]>(`/milestones/${id}`, input),
    onSuccess: (list) => qc.setQueryData(milestoneKeys.all, list),
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/milestones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: milestoneKeys.all }),
  });
}
