import { describe, expect, it } from 'vitest';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, inviteCodeSchema } from '@beside/shared';
import { generateInviteCode } from './invite-code';

describe('generateInviteCode', () => {
  it('luôn sinh mã đúng độ dài và đúng bảng chữ cái', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      for (const ch of code) expect(INVITE_CODE_ALPHABET).toContain(ch);
    }
  });

  it('mã sinh ra luôn qua được schema phía client', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(inviteCodeSchema.safeParse(generateInviteCode()).success).toBe(true);
    }
  });

  it('không bao giờ chứa ký tự dễ nhìn nhầm (0, 1, O, I)', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateInviteCode()).not.toMatch(/[01OI]/);
    }
  });

  it('không bị lặp lại trong 2000 lần sinh (đủ ngẫu nhiên)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) seen.add(generateInviteCode());
    // 32^6 ≈ 1,07 tỉ → xác suất trùng trong 2000 lần là rất nhỏ,
    // cho phép sai lệch 1 để test không "chớp tắt".
    expect(seen.size).toBeGreaterThanOrEqual(1999);
  });
});
