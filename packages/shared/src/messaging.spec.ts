import { describe, expect, it } from 'vitest';
import { buildMessagingUrl, normalizeVnPhone } from './messaging';

describe('normalizeVnPhone', () => {
  it('chấp nhận các cách viết số VN thường gặp', () => {
    expect(normalizeVnPhone('0912345678')).toBe('84912345678');
    expect(normalizeVnPhone('+84912345678')).toBe('84912345678');
    expect(normalizeVnPhone('84912345678')).toBe('84912345678');
    expect(normalizeVnPhone('091 234 5678')).toBe('84912345678');
    expect(normalizeVnPhone('091-234-5678')).toBe('84912345678');
  });

  it('từ chối số sai độ dài hoặc chuỗi rác', () => {
    expect(normalizeVnPhone('')).toBeNull();
    expect(normalizeVnPhone('091234')).toBeNull();
    expect(normalizeVnPhone('09123456789012')).toBeNull();
    expect(normalizeVnPhone('không phải số')).toBeNull();
  });
});

describe('buildMessagingUrl', () => {
  it('sinh link https cho Zalo (không dùng scheme riêng zalo://)', () => {
    expect(buildMessagingUrl({ app: 'ZALO', handle: '0912345678' })).toBe(
      'https://zalo.me/84912345678',
    );
  });

  it('Messenger dùng username, bỏ @ ở đầu', () => {
    expect(buildMessagingUrl({ app: 'MESSENGER', handle: '@nguyen.an' })).toBe(
      'https://m.me/nguyen.an',
    );
    expect(buildMessagingUrl({ app: 'MESSENGER', handle: 'an.nguyen99' })).toBe(
      'https://m.me/an.nguyen99',
    );
  });

  it('Messenger TỪ CHỐI số điện thoại — lỗi người dùng hay mắc nhất', () => {
    // m.me/0912345678 là link hỏng; phải chặn ngay chứ không để người dùng
    // tưởng đã cấu hình xong.
    expect(buildMessagingUrl({ app: 'MESSENGER', handle: '0912345678' })).toBeNull();
    expect(buildMessagingUrl({ app: 'MESSENGER', handle: '+84912345678' })).toBeNull();
    // Username phải bắt đầu bằng chữ cái
    expect(buildMessagingUrl({ app: 'MESSENGER', handle: '9nguyenan' })).toBeNull();
    expect(buildMessagingUrl({ app: 'MESSENGER', handle: '.nguyenan' })).toBeNull();
    // Facebook yêu cầu tối thiểu 5 ký tự
    expect(buildMessagingUrl({ app: 'MESSENGER', handle: 'an.b' })).toBeNull();
  });

  it('trả null khi chưa cấu hình — giao diện phải ẩn nút', () => {
    expect(buildMessagingUrl({ app: 'ZALO', handle: null })).toBeNull();
    expect(buildMessagingUrl({ app: 'ZALO', handle: '   ' })).toBeNull();
    expect(buildMessagingUrl({ app: 'ZALO', handle: 'không phải số' })).toBeNull();
  });

  it('gọi điện và SMS dùng số quốc tế có dấu cộng', () => {
    expect(buildMessagingUrl({ app: 'PHONE', handle: '0912345678' })).toBe(
      'tel:+84912345678',
    );
    expect(buildMessagingUrl({ app: 'SMS', handle: '0912345678' })).toBe(
      'sms:+84912345678',
    );
  });
});
