import { describe, expect, it } from 'vitest';
import { detectCombo, type Combo } from './tien-len';
import { bombCards, companions, listPlays, suggestHighlight } from './tien-len-suggest';

/** Dựng cardId từ nhãn cho dễ đọc: c('3♠') === 0. */
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['♠', '♣', '♦', '♥'];

function c(label: string): number {
  const suit = SUITS.indexOf(label.slice(-1));
  const rank = RANKS.indexOf(label.slice(0, -1));
  if (suit < 0 || rank < 0) throw new Error(`Nhãn lá bài sai: ${label}`);
  return rank * 4 + suit;
}

const set = (...labels: string[]): number[] => labels.map(c);

function combo(...labels: string[]): Combo {
  const found = detectCombo(set(...labels));
  if (!found) throw new Error(`Không nhận ra bộ: ${labels.join(' ')}`);
  return found;
}

/** Đổi một nước đi về nhãn để so cho dễ đọc khi test hỏng. */
const show = (cards: number[]): string =>
  cards.map((x) => `${RANKS[x >> 2]}${SUITS[x & 3]}`).join(' ');

describe('listPlays — có nước nào đi được không', () => {
  it('có lá lớn hơn thì chặn được rác', () => {
    expect(listPlays(set('9♥', '3♠'), combo('8♦'), null)).toHaveLength(1);
    expect(listPlays(set('3♠', '4♥'), combo('8♦'), null)).toHaveLength(0);
  });

  it('cần đôi lớn hơn mới chặn được đôi', () => {
    expect(listPlays(set('9♠', '9♥'), combo('8♠', '8♣'), null)).toHaveLength(1);
    // Chỉ có một lá 9 thì không thành đôi.
    expect(listPlays(set('9♠', '3♥'), combo('8♠', '8♣'), null)).toHaveLength(0);
  });

  it('sảnh phải đúng độ dài', () => {
    expect(listPlays(set('6♠', '7♥', '8♣'), combo('3♠', '4♥', '5♣'), null)).toHaveLength(1);

    /*
     * Bốn lá liên tiếp chứa tới HAI sảnh 3 lá (3-4-5 và 4-5-6) nhưng cả hai đều
     * nhỏ hơn bàn, và sảnh 4 lá thì không so được với sảnh 3 lá.
     */
    const tableCao = combo('9♠', '10♥', 'J♥');
    expect(listPlays(set('3♣', '4♦', '5♥', '6♠'), tableCao, null)).toHaveLength(0);
  });

  it('tứ quý trong tay chặt được heo lẻ', () => {
    const plays = listPlays(set('5♠', '5♣', '5♦', '5♥'), combo('2♥'), null);
    expect(plays).toHaveLength(1);
    expect(plays[0]).toHaveLength(4);
  });

  it('3 đôi thông chặt được heo lẻ nhưng không chặt được đôi heo', () => {
    const hand = set('5♠', '5♥', '6♣', '6♦', '7♠', '7♣');
    expect(listPlays(hand, combo('2♥'), null).length).toBeGreaterThan(0);
    expect(listPlays(hand, combo('2♦', '2♥'), null)).toHaveLength(0);
  });

  it('tứ quý chỉ bị chặn bởi hàng chặt', () => {
    const table = combo('5♠', '5♣', '5♦', '5♥');
    expect(listPlays(set('A♠', 'A♣', 'A♦', 'K♥'), table, null)).toHaveLength(0);
    expect(listPlays(set('A♠', 'A♣', 'A♦', 'A♥'), table, null)).toHaveLength(1);
  });

  it('tay rỗng thì không có nước nào', () => {
    expect(listPlays([], combo('3♠'), null)).toHaveLength(0);
    expect(listPlays([], null, null)).toHaveLength(0);
  });
});

describe('listPlays — thứ tự gợi ý', () => {
  it('gợi ý con nhỏ trước', () => {
    const plays = listPlays(set('3♠', '9♥', 'K♦'), null, null);
    expect(show(plays[0] as number[])).toBe('3♠');
  });

  it('không phí hàng chặt vào con rác — bộ cùng loại đứng trước', () => {
    // Bàn có rác 2♠ (heo). Trong tay có 2♥ chặn thẳng được, và cả tứ quý 5.
    const hand = set('2♥', '5♠', '5♣', '5♦', '5♥');
    const plays = listPlays(hand, combo('2♠'), null);
    expect(show(plays[0] as number[])).toBe('2♥');
    expect((plays[plays.length - 1] as number[]).length).toBe(4);
  });

  it('cùng lá cao nhất thì bộ dài đứng trước — đẩy được nhiều lá thì đẩy', () => {
    // 9♠ nhỏ nhất nên đứng đầu. Đôi 9 và rác 9♥ cùng lá cao nhất là 9♥, lúc đó
    // bộ dài hơn được ưu tiên: đi đôi thì bớt được hai lá.
    expect(listPlays(set('9♠', '9♥'), null, null).map(show)).toEqual([
      '9♠',
      '9♠ 9♥',
      '9♥',
    ]);
  });

  it('nước đầu ván chỉ nhận bộ có chứa lá bắt buộc', () => {
    const hand = set('3♠', '3♥', '9♦');
    const plays = listPlays(hand, null, c('3♠'));
    expect(plays.every((p) => p.includes(c('3♠')))).toBe(true);
    expect(plays.some((p) => show(p) === '9♦')).toBe(false);
  });

  it('với đôi trên bàn thì mọi mức đôi trong tay đều được liệt kê', () => {
    // Ba lá 9: hai đôi khác nhau về lá cao (9♣ và 9♥) đều chặn được đôi 8.
    const hand = set('9♠', '9♣', '9♥');
    const plays = listPlays(hand, combo('8♦', '8♥'), null);
    expect(plays.map(show)).toEqual(['9♠ 9♣', '9♠ 9♥']);
  });
});

describe('bombCards — hàng chặt đang cầm', () => {
  it('tứ quý là hàng chặt, kể cả tứ quý 3', () => {
    expect(show(bombCards(set('3♠', '3♣', '3♦', '3♥', 'K♦')))).toBe('3♠ 3♣ 3♦ 3♥');
  });

  it('ba đôi liền nhau là hàng chặt, hai đôi thì không', () => {
    expect(bombCards(set('5♠', '5♥', '6♣', '6♦', '7♠', '7♣'))).toHaveLength(6);
    expect(bombCards(set('5♠', '5♥', '6♣', '6♦'))).toHaveLength(0);
  });

  it('đôi heo KHÔNG nối vào đôi thông — heo không được vào bộ này', () => {
    // A-2 liền nhau về bậc, nhưng dải phải dừng trước heo.
    expect(bombCards(set('Q♠', 'Q♥', 'K♣', 'K♦', 'A♠', 'A♣', '2♦', '2♥'))).toHaveLength(6);
  });

  it('dải chạm đúng mép trên (Q-K-A) vẫn được chốt sổ', () => {
    expect(show(bombCards(set('Q♠', 'Q♥', 'K♣', 'K♦', 'A♠', 'A♣')))).toBe(
      'Q♠ Q♥ K♣ K♦ A♠ A♣',
    );
  });

  it('tay rỗng thì không có hàng chặt nào', () => {
    expect(bombCards([])).toEqual([]);
  });
});

describe('suggestHighlight — tô sáng khi chưa chọn lá nào', () => {
  it('chỉ sáng những lá thật sự chặn được', () => {
    const hand = set('3♠', '9♠', 'K♦');
    const { playable } = suggestHighlight(hand, combo('8♦'), null);
    expect(show(playable)).toBe('9♠ K♦');
  });

  it('chặn được bằng bài thường thì KHÔNG mời phá tứ quý', () => {
    // Trong tay có 2♥ chặn thẳng heo, và cả tứ quý 5 chặt được.
    const hand = set('2♥', '5♠', '5♣', '5♦', '5♥');
    const { playable, reserved } = suggestHighlight(hand, combo('2♠'), null);
    expect(show(playable)).toBe('2♥');
    expect(show(reserved)).toBe('5♠ 5♣ 5♦ 5♥');
  });

  it('không còn cách nào khác thì hàng chặt mới được mời bấm', () => {
    const hand = set('3♥', '5♠', '5♣', '5♦', '5♥');
    const { playable, reserved } = suggestHighlight(hand, combo('2♠'), null);
    expect(show(playable)).toBe('5♠ 5♣ 5♦ 5♥');
    expect(reserved).toEqual([]);
  });

  it('bí thật thì không sáng lá nào', () => {
    const { playable, reserved } = suggestHighlight(set('3♠', '4♥'), combo('K♦'), null);
    expect(playable).toEqual([]);
    expect(reserved).toEqual([]);
  });
});

describe('companions — chạm một lá thì lá nào còn ghép được', () => {
  it('bàn trống: chạm 3♠ thì sáng cả lá cùng bậc lẫn lá nối sảnh', () => {
    const hand = set('3♠', '3♥', '4♣', '5♦', 'K♦');
    // 3♥ ghép đôi; 4♣ 5♦ nối thành sảnh 3-4-5. K♦ thì không dính gì.
    expect(show(companions(hand, set('3♠'), null, null))).toBe('3♥ 4♣ 5♦');
  });

  it('chọn thêm một lá thì danh sách hẹp lại', () => {
    const hand = set('3♠', '3♥', '4♣', '5♦', '6♠');
    // Đã cầm 3♠4♣ → chỉ còn hướng sảnh, và 3♥ rơi ra ngoài.
    expect(show(companions(hand, set('3♠', '4♣'), null, null))).toBe('5♦ 6♠');
  });

  it('đôi thông: chạm một lá 5 thì sáng nốt các lá dựng được 3 đôi thông', () => {
    const hand = set('5♠', '5♥', '6♣', '6♦', '7♠', '7♣');
    expect(show(companions(hand, set('5♠'), null, null))).toBe('5♥ 6♣ 6♦ 7♠ 7♣');
  });

  it('heo không ghép được sảnh hay đôi thông', () => {
    const hand = set('K♠', 'A♥', '2♠', '2♥');
    // Chạm 2♠: chỉ còn 2♥ (đôi heo), K-A không nối vào heo được.
    expect(show(companions(hand, set('2♠'), null, null))).toBe('2♥');
  });

  it('đang phải chặn: chỉ sáng lá dẫn tới bộ CHẶN ĐƯỢC', () => {
    const hand = set('9♠', '9♣', '9♥', '3♠');
    // Bàn có đôi 8 → chạm 9♠ thì 9♣ 9♥ sáng, còn 3♠ thì không.
    expect(show(companions(hand, set('9♠'), combo('8♦', '8♥'), null))).toBe('9♣ 9♥');
  });

  it('chặn sảnh: chỉ sáng lá dựng được sảnh ĐÚNG ĐỘ DÀI và lớn hơn', () => {
    const hand = set('6♠', '7♥', '8♣', '9♦', '2♥');
    // Bàn có sảnh 3 lá → 6-7-8 và 7-8-9 đều được, nhưng 2♥ thì không.
    expect(show(companions(hand, set('7♥'), combo('3♠', '4♥', '5♣'), null))).toBe('6♠ 8♣ 9♦');
  });

  it('nước đầu ván: lá bắt buộc luôn ghép được vào bộ', () => {
    const hand = set('3♠', '3♥', 'K♦');
    // Chạm 3♥ khi buộc phải có 3♠ → 3♠ sáng lên; K♦ thì không ghép được.
    expect(show(companions(hand, set('3♥'), null, c('3♠')))).toBe('3♠');
  });

  it('lá không ghép được với gì thì không sáng lá nào', () => {
    expect(companions(set('3♠', '9♥', 'K♦'), set('3♠'), null, null)).toEqual([]);
  });

  it('lá không nằm trong bài thì bỏ qua', () => {
    expect(companions(set('3♠'), set(), null, null)).toEqual([]);
    expect(companions(set('3♠'), set('K♦'), null, null)).toEqual([]);
  });
});
