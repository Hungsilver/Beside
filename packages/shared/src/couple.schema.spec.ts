import { describe, expect, it } from 'vitest';
import { anniversarySchema, inviteCodeSchema } from './couple.schema';
import { registerSchema, passwordSchema } from './auth.schema';

describe('inviteCodeSchema', () => {
  it('chấp nhận mã hợp lệ và tự viết hoa', () => {
    expect(inviteCodeSchema.parse('lv7k29')).toBe('LV7K29');
  });

  it('bỏ qua dấu cách / gạch ngang mà người dùng chép nhầm từ tin nhắn', () => {
    expect(inviteCodeSchema.parse(' LV7-K29 ')).toBe('LV7K29');
  });

  it('từ chối mã chứa ký tự dễ nhìn nhầm (0, 1, O, I)', () => {
    expect(inviteCodeSchema.safeParse('LV7K2O').success).toBe(false);
    expect(inviteCodeSchema.safeParse('LV7K21').success).toBe(false);
  });

  it('từ chối mã sai độ dài', () => {
    expect(inviteCodeSchema.safeParse('LV7K2').success).toBe(false);
    expect(inviteCodeSchema.safeParse('LV7K299').success).toBe(false);
    expect(inviteCodeSchema.safeParse('').success).toBe(false);
  });
});

describe('anniversarySchema', () => {
  it('nhận chuỗi YYYY-MM-DD', () => {
    const d = anniversarySchema.parse('2023-02-14');
    expect(d.toISOString().slice(0, 10)).toBe('2023-02-14');
  });

  it('từ chối ngày ở tương lai (đếm ngày yêu sẽ ra số âm)', () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = anniversarySchema.safeParse(tomorrow);
    expect(r.success).toBe(false);
  });

  it('từ chối ngày vô nghĩa', () => {
    expect(anniversarySchema.safeParse('không phải ngày').success).toBe(false);
    expect(anniversarySchema.safeParse('1899-12-31').success).toBe(false);
  });

  it('chấp nhận đúng hôm nay', () => {
    expect(anniversarySchema.safeParse(new Date()).success).toBe(true);
  });
});

describe('passwordSchema', () => {
  it('đo độ dài bằng BYTE — mật khẩu tiếng Việt có dấu không lách được trần', () => {
    // 30 ký tự "ế" = 90 byte > 72 → phải bị từ chối
    expect(passwordSchema.safeParse('ế'.repeat(30)).success).toBe(false);
    // 8 ký tự có dấu vẫn hợp lệ
    expect(passwordSchema.safeParse('mậtkhẩu1').success).toBe(true);
  });

  it('từ chối mật khẩu quá ngắn', () => {
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('chuẩn hoá email về chữ thường và cắt khoảng trắng', () => {
    const r = registerSchema.parse({
      displayName: '  An  ',
      email: '  An@Example.COM ',
      password: 'matkhau123',
    });
    expect(r.email).toBe('an@example.com');
    expect(r.displayName).toBe('An');
  });

  it('từ chối tên rỗng sau khi cắt khoảng trắng', () => {
    const r = registerSchema.safeParse({
      displayName: '     ',
      email: 'a@b.com',
      password: 'matkhau123',
    });
    expect(r.success).toBe(false);
  });
});
