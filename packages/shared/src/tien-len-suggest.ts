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
 *
 *   - **Chưa chọn lá nào, đang phải chặn** → `suggestHighlight()` tô sáng những
 *     lá chặn được, và tách RIÊNG những lá đang nằm trong hàng chặt (tứ quý, đôi
 *     thông) để người chơi biết đừng phá chúng ra chỉ vì một con rác.
 *   - **Vừa chạm một lá** → `companions()` tô sáng những lá còn ghép tiếp được
 *     với nó (đôi · sám · tứ quý · sảnh · đôi thông).
 *   - **Nút "Gợi ý"** → `listPlays()` duyệt lần lượt mọi nước đi được;
 *     `listPlays(...).length === 0` là bí thật, nói thẳng "đành bỏ lượt".
 */

// ---------------------------------------------------------------------------
// Gom bài theo bậc
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

// ---------------------------------------------------------------------------
// Dựng bộ ứng viên
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hàng chặt cần để dành
// ---------------------------------------------------------------------------

/**
 * Những lá đang **nằm trong một hàng chặt** trên tay: tứ quý, hoặc một dải từ 3
 * đôi thông trở lên.
 *
 * Đây là thứ khiến gợi ý khác hẳn "liệt kê mọi nước đi được": phá tứ quý ra để
 * chặn một con rác là mất luôn quân mạnh nhất ván. Màn chơi tô những lá này
 * bằng màu riêng — vẫn bấm được, nhưng người chơi biết mình đang phá đồ quý.
 *
 * Cố tình KHÔNG chia dải dài thành từng hàng chặt riêng: chỗ gọi chỉ cần biết
 * "lá này có thuộc hàng chặt nào không", còn chia hàng ra sao là việc của người
 * chơi lúc bấm.
 */
export function bombCards(hand: number[]): number[] {
  const byRank = groupByRank(hand);
  const out = new Set<number>();

  // Tứ quý — ở bậc nào cũng là hàng chặt, kể cả tứ quý 3.
  for (const group of byRank.values()) {
    if (group.length >= 4) for (const card of group) out.add(card);
  }

  /*
   * Đôi thông: quét các dải bậc liền nhau đủ đôi. Vòng lặp chạy TỚI `RANK_TWO`
   * (heo) chứ không dừng trước nó, để dải đang mở còn được chốt sổ ở nhịp cuối
   * — heo không vào đôi thông nên nhịp ấy luôn là nhịp ngắt.
   */
  let run: number[] = [];
  for (let r = 0; r <= RANK_TWO; r++) {
    const group = r < RANK_TWO ? (byRank.get(r) ?? []) : [];
    if (group.length >= 2) {
      run.push(r);
      continue;
    }
    if (run.length >= PAIR_RUN_MIN) {
      for (const rr of run) {
        const g = byRank.get(rr) as number[];
        out.add(g[0] as number);
        out.add(g[1] as number);
      }
    }
    run = [];
  }

  return sortCards([...out]);
}

export interface Highlight {
  /** Lá nên bấm — chặn được mà không phải phá hàng chặt. */
  playable: number[];
  /** Lá chặn được nhưng đang nằm trong hàng chặt: bấm thì phá đồ quý. */
  reserved: number[];
}

/**
 * Tô sáng bài trên tay khi **chưa chọn lá nào**.
 *
 * Chỉ những lá góp mặt trong một nước đi được mới sáng. Nếu đi được mà không
 * phải đụng tới hàng chặt thì hàng chặt bị tách sang `reserved`; chỉ khi **không
 * còn cách nào khác** hàng chặt mới được mời bấm — đúng lúc đó nó mới đáng phá.
 */
export function suggestHighlight(
  hand: number[],
  table: Combo | null,
  mustInclude: number | null,
): Highlight {
  const plays = listPlays(hand, table, mustInclude);
  if (plays.length === 0) return { playable: [], reserved: [] };

  const locked = new Set(bombCards(hand));
  const soft = plays.filter((play) => !play.some((card) => locked.has(card)));
  const chosen = soft.length > 0 ? soft : plays;

  const playable = new Set<number>();
  for (const play of chosen) for (const card of play) playable.add(card);

  const reserved = new Set<number>();
  if (soft.length > 0) {
    for (const play of plays) {
      for (const card of play) if (locked.has(card) && !playable.has(card)) reserved.add(card);
    }
  }

  return { playable: sortCards([...playable]), reserved: sortCards([...reserved]) };
}

// ---------------------------------------------------------------------------
// Lá ghép tiếp được với bộ đang chọn
// ---------------------------------------------------------------------------

/**
 * Người chơi đã chạm `selected`; **còn lá nào ghép tiếp vào được?**
 *
 * Trả về mọi lá `x` sao cho tồn tại một nước đi **hợp lệ ngay lúc này** chứa cả
 * `selected` lẫn `x`. Chạm 3♠ khi bàn trống thì 3♣3♦3♥ (đôi · sám · tứ quý) và
 * mọi lá 4, 5 (sảnh, đôi thông) sáng lên; chạm thêm 4♥ thì chỉ còn các lá 5.
 *
 * Không dùng `candidates()` được: hàm đó cố tình chỉ giữ bản RẺ NHẤT của mỗi
 * hình dạng (luôn lấy lá thấp làm nền), nên nó không biết `3♣3♦` cũng là một
 * đôi. Ở đây phải phủ đủ mọi cách ghép, nên dựng bộ theo từng hình dạng.
 */
export function companions(
  hand: number[],
  selected: number[],
  table: Combo | null,
  mustInclude: number | null,
): number[] {
  const owned = new Set(hand);
  const sel = sortCards(selected.filter((card) => owned.has(card)));
  if (sel.length === 0 || new Set(sel).size !== sel.length) return [];

  const picked = new Set(sel);
  const out = new Set<number>();

  for (const cards of shapesAround(hand, sel, mustInclude)) {
    if (checkPlay(hand, cards, table, mustInclude) !== null) continue;
    for (const card of cards) if (!picked.has(card)) out.add(card);
  }

  return sortCards([...out]);
}

/**
 * Mọi bộ dựng được từ `hand` mà chứa trọn `sel`.
 *
 * Không nổ tổ hợp, vì với sảnh và đôi thông **chỉ lá ở bậc CAO NHẤT mới quyết
 * định bộ mạnh hay yếu** (`Combo.high` = lá lớn nhất). Nên với mỗi dải bậc chỉ
 * cần: (a) duyệt hết các cách chọn ở bậc cao nhất, và (b) rọi lần lượt vào từng
 * lá ở các bậc còn lại trong khi bậc cao nhất giữ bản mạnh nhất. Bấy nhiêu đã đủ
 * để không bỏ sót lá nào đáng sáng, mà số bộ dựng ra chỉ còn vài trăm.
 */
function shapesAround(hand: number[], sel: number[], prefer: number | null): number[][] {
  const byRank = groupByRank(hand);
  const selByRank = groupByRank(sel);
  const out: number[][] = [];

  sameRankShapes(byRank, selByRank, out);
  runShapes(byRank, selByRank, 1, STRAIGHT_MIN, RANK_TWO, prefer, out);
  runShapes(byRank, selByRank, 2, PAIR_RUN_MIN, PAIR_RUN_MAX, prefer, out);

  return out;
}

/** Đôi · sám · tứ quý — cùng một bậc nên duyệt thẳng mọi tập con, nhiều nhất 8 bộ. */
function sameRankShapes(
  byRank: Map<number, number[]>,
  selByRank: Map<number, number[]>,
  out: number[][],
): void {
  if (selByRank.size !== 1) return;
  const [rank, must] = [...selByRank.entries()][0] as [number, number[]];
  if (must.length > 4) return;

  const group = byRank.get(rank) ?? [];
  const rest = group.filter((card) => !must.includes(card));

  for (let mask = 1; mask < 1 << rest.length; mask++) {
    const cards = [...must];
    for (let i = 0; i < rest.length; i++) {
      if (mask & (1 << i)) cards.push(rest[i] as number);
    }
    if (cards.length >= 2 && cards.length <= 4) out.push(sortCards(cards));
  }
}

/**
 * Sảnh (`need = 1`) và đôi thông (`need = 2`) — cùng một khuôn: một dải bậc liền
 * nhau, mỗi bậc góp đúng `need` lá.
 */
function runShapes(
  byRank: Map<number, number[]>,
  selByRank: Map<number, number[]>,
  need: number,
  minLen: number,
  maxLen: number,
  prefer: number | null,
  out: number[][],
): void {
  const selRanks = [...selByRank.keys()].sort((a, b) => a - b);
  if (selRanks.length === 0) return;
  // Heo không vào sảnh lẫn đôi thông; và một bậc không góp quá `need` lá.
  if ((selRanks[selRanks.length - 1] as number) >= RANK_TWO) return;
  for (const group of selByRank.values()) if (group.length > need) return;

  const lo = selRanks[0] as number;
  const hi = selRanks[selRanks.length - 1] as number;

  for (let len = Math.max(minLen, hi - lo + 1); len <= maxLen; len++) {
    for (let start = Math.max(0, hi - len + 1); start <= lo && start + len <= RANK_TWO; start++) {
      const ranks = Array.from({ length: len }, (_, i) => start + i);
      if (ranks.some((r) => (byRank.get(r)?.length ?? 0) < need)) continue;

      const topRank = start + len - 1;
      const tops = picksAt(byRank, selByRank, topRank, need);
      const best = tops[tops.length - 1];
      if (!best) continue;

      // (a) Rọi vào từng lá ở các bậc dưới, bậc trên cùng giữ bản mạnh nhất.
      for (const r of ranks) {
        if (r === topRank) continue;
        for (const card of byRank.get(r) as number[]) {
          const combo = assemble(byRank, selByRank, ranks, need, prefer, [
            [r, [card]],
            [topRank, best],
          ]);
          if (combo) out.push(combo);
        }
      }

      // (b) Chính các cách chọn ở bậc trên cùng — đây là chỗ quyết định `high`.
      for (const top of tops) {
        const combo = assemble(byRank, selByRank, ranks, need, prefer, [[topRank, top]]);
        if (combo) out.push(combo);
      }
    }
  }
}

/**
 * Các cách chọn đúng `need` lá ở một bậc, luôn giữ lá đã chọn sẵn.
 * Xếp tăng dần theo lá lớn nhất, nên phần tử cuối là bản mạnh nhất.
 */
function picksAt(
  byRank: Map<number, number[]>,
  selByRank: Map<number, number[]>,
  rank: number,
  need: number,
): number[][] {
  const group = byRank.get(rank) ?? [];
  const must = selByRank.get(rank) ?? [];
  if (must.length > need) return [];

  const rest = group.filter((card) => !must.includes(card));
  const picks: number[][] = [];

  const fill = (from: number, taken: number[]): void => {
    if (taken.length === need - must.length) {
      picks.push(sortCards([...must, ...taken]));
      return;
    }
    for (let i = from; i < rest.length; i++) fill(i + 1, [...taken, rest[i] as number]);
  };
  fill(0, []);

  return picks.sort((a, b) => (a[a.length - 1] as number) - (b[b.length - 1] as number));
}

/**
 * Ráp một bộ hoàn chỉnh trên dải `ranks`: bậc nào bị ép thì dùng đúng lá ép, còn
 * lại lấy lá đã chọn sẵn rồi bù bằng lá THẤP NHẤT — giữ lá cao lại trên tay.
 */
function assemble(
  byRank: Map<number, number[]>,
  selByRank: Map<number, number[]>,
  ranks: number[],
  need: number,
  prefer: number | null,
  forced: [number, number[]][],
): number[] | null {
  const byForced = new Map(forced);
  const cards: number[] = [];

  for (const r of ranks) {
    const must = [...new Set([...(selByRank.get(r) ?? []), ...(byForced.get(r) ?? [])])];
    if (must.length > need) return null;

    const group = byRank.get(r) ?? [];
    if (must.some((card) => !group.includes(card))) return null;

    /*
     * Lá bắt buộc của nước đầu ván được ưu tiên hơn cả lá thấp nhất: thiếu nó
     * thì cả bộ bị luật loại, mà nó lại đang nằm đúng ở bậc này.
     */
    const rest = group
      .filter((card) => !must.includes(card))
      .sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : a - b));

    const take = [...must, ...rest.slice(0, need - must.length)];
    if (take.length < need) return null;
    cards.push(...take);
  }

  return sortCards(cards);
}
