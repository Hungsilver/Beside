import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { MAP_PIN_LIMIT, type FeedResponse, type PostResponse, type ReactionEmoji } from '@beside/shared';
import { api, apiRequest } from './api-client';

export const postKeys = {
  feed: (filter: string) => ['posts', 'feed', filter] as const,
  /*
   * Ghim bản đồ nằm DƯỚI cùng tiền tố `['posts','feed']` để mọi lần đăng / xoá
   * bài đều làm mới nó theo — nếu tách nhánh riêng thì đăng xong ghim mới không
   * hiện lên bản đồ cho tới khi tải lại trang.
   */
  mapPins: (from: number | null, to: number | null) =>
    ['posts', 'feed', 'map-pins', from, to] as const,
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

/**
 * Ghim check-in cho bản đồ — CHỈ bài có toạ độ, trong một khoảng thời gian.
 *
 * Không dùng `useFeed('pinned')`: truy vấn cuộn vô tận chỉ nạp trang đầu (10
 * bài) nếu không ai bấm "tải thêm", nên bản đồ sẽ lặng lẽ bỏ sót ghim. Ở đây
 * lấy MỘT trang duy nhất, đúng bằng trần `MAP_PIN_LIMIT`, và để bộ lọc thời
 * gian làm nhiệm vụ thu hẹp thay vì phân trang.
 */
export function useMapPins(range: { from: number | null; to: number | null; error: string | null }) {
  return useQuery({
    queryKey: postKeys.mapPins(range.from, range.to),
    queryFn: () => {
      const params = new URLSearchParams({
        pinned: 'true',
        limit: String(MAP_PIN_LIMIT),
      });
      if (range.from !== null) params.set('from', String(range.from));
      if (range.to !== null) params.set('to', String(range.to));
      return api.get<FeedResponse>(`/posts?${params.toString()}`);
    },
    // Khoảng tự chọn còn dở dang (thiếu ngày, ngày ngược) thì đừng gọi API làm gì.
    enabled: range.error === null,
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
      /*
       * Chỉ vá đúng bài vừa đổi trong cache, không nạp lại cả dòng kỷ niệm —
       * nạp lại sẽ làm màn hình nhảy về đầu khi người dùng đang cuộn giữa chừng.
       *
       * Dưới tiền tố `['posts','feed']` có HAI hình dạng dữ liệu: dòng kỷ niệm
       * cuộn vô tận (`{pages: FeedResponse[]}`) và ghim bản đồ (`FeedResponse`
       * phẳng). Phải nhận ra từng loại — cứ đọc `old.pages` thì truy vấn ghim
       * bản đồ sẽ ném "cannot read properties of undefined".
       */
      qc.setQueriesData({ queryKey: ['posts', 'feed'] }, (old: unknown) =>
        patchPostInCache(old, updated),
      );
    },
  });
}


// ---------------------------------------------------------------------------

/** Thay một bài đã đổi vào đúng chỗ của nó trong một trang kết quả. */
function patchPage(page: FeedResponse, updated: PostResponse): FeedResponse {
  return { ...page, items: page.items.map((p) => (p.id === updated.id ? updated : p)) };
}

/**
 * Vá một bài vào cache, tự nhận ra hình dạng dữ liệu.
 *
 * Trả lại nguyên `old` khi không nhận ra — thà bỏ lỡ một lần vá (lần nạp lại
 * kế tiếp sẽ đúng) còn hơn ghi đè hỏng cache của người dùng.
 */
function patchPostInCache(old: unknown, updated: PostResponse): unknown {
  if (typeof old !== 'object' || old === null) return old;

  if ('pages' in old && Array.isArray((old as { pages: unknown }).pages)) {
    const infinite = old as { pages: FeedResponse[]; pageParams: unknown[] };
    return { ...infinite, pages: infinite.pages.map((page) => patchPage(page, updated)) };
  }

  if ('items' in old && Array.isArray((old as { items: unknown }).items)) {
    return patchPage(old as FeedResponse, updated);
  }

  return old;
}
