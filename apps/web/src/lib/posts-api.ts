import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { FeedResponse, PostResponse, ReactionEmoji } from '@beside/shared';
import { api, apiRequest } from './api-client';

export const postKeys = {
  feed: (filter: string) => ['posts', 'feed', filter] as const,
};

export type FeedFilter = 'all' | 'mine' | 'partner' | 'pinned';

/**
 * Dòng kỷ niệm, cuộn vô tận bằng con trỏ.
 *
 * Dùng cursor chứ không phải offset: chỉ cần có một bài mới được đăng giữa lúc
 * người dùng đang cuộn là offset sẽ đẩy mọi bài xuống một bậc và trang sau lặp
 * lại bài đã thấy.
 */
export function useFeed(filter: FeedFilter, myId: string | null, partnerId: string | null) {
  return useInfiniteQuery({
    queryKey: postKeys.feed(filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '10' });
      if (pageParam) params.set('cursor', pageParam);
      if (filter === 'mine' && myId) params.set('authorId', myId);
      if (filter === 'partner' && partnerId) params.set('authorId', partnerId);
      if (filter === 'pinned') params.set('pinned', 'true');
      return api.get<FeedResponse>(`/posts?${params.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) =>
      apiRequest<PostResponse>('/posts', { method: 'POST', body: form }),
    onSuccess: () => {
      // Bài mới có thể lọt vào bất kỳ bộ lọc nào → nạp lại tất cả.
      void qc.invalidateQueries({ queryKey: ['posts', 'feed'] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.delete<void>(`/posts/${postId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts', 'feed'] }),
  });
}

export function useReact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, emoji }: { postId: string; emoji: ReactionEmoji }) =>
      api.post<PostResponse>(`/posts/${postId}/reactions`, { emoji }),
    onSuccess: (updated) => {
      // Chỉ vá đúng bài vừa đổi trong cache, không nạp lại cả dòng kỷ niệm —
      // nạp lại sẽ làm màn hình nhảy về đầu khi người dùng đang cuộn giữa chừng.
      qc.setQueriesData<{ pages: FeedResponse[]; pageParams: unknown[] }>(
        { queryKey: ['posts', 'feed'] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((p) => (p.id === updated.id ? updated : p)),
                })),
              }
            : old,
      );
    },
  });
}

