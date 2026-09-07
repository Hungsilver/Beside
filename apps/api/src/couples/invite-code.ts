import { randomInt } from 'node:crypto';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from '@beside/shared';

/**
 * Sinh mã ghép đôi.
 *
 * Dùng `randomInt` của node:crypto chứ KHÔNG dùng Math.random():
 * mã này là thứ duy nhất chặn người lạ ghép vào tài khoản của bạn,
 * nên phải là ngẫu nhiên mật mã học.
 *
 * Không gian mã: 32^6 ≈ 1,07 tỉ — thừa sức cho quy mô vài cặp đôi,
 * và mỗi mã chỉ sống 24 giờ.
 */
export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}
