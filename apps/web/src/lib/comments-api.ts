import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CommentListResponse,
  CommentResponse,
  FeedResponse,
} from '@beside/shared';
import { api } from './api-client';

export const commentKeys = {
  ofPost: (postId: string) => ['comments', postId] as const,
};

/**
 * Bình luận của một khoảnh khắc.
 *
 * Server trả về MỚI → CŨ (trang đầu là những dòng mới nhất); nơi vẽ đảo lại để
 * đọc xuôi như hội thoại, và "xem thêm" nạp dần lên phía trên. Lấy trang cũ
 * nhất trước thì bình luận vừa gõ sẽ rơi vào trang chưa tải và người viết
 * không thấy nó đâu cả.
 */
export function useComments(postId: string) {
  return useInfiniteQuery({
    queryKey: commentKeys.ofPost(postId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam);
      return api.get<CommentListResponse>(`/posts/${postId}/comments?${params.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<CommentResponse>(`/posts/${postId}/comments`, { body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: commentKeys.ofPost(postId) });
      bumpCommentCount(qc, postId, +1);
    },
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete<void>(`/posts/${postId}/comments/${commentId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: commentKeys.ofPost(postId) });
      bumpCommentCount(qc, postId, -1);
    },
  });
}

/**
 * Sửa tại chỗ con số "N bình luận" trong dòng kỷ niệm đang nằm trong bộ nhớ.
 *
 * KHÔNG nạp lại cả dòng kỷ niệm: người dùng đang mở tấm trượt trên một bài nằm
 * giữa danh sách, nạp lại là màn hình nhảy về đầu ngay dưới tay họ. Con số chỉ
 * cần đúng cho tới lần mở app sau, mà lần đó server trả lại số thật.
 *
 * Chặn dưới ở 0 phòng trường hợp hai tab cùng xoá một bình luận: một tab nhận
 * 404 nhưng tab kia đã trừ rồi — không để hiện ra "-1 bình luận".
 */
function bumpCommentCount(
  qc: ReturnType<typeof useQueryClient>,
  postId: string,
  delta: number,
): void {
  qc.setQueriesData<{ pages: FeedResponse[]; pageParams: unknown[] }>(
    { queryKey: ['posts', 'feed'] },
    (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((p) =>
                p.id === postId
                  ? { ...p, commentCount: Math.max(0, p.commentCount + delta) }
                  : p,
              ),
            })),
          }
        : old,
  );
}
