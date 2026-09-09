import { describe, expect, it } from 'vitest';
import {
  CARO_EMPTY,
  CARO_SIZE,
  cellAt,
  checkMove,
  emptyBoard,
  findWin,
  idx,
  inBoard,
  isBoardFull,
  otherMark,
  placeMark,
  type CaroBoard,
  type CaroMark,
} from './caro';

/** Đặt một chuỗi quân nằm ngang bắt đầu từ (r,c). */
function row(board: CaroBoard, r: number, c: number, marks: string): CaroBoard {
  let out = board;
  for (let i = 0; i < marks.length; i++) {
    const ch = marks[i];
    if (ch === 'X' || ch === 'O') out = placeMark(out, r, c + i, ch);
  }
  return out;
}

describe('bàn cờ', () => {
  it('bàn rỗng đúng 225 ô trống', () => {
    const b = emptyBoard();
    expect(b).toHaveLength(CARO_SIZE * CARO_SIZE);
    expect(b.split('').every((ch) => ch === CARO_EMPTY)).toBe(true);
    expect(isBoardFull(b)).toBe(false);
  });

  it('đặt quân không sửa bàn cũ', () => {
    const before = emptyBoard();
    const after = placeMark(before, 7, 7, 'X');
    expect(cellAt(before, 7, 7)).toBe(CARO_EMPTY);
    expect(cellAt(after, 7, 7)).toBe('X');
  });

  it('inBoard chặn toạ độ ngoài bàn và số không nguyên', () => {
    expect(inBoard(0, 0)).toBe(true);
    expect(inBoard(14, 14)).toBe(true);
    expect(inBoard(-1, 0)).toBe(false);
    expect(inBoard(0, 15)).toBe(false);
    expect(inBoard(1.5, 2)).toBe(false);
    expect(inBoard(Number.NaN, 0)).toBe(false);
  });

  it('idx khớp với cellAt', () => {
    const b = placeMark(emptyBoard(), 3, 4, 'O');
    expect(b[idx(3, 4)]).toBe('O');
  });

  it('bàn đầy thì isBoardFull đúng', () => {
    let b = emptyBoard();
    for (let r = 0; r < CARO_SIZE; r++) {
      for (let c = 0; c < CARO_SIZE; c++) {
        b = placeMark(b, r, c, ((r + c) % 2 === 0 ? 'X' : 'O') as CaroMark);
      }
    }
    expect(isBoardFull(b)).toBe(true);
  });

  it('otherMark đổi bên', () => {
    expect(otherMark('X')).toBe('O');
    expect(otherMark('O')).toBe('X');
  });
});

describe('checkMove', () => {
  it('ô trống trong bàn thì hợp lệ', () => {
    expect(checkMove(emptyBoard(), 7, 7)).toBeNull();
  });

  it('ô đã có quân bị từ chối', () => {
    const b = placeMark(emptyBoard(), 7, 7, 'X');
    expect(checkMove(b, 7, 7)?.code).toBe('OCCUPIED');
  });

  it('ô ngoài bàn bị từ chối', () => {
    expect(checkMove(emptyBoard(), -1, 7)?.code).toBe('OUT_OF_BOARD');
    expect(checkMove(emptyBoard(), 7, 15)?.code).toBe('OUT_OF_BOARD');
  });
});

describe('findWin — luật Việt Nam', () => {
  it('đúng 5 quân, hai đầu trống → THẮNG', () => {
    const b = row(emptyBoard(), 7, 5, 'XXXXX');
    const win = findWin(b, 7, 7);
    expect(win).not.toBeNull();
    expect(win?.line).toHaveLength(5);
  });

  it('đúng 5 quân, một đầu bị chặn còn một đầu hở → THẮNG', () => {
    const b = row(emptyBoard(), 7, 4, 'OXXXXX');
    expect(findWin(b, 7, 7)).not.toBeNull();
  });

  it('đúng 5 quân, BỊ CHẶN CẢ HAI ĐẦU → chưa thắng', () => {
    const b = row(emptyBoard(), 7, 4, 'OXXXXXO');
    expect(findWin(b, 7, 7)).toBeNull();
  });

  it('6 quân bị chặn hai đầu → vẫn THẮNG', () => {
    const b = row(emptyBoard(), 7, 3, 'OXXXXXXO');
    const win = findWin(b, 7, 6);
    expect(win).not.toBeNull();
    expect(win?.line).toHaveLength(6);
  });

  it('MÉP BÀN tính là bị chặn: 5 quân sát mép trái, đầu kia bị chặn → chưa thắng', () => {
    // Cột 0..4 là 5 quân X, cột 5 là O. Đầu trái không có ô nào — mép bàn.
    const b = row(emptyBoard(), 7, 0, 'XXXXXO');
    expect(findWin(b, 7, 2)).toBeNull();
  });

  it('5 quân sát mép trái nhưng đầu phải còn trống → THẮNG', () => {
    const b = row(emptyBoard(), 7, 0, 'XXXXX');
    expect(findWin(b, 7, 0)).not.toBeNull();
  });

  it('5 quân sát mép phải, đầu kia bị chặn → chưa thắng', () => {
    const b = row(emptyBoard(), 7, 9, 'OXXXXX');
    expect(findWin(b, 7, 14)).toBeNull();
  });

  it('6 quân chiếm sát cả hai mép vẫn thắng', () => {
    let b = emptyBoard();
    // Hàng dài 15 ô: đặt 6 quân sát mép trái rồi chặn bằng O
    b = row(b, 3, 0, 'XXXXXXO');
    expect(findWin(b, 3, 0)).not.toBeNull();
  });

  it('thắng theo hàng DỌC', () => {
    let b = emptyBoard();
    for (let r = 2; r < 7; r++) b = placeMark(b, r, 9, 'O');
    expect(findWin(b, 4, 9)).not.toBeNull();
  });

  it('hàng dọc đúng 5 bị chặn hai đầu → chưa thắng', () => {
    let b = emptyBoard();
    b = placeMark(b, 1, 9, 'X');
    for (let r = 2; r < 7; r++) b = placeMark(b, r, 9, 'O');
    b = placeMark(b, 7, 9, 'X');
    expect(findWin(b, 4, 9)).toBeNull();
  });

  it('thắng theo chéo xuống-phải', () => {
    let b = emptyBoard();
    for (let i = 0; i < 5; i++) b = placeMark(b, 3 + i, 3 + i, 'X');
    expect(findWin(b, 5, 5)).not.toBeNull();
  });

  it('thắng theo chéo xuống-trái', () => {
    let b = emptyBoard();
    for (let i = 0; i < 5; i++) b = placeMark(b, 3 + i, 11 - i, 'O');
    expect(findWin(b, 5, 9)).not.toBeNull();
  });

  it('chéo đúng 5 bị chặn hai đầu → chưa thắng', () => {
    let b = emptyBoard();
    b = placeMark(b, 2, 2, 'O');
    for (let i = 0; i < 5; i++) b = placeMark(b, 3 + i, 3 + i, 'X');
    b = placeMark(b, 8, 8, 'O');
    expect(findWin(b, 5, 5)).toBeNull();
  });

  it('4 quân chưa đủ thắng', () => {
    const b = row(emptyBoard(), 7, 5, 'XXXX');
    expect(findWin(b, 7, 6)).toBeNull();
  });

  it('5 quân nhưng xen một ô của đối phương thì không thành chuỗi', () => {
    const b = row(emptyBoard(), 7, 5, 'XXOXX');
    expect(findWin(b, 7, 5)).toBeNull();
    expect(findWin(b, 7, 9)).toBeNull();
  });

  it('ô trống thì không bao giờ là nước thắng', () => {
    expect(findWin(emptyBoard(), 7, 7)).toBeNull();
  });

  it('chuỗi thắng trả về đúng các ô, theo thứ tự từ đầu chuỗi', () => {
    const b = row(emptyBoard(), 7, 5, 'XXXXX');
    const win = findWin(b, 7, 9);
    expect(win?.line.map((p) => p.c)).toEqual([5, 6, 7, 8, 9]);
    expect(win?.line.every((p) => p.r === 7)).toBe(true);
  });

  it('7 quân liên tiếp vẫn tính là thắng', () => {
    const b = row(emptyBoard(), 7, 4, 'XXXXXXX');
    expect(findWin(b, 7, 7)?.line).toHaveLength(7);
  });
});
