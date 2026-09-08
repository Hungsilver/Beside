import { useEffect, useState } from 'react';
import { fetchImageObjectUrl } from '@/lib/api-client';

/**
 * Ảnh đại diện, tự lùi về chữ cái đầu của tên khi chưa có ảnh.
 *
 * Ảnh nằm sau lớp xác thực nên phải tải bằng fetch rồi đổi sang blob URL —
 * `<img src>` thẳng sẽ nhận 401. Xem `AuthedImage` cho ảnh check-in; ở đây
 * cố tình KHÔNG dùng lại component đó vì nó gánh thêm IntersectionObserver và
 * ảnh mờ đặt chỗ — thừa cho một hình tròn 44px luôn nằm sẵn trên màn hình.
 */
export default function Avatar({
  url,
  name,
  size = 44,
  className = '',
  fallbackClassName = 'bg-love-100 text-love-700',
}: {
  /** Đường dẫn tương đối tới ảnh; `null` nghĩa là chưa đặt ảnh. */
  url: string | null;
  name: string;
  size?: number;
  className?: string;
  /**
   * Nền của vòng tròn chữ cái đầu. Mỗi chỗ trong app đang dùng một dải màu
   * riêng (hồng cho mình, xanh cho người ấy) — giữ nguyên bảng màu đó thay vì
   * ép tất cả về một màu.
   */
  fallbackClassName?: string;
}) {
  const objectUrl = useAvatarObjectUrl(url);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold ${objectUrl ? '' : fallbackClassName} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {objectUrl ? (
        <img src={objectUrl} alt={`Ảnh đại diện của ${name}`} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initial(name)}</span>
      )}
    </span>
  );
}

/**
 * Tải ảnh đại diện thành blob URL và thu hồi đúng lúc.
 *
 * Cờ `cancelled` là bắt buộc: người dùng đổi ảnh xong, effect cũ có thể về sau
 * effect mới. Không có cờ thì blob của ảnh CŨ ghi đè lên ảnh mới.
 */
function useAvatarObjectUrl(url: string | null): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setObjectUrl(null);
      return;
    }

    let created: string | null = null;
    let cancelled = false;
    setObjectUrl(null);

    void fetchImageObjectUrl(url)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setObjectUrl(u);
      })
      .catch(() => {
        // Không tải được thì lùi về chữ cái đầu, không hiện ô ảnh vỡ.
        if (!cancelled) setObjectUrl(null);
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return objectUrl;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
