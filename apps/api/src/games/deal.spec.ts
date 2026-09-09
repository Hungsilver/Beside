import { describe, expect, it } from 'vitest';
import { DECK_SIZE, HAND_SIZE } from '@beside/shared';
import { dealTienLen } from './deal';

describe('dealTienLen', () => {
  it('chia đúng 13 lá mỗi người', () => {
    const { hands } = dealTienLen();
    expect(hands[0]).toHaveLength(HAND_SIZE);
    expect(hands[1]).toHaveLength(HAND_SIZE);
  });

  it('không có lá nào trùng giữa hai tay', () => {
    const { hands } = dealTienLen();
    const all = [...hands[0], ...hands[1]];
    expect(new Set(all).size).toBe(HAND_SIZE * 2);
  });

  it('mọi lá đều nằm trong dải 0..51', () => {
    const { hands } = dealTienLen();
    for (const card of [...hands[0], ...hands[1]]) {
      expect(Number.isInteger(card)).toBe(true);
      expect(card).toBeGreaterThanOrEqual(0);
      expect(card).toBeLessThan(DECK_SIZE);
    }
  });

  it('mỗi tay đã được xếp tăng dần', () => {
    const { hands } = dealTienLen();
    for (const hand of hands) {
      expect(hand).toEqual([...hand].sort((a, b) => a - b));
    }
  });

  it('`lowest` là lá nhỏ nhất trong số bài ĐÃ CHIA, và nó thuộc về một trong hai tay', () => {
    for (let i = 0; i < 50; i++) {
      const { hands, lowest } = dealTienLen();
      const all = [...hands[0], ...hands[1]];
      expect(lowest).toBe(Math.min(...all));
      expect(all).toContain(lowest);
    }
  });

  it('KHÔNG phải lúc nào 3♠ cũng được chia — đó là lý do phải dùng "lá nhỏ nhất"', () => {
    /*
     * 26 trên 52 lá bị bỏ ra, nên 3♠ (cardId 0) chỉ vào tay ai đó khoảng một
     * nửa số ván. Luật gốc "ai có 3♠ đi trước" áp thẳng vào đây sẽ có ván không
     * ai đi được. Test này chốt lại lý do của quyết định ấy.
     */
    let dealtCount = 0;
    const rounds = 200;
    for (let i = 0; i < rounds; i++) {
      const { hands } = dealTienLen();
      if (hands[0].includes(0) || hands[1].includes(0)) dealtCount++;
    }
    expect(dealtCount).toBeGreaterThan(0);
    expect(dealtCount).toBeLessThan(rounds);
  });

  it('xáo thật — hai lần chia liên tiếp không ra cùng một bộ bài', () => {
    const a = dealTienLen();
    const b = dealTienLen();
    expect(a.hands[0].join(',')).not.toBe(b.hands[0].join(','));
  });
});
