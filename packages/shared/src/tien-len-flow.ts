import type { TienLenClientState } from './game.schema';
import {
  checkPass,
  checkPlay,
  detectCombo,
  lowestCard,
  sortCards,
  type MoveError,
} from './tien-len';

/**
 * Diễn biến một ván Tiến lên — **hàm thuần**, không đụng DB, không đụng đồng hồ.
 *
 * Tách khỏi service theo đúng bài học đã ghi trong ADR 2026-09-08: phần tính
 * toán nào tách ra được thành hàm thuần thì tách, rồi mới nối vào service. F5
 * làm vậy và chạy đúng ngay lượt trace đầu, còn F6 để logic lẫn trong service
 * thì dính 3 lỗi.
 *
 * Ở đây còn một lý do nữa: `hands` chứa bài của CẢ HAI người, nên `viewFor()`
 * là hàng rào giữ cho bài úp không bị lộ. Hàng rào thì phải test được 100%.
 */

export interface TienLenTableState {
  /** userId → bài trên tay. CHỨA BÀI CẢ HAI NGƯỜI. */
  hands: Record<string, number[]>;
  table: { userId: string; cards: number[] } | null;
  /** Ai vừa bỏ lượt trong vòng này. */
  passedBy: string | null;
  /** Lá bắt buộc có trong bộ ĐẦU TIÊN của ván. */
  mustInclude: number | null;
}

export type TienLenAction = { cards: number[] } | { pass: true };

export interface TienLenStep {
  state: TienLenTableState;
  /** Người đi lượt kế. `null` khi ván đã xong. */
  nextTurnUserId: string | null;
  finished: boolean;
  winnerId: string | null;
}

export type TienLenResult =
  | { ok: true; step: TienLenStep }
  | { ok: false; error: MoveError };

/**
 * Áp một nước đi lên trạng thái ván.
 *
 * Với hai người, "vòng" đơn giản hơn hẳn bản bốn người: bỏ lượt là mất vòng
 * NGAY, không phải chờ ai khác. Người kia ăn vòng, bàn được dọn, và họ ra bài
 * tự do ở lượt sau.
 */
export function stepTienLen(
  state: TienLenTableState,
  userId: string,
  partnerId: string,
  action: TienLenAction,
): TienLenResult {
  const hand = state.hands[userId];
  if (!hand) {
    return { ok: false, error: { code: 'NOT_IN_HAND', message: 'Bạn không ở trong ván này' } };
  }

  const table = state.table ? detectCombo(state.table.cards) : null;

  if ('pass' in action) {
    const error = checkPass(table);
    if (error) return { ok: false, error };

    return {
      ok: true,
      step: {
        state: { ...state, table: null, passedBy: userId },
        nextTurnUserId: partnerId,
        finished: false,
        winnerId: null,
      },
    };
  }

  const error = checkPlay(hand, action.cards, table, state.mustInclude);
  if (error) return { ok: false, error };

  const played = new Set(action.cards);
  const rest = hand.filter((card) => !played.has(card));
  const finished = rest.length === 0;

  return {
    ok: true,
    step: {
      state: {
        ...state,
        hands: { ...state.hands, [userId]: rest },
        table: { userId, cards: sortCards(action.cards) },
        passedBy: null,
        // Ràng buộc lá nhỏ nhất chỉ áp cho đúng nước đầu tiên của ván.
        mustInclude: null,
      },
      nextTurnUserId: finished ? null : partnerId,
      finished,
      winnerId: finished ? userId : null,
    },
  };
}

/**
 * Nước đi tự động khi hết giờ.
 *
 * Đang phải chặn → **bỏ lượt**, đúng thứ người chơi sẽ làm nếu bí.
 * Đang được ra bài tự do → không bỏ lượt được, phải tự đánh **lá lẻ nhỏ nhất**:
 * ván buộc phải đi tiếp, và đó là nước ít thiệt nhất.
 *
 * `null` khi không dựng được nước nào (tay rỗng mà bàn cũng trống — trạng thái
 * không thể có, vì hết bài thì ván đã kết thúc).
 */
export function autoActionTienLen(
  state: TienLenTableState,
  userId: string,
): TienLenAction | null {
  if (state.table) return { pass: true };

  const low = lowestCard(state.hands[userId] ?? []);
  return low === null ? null : { cards: [low] };
}

/**
 * Lọc trạng thái theo người xem.
 *
 * **Đây là hàng rào giữ cho bài úp không bị lộ.** Người xem thấy bài của mình,
 * còn của đối phương chỉ thấy SỐ LÁ. Mọi đường ra của `state` phải đi qua đây;
 * thêm bất kỳ lối nào khác là phá thẳng luật số một ở `docs/thiet-ke-games.md` §2.
 */
export function viewTienLen(
  state: TienLenTableState,
  viewerId: string,
  opponentId: string | null,
): TienLenClientState {
  return {
    kind: 'TIEN_LEN',
    myHand: sortCards(state.hands[viewerId] ?? []),
    opponentCount: opponentId ? (state.hands[opponentId]?.length ?? 0) : 0,
    table: state.table,
    opponentPassed: state.passedBy !== null && state.passedBy !== viewerId,
    mustInclude: state.mustInclude,
  };
}
