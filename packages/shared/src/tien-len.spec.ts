import { describe, expect, it } from 'vitest';
import {
  beats,
  cardLabel,
  checkPass,
  checkPlay,
  detectCombo,
  isRedSuit,
  lowestCard,
  rankOf,
  sortCards,
  suitOf,
  type Combo,
} from './tien-len';

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

/** Nhận diện bộ, ném lỗi nếu không hợp lệ — dùng khi test đã biết chắc bộ đúng. */
function combo(...labels: string[]): Combo {
  const found = detectCombo(set(...labels));
  if (!found) throw new Error(`Không nhận ra bộ: ${labels.join(' ')}`);
  return found;
}

describe('mã hoá lá bài', () => {
  it('3♠ là lá nhỏ nhất, 2♥ là lá lớn nhất', () => {
    expect(c('3♠')).toBe(0);
    expect(c('2♥')).toBe(51);
  });

  it('so hai lá chỉ là so số', () => {
    // Cùng rank thì chất quyết định: bích < chuồn < rô < cơ.
    expect(c('7♥')).toBeGreaterThan(c('7♦'));
    expect(c('7♦')).toBeGreaterThan(c('7♣'));
    expect(c('7♣')).toBeGreaterThan(c('7♠'));
    // Rank luôn thắng chất: 8 bích vẫn lớn hơn 7 cơ.
    expect(c('8♠')).toBeGreaterThan(c('7♥'));
    // Heo lớn hơn A.
    expect(c('2♠')).toBeGreaterThan(c('A♥'));
  });

  it('rankOf / suitOf tách đúng', () => {
    expect(rankOf(c('K♦'))).toBe(10);
    expect(suitOf(c('K♦'))).toBe(2);
  });

  it('cardLabel dựng lại đúng nhãn', () => {
    expect(cardLabel(c('10♣'))).toBe('10♣');
    expect(cardLabel(c('2♥'))).toBe('2♥');
  });

  it('rô và cơ là chất đỏ', () => {
    expect(isRedSuit(c('5♦'))).toBe(true);
    expect(isRedSuit(c('5♥'))).toBe(true);
    expect(isRedSuit(c('5♠'))).toBe(false);
    expect(isRedSuit(c('5♣'))).toBe(false);
  });

  it('sortCards xếp tăng dần và không sửa mảng gốc', () => {
    const input = set('K♦', '3♠', '2♥');
    const out = sortCards(input);
    expect(out).toEqual(set('3♠', 'K♦', '2♥'));
    expect(input[0]).toBe(c('K♦'));
  });
});

describe('detectCombo', () => {
  it('rác', () => {
    expect(detectCombo(set('7♦'))?.type).toBe('SINGLE');
  });

  it('đôi · sám · tứ quý', () => {
    expect(combo('7♠', '7♥').type).toBe('PAIR');
    expect(combo('7♠', '7♣', '7♥').type).toBe('TRIPLE');
    expect(combo('7♠', '7♣', '7♦', '7♥').type).toBe('QUAD');
  });

  it('hai lá khác rank không phải đôi', () => {
    expect(detectCombo(set('7♠', '8♥'))).toBeNull();
  });

  it('sảnh 3 lá, lẫn chất được', () => {
    const s = combo('3♠', '4♥', '5♣');
    expect(s.type).toBe('STRAIGHT');
    expect(s.len).toBe(3);
  });

  it('sảnh dài', () => {
    expect(combo('5♠', '6♠', '7♦', '8♣', '9♥').len).toBe(5);
  });

  it('sảnh CÓ HEO bị từ chối', () => {
    expect(detectCombo(set('K♠', 'A♦', '2♣'))).toBeNull();
  });

  it('sảnh đứt quãng bị từ chối', () => {
    expect(detectCombo(set('3♠', '4♥', '6♣'))).toBeNull();
  });

  it('sảnh 2 lá không tồn tại', () => {
    expect(detectCombo(set('3♠', '4♥'))).toBeNull();
  });

  it('3 đôi thông', () => {
    const r = combo('5♠', '5♥', '6♣', '6♦', '7♠', '7♣');
    expect(r.type).toBe('PAIR_RUN');
    expect(r.len).toBe(3);
  });

  it('4 đôi thông', () => {
    expect(combo('5♠', '5♥', '6♣', '6♦', '7♠', '7♣', '8♦', '8♥').len).toBe(4);
  });

  it('đôi thông CÓ HEO bị từ chối', () => {
    expect(detectCombo(set('K♠', 'K♥', 'A♣', 'A♦', '2♠', '2♣'))).toBeNull();
  });

  it('đôi thông đứt quãng bị từ chối', () => {
    expect(detectCombo(set('5♠', '5♥', '6♣', '6♦', '8♠', '8♣'))).toBeNull();
  });

  it('2 đôi thông chưa đủ, 5 đôi thông vượt trần', () => {
    expect(detectCombo(set('5♠', '5♥', '6♣', '6♦'))).toBeNull();
    expect(
      detectCombo(set('4♠', '4♥', '5♠', '5♥', '6♣', '6♦', '7♠', '7♣', '8♦', '8♥')),
    ).toBeNull();
  });

  it('mớ bài lẫn lộn không thành bộ nào', () => {
    expect(detectCombo(set('3♠', '7♥', 'K♣'))).toBeNull();
  });

  it('đánh trùng lá bị từ chối', () => {
    expect(detectCombo([c('7♠'), c('7♠')])).toBeNull();
  });

  it('mảng rỗng và lá ngoài dải bị từ chối', () => {
    expect(detectCombo([])).toBeNull();
    expect(detectCombo([52])).toBeNull();
    expect(detectCombo([-1])).toBeNull();
  });

  it('lá cao nhất luôn là max, kể cả với sảnh và đôi thông', () => {
    expect(combo('3♠', '4♥', '5♣').high).toBe(c('5♣'));
    expect(combo('5♠', '5♥', '6♣', '6♦', '7♠', '7♣').high).toBe(c('7♣'));
  });
});

describe('beats — so bộ cùng loại', () => {
  it('rác lớn hơn thì chặn được', () => {
    expect(beats(combo('7♥'), combo('7♦'))).toBe(true);
    expect(beats(combo('7♦'), combo('7♥'))).toBe(false);
  });

  it('đôi so bằng lá cao nhất', () => {
    expect(beats(combo('8♠', '8♣'), combo('7♦', '7♥'))).toBe(true);
    // Cùng rank thì chất của lá cao quyết định.
    expect(beats(combo('7♦', '7♥'), combo('7♠', '7♣'))).toBe(true);
  });

  it('sám so bằng rank', () => {
    expect(beats(combo('9♠', '9♣', '9♦'), combo('8♠', '8♣', '8♥'))).toBe(true);
  });

  it('sảnh phải CÙNG ĐỘ DÀI mới so được', () => {
    const s3 = combo('3♠', '4♥', '5♣');
    const s3b = combo('6♠', '7♥', '8♣');
    const s4 = combo('5♠', '6♠', '7♦', '8♣');
    expect(beats(s3b, s3)).toBe(true);
    // Sảnh 4 lá KHÔNG chặn được sảnh 3 lá dù to hơn hẳn.
    expect(beats(s4, s3)).toBe(false);
  });

  it('đôi thông cùng số đôi thì so lá cao nhất', () => {
    const a = combo('5♠', '5♥', '6♣', '6♦', '7♠', '7♣');
    const b = combo('8♠', '8♥', '9♣', '9♦', '10♠', '10♣');
    expect(beats(b, a)).toBe(true);
    expect(beats(a, b)).toBe(false);
  });

  it('rác không chặn được đôi', () => {
    expect(beats(combo('2♥'), combo('3♠', '3♣'))).toBe(false);
  });
});

describe('beats — chặt heo', () => {
  const heoLe = combo('2♥');
  const doiHeo = combo('2♦', '2♥');
  const tuQuy = combo('5♠', '5♣', '5♦', '5♥');
  const thong3 = combo('5♠', '5♥', '6♣', '6♦', '7♠', '7♣');
  const thong4 = combo('5♠', '5♥', '6♣', '6♦', '7♠', '7♣', '8♦', '8♥');

  it('3 đôi thông chặt heo lẻ', () => {
    expect(beats(thong3, heoLe)).toBe(true);
  });

  it('3 đôi thông KHÔNG chặt được đôi heo', () => {
    expect(beats(thong3, doiHeo)).toBe(false);
  });

  it('3 đôi thông không chặt được tứ quý', () => {
    expect(beats(thong3, tuQuy)).toBe(false);
  });

  it('tứ quý chặt heo lẻ và đôi heo', () => {
    expect(beats(tuQuy, heoLe)).toBe(true);
    expect(beats(tuQuy, doiHeo)).toBe(true);
  });

  it('tứ quý chặt 3 đôi thông', () => {
    expect(beats(tuQuy, thong3)).toBe(true);
  });

  it('tứ quý KHÔNG chặt được 4 đôi thông', () => {
    expect(beats(tuQuy, thong4)).toBe(false);
  });

  it('4 đôi thông chặt được tất cả các hàng dưới', () => {
    expect(beats(thong4, heoLe)).toBe(true);
    expect(beats(thong4, doiHeo)).toBe(true);
    expect(beats(thong4, thong3)).toBe(true);
    expect(beats(thong4, tuQuy)).toBe(true);
  });

  it('4 đôi thông chặt 3 đôi thông kể cả khi nhỏ hơn về giá trị', () => {
    const thong4Nho = combo('3♠', '3♥', '4♣', '4♦', '5♠', '5♣', '6♦', '6♥');
    const thong3To = combo('9♠', '9♥', '10♣', '10♦', 'J♠', 'J♣');
    expect(beats(thong4Nho, thong3To)).toBe(true);
  });

  it('tứ quý lớn chặt tứ quý nhỏ', () => {
    const tuQuyK = combo('K♠', 'K♣', 'K♦', 'K♥');
    expect(beats(tuQuyK, tuQuy)).toBe(true);
    expect(beats(tuQuy, tuQuyK)).toBe(false);
  });

  it('hàng chặt KHÔNG chặt được lá thường — chỉ heo mới bị chặt', () => {
    expect(beats(tuQuy, combo('A♥'))).toBe(false);
    expect(beats(thong3, combo('A♥'))).toBe(false);
    expect(beats(thong3, combo('A♦', 'A♥'))).toBe(false);
  });
});

describe('checkPlay', () => {
  const hand = set('3♠', '4♥', '5♣', '7♠', '7♣', 'K♦', '2♥');

  it('happy path: đánh một đôi hợp lệ khi bàn trống', () => {
    expect(checkPlay(hand, set('7♠', '7♣'), null, null)).toBeNull();
  });

  it('đánh lá không có trong tay bị chặn', () => {
    const err = checkPlay(hand, set('9♥'), null, null);
    expect(err?.code).toBe('NOT_IN_HAND');
  });

  it('mớ bài không thành bộ bị chặn', () => {
    expect(checkPlay(hand, set('3♠', '7♠'), null, null)?.code).toBe('INVALID_COMBO');
  });

  it('nước đầu ván đầu phải có lá nhỏ nhất', () => {
    const err = checkPlay(hand, set('7♠', '7♣'), null, c('3♠'));
    expect(err?.code).toBe('MUST_INCLUDE_LOWEST');
    expect(err?.message).toContain('3♠');
    // Có kèm 3♠ thì được.
    expect(checkPlay(hand, set('3♠', '4♥', '5♣'), null, c('3♠'))).toBeNull();
  });

  it('bộ không chặn được bàn thì bị từ chối, kèm lý do đọc được', () => {
    const table = combo('9♦', '9♥');
    const err = checkPlay(hand, set('7♠', '7♣'), table, null);
    expect(err?.code).toBe('CANNOT_BEAT');
    expect(err?.message).toContain('đôi');
  });

  it('chặt heo bằng tứ quý được chấp nhận', () => {
    const bigHand = set('5♠', '5♣', '5♦', '5♥', '9♠');
    expect(checkPlay(bigHand, set('5♠', '5♣', '5♦', '5♥'), combo('2♥'), null)).toBeNull();
  });

  it('mảng rỗng bị chặn', () => {
    expect(checkPlay(hand, [], null, null)?.code).toBe('NOT_IN_HAND');
  });
});

describe('checkPass', () => {
  it('bàn có bài thì bỏ lượt được', () => {
    expect(checkPass(combo('9♥'))).toBeNull();
  });

  it('bàn trống thì KHÔNG được bỏ lượt — ván sẽ đứng im mãi', () => {
    expect(checkPass(null)?.code).toBe('CANNOT_PASS');
  });
});

describe('lowestCard', () => {
  it('trả về lá nhỏ nhất', () => {
    expect(lowestCard(set('K♦', '3♠', '2♥'))).toBe(c('3♠'));
  });

  it('tay rỗng trả null', () => {
    expect(lowestCard([])).toBeNull();
  });
});
