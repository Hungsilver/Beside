import { describe, expect, it } from 'vitest';
import {
  autoActionTienLen,
  stepTienLen,
  viewTienLen,
  type TienLenTableState,
} from './tien-len-flow';

const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['♠', '♣', '♦', '♥'];

function c(label: string): number {
  const suit = SUITS.indexOf(label.slice(-1));
  const rank = RANKS.indexOf(label.slice(0, -1));
  if (suit < 0 || rank < 0) throw new Error(`Nhãn lá bài sai: ${label}`);
  return rank * 4 + suit;
}
const set = (...labels: string[]): number[] => labels.map(c);

const AN = 'user-an';
const BINH = 'user-binh';

function table(over: Partial<TienLenTableState> = {}): TienLenTableState {
  return {
    hands: {
      [AN]: set('3♠', '4♥', '7♠', '7♣', 'K♦'),
      [BINH]: set('5♦', '8♠', '8♥', 'A♣', '2♥'),
    },
    table: null,
    passedBy: null,
    mustInclude: null,
    ...over,
  };
}

describe('stepTienLen — đánh bài', () => {
  it('happy path: đánh một đôi khi bàn trống, lượt sang người kia', () => {
    const r = stepTienLen(table(), AN, BINH, { cards: set('7♠', '7♣') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.step.state.table).toEqual({ userId: AN, cards: set('7♠', '7♣') });
    expect(r.step.state.hands[AN]).toEqual(set('3♠', '4♥', 'K♦'));
    expect(r.step.nextTurnUserId).toBe(BINH);
    expect(r.step.finished).toBe(false);
  });

  it('không sửa trạng thái cũ — hàm thuần', () => {
    const before = table();
    const snapshot = JSON.stringify(before);
    stepTienLen(before, AN, BINH, { cards: set('7♠', '7♣') });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('đánh lá không có trong tay bị từ chối', () => {
    const r = stepTienLen(table(), AN, BINH, { cards: set('2♥') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_IN_HAND');
  });

  it('bộ không chặn được bàn bị từ chối', () => {
    const state = table({ table: { userId: BINH, cards: set('9♦', '9♥') } });
    const r = stepTienLen(state, AN, BINH, { cards: set('7♠', '7♣') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CANNOT_BEAT');
  });

  it('người không ở trong ván bị từ chối', () => {
    const r = stepTienLen(table(), 'nguoi-la', BINH, { cards: set('7♠') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_IN_HAND');
  });

  it('nước đầu ván đầu phải chứa lá bắt buộc', () => {
    const state = table({ mustInclude: c('3♠') });
    expect(stepTienLen(state, AN, BINH, { cards: set('7♠', '7♣') }).ok).toBe(false);

    const ok = stepTienLen(state, AN, BINH, { cards: set('3♠') });
    expect(ok.ok).toBe(true);
    // Ràng buộc chỉ áp đúng một lần — đánh xong là gỡ.
    if (ok.ok) expect(ok.step.state.mustInclude).toBeNull();
  });

  it('đánh hết bài là thắng, không còn lượt kế', () => {
    const state = table({ hands: { [AN]: set('7♠', '7♣'), [BINH]: set('5♦') } });
    const r = stepTienLen(state, AN, BINH, { cards: set('7♠', '7♣') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.step.finished).toBe(true);
    expect(r.step.winnerId).toBe(AN);
    expect(r.step.nextTurnUserId).toBeNull();
    expect(r.step.state.hands[AN]).toEqual([]);
  });

  it('thắng bằng nước CHẶT vẫn tính là hết bài', () => {
    const state = table({
      hands: { [AN]: set('5♠', '5♣', '5♦', '5♥'), [BINH]: set('3♥') },
      table: { userId: BINH, cards: set('2♥') },
    });
    const r = stepTienLen(state, AN, BINH, { cards: set('5♠', '5♣', '5♦', '5♥') });
    expect(r.ok && r.step.winnerId).toBe(AN);
  });
});

describe('stepTienLen — bỏ lượt', () => {
  it('bỏ lượt khi bàn có bài: người kia ăn vòng, bàn được dọn', () => {
    const state = table({ table: { userId: BINH, cards: set('9♦', '9♥') } });
    const r = stepTienLen(state, AN, BINH, { pass: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.step.state.table).toBeNull();
    expect(r.step.state.passedBy).toBe(AN);
    expect(r.step.nextTurnUserId).toBe(BINH);
    // Bỏ lượt không làm mất lá nào.
    expect(r.step.state.hands[AN]).toEqual(table().hands[AN]);
  });

  it('KHÔNG được bỏ lượt khi bàn trống — ván sẽ đứng im mãi', () => {
    const r = stepTienLen(table(), AN, BINH, { pass: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CANNOT_PASS');
  });

  it('đánh tiếp sau khi ăn vòng thì cờ `passedBy` được xoá', () => {
    const state = table({ passedBy: BINH });
    const r = stepTienLen(state, AN, BINH, { cards: set('7♠', '7♣') });
    expect(r.ok && r.step.state.passedBy).toBeNull();
  });
});

describe('autoActionTienLen — nước đi khi hết giờ', () => {
  it('đang phải chặn → bỏ lượt', () => {
    const state = table({ table: { userId: BINH, cards: set('9♦', '9♥') } });
    expect(autoActionTienLen(state, AN)).toEqual({ pass: true });
  });

  it('đang được ra bài tự do → tự đánh lá lẻ nhỏ nhất', () => {
    expect(autoActionTienLen(table(), AN)).toEqual({ cards: set('3♠') });
  });

  it('nước tự động luôn hợp lệ — kể cả khi còn ràng buộc lá bắt buộc', () => {
    /*
     * Người giữ lá nhỏ nhất chính là người đi trước, nên "lá lẻ nhỏ nhất trong
     * tay" luôn trùng với lá bắt buộc. Nếu hai thứ đó lệch nhau thì nước tự
     * động sẽ bị chính trọng tài từ chối và ván treo — nên phải chốt lại.
     */
    const state = table({ mustInclude: c('3♠') });
    const action = autoActionTienLen(state, AN);
    expect(action).toEqual({ cards: set('3♠') });

    const r = stepTienLen(state, AN, BINH, action as { cards: number[] });
    expect(r.ok).toBe(true);
  });

  it('tay rỗng và bàn trống → không dựng được nước nào', () => {
    const state = table({ hands: { [AN]: [], [BINH]: set('5♦') } });
    expect(autoActionTienLen(state, AN)).toBeNull();
  });
});

describe('viewTienLen — hàng rào giữ bài úp', () => {
  it('người xem thấy bài mình, chỉ thấy SỐ LÁ của đối phương', () => {
    const view = viewTienLen(table(), AN, BINH);
    expect(view.myHand).toEqual(set('3♠', '4♥', '7♠', '7♣', 'K♦'));
    expect(view.opponentCount).toBe(5);
  });

  it('KHÔNG có lá nào của đối phương lọt vào bản gửi đi', () => {
    // Đây là chốt chặn quan trọng nhất của cả tính năng: soi thẳng vào JSON
    // sẽ đi qua dây, tìm bất kỳ lá nào chỉ Bình mới có.
    const state = table();
    const wire = JSON.stringify(viewTienLen(state, AN, BINH));
    const parsed = JSON.parse(wire) as Record<string, unknown>;

    expect(parsed).not.toHaveProperty('hands');
    for (const card of state.hands[BINH] as number[]) {
      if ((state.hands[AN] as number[]).includes(card)) continue;
      expect(wire).not.toContain(`:${card},`);
    }
  });

  it('mỗi người thấy một bản khác nhau', () => {
    const state = table();
    const anView = viewTienLen(state, AN, BINH);
    const binhView = viewTienLen(state, BINH, AN);
    expect(anView.myHand).not.toEqual(binhView.myHand);
    expect(anView.myHand).toEqual(binhView.myHand.length ? state.hands[AN] : []);
  });

  it('bài trên tay luôn được xếp tăng dần', () => {
    const state = table({ hands: { [AN]: set('K♦', '3♠', '2♥'), [BINH]: [] } });
    expect(viewTienLen(state, AN, BINH).myHand).toEqual(set('3♠', 'K♦', '2♥'));
  });

  it('`opponentPassed` chỉ đúng khi NGƯỜI KIA bỏ lượt', () => {
    expect(viewTienLen(table({ passedBy: BINH }), AN, BINH).opponentPassed).toBe(true);
    expect(viewTienLen(table({ passedBy: AN }), AN, BINH).opponentPassed).toBe(false);
    expect(viewTienLen(table(), AN, BINH).opponentPassed).toBe(false);
  });

  it('chưa có đối phương thì số lá là 0, không phải undefined', () => {
    expect(viewTienLen(table(), AN, null).opponentCount).toBe(0);
  });
});

describe('một vòng đánh hoàn chỉnh', () => {
  it('An ra bài · Bình chặn · An bỏ lượt · Bình ăn vòng và ra bài tự do', () => {
    let state = table();

    const s1 = stepTienLen(state, AN, BINH, { cards: set('7♠') });
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    state = s1.step.state;
    expect(s1.step.nextTurnUserId).toBe(BINH);

    const s2 = stepTienLen(state, BINH, AN, { cards: set('8♠') });
    expect(s2.ok).toBe(true);
    if (!s2.ok) return;
    state = s2.step.state;
    expect(state.table).toEqual({ userId: BINH, cards: set('8♠') });

    const s3 = stepTienLen(state, AN, BINH, { pass: true });
    expect(s3.ok).toBe(true);
    if (!s3.ok) return;
    state = s3.step.state;

    // Bình ăn vòng: bàn trống, tới lượt Bình, và giờ Bình ra bài tự do.
    expect(state.table).toBeNull();
    expect(s3.step.nextTurnUserId).toBe(BINH);
    expect(stepTienLen(state, BINH, AN, { cards: set('2♥') }).ok).toBe(true);
  });
});
