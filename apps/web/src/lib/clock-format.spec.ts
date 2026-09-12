import { describe, expect, it } from 'vitest';
import { centis, lapClock } from './clock-format';
import {
  DEFAULT_CLOCK_PREFS,
  MAX_DIM,
  clampDim,
  isNightHour,
} from './clock-prefs';

describe('centis', () => {
  it('lấy hai chữ số phần trăm giây', () => {
    expect(centis(0)).toBe('00');
    expect(centis(1234)).toBe('23');
    expect(centis(999)).toBe('99');
  });

  it('đệm 0 ở đầu', () => {
    // `1050ms` là 5 phần trăm giây — ra `5` thì đọc thành 50, lệch mười lần.
    expect(centis(1050)).toBe('05');
  });

  it('số âm và số hỏng đều về "00"', () => {
    expect(centis(-500)).toBe('00');
    expect(centis(Number.NaN)).toBe('00');
    expect(centis(Number.POSITIVE_INFINITY)).toBe('00');
  });
});

describe('lapClock', () => {
  it('dưới một giờ thì bỏ hẳn phần giờ', () => {
    expect(lapClock(754_300)).toBe('12:34,30');
    expect(lapClock(0)).toBe('00:00,00');
  });

  it('quá một giờ thì hiện giờ ở đầu', () => {
    // 1 giờ 02 phút 03 giây 40
    expect(lapClock(3_723_400)).toBe('1:02:03,40');
  });

  it('số âm và số hỏng về mốc 0 thay vì ra chuỗi vô nghĩa', () => {
    expect(lapClock(-1)).toBe('00:00,00');
    expect(lapClock(Number.NaN)).toBe('00:00,00');
  });
});

describe('clampDim', () => {
  it('kẹp vào khoảng cho phép', () => {
    expect(clampDim(0)).toBe(0);
    expect(clampDim(0.5)).toBe(0.5);
    expect(clampDim(MAX_DIM)).toBe(MAX_DIM);
  });

  it('vượt trần thì về trần — không bao giờ được tối 100%', () => {
    // Tối hẳn thì nút thoát biến mất và người dùng kẹt trong một màn hình đen.
    expect(clampDim(1)).toBe(MAX_DIM);
    expect(clampDim(9)).toBe(MAX_DIM);
  });

  it('giá trị hỏng quy về SÁNG NHẤT, không phải tối nhất', () => {
    // Mở app lên mà màn hình đen sì thì không ai biết vì sao.
    expect(clampDim(Number.NaN)).toBe(0);
    expect(clampDim('0.5')).toBe(0);
    expect(clampDim(undefined)).toBe(0);
    expect(clampDim(null)).toBe(0);
    expect(clampDim(-2)).toBe(0);
  });
});

describe('isNightHour', () => {
  it('khung giờ đêm bắc qua nửa đêm', () => {
    expect(isNightHour(21)).toBe(true);
    expect(isNightHour(23)).toBe(true);
    expect(isNightHour(0)).toBe(true);
    expect(isNightHour(5)).toBe(true);
  });

  it('ban ngày thì không', () => {
    expect(isNightHour(6)).toBe(false);
    expect(isNightHour(12)).toBe(false);
    expect(isNightHour(20)).toBe(false);
  });

  it('số hỏng thì KHÔNG bật chế độ đêm', () => {
    // Thà không tự làm tối còn hơn tự làm tối vì một giá trị vô nghĩa.
    expect(isNightHour(Number.NaN)).toBe(false);
  });
});

describe('DEFAULT_CLOCK_PREFS', () => {
  it('mở lần đầu là sáng nhất và giữ màn hình sáng', () => {
    // Hai mặc định này quyết định ấn tượng đầu tiên: đồng hồ để bàn mà mở ra
    // thấy tối hoặc màn hình tắt sau 30 giây thì coi như không dùng được.
    expect(DEFAULT_CLOCK_PREFS.dim).toBe(0);
    expect(DEFAULT_CLOCK_PREFS.keepAwake).toBe(true);
  });

  it('mức pin mặc định TẮT', () => {
    // Battery Status API chỉ có ở Chrome; bật sẵn thì phần lớn người dùng thấy
    // một tuỳ chọn bật nhưng không hiện gì.
    expect(DEFAULT_CLOCK_PREFS.showBattery).toBe(false);
  });
});
