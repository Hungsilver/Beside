import { describe, expect, it } from 'vitest';
import { parseDuration } from './token.service';
import { extractBearerToken } from './jwt-auth.guard';

describe('parseDuration', () => {
  it('đọc được các đơn vị', () => {
    expect(parseDuration('45s')).toBe(45);
    expect(parseDuration('15m')).toBe(900);
    expect(parseDuration('2h')).toBe(7200);
    expect(parseDuration('1d')).toBe(86400);
  });

  it('số trần không đơn vị được hiểu là giây', () => {
    expect(parseDuration('900')).toBe(900);
  });

  it('bỏ qua khoảng trắng và không phân biệt hoa thường', () => {
    expect(parseDuration(' 15M ')).toBe(900);
  });

  it('cấu hình sai thì rơi về mặc định 15 phút thay vì NaN', () => {
    expect(parseDuration('')).toBe(900);
    expect(parseDuration('mot-tieng')).toBe(900);
    expect(parseDuration('15 phut')).toBe(900);
  });
});

describe('extractBearerToken', () => {
  it('lấy được token hợp lệ', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('không phân biệt hoa thường ở từ khoá Bearer', () => {
    expect(extractBearerToken('bearer abc')).toBe('abc');
    expect(extractBearerToken('BEARER abc')).toBe('abc');
  });

  it('trả null với header thiếu hoặc sai định dạng', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('abc')).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
    expect(extractBearerToken('Bearer    ')).toBeNull();
  });
});
