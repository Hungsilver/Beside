import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Băm mật khẩu bằng scrypt của Node (có sẵn trong `node:crypto`).
 *
 * Vì sao không dùng bcrypt/argon2: cả hai đều là native addon, phải biên dịch
 * khi cài — hay vỡ trên Windows và làm image Docker phình to. scrypt là thuật
 * toán chuẩn (RFC 7914), được OWASP khuyến nghị, và không thêm dependency nào.
 *
 * Định dạng lưu trong DB (tự mô tả, để sau này đổi tham số vẫn đọc được bản cũ):
 *   scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 */
const PARAMS = { N: 16_384, r: 8, p: 1 } as const;
// 128 * N * r = 16 MiB; cấp gấp đôi cho chắc.
const MAXMEM = 64 * 1024 * 1024;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await scryptAsync(plain.normalize('NFC'), salt, KEY_LENGTH, {
      ...PARAMS,
      maxmem: MAXMEM,
    });
    return [
      'scrypt',
      PARAMS.N,
      PARAMS.r,
      PARAMS.p,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
  }

  /**
   * So sánh mật khẩu. Trả về false (không ném lỗi) với mọi đầu vào hỏng,
   * để endpoint đăng nhập không phân biệt được "tài khoản không tồn tại"
   * với "sai mật khẩu".
   */
  async verify(plain: string, stored: string | null | undefined): Promise<boolean> {
    if (!stored) return false;

    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }
    // Chặn tham số quá lớn do dữ liệu bị sửa — tránh treo tiến trình vì hết RAM.
    if (N > 2 ** 20 || r > 32 || p > 16) return false;

    let salt: Buffer;
    let expected: Buffer;
    try {
      salt = Buffer.from(parts[4] as string, 'base64');
      expected = Buffer.from(parts[5] as string, 'base64');
    } catch {
      return false;
    }
    if (salt.length === 0 || expected.length === 0) return false;

    let actual: Buffer;
    try {
      actual = await scryptAsync(plain.normalize('NFC'), salt, expected.length, {
        N,
        r,
        p,
        maxmem: MAXMEM,
      });
    } catch {
      return false;
    }

    // timingSafeEqual ném lỗi nếu hai buffer khác độ dài → đã ép cùng độ dài ở trên.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  /**
   * Băm giả để dùng khi email không tồn tại.
   * Giữ cho thời gian phản hồi của "sai email" và "sai mật khẩu" gần bằng nhau,
   * chặn việc dò xem email nào đã đăng ký.
   */
  async burnCycles(): Promise<void> {
    await this.hash('khong-ton-tai-' + randomBytes(8).toString('hex'));
  }
}
