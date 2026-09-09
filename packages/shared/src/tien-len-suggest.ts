import {
  checkPlay,
  detectCombo,
  PAIR_RUN_MAX,
  PAIR_RUN_MIN,
  RANK_TWO,
  rankOf,
  sortCards,
  STRAIGHT_MIN,
  type Combo,
} from './tien-len';

/**
 * Gợi ý nước đi cho Tiến lên — **hàm thuần**, cùng nhà với `tien-len.ts`.
 *
 * File này KHÔNG chứa luật: nó dựng các bộ ứng viên từ bài trên tay rồi hỏi
 * `checkPlay()` xem bộ nào đi được. Luật vẫn chỉ có một bản.
 *
 * Ba việc trên màn chơi đều dựa vào đây:
 *   - chạm một lá → tự chọn nốt bộ hợp lệ chứa lá đó (`autoPick`);
 *   - nút "Gợi ý" → duyệt lần lượt mọi nước đi được (`listPlays`);
 *   - `listPlays(...).length === 0` → bí thật, nói thẳng "đành bỏ lượt".
 */

// ---------------------------------------------------------------------------
// Dựng bộ ứng viên
// ---------------------------------------------------------------------------

/** Bậc → các lá cùng bậc đang cầm, đã xếp tăng dần. */
function groupByRank(hand: number[]): Map<number, number[]> {
  const byRank = new Map<number, number[]>();
  for (const card of sortCards(hand)) {
    const r = rankOf(card);
    const group = byRank.get(r);
    if (group) group.push(card);
    else byRank.set(r, [card]);
  }
  return byRank;
}

/**
 * Mọi bộ **đáng cân nhắc** dựng được từ bài trên tay.
 *
 * Không liệt kê hết tổ hợp của 13 lá (8191 tập con) mà chỉ lấy bản **rẻ nhất**
 * của mỗi hình dạng: các lá thấp còn dư thì giữ lại, chỉ thay đúng lá cao nhất.
 * Vì mọi bộ so nhau bằng `high` = lá lớn nhất, cách này vẫn phủ đủ mọi mức mạnh
 * mà một tay bài với tới được — nhưng số ứng viên chỉ còn khoảng vài chục.
 */
function candidates(hand: number[]): number[][] {
  const byRank = groupByRank(hand);
  const out: number[][] = [];

  for (const card of sortCards(hand)) out.push([card]);

  // Đôi · sám · tứ quý. Giữ các lá thấp, đổi lá trên cùng để phủ mọi mức `high`.
  for (const group of byRank.values()) {
    for (let n = 2; n <= group.length; n++) {
      const base = group.slice(0, n - 1);
      for (let i = n - 1; i < group.length; i++) {
        out.push([...base, group[i] as number]);
      }
    }
  }

  // Sảnh: heo không được vào sảnh nên dải bậc dừng ở RANK_TWO.
  for (let len = STRAIGHT_MIN; len <= RANK_TWO; len++) {
    for (let start = 0; start + len <= RANK_TWO; start++) {
      const groups = rangeGroups(byRank, start, len, 1);
      if (!groups) continue;
      const base = groups.slice(0, len - 1).map((g) => g[0] as number);
      for (const top of groups[len - 1] as number[]) out.push([...base, top]);
    }
  }

  // Đôi thông.
  for (let n = PAIR_RUN_MIN; n <= PAIR_RUN_MAX; n++) {
    for (let start = 0; start + n <= RANK_TWO; start++) {
      const groups = rangeGroups(byRank, start, n, 2);
      if (!groups) continue;
      const base = groups.slice(0, n - 1).flatMap((g) => [g[0] as number, g[1] as number]);
      const top = groups[n - 1] as number[];
      for (let i = 1; i < top.length; i++) {
        out.push([...base, top[0] as number, top[i] as number]);
      }
    }
  }

  return out;
}

/** Các bậc `start..start+len-1` phải có đủ `need` lá mỗi bậc, nếu không → `null`. */
function rangeGroups(
  byRank: Map<number, number[]>,
  start: number,
  len: number,
  need: number,
): number[][] | null {
  const groups: number[][] = [];
  for (let i = 0; i < len; i++) {
    const group = byRank.get(start + i);
    if (!group || group.length < need) return null;
    groups.push(group);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Liệt kê nước đi
// ---------------------------------------------------------------------------

/**
 * Mọi bộ đánh được ngay lúc này, xếp theo thứ tự **nên đánh trước**.
 *
 * @param hand        bài trên tay
 * @param table       bộ đang nằm trên bàn; `null` = được ra bài tự do
 * @param mustInclude lá bắt buộc phải có (nước đầu ván), hoặc `null`
 */
export function listPlays(
  hand: number[],
  table: Combo | null,
  mustInclude: number | null,
): number[][] {
  const found: { cards: number[]; combo: Combo }[] = [];
  const seen = new Set<string>();

  for (const cards of candidates(hand)) {
    const key = cards.join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    if (checkPlay(hand, cards, table, mustInclude) !== null) continue;
    const combo = detectCombo(cards);
    if (combo) found.push({ cards, combo });
  }

  /*
   * Thứ tự: hàng chặt xuống cuối (không ai phá tứ quý để ăn một con rác), rồi
   * tới bộ nhỏ nhất, rồi tới bộ dài hơn — đi được nhiều lá thì đi.
   */
  found.sort(
    (a, b) =>
      bombCost(a.combo, table) - bombCost(b.combo, table) ||
      a.combo.high - b.combo.high ||
      b.cards.length - a.cards.length,
  );

  return found.map((f) => f.cards);
}

/** Bộ này có phải hàng chặt không — chỉ có nghĩa khi trên bàn đã có bài. */
function bombCost(combo: Combo, table: Combo | null): number {
  return table !== null && combo.type !== table.type ? 1 : 0;
}

/**
 * Người chơi vừa chạm một lá — nên chọn sẵn những lá nào?
 *
 * Đang phải chặn: tự nhặt nốt bộ rẻ nhất chứa lá đó (chạm một lá 9 khi bàn có
 * đôi 8 thì lấy luôn đôi 9). Đang được ra bài tự do: chỉ chọn đúng lá vừa chạm
 * — lúc đó chỉ người chơi mới biết họ định ghép bộ gì.
 *
 * Không dựng được bộ nào thì vẫn trả về chính lá đó, để màn hình nói cho họ
 * biết vì sao lá này đi không được thay vì im lặng không phản hồi.
 */
export function autoPick(
  hand: number[],
  card: number,
  table: Combo | null,
  mustInclude: number | null,
): number[] {
  if (!hand.includes(card)) return [];

  if (table === null) {
    if (mustInclude === null || card === mustInclude) return [card];
    // Nước đầu ván: lá bắt buộc phải đi kèm, nên gợi ý bộ rẻ nhất chứa cả hai.
    const both = listPlays(hand, table, mustInclude).find((p) => p.includes(card));
    return both ?? [card];
  }

  const play = listPlays(hand, table, mustInclude).find((p) => p.includes(card));
  return play ?? [card];
}
