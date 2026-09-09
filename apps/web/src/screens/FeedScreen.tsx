import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { REACTIONS, type PostResponse, type ReactionEmoji } from '@beside/shared';
import { useAuth } from '@/lib/auth-context';
import { useCouple } from '@/lib/couple-api';
import { useDeletePost, useFeed, useReact, type FeedFilter } from '@/lib/posts-api';
import { ApiRequestError } from '@/lib/api-client';
import { formatWhen } from '@/lib/relative-time';
import AuthedImage from '@/components/AuthedImage';
import CommentSheet from '@/components/CommentSheet';
import TabBar from '@/components/TabBar';
import { Screen, Spinner } from '@/components/ui';

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'mine', label: 'Của tôi' },
  { key: 'partner', label: 'Của người ấy' },
  { key: 'pinned', label: 'Có ghim 📍' },
];

export default function FeedScreen() {
  const { user } = useAuth();
  const coupleQuery = useCouple();
  const [filter, setFilter] = useState<FeedFilter>('all');

  const partnerId = coupleQuery.data?.partner?.id ?? null;
  const feed = useFeed(filter, user?.id ?? null, partnerId);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Tách ra từng giá trị: object `feed` đổi danh tính sau MỌI lần render, nên để
  // nguyên nó trong mảng phụ thuộc là dựng lại observer liên tục một cách vô ích.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  // Cuộn tới gần cuối thì tự nạp trang tiếp.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const total = posts.length;

  return (
    <Screen>
      <header className="flex items-center justify-between py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-love-500">
            {total > 0 ? `${total} khoảnh khắc` : 'Chưa có gì cả'}
          </p>
          <h1 className="text-[24px] font-extrabold tracking-tight">Kỷ niệm</h1>
        </div>
        <Link
          to="/check-in"
          aria-label="Tạo khoảnh khắc mới"
          className="love-gradient flex size-11 items-center justify-center rounded-full text-[22px] text-white shadow-[0_10px_30px_rgba(234,47,101,0.35)]"
        >
          ＋
        </Link>
      </header>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
              filter === f.key ? 'bg-love-100 text-love-700' : 'bg-ink-100 text-ink-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {feed.isLoading ? (
        <Spinner label="Đang mở kỷ niệm..." />
      ) : posts.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="flex flex-col gap-3.5">
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} eager={i < 2} myId={user?.id ?? null} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-px" />
      {feed.isFetchingNextPage && (
        <p className="py-4 text-center text-[12.5px] text-ink-400">Đang tải thêm...</p>
      )}
      {!feed.hasNextPage && posts.length > 0 && (
        <p className="py-4 text-center text-[12.5px] text-ink-400">
          Hết rồi — cùng tạo thêm kỷ niệm nhé 💕
        </p>
      )}

      <div className="h-[100px]" />
      <TabBar />
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function EmptyState({ filter }: { filter: FeedFilter }) {
  const text: Record<FeedFilter, string> = {
    all: 'Chưa có khoảnh khắc nào. Bấm ＋ để lưu lại tấm đầu tiên.',
    mine: 'Bạn chưa đăng khoảnh khắc nào.',
    partner: 'Người ấy chưa đăng khoảnh khắc nào.',
    pinned: 'Chưa có khoảnh khắc nào được ghim lên bản đồ.',
  };
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="text-[44px]">💌</span>
      <p className="max-w-[260px] text-[13.5px] leading-relaxed text-ink-500">{text[filter]}</p>
    </div>
  );
}

function PostCard({
  post,
  eager,
  myId,
}: {
  post: PostResponse;
  eager: boolean;
  myId: string | null;
}) {
  const react = useReact();
  const del = useDeletePost();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showComments, setShowComments] = useState(false);

  const myReaction = post.reactions.find((r) => r.userId === myId)?.emoji;
  const photo = post.photos[photoIndex];

  async function toggle(emoji: ReactionEmoji) {
    setError(null);
    try {
      await react.mutateAsync({ postId: post.id, emoji });
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Không thả được cảm xúc');
    }
  }

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-black/[0.04] bg-white shadow-[0_2px_8px_rgba(35,19,32,0.06)]">
      {photo && (
        <div className="relative">
          <AuthedImage
            path={photo.urlMd}
            placeholder={photo.placeholder}
            alt={post.caption ?? 'Ảnh check-in'}
            eager={eager}
            className="aspect-[4/3] w-full"
          />
          {post.photos.length > 1 && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {post.photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  aria-label={`Ảnh ${i + 1}`}
                  className={`size-1.5 rounded-full transition ${
                    i === photoIndex ? 'w-4 bg-white' : 'bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FF9BB3] to-[#FF4D7D] text-[12px] font-extrabold text-white">
            {post.authorName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-[13.5px]">{post.authorName}</b>
            <p className="mt-0.5 text-[11.5px] text-ink-400">
              {formatWhen(post.createdAt)}
              {post.lat !== null && ' · 📍 đã ghim lên bản đồ'}
            </p>
          </div>
          {post.mood && <span className="text-[20px]">{post.mood}</span>}
        </div>

        {post.caption && (
          <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed">{post.caption}</p>
        )}

        <div className="mt-3 flex items-center gap-1.5">
          {REACTIONS.map((emoji) => {
            const on = myReaction === emoji;
            const count = post.reactions.filter((r) => r.emoji === emoji).length;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => void toggle(emoji)}
                aria-pressed={on}
                className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-[14px] transition ${
                  on ? 'bg-love-100 ring-[1.5px] ring-love-300' : 'bg-ink-100'
                }`}
              >
                {emoji}
                {count > 0 && <span className="text-[11px] font-bold text-ink-600">{count}</span>}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowComments(true)}
            aria-label={
              post.commentCount > 0
                ? `Xem ${post.commentCount} bình luận`
                : 'Viết bình luận'
            }
            className="flex h-8 items-center gap-1 rounded-full bg-ink-100 px-2.5 text-[14px]"
          >
            💬
            {post.commentCount > 0 && (
              <span className="text-[11px] font-bold text-ink-600">{post.commentCount}</span>
            )}
          </button>

          <div className="flex-1" />

          {post.canDelete &&
            (confirming ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-8 rounded-full bg-ink-100 px-3 text-[12px] font-bold text-ink-600"
                >
                  Thôi
                </button>
                <button
                  type="button"
                  disabled={del.isPending}
                  onClick={() => void del.mutateAsync(post.id).catch(() => setError('Không xoá được'))}
                  className="h-8 rounded-full bg-love-600 px-3 text-[12px] font-bold text-white disabled:opacity-50"
                >
                  {del.isPending ? 'Đang xoá...' : 'Xoá hẳn'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label="Xoá khoảnh khắc"
                className="flex size-8 items-center justify-center rounded-full bg-ink-100 text-[13px]"
              >
                🗑
              </button>
            ))}
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[12px] font-semibold text-love-600">
            {error}
          </p>
        )}
      </div>

      {/* Chỉ gắn vào cây khi thật sự mở: mỗi tấm trượt kéo theo một truy vấn
          bình luận riêng, dựng sẵn cho cả 10 bài trong danh sách là 10 request
          không ai cần. */}
      {showComments && (
        <CommentSheet post={post} myId={myId} onClose={() => setShowComments(false)} />
      )}
    </article>
  );
}
