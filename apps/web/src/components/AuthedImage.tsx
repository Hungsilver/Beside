import { useEffect, useRef, useState } from 'react';
import { fetchImageObjectUrl } from '@/lib/api-client';

/**
 * Ảnh nằm sau lớp xác thực.
 *
 * `<img src="/api/v1/posts/photos/...">` sẽ nhận 401: thẻ img không gửi được
 * header Authorization. Nên phải tải bằng fetch rồi đổi sang blob URL.
 *
 * Trong lúc tải, hiện ảnh mờ 20px nhúng sẵn trong dữ liệu — người dùng thấy
 * ngay khung hình và màu sắc thay vì một ô xám trống.
 */
export default function AuthedImage({
  path,
  placeholder,
  alt,
  className,
  eager = false,
  aspectRatio,
}: {
  path: string;
  placeholder: string;
  alt: string;
  className?: string;
  /** Ảnh đầu danh sách thì tải ngay, còn lại chờ tới khi cuộn gần đến. */
  eager?: boolean;
  /**
   * Tỉ lệ khung (rộng / cao) do NƠI GỌI quyết định — thường là tỉ lệ thật của
   * ảnh, lấy từ `width/height` trong dữ liệu bài viết.
   *
   * Cần nó vì khung phải có chiều cao NGAY từ lúc chưa tải xong ảnh: không thì
   * cả dòng kỷ niệm nhảy chồm lên mỗi khi một tấm ảnh tải xong (layout shift),
   * và người đang đọc bị đẩy mất chỗ.
   */
  aspectRatio?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(eager);
  const holderRef = useRef<HTMLDivElement | null>(null);

  // Chỉ tải ảnh khi sắp lọt vào màn hình. Dòng kỷ niệm có thể dài hàng trăm
  // bài — tải hết một lượt là ngốn sạch data của người dùng.
  useEffect(() => {
    if (visible || !holderRef.current) return;

    const el = holderRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    // Đổi sang ảnh khác: bỏ url cũ ngay, nếu không thẻ img sẽ trỏ vào một blob
    // vừa bị thu hồi ở lượt dọn dẹp trước và hiện ra ô vỡ.
    setUrl(null);
    setFailed(false);

    void fetchImageObjectUrl(path)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      // Không thu hồi thì mỗi lần cuộn qua lại là rò thêm một blob trong bộ nhớ.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, visible]);

  return (
    <div
      ref={holderRef}
      className={`relative overflow-hidden bg-ink-100 ${className ?? ''}`}
      style={
        aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0
          ? { aspectRatio: String(aspectRatio) }
          : undefined
      }
    >
      <img
        src={placeholder}
        alt=""
        aria-hidden
        className="absolute inset-0 size-full scale-110 object-cover blur-lg"
      />
      {url && (
        <img
          src={url}
          alt={alt}
          className="relative size-full object-cover animate-[fadeIn_.25s_ease]"
        />
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-100/80 text-[12px] font-semibold text-ink-500">
          Không tải được ảnh
        </div>
      )}
    </div>
  );
}
