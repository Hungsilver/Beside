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

/**
 * Chiều cao mỗi nấc.
 *
 * Nấc thu gọn phải CỘNG THÊM chiều cao thanh tab. Bảng neo `bottom-0` nên đáy
 * của nó nằm khuất dưới thanh tab (`z-30`, cao hơn bảng `z-20`). Trước đây nấc
 * này đặt cứng 84px — xấp xỉ đúng chiều cao thanh tab trên iPhone có tai thỏ,
 * nên thanh nắm bị che gần hết và không còn chỗ đặt ngón tay vào kéo.
 * Cộng thêm 100px là đủ cho thanh nắm (48px) + dòng tên/avatar (48px).
 */
const SNAP_HEIGHT: Record<SheetSnap, string> = {
  collapsed: 'calc(var(--tabbar-h) + 100px)',
  half: '46%',
  full: '82%',
};

const ORDER: SheetSnap[] = ['collapsed', 'half', 'full'];

/** Vuốt ngắn hơn ngần này coi như chạm, không phải kéo. */
const DRAG_THRESHOLD_PX = 28;

/** Giới hạn quãng kéo để một cú vung tay không lôi bảng đi quá đà. */
const MAX_DRAG_PX = 240;

const SNAP_KEY = 'beside:map-sheet-snap';

function readSavedSnap(): SheetSnap {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return ORDER.includes(raw as SheetSnap) ? (raw as SheetSnap) : 'half';
  } catch {
    return 'half';
  }
}

const SNAP_LABEL: Record<SheetSnap, string> = {
  collapsed: 'thu gọn',
  half: 'vừa',
  full: 'mở rộng',
};

export default function DraggableSheet({
  children,
  onSnapChange,
}: {
  children: ReactNode;
  /** Báo ra ngoài để bản đồ căn lại khung nhìn cho khớp phần còn trống. */
  onSnapChange?: (snap: SheetSnap) => void;
}) {
  const [snap, setSnap] = useState<SheetSnap>(readSavedSnap);
  /** `null` = không kéo. Số dương = đang kéo xuống. */
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const gestureHandledRef = useRef(false);

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

  /** Chạm (không kéo): đang mở hết thì gập về thu gọn, còn lại thì lên một nấc. */
  function tap() {
    move(snap === 'full' ? -2 : 1);
  }

  function onPointerDown(e: React.PointerEvent) {
    startYRef.current = e.clientY;
    setDragOffset(0);
    gestureHandledRef.current = false;
    // Bắt con trỏ để ngón tay trượt ra ngoài thanh nắm vẫn nhận được sự kiện.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    // Kéo xuống = số dương.
    const raw = e.clientY - startYRef.current;
    setDragOffset(Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, raw)));
  }

  function onPointerUp() {
    if (startYRef.current === null) return;
    const delta = dragOffset ?? 0;
    startYRef.current = null;
    setDragOffset(null);
    /*
     * Con trỏ đang bị bắt nên cùng một phần tử nhận cả `pointerdown` lẫn
     * `pointerup` ⇒ trình duyệt vẫn bắn `click` SAU khi kéo xong. Không chặn
     * thì cú kéo vừa đổi nấc xong bị chính cú click đó đổi ngược lại, bảng
     * đứng yên y như hỏng — đúng triệu chứng "vuốt mãi không lên".
     */
    gestureHandledRef.current = true;
    if (Math.abs(delta) >= DRAG_THRESHOLD_PX) {
      // Kéo XUỐNG (delta > 0) là thu gọn ⇒ lùi một nấc.
      move(delta > 0 ? -1 : 1);
    } else {
      tap();
    }
  }

  /** Huỷ giữa chừng (cuộc gọi đến, gesture hệ thống): trả về nguyên trạng. */
  function onPointerCancel() {
    startYRef.current = null;
    setDragOffset(null);
  }

  const dragging = dragOffset !== null;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[430px] flex-col rounded-t-[34px] bg-white shadow-[0_-10px_40px_rgba(35,19,32,0.16)]"
      style={{
        /*
         * Kéo thì đổi CHIỀU CAO chứ không `translateY`: trước đây chỉ dịch khi
         * kéo xuống, nên vuốt LÊN không có phản hồi gì cả — người dùng tưởng
         * cử chỉ không ăn rồi thả tay sớm.
         */
        height: dragging
          ? `clamp(${SNAP_HEIGHT.collapsed}, calc(${SNAP_HEIGHT[snap]} - ${dragOffset}px), ${SNAP_HEIGHT.full})`
          : SNAP_HEIGHT[snap],
        transition: dragging ? 'none' : 'height .28s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {/*
        Thanh nắm. Vạch kẻ nhìn thấy chỉ cao 5px, nhưng vùng CHẠM phải đủ 48px
        theo R2 — đây là chỗ ngón cái đặt vào để kéo, hụt một chút là trượt tay.
        `touch-action: none` để trình duyệt không cuộn trang khi đang kéo.
      */}
      <button
        type="button"
        aria-label={`Kéo để thay đổi kích thước bảng — đang ở nấc ${SNAP_LABEL[snap]}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={() => {
          // Chuột/cảm ứng đã xử lý xong ở `pointerup`. Chỉ bàn phím
          // (Enter/Space) mới thật sự cần nhánh này.
          if (gestureHandledRef.current) {
            gestureHandledRef.current = false;
            return;
          }
          tap();
        }}
        className="flex min-h-12 w-full shrink-0 cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing"
      >
        <span className="block h-[5px] w-12 rounded-full bg-ink-300" />
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(var(--tabbar-h)+16px)]">
        {children}
      </div>
    </div>
  );
}
