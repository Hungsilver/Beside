import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AVATAR_MAX_EDGE } from '@beside/shared';
import type { Privacy, SelfUser, UpdateProfileInput } from '@beside/shared';
import { compressImage } from './image-compress';
import { api, apiRequest } from './api-client';
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

/**
 * Đổi ảnh đại diện.
 *
 * Ảnh được nén ở phía client trước khi gửi (`compressImage`): ảnh gốc từ điện
 * thoại thường 4–12MB, mà hiển thị lớn nhất chỉ 512px. Gửi nguyên bản là bắt
 * người dùng tốn data cho thứ server sẽ vứt đi ngay.
 */
export function useSetAvatar(onUpdated?: (user: SelfUser) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { blob } = await compressImage(file, AVATAR_MAX_EDGE);
      const form = new FormData();
      // Tên tệp phải có đuôi khớp kiểu thật — server đọc nội dung chứ không tin
      // tên, nhưng để lệch thì log lẫn lộn lúc gỡ lỗi.
      form.append('avatar', blob, 'avatar.webp');
      return apiRequest<SelfUser>('/me/avatar', { method: 'POST', body: form });
    },
    onSuccess: (user) => {
      onUpdated?.(user);
      void qc.invalidateQueries({ queryKey: coupleKeys.me });
    },
  });
}

/** Gỡ ảnh đại diện, quay về chữ cái đầu của tên. */
export function useRemoveAvatar(onUpdated?: (user: SelfUser) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<SelfUser>('/me/avatar'),
    onSuccess: (user) => {
      onUpdated?.(user);
      void qc.invalidateQueries({ queryKey: coupleKeys.me });
    },
  });
}
