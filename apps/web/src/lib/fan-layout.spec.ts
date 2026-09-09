import { describe, expect, it } from 'vitest';
import { cardHeight, fanLayout, fanWidth } from './fan-layout';

/**
 * Khung quạt bài ở các khổ máy thật.
 *
 * Bề rộng đã trừ padding ngang của `<footer>` (px-3 = 24px), và ở khổ ngang trừ
 * thêm cột nút bên phải (136px + gap 12px). Chiều cao lấy theo `.tl-hand-box`
 * trong `styles/index.css`.
 */
const DOC = { w: 390 - 24, h: 150 }; // iPhone 14 dọc
const NGANG = { w: 844 - 24 - 148, h: 156 }; // iPhone 14 ngang
const NHO = { w: 320 - 24, h: 130 }; // iPhone SE (thế hệ 1) dọc — khổ hẹp nhất

describe('fanLayout — 13 lá không bao giờ tràn ra ngoài khung', () => {
  for (const [ten, box] of [
    ['dọc 390', DOC],
    ['ngang 844', NGANG],
    ['dọc 320', NHO],
  ] as const) {
    it(`khổ ${ten}`, () => {
      const m = fanLayout(13, box);
      expect(fanWidth(13, m)).toBeLessThanOrEqual(box.w);
      // Nằm gọn theo chiều cao: lá rìa võng xuống 15px vẫn không lòi khỏi khung,
      // và lá đang chọn nhô lên `lift` cũng không lòi khỏi đỉnh.
      expect(m.baseY + 15 + cardHeight(m.cardW)).toBeLessThanOrEqual(box.h);
      expect(m.baseY).toBeGreaterThanOrEqual(m.lift);
    });
  }
});

describe('fanLayout — bề ngang lộ ra còn chạm được', () => {
  it('khổ ngang: mỗi lá hở gần trọn bề rộng, không còn phải ngắm', () => {
    const m = fanLayout(13, NGANG);
    expect(m.step).toBeGreaterThanOrEqual(40);
    expect(m.cardW).toBeGreaterThanOrEqual(70);
  });

  it('khổ dọc: hẹp hơn hẳn — chính là lý do phải xoay ngang', () => {
    const m = fanLayout(13, DOC);
    expect(m.step).toBeLessThan(fanLayout(13, NGANG).step);
    // Vẫn phải đủ 26px để con "10" ở góc lá không bị lá kế bên che mất.
    expect(m.step).toBeGreaterThanOrEqual(26);
  });

  it('khổ 320px: lá vẫn giữ được cỡ đọc được, không bị siết xuống quá nhỏ', () => {
    const m = fanLayout(13, NHO);
    expect(m.cardW).toBeGreaterThanOrEqual(40);
    expect(m.step).toBeGreaterThanOrEqual(16);
  });

  it('lá bài không bao giờ nhỏ hơn sàn 28px, kể cả khung hẹp bất thường', () => {
    expect(fanLayout(13, { w: 120, h: 150 }).cardW).toBe(28);
  });
});

describe('fanLayout — biên', () => {
  it('một lá thì không có khoảng cách và không nghiêng', () => {
    const m = fanLayout(1, DOC);
    expect(m.step).toBe(0);
    expect(m.arc).toBe(0);
    expect(fanWidth(1, m)).toBe(m.cardW);
  });

  it('hai lá thì chưa cong', () => {
    expect(fanLayout(2, DOC).arc).toBe(0);
  });

  it('quạt bài neo xuống đáy khung, không treo lơ lửng ở đỉnh', () => {
    const m = fanLayout(13, DOC);
    // Lá nhỏ đi vì khung hẹp → mép trên phải tụt xuống, không bám đỉnh khung.
    expect(m.baseY).toBeGreaterThan(m.lift);
    // Mép dưới của lá rìa chạm sát đáy khung, chừa đúng 2px cho bóng đổ.
    expect(m.baseY + cardHeight(m.cardW) + 15).toBe(DOC.h - 2);
  });

  it('tay rỗng thì quạt rộng 0', () => {
    expect(fanWidth(0, fanLayout(0, DOC))).toBe(0);
  });

  it('khung chưa đo xong (0×0) vẫn ra số hợp lệ, không âm', () => {
    const m = fanLayout(13, { w: 0, h: 0 });
    expect(m.cardW).toBeGreaterThan(0);
    expect(m.step).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(m.arc)).toBe(true);
  });

  it('còn ít lá thì bài giãn ra nhưng không rời nhau quá xa', () => {
    const m = fanLayout(3, DOC);
    // Trần 0.78 × bề rộng lá: giữ lại chút chồng mép cho ra dáng quạt bài.
    expect(m.step).toBeLessThanOrEqual(m.cardW * 0.78);
  });
});
