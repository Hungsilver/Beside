import { describe, expect, it } from 'vitest';
import {
  averageCycleDays,
  averagePeriodDays,
  CYCLE_LENGTH_DEFAULT,
  partnerView,
  periodLength,
  predictCycle,
} from './cycle';

/** Mốc "hôm nay" cố định: 11/09/2026 lúc 10:00 giờ VN (03:00Z). */
const TODAY = new Date('2026-09-11T03:00:00.000Z');

const entry = (startDate: string, endDate: string | null = null) => ({ startDate, endDate });

describe('averageCycleDays', () => {
  it('lấy trung bình khoảng cách giữa các lần bắt đầu', () => {
    // 01/06 → 29/06 (28) → 27/07 (28) → 26/08 (30)
    const r = averageCycleDays(['2026-06-01', '2026-06-29', '2026-07-27', '2026-08-26']);
    expect(r.days).toBe(29); // (28+28+30)/3 = 28,67 → 29
    expect(r.samples).toBe(3);
  });

  it('chưa có kỳ nào thì dùng mặc định 28 ngày', () => {
    expect(averageCycleDays([])).toEqual({ days: CYCLE_LENGTH_DEFAULT, samples: 0 });
  });

  it('một kỳ duy nhất cũng chưa đủ để tính trung bình', () => {
    expect(averageCycleDays(['2026-09-01']).samples).toBe(0);
  });

  it('bỏ qua khoảng cách quá dài — quên ghi mấy kỳ liền, không phải chu kỳ 4 tháng', () => {
    const r = averageCycleDays(['2026-01-01', '2026-06-01', '2026-06-29']);
    expect(r.samples).toBe(1);
    expect(r.days).toBe(28);
  });

  it('thứ tự đầu vào lộn xộn vẫn ra đúng', () => {
    const a = averageCycleDays(['2026-07-27', '2026-06-01', '2026-06-29']);
    const b = averageCycleDays(['2026-06-01', '2026-06-29', '2026-07-27']);
    expect(a).toEqual(b);
  });

  it('ngày hỏng thì bỏ qua, không làm vỡ phép tính', () => {
    expect(averageCycleDays(['khong-phai-ngay', '2026-06-01', '2026-06-29']).days).toBe(28);
  });
});

describe('periodLength / averagePeriodDays', () => {
  it('tính cả ngày đầu lẫn ngày cuối', () => {
    expect(periodLength('2026-09-01', '2026-09-05')).toBe(5);
  });

  it('chưa ghi ngày kết thúc thì chưa biết độ dài', () => {
    expect(periodLength('2026-09-01', null)).toBeNull();
  });

  it('ngày kết thúc trước ngày bắt đầu là dữ liệu hỏng', () => {
    expect(periodLength('2026-09-05', '2026-09-01')).toBeNull();
  });

  it('trung bình chỉ tính các kỳ đã đóng', () => {
    expect(
      averagePeriodDays([entry('2026-08-01', '2026-08-05'), entry('2026-09-01')]),
    ).toBe(5);
  });
});

describe('predictCycle', () => {
  it('chưa ghi kỳ nào → không đoán bừa', () => {
    const p = predictCycle([], {}, TODAY);
    expect(p.phase).toBe('UNKNOWN');
    expect(p.nextStartDate).toBeNull();
    expect(p.dayOfCycle).toBeNull();
  });

  it('đang trong kỳ (ngày 2/5)', () => {
    const p = predictCycle([entry('2026-09-10')], {}, TODAY);
    expect(p.dayOfCycle).toBe(2);
    expect(p.phase).toBe('PERIOD');
  });

  it('kỳ đã ghi ngày kết thúc thì tin vào đó, không dùng trung bình', () => {
    // Kỳ 10/09–10/09 (1 ngày) ⇒ hôm nay 11/09 KHÔNG còn trong kỳ nữa.
    const p = predictCycle([entry('2026-09-10', '2026-09-10')], {}, TODAY);
    expect(p.phase).not.toBe('PERIOD');
  });

  it('đếm ngược đúng tới kỳ tiếp theo', () => {
    // Bắt đầu 01/09, chu kỳ 28 ⇒ kỳ sau 29/09, hôm nay 11/09 ⇒ còn 18 ngày.
    const p = predictCycle([entry('2026-09-01', '2026-09-05')], {}, TODAY);
    expect(p.nextStartDate).toBe('2026-09-29');
    expect(p.daysUntilNext).toBe(18);
  });

  it('trễ kỳ thì nói thẳng là trễ, không nhảy sang chu kỳ sau', () => {
    // Bắt đầu 01/08, chu kỳ 28 ⇒ dự kiến 29/08, hôm nay 11/09 ⇒ trễ 13 ngày.
    const p = predictCycle([entry('2026-08-01', '2026-08-05')], {}, TODAY);
    expect(p.daysUntilNext).toBe(-13);
    expect(p.nextStartDate).toBe('2026-08-29');
  });

  it('người dùng tự đặt độ dài chu kỳ thì ưu tiên con số đó', () => {
    const p = predictCycle([entry('2026-09-01')], { cycleDays: 35 }, TODAY);
    expect(p.cycleDays).toBe(35);
    expect(p.nextStartDate).toBe('2026-10-06');
  });

  it('độ dài vô lý bị kẹp về dải hợp lệ', () => {
    expect(predictCycle([entry('2026-09-01')], { cycleDays: 900 }, TODAY).cycleDays).toBe(60);
    expect(predictCycle([entry('2026-09-01')], { cycleDays: 2 }, TODAY).cycleDays).toBe(18);
  });

  it('cửa sổ dễ thụ thai rơi quanh ngày rụng trứng ước tính', () => {
    // Chu kỳ 28 ⇒ rụng trứng ~ngày 14 ⇒ ngày 12 nằm trong cửa sổ.
    // Bắt đầu 31/08 ⇒ hôm nay 11/09 là ngày thứ 12.
    const p = predictCycle([entry('2026-08-31', '2026-09-04')], {}, TODAY);
    expect(p.dayOfCycle).toBe(12);
    expect(p.phase).toBe('FERTILE');
  });

  it('qua nửa đêm giờ VN vẫn đếm đúng ngày lịch', () => {
    // 00:30 ngày 11/09 giờ VN = 17:30Z ngày 10/09 — cái bẫy R2.
    const justAfterMidnight = new Date('2026-09-10T17:30:00.000Z');
    const p = predictCycle([entry('2026-09-10')], {}, justAfterMidnight);
    expect(p.dayOfCycle).toBe(2);
  });

  it('qua 29/02 năm nhuận vẫn đúng', () => {
    const p = predictCycle(
      [entry('2028-02-01')],
      { cycleDays: 28 },
      new Date('2028-03-01T03:00:00.000Z'),
    );
    expect(p.nextStartDate).toBe('2028-02-29');
  });
});

describe('partnerView — hàng rào riêng tư', () => {
  const prediction = predictCycle([entry('2026-09-10')], {}, TODAY);

  it('OFF: người ấy không thấy gì cả', () => {
    const v = partnerView('OFF', 'An', prediction);
    expect(v).toEqual({
      shared: false,
      level: 'OFF',
      name: null,
      phase: null,
      nextStartDate: null,
      daysUntilNext: null,
    });
  });

  it('SUMMARY: biết đang trong kỳ, KHÔNG biết ngày nào', () => {
    const v = partnerView('SUMMARY', 'An', prediction);
    expect(v.shared).toBe(true);
    expect(v.phase).toBe('PERIOD');
    expect(v.nextStartDate).toBeNull();
    // Số ngày còn lại cũng không được lộ: từ đó suy ngược ra ngày cụ thể.
    expect(v.daysUntilNext).toBeNull();
  });

  it('SUMMARY: ngoài kỳ và chưa sắp tới thì không nói gì', () => {
    const far = predictCycle([entry('2026-09-01', '2026-09-05')], {}, TODAY);
    expect(partnerView('SUMMARY', 'An', far).phase).toBeNull();
  });

  it('SUMMARY: sắp tới kỳ thì báo, vẫn không kèm ngày', () => {
    // Bắt đầu 15/08, chu kỳ 28 ⇒ kỳ sau 12/09, hôm nay 11/09 ⇒ còn 1 ngày.
    const soon = predictCycle([entry('2026-08-15', '2026-08-19')], {}, TODAY);
    const v = partnerView('SUMMARY', 'An', soon);
    expect(v.phase).toBe('LUTEAL');
    expect(v.nextStartDate).toBeNull();
  });

  it('FULL: thấy ngày dự kiến và số ngày còn lại', () => {
    const v = partnerView('FULL', 'An', prediction);
    expect(v.nextStartDate).toBe(prediction.nextStartDate);
    expect(v.daysUntilNext).toBe(prediction.daysUntilNext);
  });
});
