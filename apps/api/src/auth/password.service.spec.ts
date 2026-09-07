import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

const svc = new PasswordService();

describe('PasswordService', () => {
  it('băm rồi xác minh lại đúng', async () => {
    const hash = await svc.hash('matkhau123');
    expect(await svc.verify('matkhau123', hash)).toBe(true);
  });

  it('hai lần băm cùng mật khẩu cho hai chuỗi khác nhau (salt ngẫu nhiên)', async () => {
    const a = await svc.hash('matkhau123');
    const b = await svc.hash('matkhau123');
    expect(a).not.toBe(b);
    expect(await svc.verify('matkhau123', a)).toBe(true);
    expect(await svc.verify('matkhau123', b)).toBe(true);
  });

  it('từ chối mật khẩu sai', async () => {
    const hash = await svc.hash('matkhau123');
    expect(await svc.verify('matkhau124', hash)).toBe(false);
    expect(await svc.verify('', hash)).toBe(false);
  });

  it('xử lý được mật khẩu tiếng Việt có dấu', async () => {
    const hash = await svc.hash('mậtkhẩuCủaTôi');
    expect(await svc.verify('mậtkhẩuCủaTôi', hash)).toBe(true);
    expect(await svc.verify('matkhauCuaToi', hash)).toBe(false);
  });

  it('chuẩn hoá Unicode: cùng chữ nhưng gõ khác tổ hợp vẫn khớp', async () => {
    // "ế" viết liền (NFC) và "ế" ghép từ e + dấu (NFD) — bàn phím macOS hay sinh NFD
    const nfc = 'bếp123456';
    const nfd = nfc.normalize('NFD');
    expect(nfc).not.toBe(nfd); // khác nhau ở mức chuỗi
    const hash = await svc.hash(nfc);
    expect(await svc.verify(nfd, hash)).toBe(true);
  });

  it('trả false (không ném lỗi) với dữ liệu băm hỏng', async () => {
    expect(await svc.verify('x', null)).toBe(false);
    expect(await svc.verify('x', undefined)).toBe(false);
    expect(await svc.verify('x', '')).toBe(false);
    expect(await svc.verify('x', 'khong-phai-dinh-dang')).toBe(false);
    expect(await svc.verify('x', 'bcrypt$1$2$3$4$5')).toBe(false);
    expect(await svc.verify('x', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(await svc.verify('x', 'scrypt$16384$8$1$$')).toBe(false);
  });

  it('chặn tham số N quá lớn (dữ liệu bị sửa) thay vì treo tiến trình', async () => {
    const evil = `scrypt$${2 ** 30}$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA`;
    expect(await svc.verify('x', evil)).toBe(false);
  });

  it('định dạng lưu trữ tự mô tả tham số', async () => {
    const hash = await svc.hash('matkhau123');
    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '16384', '8', '1']);
  });
});
