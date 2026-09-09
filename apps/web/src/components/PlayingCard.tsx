import type { CSSProperties } from 'react';
import { isRedSuit, rankOf, RANK_LABELS, SUIT_LABELS, suitOf } from '@beside/shared';
import { cardHeight } from '@/lib/fan-layout';

/**
 * Một lá bài Tây.
 *
 * Mọi kích thước bên trong đều tính theo `em`, còn `font-size` của lá thì suy ra
 * từ bề rộng — nên chỉ cần đổi đúng một con số `w` là cả lá bài (số, chất, hoa
 * văn giữa) phóng to thu nhỏ cân đối. Không có bảng kích thước rời rạc nào phải
 * giữ đồng bộ với nhau.
 *
 * Tỉ lệ 1 : 1.4 là tỉ lệ bài thật (63 × 88 mm) — xem `cardHeight()`.
 */
export function CardFace({
  card,
  w,
  className = '',
  style,
}: {
  card: number;
  /** Bề rộng lá bài, px. */
  w: number;
  className?: string;
  style?: CSSProperties;
}) {
  const rank = RANK_LABELS[rankOf(card)] ?? '?';
  const suit = SUIT_LABELS[suitOf(card)] ?? '?';

  return (
    <span
      className={`pcard ${isRedSuit(card) ? 'pcard-red' : 'pcard-black'} ${className}`}
      style={{ width: w, height: cardHeight(w), fontSize: w * 0.3, ...style }}
    >
      <span className="pcard-corner pcard-tl">
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
      <span className="pcard-pip" aria-hidden>
        {suit}
      </span>
      <span className="pcard-corner pcard-br" aria-hidden>
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
    </span>
  );
}

/**
 * Lá úp. Dùng cho bài của đối phương — và nó **thật sự** là úp: số lá là tất cả
 * những gì server gửi về, mặt bài không bao giờ rời khỏi server.
 */
export function CardBack({
  w,
  className = '',
  style,
}: {
  w: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`pcard pcard-back ${className}`}
      style={{ width: w, height: cardHeight(w), ...style }}
      aria-hidden
    />
  );
}
