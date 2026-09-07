import { describe, expect, it } from 'vitest';
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
