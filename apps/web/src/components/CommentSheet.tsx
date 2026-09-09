import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  COMMENT_MAX,
  createCommentSchema,
  type CommentResponse,
  type PostResponse,
} from '@beside/shared';
import { ApiRequestError } from '@/lib/api-client';
import { useAddComment, useComments, useDeleteComment } from '@/lib/comments-api';
import { formatWhen } from '@/lib/relative-time';
import { FormError } from '@/components/ui';

/**
 * Tấm trượt bình luận của một khoảnh khắc.
 *
 * Dựng bằng div chứ không phải `<dialog>` — cùng lý do với `EventSheet`:
 * Safari iOS 16 chưa hỗ trợ `showModal()` đầy đủ và bàn phím ảo hay đẩy hỏng
 * layout của dialog gốc.
 */
export default function CommentSheet({
  post,
  myId,
  onClose,
}: {
  post: PostResponse;
  myId: string | null;
  onClose: () => void;
}) {
  const comments = useComments(post.id);
  const add = useAddComment(post.id);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  // Id của dòng mới nhất ở lần vẽ trước — xem effect cuộn ở dưới.
  const newestSeenRef = useRef<string | null>(null);
  // Chốt chặn chống bấm gửi hai lần. `isPending` của react-query đi qua một
  // vòng cập nhật state, còn hai lần chạm cách nhau 50ms thì không.
  const sendingRef = useRef(false);

  // Khoá cuộn nền để bàn phím ảo không đẩy cả trang.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Esc để đóng — bàn phím ngoài trên iPad và mọi trình duyệt máy tính.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pages = comments.data?.pages ?? [];
  /*
   * Server trả mới → cũ; đảo lại để đọc xuôi như hội thoại.
   *
   * `pages` nối lại là [mới nhất … cũ nhất] (trang sau càng cũ), nên `reverse()`
   * cho ra đúng [cũ nhất … mới nhất] — dòng mới nhất luôn nằm cuối, ngay trên
   * ô nhập.
   */
  const items = [...pages.flatMap((p) => p.items)].reverse();
  // Tổng lấy từ trang ĐẦU: đó là trang vừa được nạp lại sau khi thêm/xoá.
  const total = pages[0]?.total ?? post.commentCount;

  const newestId = items[items.length - 1]?.id ?? null;

  /*
   * Cuộn xuống đáy khi dòng MỚI NHẤT đổi — mở tấm trượt lần đầu, hoặc vừa gửi
   * xong một bình luận.
   *
   * Cố tình không dựa vào SỐ dòng: bấm "xem thêm" nạp các dòng cũ vào PHÍA
   * TRÊN, số dòng cũng tăng, mà nhảy xuống đáy lúc đó là giật mất chỗ người
   * dùng vừa xin xem.
   */
  useEffect(() => {
    const el = listRef.current;
    if (!el || newestId === null) return;

    // Lần đầu thì nhảy thẳng, không cần hoạt ảnh cuộn qua cả danh sách.
    const first = newestSeenRef.current === null;
    el.scrollTo({ top: el.scrollHeight, behavior: first ? 'auto' : 'smooth' });
    newestSeenRef.current = newestId;
  }, [newestId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sendingRef.current) return;

    setError(null);

    // Kiểm tra bằng CHÍNH schema server dùng — sai thì báo ngay tại chỗ,
    // không phải chờ một vòng mạng mới biết.
    const parsed = createCommentSchema.safeParse({ body: draft });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Nội dung không hợp lệ');
      return;
    }

    sendingRef.current = true;
    try {
      await add.mutateAsync(parsed.data.body);
      // Chỉ xoá ô nhập KHI ĐÃ GỬI XONG. Xoá trước cho "mượt" thì mất mạng là
      // mất luôn câu người dùng vừa gõ.
      setDraft('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Không gửi được bình luận');
    } finally {
      sendingRef.current = false;
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bình luận"
        className="relative mx-auto flex max-h-[85dvh] w-full max-w-[430px] flex-col rounded-t-[28px] bg-white shadow-[0_-8px_40px_rgba(35,19,32,0.18)]"
      >
        <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-3">
          <b className="text-[15px]">
            {total > 0 ? `${total} bình luận` : 'Bình luận'}
          </b>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex size-11 items-center justify-center text-[15px] font-semibold text-ink-500"
          >
            Xong
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-3">
          {comments.isLoading ? (
            <p className="py-8 text-center text-[13px] text-ink-400">Đang tải bình luận...</p>
          ) : comments.isError ? (
            <FormError
              message={
                comments.error instanceof ApiRequestError
                  ? comments.error.message
                  : 'Không tải được bình luận'
              }
            />
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-[13px] leading-relaxed text-ink-400">
              Chưa có bình luận nào.
              <br />
              Nói gì đó với người ấy về khoảnh khắc này nhé 💬
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {/* Nạp dòng CŨ hơn nên nút nằm ở đầu danh sách, không phải cuối. */}
              {comments.hasNextPage && (
                <li>
                  <button
                    type="button"
                    disabled={comments.isFetchingNextPage}
                    onClick={() => void comments.fetchNextPage()}
                    className="mx-auto flex h-11 items-center rounded-full bg-ink-100 px-4 text-[12.5px] font-bold text-ink-600 disabled:opacity-50"
                  >
                    {comments.isFetchingNextPage ? 'Đang tải...' : 'Xem bình luận cũ hơn'}
                  </button>
                </li>
              )}
              {items.map((c) => (
                <CommentRow key={c.id} comment={c} mine={c.authorId === myId} postId={post.id} />
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={submit}
          className="border-t border-black/[0.05] px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]"
        >
          {error && (
            <p role="alert" className="mb-2 text-[12px] font-semibold text-love-600">
              {error}
            </p>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Viết bình luận..."
              rows={1}
              aria-label="Nội dung bình luận"
              // Cố ý KHÔNG đặt `maxLength`: trình duyệt sẽ lặng lẽ nuốt phím khi
              // chạm trần, người dùng không hiểu vì sao gõ mà không ra chữ.
              className="field-input max-h-28 flex-1 resize-none py-3"
            />
            <button
              type="submit"
              disabled={add.isPending || draft.trim().length === 0}
              aria-label="Gửi bình luận"
              className="love-gradient flex size-12 shrink-0 items-center justify-center rounded-full text-[18px] text-white disabled:opacity-40"
            >
              {add.isPending ? '···' : '➤'}
            </button>
          </div>

          {draft.length > COMMENT_MAX * 0.8 && (
            <p
              className={`mt-1.5 text-right text-[11.5px] tabular-nums ${
                draft.trim().length > COMMENT_MAX ? 'font-bold text-love-600' : 'text-ink-400'
              }`}
            >
              {draft.trim().length}/{COMMENT_MAX}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CommentRow({
  comment,
  mine,
  postId,
}: {
  comment: CommentResponse;
  mine: boolean;
  postId: string;
}) {
  const del = useDeleteComment(postId);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white ${
          mine
            ? 'bg-gradient-to-br from-[#FF9BB3] to-[#FF4D7D]'
            : 'bg-gradient-to-br from-[#8FB8FF] to-[#4D7DFF]'
        }`}
        aria-hidden
      >
        {comment.authorName.charAt(0).toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-ink-100 px-3 py-2">
          <b className="text-[12.5px]">{comment.authorName}</b>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
            {comment.body}
          </p>
        </div>

        <div className="mt-1 flex items-center gap-2 pl-1">
          <span className="text-[11px] text-ink-400">{formatWhen(comment.createdAt)}</span>

          {comment.canDelete &&
            (confirming ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-[11px] font-bold text-ink-500"
                >
                  Thôi
                </button>
                <button
                  type="button"
                  disabled={del.isPending}
                  onClick={() =>
                    void del
                      .mutateAsync(comment.id)
                      .catch((e: unknown) =>
                        setError(
                          e instanceof ApiRequestError ? e.message : 'Không xoá được',
                        ),
                      )
                  }
                  className="text-[11px] font-bold text-love-600 disabled:opacity-50"
                >
                  {del.isPending ? 'Đang xoá...' : 'Xoá hẳn'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-[11px] font-bold text-ink-500"
              >
                Xoá
              </button>
            ))}
        </div>

        {error && (
          <p role="alert" className="mt-1 pl-1 text-[11.5px] font-semibold text-love-600">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
