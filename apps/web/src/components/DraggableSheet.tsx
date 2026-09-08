import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Bảng thông tin kéo được ở đáy màn bản đồ.
 *
 * Ba nấc: thu gọn (chỉ thấy dòng đầu) · vừa (mặc định) · mở rộng.
 * Vuốt lên/xuống để đổi nấc, hoặc chạm vào thanh nắm để nhảy nấc kế tiếp.
 *
 * Vì sao cần: bản đồ là thứ người ta muốn nhìn, mà bảng thông tin chiếm mất
 * gần nửa màn hình 390×844. Cho thu gọn lại là trả về phần lớn không gian đó.
 *
 * Dùng con trỏ thô (`pointerdown/move/up`) chứ không kéo thư viện gesture về:
 * chỉ có một cử chỉ duy nhất theo trục dọc, thêm một phụ thuộc nữa vào gói tải
 * đầu là không đáng.
 */

export type SheetSnap = 'collapsed' | 'half' | 'full';

/** Chiều cao mỗi nấc, tính theo phần trăm chiều cao khung nhìn. */
const SNAP_HEIGHT: Record<SheetSnap, string> = {
  collapsed: '84px',
  half: '46%',
  full: '82%',
};

const ORDER: SheetSnap[] = ['collapsed', 'half', 'full'];

/** Vuốt ngắn hơn ngần này coi như chạm nhầm, không đổi nấc. */
const DRAG_THRESHOLD_PX = 44;

const SNAP_KEY = 'beside:map-sheet-snap';

function readSavedSnap(): SheetSnap {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return ORDER.includes(raw as SheetSnap) ? (raw as SheetSnap) : 'half';
  } catch {
    return 'half';
  }
}

export default function DraggableSheet({
  children,
  onSnapChange,
}: {
  children: ReactNode;
  /** Báo ra ngoài để bản đồ căn lại khung nhìn cho khớp phần còn trống. */
  onSnapChange?: (snap: SheetSnap) => void;
}) {
  const [snap, setSnap] = useState<SheetSnap>(readSavedSnap);
  const [dragOffset, setDragOffset] = useState(0);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SNAP_KEY, snap);
    } catch {
      /* bỏ qua */
    }
    onSnapChange?.(snap);
  }, [snap, onSnapChange]);

  function move(delta: number) {
    const i = ORDER.indexOf(snap);
    const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, i + delta))];
    if (next) setSnap(next);
  }

  function onPointerDown(e: React.PointerEvent) {
    startYRef.current = e.clientY;
    // Bắt con trỏ để ngón tay trượt ra ngoài thanh nắm vẫn nhận được sự kiện.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    // Kéo xuống = số dương. Giới hạn để bảng không bị lôi đi quá tay.
    setDragOffset(Math.max(-90, Math.min(90, e.clientY - startYRef.current)));
  }

  function onPointerUp() {
    const delta = dragOffset;
    startYRef.current = null;
    setDragOffset(0);
    if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
    // Kéo XUỐNG (delta > 0) là thu gọn ⇒ lùi một nấc.
    move(delta > 0 ? -1 : 1);
  }

  const dragging = startYRef.current !== null;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[430px] flex-col rounded-t-[34px] bg-white shadow-[0_-10px_40px_rgba(35,19,32,0.16)]"
      style={{
        height: SNAP_HEIGHT[snap],
        transform: dragging ? `translateY(${Math.max(0, dragOffset)}px)` : undefined,
        transition: dragging ? 'none' : 'height .28s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {/*
        Thanh nắm. Vạch kẻ nhìn thấy chỉ cao 6px, nhưng vùng CHẠM phải đủ 44px
        theo R2 — đây là chỗ ngón cái đặt vào để kéo, hụt một chút là trượt tay.
        `touch-action: none` để trình duyệt không cuộn trang khi đang kéo.
      */}
      <button
        type="button"
        aria-label={`Kéo để thay đổi kích thước bảng — đang ở nấc ${snap === 'collapsed' ? 'thu gọn' : snap === 'half' ? 'vừa' : 'mở rộng'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => move(snap === 'full' ? -2 : 1)}
        className="flex min-h-11 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span className="block h-1.5 w-11 rounded-full bg-ink-200" />
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[112px]">{children}</div>
    </div>
  );
}
