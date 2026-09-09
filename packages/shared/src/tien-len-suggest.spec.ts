import { describe, expect, it } from 'vitest';
import { detectCombo, type Combo } from './tien-len';
import { autoPick, listPlays } from './tien-len-suggest';

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

describe('autoPick — chạm một lá thì chọn sẵn cả bộ', () => {
  it('bàn có đôi → chạm một lá 9 lấy luôn đôi 9', () => {
    const hand = set('9♠', '9♥', '3♠', 'K♦');
    expect(show(autoPick(hand, c('9♥'), combo('8♠', '8♣'), null))).toBe('9♠ 9♥');
  });

  it('bàn có sảnh → chạm một lá lấy luôn sảnh đủ dài', () => {
    const hand = set('6♠', '7♥', '8♣', '2♥');
    const picked = autoPick(hand, c('7♥'), combo('3♠', '4♥', '5♣'), null);
    expect(show(picked)).toBe('6♠ 7♥ 8♣');
  });

  it('bàn trống → chỉ chọn đúng lá vừa chạm, không tự ghép bộ', () => {
    const hand = set('9♠', '9♥', '3♠');
    expect(show(autoPick(hand, c('9♥'), null, null))).toBe('9♥');
  });

  it('nước đầu ván → tự kèm lá bắt buộc vào bộ', () => {
    const hand = set('3♠', '3♥', 'K♦');
    // Chạm 3♥ khi buộc phải có 3♠ → lấy luôn đôi 3.
    expect(show(autoPick(hand, c('3♥'), null, c('3♠')))).toBe('3♠ 3♥');
    // Chạm đúng lá bắt buộc thì để họ tự ghép tiếp.
    expect(show(autoPick(hand, c('3♠'), null, c('3♠')))).toBe('3♠');
  });

  it('lá không ghép được bộ nào vẫn được chọn, để màn hình nói rõ lý do', () => {
    const hand = set('3♠', '4♥');
    expect(show(autoPick(hand, c('3♠'), combo('K♦'), null))).toBe('3♠');
  });

  it('lá không nằm trong bài thì không chọn gì', () => {
    expect(autoPick(set('3♠'), c('K♦'), null, null)).toEqual([]);
  });
});
