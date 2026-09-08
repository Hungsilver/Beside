import { describe, expect, it } from 'vitest';
import { ADDRESS_MAX_LENGTH, BIO_MAX_LENGTH } from './constants';
import { birthdaySchema, updateProfileSchema } from './user.schema';

describe('birthdaySchema', () => {
  it('nhận chuỗi YYYY-MM-DD', () => {
    const d = birthdaySchema.parse('1998-05-12');
    expect(d?.toISOString().slice(0, 10)).toBe('1998-05-12');
  });

  it('cho phép để trống (null hoặc chuỗi rỗng) — không bắt buộc khai', () => {
    expect(birthdaySchema.parse(null)).toBeNull();
    expect(birthdaySchema.parse('')).toBeNull();
  });

  it('từ chối ngày sinh ở tương lai', () => {
    const tomorrow = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(birthdaySchema.safeParse(tomorrow).success).toBe(false);
  });

  it('từ chối ngày vô nghĩa mà không ném TypeError', () => {
    const r = birthdaySchema.safeParse('ngay-sinh-cua-toi');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Ngày sinh không hợp lệ');
  });

  it('từ chối ngày trước năm 1900', () => {
    expect(birthdaySchema.safeParse('1880-01-01').success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('chấp nhận cập nhật từng phần', () => {
    expect(updateProfileSchema.safeParse({ displayName: 'An' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ messagingApp: 'ZALO' }).success).toBe(true);
  });

  it('từ chối body rỗng — không có gì để cập nhật', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it('cắt khoảng trắng, chuỗi rỗng thành null (để xoá thông tin liên hệ)', () => {
    const r = updateProfileSchema.parse({ messagingHandle: '   ' });
    expect(r.messagingHandle).toBeNull();

    const r2 = updateProfileSchema.parse({ messagingHandle: '  0912345678  ' });
    expect(r2.messagingHandle).toBe('0912345678');
  });

  it('phân biệt "không đổi" (undefined) với "xoá đi" (null)', () => {
    const keep = updateProfileSchema.parse({ displayName: 'An' });
    expect(keep.messagingHandle).toBeUndefined();

    const clear = updateProfileSchema.parse({ messagingHandle: null });
    expect(clear.messagingHandle).toBeNull();
  });

  it('từ chối app nhắn tin không nằm trong danh sách', () => {
    expect(
      updateProfileSchema.safeParse({ messagingApp: 'TELEGRAM' }).success,
    ).toBe(false);
  });

  it('từ chối tên rỗng sau khi cắt khoảng trắng', () => {
    expect(updateProfileSchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });

  it('từ chối thông tin liên hệ dài hơn 64 ký tự', () => {
    expect(
      updateProfileSchema.safeParse({ messagingHandle: 'a'.repeat(65) }).success,
    ).toBe(false);
  });
});

describe('updateProfileSchema — lời giới thiệu và địa chỉ', () => {
  it('cắt khoảng trắng thừa hai đầu', () => {
    const r = updateProfileSchema.parse({ bio: '  Thích cà phê sáng  ' });
    expect(r.bio).toBe('Thích cà phê sáng');
  });

  it('chuỗi rỗng và chuỗi toàn khoảng trắng đều thành null — đó là cách XOÁ', () => {
    expect(updateProfileSchema.parse({ bio: '' }).bio).toBeNull();
    expect(updateProfileSchema.parse({ bio: '   ' }).bio).toBeNull();
    expect(updateProfileSchema.parse({ address: '\t\n ' }).address).toBeNull();
  });

  it('không gửi lên thì là undefined — GIỮ NGUYÊN, khác hẳn với xoá', () => {
    const r = updateProfileSchema.parse({ displayName: 'An' });
    expect(r.bio).toBeUndefined();
    expect(r.address).toBeUndefined();
  });

  it('từ chối khi vượt trần độ dài', () => {
    const tooLongBio = updateProfileSchema.safeParse({ bio: 'a'.repeat(BIO_MAX_LENGTH + 1) });
    expect(tooLongBio.success).toBe(false);

    const okBio = updateProfileSchema.safeParse({ bio: 'a'.repeat(BIO_MAX_LENGTH) });
    expect(okBio.success).toBe(true);

    const tooLongAddress = updateProfileSchema.safeParse({
      address: 'a'.repeat(ADDRESS_MAX_LENGTH + 1),
    });
    expect(tooLongAddress.success).toBe(false);
  });

  it('đo độ dài SAU khi cắt khoảng trắng — không tính khoảng trắng thừa vào trần', () => {
    const r = updateProfileSchema.safeParse({
      bio: '   ' + 'a'.repeat(BIO_MAX_LENGTH) + '   ',
    });
    expect(r.success).toBe(true);
  });

  it('giữ nguyên dấu tiếng Việt và emoji, đếm theo ký tự chứ không theo byte', () => {
    const r = updateProfileSchema.parse({ address: 'Số 1 Đại Cồ Việt, Hà Nội 🏠' });
    expect(r.address).toBe('Số 1 Đại Cồ Việt, Hà Nội 🏠');
  });

  it('gửi null tường minh cũng là xoá', () => {
    expect(updateProfileSchema.parse({ bio: null }).bio).toBeNull();
  });

  it('chỉ gửi mỗi bio vẫn hợp lệ — không bị coi là body rỗng', () => {
    expect(updateProfileSchema.safeParse({ bio: 'xin chào' }).success).toBe(true);
  });
});
