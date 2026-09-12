import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Vuốt dọc để chỉnh: nửa TRÁI màn hình đổi một giá trị, nửa PHẢI đổi giá trị kia.
 *
 * Đây là cử chỉ của trình phát video (và của chính app Flip Clock): ngón cái
 * đặt đâu cũng chỉnh được, không phải ngắm trúng một thanh trượt nhỏ. Vẫn phải
 * có thanh trượt thật ở đâu đó — cử chỉ này không kể cho người dùng biết là nó
 * tồn tại, và người dùng trình đọc màn hình thì không vuốt được.
 *
 * Quy ước: vuốt LÊN là tăng. Ngược lại thì trái với mọi thứ người ta đã quen.
 */

export type AdjustSide = 'left' | 'right';

export interface SlideAdjust {
  /** Bên đang được chỉnh, `null` khi không có ngón tay nào trên màn. */
  active: AdjustSide | null;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

export function useSlideAdjust({
  onLeft,
  onRight,
  getLeft,
  getRight,
  enabled = true,
}: {
  /** Nhận giá trị MỚI trong khoảng 0–1. */
  onLeft: (value: number) => void;
  onRight: (value: number) => void;
  /** Đọc giá trị hiện tại lúc bắt đầu vuốt. */
  getLeft: () => number;
  getRight: () => number;
  enabled?: boolean;
}): SlideAdjust {
  const [active, setActive] = useState<AdjustSide | null>(null);
  const startRef = useRef<{ y: number; base: number; side: AdjustSide; span: number } | null>(
    null,
  );
  const movedRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      const box = e.currentTarget.getBoundingClientRect();
      const side: AdjustSide = e.clientX - box.left < box.width / 2 ? 'left' : 'right';
      startRef.current = {
        y: e.clientY,
        base: side === 'left' ? getLeft() : getRight(),
        side,
        /*
         * Vuốt hết 60% chiều cao vùng chạm là đi trọn 0 → 1.
         *
         * Dùng toàn bộ chiều cao thì phải vuốt gần hết màn mới đổi được đáng
         * kể; dùng quãng quá ngắn thì rung tay một chút đã nhảy mấy chục phần
         * trăm. Chặn dưới 200px cho các khung nhìn thấp (khổ ngang).
         */
        span: Math.max(200, box.height * 0.6),
      };
      movedRef.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled, getLeft, getRight],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;

      const dy = start.y - e.clientY; // vuốt lên = số dương
      // Dưới 8px coi như tay run lúc chạm, chưa phải đang vuốt — nếu không thì
      // mọi cú chạm đơn thuần cũng nhích giá trị đi một chút.
      if (!movedRef.current && Math.abs(dy) < 8) return;
      movedRef.current = true;
      setActive(start.side);

      const next = clamp01(start.base + dy / start.span);
      if (start.side === 'left') onLeft(next);
      else onRight(next);
    },
    [onLeft, onRight],
  );

  const finish = useCallback(() => {
    startRef.current = null;
    movedRef.current = false;
    setActive(null);
  }, []);

  // Ngón tay rời khỏi màn giữa chừng vì chuyển app / có cuộc gọi: vẫn phải
  // dọn, nếu không lần chạm sau sẽ tiếp tục từ trạng thái cũ.
  useEffect(() => {
    if (!enabled) finish();
  }, [enabled, finish]);

  return {
    active,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
