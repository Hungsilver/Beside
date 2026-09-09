/**
 * Cờ caro — luật Việt Nam (F11).
 *
 * Toàn bộ file là **hàm thuần**: không đọc đồng hồ, không đụng mạng, không state.
 * Nhờ vậy web dùng để tô sáng nước thắng và tắt/bật nút, còn API dùng đúng những
 * hàm này làm trọng tài — một nguồn sự thật, không viết luật hai lần.
 *
 * Xem `docs/thiet-ke-games.md` §4.5.
 */

/** Bàn 15×15 — vừa khít khổ 390px mà vẫn đủ rộng cho luật chặn hai đầu. */
export const CARO_SIZE = 15;
export const CARO_CELLS = CARO_SIZE * CARO_SIZE;

/** Số quân liên tiếp tối thiểu để thắng. */
export const CARO_WIN_LEN = 5;

export type CaroMark = 'X' | 'O';
/** Ô trống. Dùng dấu chấm chứ không phải chuỗi rỗng để bàn cờ luôn đúng 225 ký tự. */
export const CARO_EMPTY = '.';

/**
 * Bàn cờ là MỘT CHUỖI 225 ký tự, không phải mảng hai chiều.
 *
 * Nó nằm trong cột JSON của Postgres và đi qua WebSocket sau mỗi nước đi. Chuỗi
 * 225 byte thì gọn và so sánh được bằng `===`; mảng lồng mảng tốn gấp mấy lần
 * chỗ trong JSON mà chẳng cho thêm gì.
 */
export type CaroBoard = string;

export function emptyBoard(): CaroBoard {
  return CARO_EMPTY.repeat(CARO_CELLS);
}

export function idx(r: number, c: number): number {
  return r * CARO_SIZE + c;
}

export function inBoard(r: number, c: number): boolean {
  return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < CARO_SIZE && c >= 0 && c < CARO_SIZE;
}

export function cellAt(board: CaroBoard, r: number, c: number): string {
  if (!inBoard(r, c)) return CARO_EMPTY;
  return board[idx(r, c)] ?? CARO_EMPTY;
}

/** Đặt một quân, trả về bàn MỚI. Không sửa bàn cũ. */
export function placeMark(board: CaroBoard, r: number, c: number, mark: CaroMark): CaroBoard {
  const i = idx(r, c);
  return board.slice(0, i) + mark + board.slice(i + 1);
}

export function isBoardFull(board: CaroBoard): boolean {
  return !board.includes(CARO_EMPTY);
}

export interface CaroMoveError {
  code: 'OUT_OF_BOARD' | 'OCCUPIED';
  message: string;
}

/** Nước đi có hợp lệ không. `null` = hợp lệ. */
export function checkMove(board: CaroBoard, r: number, c: number): CaroMoveError | null {
  if (!inBoard(r, c)) {
    return { code: 'OUT_OF_BOARD', message: 'Ô này nằm ngoài bàn cờ' };
  }
  if (cellAt(board, r, c) !== CARO_EMPTY) {
    return { code: 'OCCUPIED', message: 'Ô này đã có quân rồi' };
  }
  return null;
}

/** Bốn hướng cần dò. Mỗi hướng đại diện cho một đường thẳng đi qua ô vừa đánh. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], // ngang
  [1, 0], // dọc
  [1, 1], // chéo xuống-phải
  [1, -1], // chéo xuống-trái
];

export interface CaroWin {
  /** Toạ độ các quân tạo nên chuỗi thắng — dùng để tô sáng khi kết thúc. */
  line: { r: number; c: number }[];
}

/**
 * Ô vừa đánh có tạo thành nước thắng không.
 *
 * **Luật Việt Nam** (`docs/thiet-ke-games.md` §4.5):
 *   - chuỗi ≥6 quân → thắng, bất kể hai đầu thế nào;
 *   - chuỗi đúng 5 → chỉ thắng nếu **ít nhất một đầu còn trống**;
 *   - **mép bàn tính là bị chặn** — đây là chỗ dễ quên nhất, và cũng là chỗ hai
 *     người dễ cãi nhau nhất nếu để mập mờ.
 *
 * Chỉ dò 4 đường thẳng đi qua đúng ô vừa đánh, không quét cả bàn: đó là chỗ duy
 * nhất trạng thái vừa thay đổi, nên cũng là chỗ duy nhất một chuỗi thắng có thể
 * vừa xuất hiện.
 */
export function findWin(board: CaroBoard, r: number, c: number): CaroWin | null {
  const mark = cellAt(board, r, c);
  if (mark !== 'X' && mark !== 'O') return null;

  for (const [dr, dc] of DIRECTIONS) {
    // Lùi về đầu chuỗi, rồi tiến tới cuối — đếm cả hai phía của ô vừa đánh.
    let startR = r;
    let startC = c;
    while (cellAt(board, startR - dr, startC - dc) === mark) {
      startR -= dr;
      startC -= dc;
    }

    const line: { r: number; c: number }[] = [];
    let curR = startR;
    let curC = startC;
    while (cellAt(board, curR, curC) === mark) {
      line.push({ r: curR, c: curC });
      curR += dr;
      curC += dc;
    }

    if (line.length < CARO_WIN_LEN) continue;
    // Từ 6 quân trở lên thì chặn kiểu gì cũng thua — không cần soi hai đầu.
    if (line.length > CARO_WIN_LEN) return { line };

    /*
     * Đúng 5 quân: soi hai đầu. `cellAt` trả về ô trống cho toạ độ NGOÀI bàn,
     * nên phải hỏi `inBoard` riêng — mép bàn là bị chặn, không phải đầu hở.
     */
    const headOpen = inBoard(startR - dr, startC - dc) && cellAt(board, startR - dr, startC - dc) === CARO_EMPTY;
    const tailOpen = inBoard(curR, curC) && cellAt(board, curR, curC) === CARO_EMPTY;

    if (headOpen || tailOpen) return { line };
  }

  return null;
}

/** Quân của đối phương. */
export function otherMark(mark: CaroMark): CaroMark {
  return mark === 'X' ? 'O' : 'X';
}
