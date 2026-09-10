import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoResponse } from '@beside/shared';
import { fetchImageObjectUrl } from '@/lib/api-client';

/**
 * Xem ảnh toàn màn hình.
 *
 * Vì sao cần: trong dòng kỷ niệm, ảnh bị cắt theo khung để các thẻ bài đều nhau
 * — ảnh dọc chụp bằng điện thoại mất cả đầu lẫn chân. Ở đây ảnh hiện TRỌN VẸN
 * (`object-contain`) trên nền tối, phóng to được để nhìn rõ chi tiết.
 *
 * Ảnh nằm sau lớp xác thực nên phải tải bằng fetch rồi đổi sang blob URL (§7.1b),
 * giống `AuthedImage`. Ở đây tự quản lý blob thay vì dùng lại component đó vì
 * cần đặt `transform` lên đúng thẻ `<img>` để phóng to / kéo ảnh.
 *
 * Cỡ ảnh lấy là `orig` (2048px) — người dùng mở toàn màn hình chính là lúc họ
 * muốn nhìn rõ; bản `md` 1080px phóng lên sẽ thấy vỡ hạt.
 */

/** Mức phóng khi chạm hai lần. Đủ để đọc chữ trên biển hiệu trong ảnh. */
const ZOOM_STEP = 2.5;

/** Vuốt ngang quá ngần này (px) thì chuyển ảnh. */
const SWIPE_THRESHOLD_PX = 60;

/** Cửa sổ nhận cú chạm thứ hai của cử chỉ "chạm hai lần". */
const DOUBLE_TAP_MS = 280;

export default function PhotoLightbox({
  photos,
  startIndex = 0,
  caption,
  onClose,
}: {
  photos: PhotoResponse[];
  startIndex?: number;
  caption?: string | null;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, photos.length - 1)),
  );
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const photo = photos[index];

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = i + delta;
        if (next < 0 || next >= photos.length) return i;
        return next;
      });
      // Đổi ảnh thì bỏ mọi phóng to / dời ảnh của tấm trước, nếu không tấm mới
      // mở ra đã ở sẵn trạng thái phóng to lệch một góc nào đó.
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    },
    [photos.length],
  );

  // Khoá cuộn nền trong lúc mở.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Bàn phím: Esc đóng, mũi tên chuyển ảnh (bàn phím ngoài / máy tính).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go]);

  /*
   * Nút "quay lại" của điện thoại phải đóng ảnh chứ không rời khỏi màn hình.
   *
   * Đẩy thêm một mục vào lịch sử khi mở, rồi nghe `popstate`. Lúc đóng bằng nút
   * X thì phải gỡ mục đó ra (`history.back()`), nếu không người dùng bấm quay
   * lại một lần nữa sẽ thấy "không có gì xảy ra".
   */
  useEffect(() => {
    const marker = { besideLightbox: true };
    window.history.pushState(marker, '');

    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if ((window.history.state as { besideLightbox?: boolean } | null)?.besideLightbox) {
        window.history.back();
      }
    };
  }, [onClose]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
    >
      <div className="flex shrink-0 items-center justify-between px-3 pt-[max(env(safe-area-inset-top),10px)]">
        <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold tabular-nums text-white/90">
          {photos.length > 1 ? `${index + 1}/${photos.length}` : `${photo.width}×${photo.height}`}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setZoom((z) => (z > 1 ? 1 : ZOOM_STEP));
              setOffset({ x: 0, y: 0 });
            }}
            aria-label={zoom > 1 ? 'Thu nhỏ ảnh' : 'Phóng to ảnh'}
            className="flex size-11 items-center justify-center rounded-full bg-white/10 text-[17px] text-white"
          >
            {zoom > 1 ? '⊖' : '⊕'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng ảnh"
            className="flex size-11 items-center justify-center rounded-full bg-white/10 text-[17px] text-white"
          >
            ✕
          </button>
        </div>
      </div>

      <ZoomableImage
        key={photo.id}
        photo={photo}
        zoom={zoom}
        offset={offset}
        onZoomChange={setZoom}
        onOffsetChange={setOffset}
        onSwipe={go}
        onBackdropTap={onClose}
      />

      <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-2">
        {photos.length > 1 && (
          <div className="mb-2 flex justify-center gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
                aria-label={`Xem ảnh ${i + 1}`}
                aria-current={i === index}
                className="flex h-11 items-center px-1"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/45'
                  }`}
                />
              </button>
            ))}
          </div>
        )}

        {caption && (
          <p className="mx-auto max-w-[430px] text-center text-[13px] leading-relaxed text-white/85">
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Vùng ảnh: tải blob, phóng to bằng chụm hai ngón / chạm hai lần, kéo để dời
 * ảnh khi đang phóng, vuốt ngang để đổi ảnh khi đang ở mức 1×.
 *
 * Tự viết bằng sự kiện con trỏ thay vì kéo về một thư viện gesture: chỉ có ba
 * cử chỉ, mà mỗi thư viện thêm vào là thêm vài chục KB cho gói tải đầu.
 */
function ZoomableImage({
  photo,
  zoom,
  offset,
  onZoomChange,
  onOffsetChange,
  onSwipe,
  onBackdropTap,
}: {
  photo: PhotoResponse;
  zoom: number;
  offset: { x: number; y: number };
  onZoomChange: (z: number) => void;
  onOffsetChange: (o: { x: number; y: number }) => void;
  onSwipe: (delta: number) => void;
  onBackdropTap: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Con trỏ đang chạm màn hình, theo id — cần cho cử chỉ chụm hai ngón.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const startRef = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const lastTapRef = useRef(0);
  // Hẹn giờ đóng của cú chạm đơn. Phải huỷ được, vì cú chạm THỨ HAI của cử chỉ
  // phóng to đến sau nó — không huỷ thì chạm hai lần vừa phóng to vừa đóng ảnh.
  const tapCloseTimerRef = useRef<number | null>(null);
  // Đã xử lý cử chỉ (kéo / vuốt / chụm) thì lần nhấc tay đó không phải cú chạm.
  const movedRef = useRef(false);

  // Rời màn hình giữa lúc còn hẹn giờ thì phải dọn, không để nó gọi vào
  // component đã tháo.
  useEffect(
    () => () => {
      if (tapCloseTimerRef.current !== null) window.clearTimeout(tapCloseTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setUrl(null);
    setFailed(false);

    void fetchImageObjectUrl(photo.urlOrig)
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.urlOrig]);

  function onPointerDown(e: React.PointerEvent) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: distanceBetween(a!, b!), zoom };
      startRef.current = null;
      movedRef.current = true;
      return;
    }

    startRef.current = { x: e.clientX, y: e.clientY, offset };
    movedRef.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Chụm hai ngón — ưu tiên hơn kéo.
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const next = (distanceBetween(a!, b!) / pinchRef.current.distance) * pinchRef.current.zoom;
      onZoomChange(clamp(next, 1, 5));
      return;
    }

    const start = startRef.current;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) movedRef.current = true;

    // Chỉ dời ảnh khi đang phóng to. Ở mức 1× thì cử chỉ ngang dành cho việc
    // chuyển ảnh, xử lý lúc nhấc tay.
    if (zoom > 1) onOffsetChange({ x: start.offset.x + dx, y: start.offset.y + dy });
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = startRef.current;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (!start) return;
    startRef.current = null;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    // Vuốt ngang đổi ảnh — chỉ khi đang ở 1× và đúng là vuốt ngang, không phải
    // vuốt chéo (vuốt dọc dành cho cử chỉ đóng của hệ điều hành).
    if (zoom === 1 && Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      onSwipe(dx < 0 ? 1 : -1);
      return;
    }

    if (movedRef.current) return;

    // Chạm hai lần liên tiếp = phóng to / thu nhỏ.
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      if (tapCloseTimerRef.current !== null) {
        window.clearTimeout(tapCloseTimerRef.current);
        tapCloseTimerRef.current = null;
      }
      onZoomChange(zoom > 1 ? 1 : ZOOM_STEP);
      onOffsetChange({ x: 0, y: 0 });
      return;
    }

    lastTapRef.current = now;

    // Chạm một lần khi chưa phóng to = đóng. Nhưng phải chờ hết cửa sổ chạm-hai-lần
    // mới biết đó có thật là cú chạm đơn hay không.
    if (zoom === 1) {
      tapCloseTimerRef.current = window.setTimeout(() => {
        tapCloseTimerRef.current = null;
        onBackdropTap();
      }, DOUBLE_TAP_MS);
    }
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Ảnh mờ nhúng sẵn: hiện ngay khung hình trong lúc bản 2048px đang tải. */}
      <img
        src={photo.placeholder}
        alt=""
        aria-hidden
        className={`absolute inset-0 size-full object-contain blur-xl transition-opacity ${
          url ? 'opacity-0' : 'opacity-60'
        }`}
      />

      {url && (
        <img
          src={url}
          alt="Ảnh khoảnh khắc"
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transition: pinchRef.current ? 'none' : 'transform .18s ease-out',
          }}
        />
      )}

      {failed && (
        <p className="px-6 text-center text-[13px] font-semibold text-white/80">
          Không tải được ảnh. Kiểm tra kết nối rồi thử lại nhé.
        </p>
      )}
    </div>
  );
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
