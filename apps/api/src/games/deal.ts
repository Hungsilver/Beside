import { randomInt } from 'node:crypto';
import { DECK_SIZE, HAND_SIZE, sortCards } from '@beside/shared';

export interface Deal {
  /** Bài của người đi trước và người đi sau, đã xếp tăng dần. */
  hands: [number[], number[]];
  /**
   * Lá nhỏ nhất trong số bài ĐÃ CHIA. Người cầm nó đi trước, và bộ đầu tiên
   * bắt buộc phải chứa nó.
   *
   * Luật gốc nói "ai có 3♠ đi trước", nhưng với 13 lá mỗi người thì 26 lá bị
   * bỏ ra — **3♠ có thể không được chia cho ai cả**, và lúc đó không ai đi
   * được. "Lá nhỏ nhất đã chia" là cách nói tổng quát của đúng luật ấy: với bộ
   * bài chia hết thì nó chính là 3♠.
   */
  lowest: number;
}

/**
 * Xáo bài rồi chia.
 *
 * Fisher–Yates với `crypto.randomInt`, **không** `Math.random`: bộ sinh số của
 * V8 để lộ trạng thái sau vài chục mẫu, và với bài úp thì đó là lỗ hổng thật
 * chứ không phải lo xa — đối phương chỉ cần nhìn vài ván là đoán được bài.
 */
export function dealTienLen(): Deal {
  const deck = Array.from({ length: DECK_SIZE }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j] as number, deck[i] as number];
  }

  const first = sortCards(deck.slice(0, HAND_SIZE));
  const second = sortCards(deck.slice(HAND_SIZE, HAND_SIZE * 2));

  // Đã sắp tăng dần nên lá nhỏ nhất của mỗi tay nằm ở đầu.
  const lowest = Math.min(first[0] as number, second[0] as number);

  return { hands: [first, second], lowest };
}
