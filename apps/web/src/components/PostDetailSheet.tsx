import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PostResponse } from '@beside/shared';
import { formatWhen } from '@/lib/relative-time';
import AuthedImage from '@/components/AuthedImage';
import CoordinateCard from '@/components/CoordinateCard';
import PhotoLightbox from '@/components/PhotoLightbox';

/**
 * Chi tiết một khoảnh khắc đã ghim, mở ra khi chạm vào ghim trên bản đồ.
 *
 * Dựng bằng div chứ không phải `<dialog>` — cùng lý do với `CommentSheet` và
 * `EventSheet`: Safari iOS 16 chưa hỗ trợ `showModal()` đầy đủ.
 *
 * Phần toạ độ / sao chép / chỉ đường nằm ở `CoordinateCard`, dùng chung với
 * tấm trượt vị trí của người ấy.
 */
export default function PostDetailSheet({
  post,
  onClose,
}: {
  post: PostResponse;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const point =
    post.lat !== null && post.lng !== null ? { lat: post.lat, lng: post.lng } : null;
  const photo = post.photos[0];

  return (
    <>
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
          aria-label="Chi tiết khoảnh khắc"
          className="relative mx-auto flex max-h-[88dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-8px_40px_rgba(35,19,32,0.18)]"
        >
          <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-3">
            <b className="text-[15px]">Khoảnh khắc đã ghim</b>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 flex size-11 items-center justify-center text-[15px] font-semibold text-ink-500"
            >
              Xong
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3.5">
            {photo && (
              <button
                type="button"
                onClick={() => setLightboxIndex(0)}
                aria-label="Xem ảnh toàn màn hình"
                className="relative block w-full overflow-hidden rounded-[var(--radius-card)]"
              >
                <AuthedImage
                  path={photo.urlMd}
                  placeholder={photo.placeholder}
                  alt={post.caption ?? 'Ảnh check-in'}
                  eager
                  className="w-full"
                  // Giữ đúng tỉ lệ ảnh gốc — ảnh dọc không bị cắt mất đầu.
                  aspectRatio={photo.width / photo.height}
                />
                <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white">
                  {post.photos.length > 1 ? `🔍 ${post.photos.length} ảnh` : '🔍 Xem lớn'}
                </span>
              </button>
            )}

            <div className="mt-3 flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FF9BB3] to-[#FF4D7D] text-[12px] font-extrabold text-white">
                {post.authorName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px]">{post.authorName}</b>
                <p className="mt-0.5 text-[11.5px] text-ink-400">{formatWhen(post.createdAt)}</p>
              </div>
              {post.mood && <span className="text-[20px]">{post.mood}</span>}
            </div>

            {post.caption && (
              <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed">
                {post.caption}
              </p>
            )}

            {(post.reactions.length > 0 || post.commentCount > 0) && (
              <p className="mt-2 text-[12px] text-ink-400">
                {post.reactions.length > 0 && (
                  <span className="mr-3">
                    {post.reactions.map((r) => r.emoji).join(' ')} {post.reactions.length}
                  </span>
                )}
                {post.commentCount > 0 && <span>💬 {post.commentCount} bình luận</span>}
              </p>
            )}

            <div className="mt-3.5">
              <CoordinateCard point={point} title={post.placeName} />
            </div>

            <button
              type="button"
              onClick={() => void navigate('/ky-niem')}
              className="btn-ghost mt-2 w-full"
            >
              Xem trong Kỷ niệm
            </button>
          </div>
        </div>
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={post.photos}
          startIndex={lightboxIndex}
          caption={post.caption}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
