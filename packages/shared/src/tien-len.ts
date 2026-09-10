/**
 * Tiến lên miền Nam — luật cơ bản + chặt heo (F10).
 *
 * Toàn bộ file là **hàm thuần**: không đọc đồng hồ, không đụng mạng, không
 * state. Web dùng để tắt/bật nút "Đánh", API dùng đúng những hàm này làm trọng
 * tài — một nguồn sự thật, không viết luật hai lần.
 *
 * Xem `docs/thiet-ke-games.md` §4.1–4.4.
 */

// ---------------------------------------------------------------------------
// Mã hoá lá bài
// ---------------------------------------------------------------------------

/**
 * `cardId = rank * 4 + suit` → 0..51.
 *
 * Nhờ cách đánh số này, **so hai lá chỉ là so `cardId`**: `3♠` = 0 (yếu nhất),
 * `2♥` = 51 (mạnh nhất). Không cần hàm so sánh riêng, và không còn chỗ nào để
 * so sai thứ tự chất.
 */
export const RANK_LABELS = [
  '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2',
] as const;

/** Thứ tự chất miền Nam: bích < chuồn < rô < cơ. */
export const SUIT_LABELS = ['♠', '♣', '♦', '♥'] as const;

/** Rank của con 2 (heo) — con bài duy nhất bị cấm vào sảnh và đôi thông. */
export const RANK_TWO = 12;

export const DECK_SIZE = 52;
/** Mỗi người 13 lá; 26 lá còn lại bỏ ra (chủ dự án chốt 09/09). */
export const HAND_SIZE = 13;

export function rankOf(card: number): number {
  return card >> 2;
}

export function suitOf(card: number): number {
  return card & 3;
}

export function cardLabel(card: number): string {
  return `${RANK_LABELS[rankOf(card)] ?? '?'}${SUIT_LABELS[suitOf(card)] ?? '?'}`;
}

/** Chất đỏ (rô, cơ) — chỉ dùng để tô màu, không ảnh hưởng luật. */
export function isRedSuit(card: number): boolean {
  return suitOf(card) >= 2;
}

export function isValidCard(card: unknown): card is number {
  return Number.isInteger(card) && (card as number) >= 0 && (card as number) < DECK_SIZE;
}

/** Bài trên tay luôn xếp tăng dần — mọi nơi đều dựa vào thứ tự này. */
export function sortCards(cards: number[]): number[] {
  return [...cards].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Nhận diện bộ
// ---------------------------------------------------------------------------

export type ComboType = 'SINGLE' | 'PAIR' | 'TRIPLE' | 'QUAD' | 'STRAIGHT' | 'PAIR_RUN';

export const COMBO_LABELS: Record<ComboType, string> = {
  SINGLE: 'rác',
  PAIR: 'đôi',
  TRIPLE: 'sám',
  QUAD: 'tứ quý',
  STRAIGHT: 'sảnh',
  PAIR_RUN: 'đôi thông',
};

export interface Combo {
  type: ComboType;
  /** Đã sắp tăng dần. */
  cards: number[];
  /**
   * Lá cao nhất của bộ — dùng để so hai bộ cùng loại.
   *
   * Với MỌI loại bộ, lá cao nhất chính là `max(cards)`: sảnh thì đó là rank cao
   * nhất, đôi thông thì đó là lá lớn của đôi cao nhất. Nên không cần mỗi loại
   * một cách tính riêng.
   */
  high: number;
  /** Sảnh: số lá. Đôi thông: số ĐÔI. Bộ khác: số lá. */
  len: number;
}

/** Số đôi tối thiểu / tối đa của một bộ đôi thông. */
export const PAIR_RUN_MIN = 3;
export const PAIR_RUN_MAX = 4;

/** Sảnh ngắn nhất là 3 lá. */
export const STRAIGHT_MIN = 3;

/**
 * Nhận diện bộ. `null` nghĩa là mớ bài này không tạo thành bộ hợp lệ nào.
 *
 * Cố tình trả `null` thay vì ném lỗi: nơi gọi ở web dùng hàm này sau MỖI lần
 * chạm lá bài để quyết định bật hay tắt nút "Đánh", nên "chưa hợp lệ" là trạng
 * thái bình thường chứ không phải sự cố.
 */
export function detectCombo(input: number[]): Combo | null {
  if (input.length === 0) return null;
  if (!input.every(isValidCard)) return null;

  const cards = sortCards(input);
  // Đánh cùng một lá hai lần là dấu hiệu client hỏng hoặc ai đó đang thử gian.
  if (new Set(cards).size !== cards.length) return null;

  const high = cards[cards.length - 1] as number;
  const ranks = cards.map(rankOf);
  const sameRank = ranks.every((r) => r === ranks[0]);

  if (cards.length === 1) return { type: 'SINGLE', cards, high, len: 1 };
  if (cards.length === 2 && sameRank) return { type: 'PAIR', cards, high, len: 2 };
  if (cards.length === 3 && sameRank) return { type: 'TRIPLE', cards, high, len: 3 };
  if (cards.length === 4 && sameRank) return { type: 'QUAD', cards, high, len: 4 };

  const straight = detectStraight(cards, ranks, high);
  if (straight) return straight;

  return detectPairRun(cards, ranks, high);
}

function detectStraight(cards: number[], ranks: number[], high: number): Combo | null {
  if (cards.length < STRAIGHT_MIN) return null;
  // Heo không được vào sảnh — đây là luật, không phải giới hạn kỹ thuật.
  if (ranks.some((r) => r === RANK_TWO)) return null;

  for (let i = 1; i < ranks.length; i++) {
    if ((ranks[i] as number) !== (ranks[i - 1] as number) + 1) return null;
  }
  return { type: 'STRAIGHT', cards, high, len: cards.length };
}

function detectPairRun(cards: number[], ranks: number[], high: number): Combo | null {
  if (cards.length % 2 !== 0) return null;
  const pairs = cards.length / 2;
  if (pairs < PAIR_RUN_MIN || pairs > PAIR_RUN_MAX) return null;
  if (ranks.some((r) => r === RANK_TWO)) return null;

  // Mỗi rank phải có ĐÚNG hai lá, và các rank phải liền nhau.
  for (let i = 0; i < cards.length; i += 2) {
    if ((ranks[i] as number) !== (ranks[i + 1] as number)) return null;
    if (i > 0 && (ranks[i] as number) !== (ranks[i - 1] as number) + 1) return null;
  }
  return { type: 'PAIR_RUN', cards, high, len: pairs };
}

// ---------------------------------------------------------------------------
// So bộ
// ---------------------------------------------------------------------------

/** Bộ `c` có chặn được bộ `t` đang nằm trên bàn không. */
export function beats(c: Combo, t: Combo): boolean {
  if (c.type === t.type) {
    // Sảnh chỉ so được với sảnh CÙNG ĐỘ DÀI — 5 lá không chặn được 3 lá.
    if (c.type === 'STRAIGHT') return c.len === t.len && c.high > t.high;

    if (c.type === 'PAIR_RUN') {
      if (c.len === t.len) return c.high > t.high;
      // Ngoại lệ duy nhất: 4 đôi thông là hàng chặt của 3 đôi thông, bất kể
      // lớn nhỏ — nên nó không đi theo luật "cùng độ dài".
      return c.len >= 4 && t.len === PAIR_RUN_MIN;
    }
    return c.high > t.high;
  }
  return canBomb(c, t);
}

/**
 * Các nước chặt (chém heo). Bảng đầy đủ ở `docs/thiet-ke-games.md` §4.3:
 *
 *   3 đôi thông → heo lẻ
 *   tứ quý      → heo lẻ · đôi heo · 3 đôi thông
 *   4 đôi thông → heo lẻ · đôi heo · 3 đôi thông · tứ quý
 */
function canBomb(c: Combo, t: Combo): boolean {
  const singleTwo = t.type === 'SINGLE' && rankOf(t.high) === RANK_TWO;
  const pairTwo = t.type === 'PAIR' && rankOf(t.high) === RANK_TWO;
  const pairRun3 = t.type === 'PAIR_RUN' && t.len === PAIR_RUN_MIN;

  if (c.type === 'PAIR_RUN' && c.len === PAIR_RUN_MIN) return singleTwo;
  if (c.type === 'QUAD') return singleTwo || pairTwo || pairRun3;
  if (c.type === 'PAIR_RUN' && c.len >= 4) {
    return singleTwo || pairTwo || pairRun3 || t.type === 'QUAD';
  }
  return false;
}

// ---------------------------------------------------------------------------
// Kiểm tra nước đi
// ---------------------------------------------------------------------------

export interface MoveError {
  code:
    | 'NOT_IN_HAND'
    | 'INVALID_COMBO'
    | 'MUST_INCLUDE_LOWEST'
    | 'CANNOT_BEAT'
    | 'CANNOT_PASS';
  message: string;
}

/**
 * Nước đánh bài có hợp lệ không. `null` = hợp lệ.
 *
 * @param hand      bài trên tay người đi
 * @param cards     các lá họ chọn
 * @param table     bộ đang nằm trên bàn; `null` = được ra bài tự do
 * @param mustInclude lá bắt buộc phải có trong bộ (nước đầu ván đầu), hoặc `null`
 */
export function checkPlay(
  hand: number[],
  cards: number[],
  table: Combo | null,
  mustInclude: number | null,
): MoveError | null {
  const owned = new Set(hand);
  if (cards.length === 0 || !cards.every((c) => owned.has(c))) {
    return { code: 'NOT_IN_HAND', message: 'Có lá không nằm trong bài của bạn' };
  }

  const combo = detectCombo(cards);
  if (!combo) {
    return { code: 'INVALID_COMBO', message: 'Mấy lá này không tạo thành bộ hợp lệ' };
  }

  if (mustInclude !== null && !cards.includes(mustInclude)) {
    return {
      code: 'MUST_INCLUDE_LOWEST',
      message: `Nước đầu tiên phải có ${cardLabel(mustInclude)}`,
    };
  }

  if (table && !beats(combo, table)) {
    return {
      code: 'CANNOT_BEAT',
      message: `${COMBO_LABELS[combo.type]} này không chặn được ${COMBO_LABELS[table.type]} trên bàn`,
    };
  }

  return null;
}

/**
 * Được bỏ lượt không.
 *
 * Bàn trống nghĩa là mình đang giữ quyền ra bài — bỏ lượt lúc đó thì ván đứng
 * im mãi mãi, nên phải cấm.
 */
export function checkPass(table: Combo | null): MoveError | null {
  if (!table) {
    return { code: 'CANNOT_PASS', message: 'Bạn đang được ra bài, không bỏ lượt được' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hỗ trợ
// ---------------------------------------------------------------------------

/** Lá nhỏ nhất trong tay — nước đi tự động khi hết giờ mà đang phải ra bài. */
export function lowestCard(hand: number[]): number | null {
  if (hand.length === 0) return null;
  return hand.reduce((min, c) => (c < min ? c : min), hand[0] as number);
}

// ---------------------------------------------------------------------------
// Tới trắng · thối 3 bích
// ---------------------------------------------------------------------------

/**
 * 3♠ — lá yếu nhất bộ bài, và là lá "thối" của luật miền Nam.
 *
 * `rank 0 * 4 + suit 0 = 0`, nên nó cũng chính là `cardId` nhỏ nhất. Đặt tên
 * hằng thay vì viết số 0 rải rác: đọc `card === THREE_SPADE` thì biết ngay đang
 * nói tới luật thối, còn `card === 0` thì không.
 */
export const THREE_SPADE = 0;

/** Người thua còn ôm 3♠ lúc ván kết thúc — "thối 3 bích". */
export function holdsThreeSpade(hand: number[]): boolean {
  return hand.includes(THREE_SPADE);
}

export type InstantWinKind =
  | 'SANH_RONG'
  | 'TU_QUY_HEO'
  | 'DOI_THONG_6'
  | 'DOI_THONG_5'
  | 'SAU_DOI';

export const INSTANT_WIN_LABELS: Record<InstantWinKind, string> = {
  SANH_RONG: 'Sảnh rồng',
  TU_QUY_HEO: 'Tứ quý heo',
  DOI_THONG_6: 'Sáu đôi thông',
  DOI_THONG_5: 'Năm đôi thông',
  SAU_DOI: 'Sáu đôi',
};

/** Bậc → số lá đang cầm. Dùng chung cho mấy phép đếm dưới đây. */
function rankCounts(hand: number[]): number[] {
  const counts = new Array<number>(RANK_LABELS.length).fill(0);
  for (const card of hand) {
    if (!isValidCard(card)) continue;
    counts[rankOf(card)] = (counts[rankOf(card)] as number) + 1;
  }
  return counts;
}

/**
 * Bài **tới trắng**: chia xong là thắng luôn, không phải đánh lá nào.
 *
 * Thứ tự xét đi từ hiếm nhất xuống — một tay bài có thể thoả nhiều điều kiện
 * cùng lúc (6 đôi thông cũng là 6 đôi), và người chơi muốn nghe tên **oách
 * nhất** chứ không phải tên đầu tiên tìm thấy.
 *
 * Lưu ý riêng của bản 13 lá: mỗi người chỉ được chia 13 trong 52 lá nên các tay
 * này hiếm hơn hẳn bản chia hết bộ — nhưng vẫn dựng được đủ, và luật thì không
 * đổi theo số lá bỏ ra.
 */
export function detectInstantWin(hand: number[]): InstantWinKind | null {
  const counts = rankCounts(hand);

  // Sảnh rồng: đủ mặt 3 → A, mỗi bậc ít nhất một lá. Heo không tính.
  let dragon = true;
  for (let r = 0; r < RANK_TWO; r++) {
    if ((counts[r] as number) === 0) dragon = false;
  }
  if (dragon) return 'SANH_RONG';

  if ((counts[RANK_TWO] as number) === 4) return 'TU_QUY_HEO';

  // Chuỗi đôi thông dài nhất — heo không được vào đôi thông nên dừng ở RANK_TWO.
  let run = 0;
  let longest = 0;
  for (let r = 0; r < RANK_TWO; r++) {
    run = (counts[r] as number) >= 2 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  if (longest >= 6) return 'DOI_THONG_6';
  if (longest === 5) return 'DOI_THONG_5';

  // Sáu đôi rời rạc — không cần thông, nhưng 13 lá thì đây là trần tuyệt đối.
  const pairs = counts.filter((n) => n >= 2).length;
  return pairs >= 6 ? 'SAU_DOI' : null;
}
