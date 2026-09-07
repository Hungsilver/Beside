import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

/** Cấu hình dev hợp lệ, dùng làm điểm xuất phát cho mọi test. */
const DEV = {
  NODE_ENV: 'development',
  API_PORT: '3000',
  DATABASE_URL: 'postgresql://beside:beside_dev_pw_2026@localhost:5432/beside?schema=public',
  JWT_ACCESS_SECRET: 'dev_access_secret_khong_dung_cho_production_32',
  JWT_REFRESH_SECRET: 'dev_refresh_secret_khac_access_khong_dung_that_32',
  APP_ORIGIN: 'http://localhost:5173',
  COOKIE_DOMAIN: 'localhost',
  CORS_EXTRA_ORIGINS: 'http://localhost:4173',
};

/** Cấu hình production thật, tất cả secret đều "sạch". */
const PROD = {
  NODE_ENV: 'production',
  API_PORT: '3000',
  DATABASE_URL: 'postgresql://beside:kJ8vQm2ZpRxT4nLwYb7Hc@db:5432/beside?schema=public',
  JWT_ACCESS_SECRET: 'qN7vK2mP9xR4tL8wZbY3hJ6cF1sD5gA0uE',
  JWT_REFRESH_SECRET: 'zB4nM8kQ2wX7pL5vR9tH3jC6yF0sG1dU4a',
  APP_ORIGIN: 'https://easytech.io.vn',
  COOKIE_DOMAIN: 'easytech.io.vn',
};

const errorOf = (raw: Record<string, unknown>): string => {
  try {
    validateEnv(raw);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
};

describe('validateEnv — luật chung', () => {
  it('cấu hình dev hợp lệ thì qua', () => {
    expect(() => validateEnv(DEV)).not.toThrow();
  });

  it('cấu hình production sạch thì qua', () => {
    expect(() => validateEnv(PROD)).not.toThrow();
  });

  it('hai JWT secret trùng nhau thì từ chối', () => {
    const msg = errorOf({ ...DEV, JWT_REFRESH_SECRET: DEV.JWT_ACCESS_SECRET });
    expect(msg).toContain('JWT_REFRESH_SECRET');
  });

  it('secret ngắn hơn 32 ký tự thì từ chối', () => {
    expect(errorOf({ ...DEV, JWT_ACCESS_SECRET: 'ngan' })).toContain('32');
  });

  it('production mà dùng http:// thì từ chối', () => {
    const msg = errorOf({ ...PROD, APP_ORIGIN: 'http://easytech.io.vn' });
    expect(msg).toContain('https://');
  });

  it('thiếu DATABASE_URL thì từ chối', () => {
    const { DATABASE_URL: _omit, ...rest } = DEV;
    expect(errorOf(rest)).toContain('DATABASE_URL');
  });
});

describe('validateEnv — rào chắn production', () => {
  it('KHÔNG áp luật production cho localhost, để `npm run docker:up` vẫn chạy được', () => {
    // Chạy full stack trên máy dev: NODE_ENV=production nhưng phục vụ localhost
    // và dùng secret dev — phải cho qua, nếu không máy dev không khởi động được.
    expect(() =>
      validateEnv({
        ...DEV,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://localhost',
        COOKIE_DOMAIN: 'localhost',
      }),
    ).not.toThrow();
  });

  it('CHẶN khi mang nguyên secret của máy dev lên domain thật', () => {
    // Đây là kịch bản dễ xảy ra nhất: scp .env từ máy dev lên VPS cho nhanh.
    const msg = errorOf({
      ...PROD,
      JWT_ACCESS_SECRET: DEV.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: DEV.JWT_REFRESH_SECRET,
    });
    expect(msg).toContain('JWT_ACCESS_SECRET');
    expect(msg).toContain('openssl rand');
  });

  it('CHẶN các giá trị mẫu còn sót trong .env.example', () => {
    for (const placeholder of [
      'doi-gia-tri-nay-access-secret-toi-thieu-32-ky-tu',
      'change-me-please-32-characters-long-value',
      'example-secret-value-32-characters-long!!',
    ]) {
      expect(errorOf({ ...PROD, JWT_ACCESS_SECRET: placeholder })).toContain(
        'JWT_ACCESS_SECRET',
      );
    }
  });

  it('CHẶN secret chỉ gồm vài ký tự lặp lại', () => {
    expect(errorOf({ ...PROD, JWT_ACCESS_SECRET: 'a'.repeat(40) })).toContain(
      'JWT_ACCESS_SECRET',
    );
    expect(errorOf({ ...PROD, JWT_ACCESS_SECRET: '1212121212121212121212121212121212' })).toContain(
      'JWT_ACCESS_SECRET',
    );
  });

  it('CHẶN mật khẩu database còn là giá trị để tạm', () => {
    const msg = errorOf({
      ...PROD,
      DATABASE_URL: 'postgresql://beside:doi-gia-tri-nay-postgres@db:5432/beside',
    });
    expect(msg).toContain('DATABASE_URL');
  });

  it('CHẶN COOKIE_DOMAIN lệch với APP_ORIGIN', () => {
    // Lệch thì trình duyệt vứt cookie refresh → đăng nhập xong bị đá ra ngay.
    const msg = errorOf({ ...PROD, COOKIE_DOMAIN: 'domain-khac.com' });
    expect(msg).toContain('COOKIE_DOMAIN');
    expect(msg).toContain('đá ra ngay');
  });

  it('cho phép COOKIE_DOMAIN là domain cha', () => {
    expect(() =>
      validateEnv({
        ...PROD,
        APP_ORIGIN: 'https://app.easytech.io.vn',
        COOKIE_DOMAIN: 'easytech.io.vn',
      }),
    ).not.toThrow();
    // Kiểu ghi có dấu chấm đầu cũng hợp lệ
    expect(() =>
      validateEnv({ ...PROD, COOKIE_DOMAIN: '.easytech.io.vn' }),
    ).not.toThrow();
  });

  it('CHẶN mở CORS cho localhost hoặc http:// ở production', () => {
    expect(
      errorOf({ ...PROD, CORS_EXTRA_ORIGINS: 'http://localhost:5173' }),
    ).toContain('CORS_EXTRA_ORIGINS');
    expect(
      errorOf({ ...PROD, CORS_EXTRA_ORIGINS: 'https://a.com,http://b.com' }),
    ).toContain('CORS_EXTRA_ORIGINS');
  });

  it('vẫn cho phép origin https bên ngoài (ví dụ domain cũ khi đang chuyển)', () => {
    expect(() =>
      validateEnv({ ...PROD, CORS_EXTRA_ORIGINS: 'https://beside.vn' }),
    ).not.toThrow();
  });

  it('thông báo lỗi nói rõ biến nào sai để sửa được ngay', () => {
    const msg = errorOf({
      ...PROD,
      JWT_ACCESS_SECRET: 'change-me-1234567890123456789012345',
      COOKIE_DOMAIN: 'sai.com',
    });
    expect(msg).toContain('Cấu hình môi trường không hợp lệ');
    expect(msg).toContain('JWT_ACCESS_SECRET');
    expect(msg).toContain('COOKIE_DOMAIN');
  });
});
