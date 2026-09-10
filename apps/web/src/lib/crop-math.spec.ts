import { describe, expect, it } from 'vitest';
import { clampOffset, coverScale, cropRegionFor, fitFrame, maxOffset, type CropView } from './crop-math';

/** Ảnh ngang 4000×3000 (tỉ lệ 4:3) trong khung vuông 300×300 trên màn hình. */
const base: CropView = {
  imageW: 4000,
  imageH: 3000,
  frameW: 300,
  frameH: 300,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

describe('coverScale', () => {
  it('lấy cạnh NGẮN của ảnh để phủ kín khung', () => {
    // 300/3000 = 0,1 lớn hơn 300/4000 = 0,075 ⇒ chọn 0,1
    expect(coverScale(base)).toBeCloseTo(0.1, 6);
  });

  it('ảnh rỗng thì trả 1 thay vì Infinity', () => {
    expect(coverScale({ ...base, imageW: 0, imageH: 0 })).toBe(1);
  });
});

describe('cropRegionFor', () => {
  it('ở mức 1× và chưa kéo: cắt đúng ô vuông giữa ảnh', () => {
    const r = cropRegionFor(base);
    expect(r.sw).toBeCloseTo(3000, 3);
    expect(r.sh).toBeCloseTo(3000, 3);
    // Ảnh rộng 4000, ô vuông 3000 ⇒ chừa 500px mỗi bên.
    expect(r.sx).toBeCloseTo(500, 3);
    expect(r.sy).toBeCloseTo(0, 3);
  });

  it('kéo ảnh sang PHẢI thì vùng cắt dịch sang TRÁI', () => {
    const r = cropRegionFor({ ...base, offsetX: 50 });
    // 50px màn hình ÷ tỉ lệ 0,1 = 500px ảnh
    expect(r.sx).toBeCloseTo(0, 3);
  });

  it('không cho kéo lố ra ngoài mép ảnh', () => {
    const r = cropRegionFor({ ...base, offsetX: 99_999 });
    expect(r.sx).toBeCloseTo(0, 3);
    expect(r.sx + r.sw).toBeLessThanOrEqual(base.imageW);
  });

  it('phóng to 2× thì vùng cắt nhỏ đi một nửa', () => {
    const r = cropRegionFor({ ...base, zoom: 2 });
    expect(r.sw).toBeCloseTo(1500, 3);
    expect(r.sh).toBeCloseTo(1500, 3);
  });

  it('mức phóng nhỏ hơn 1 bị coi như 1 — không cho hở mép', () => {
    const shrunk = cropRegionFor({ ...base, zoom: 0.3 });
    const normal = cropRegionFor(base);
    expect(shrunk.sw).toBeCloseTo(normal.sw, 3);
  });

  it('khung 4:5 trên ảnh dọc vẫn cắt trọn chiều rộng', () => {
    const r = cropRegionFor({
      ...base,
      imageW: 3000,
      imageH: 4000,
      frameW: 320,
      frameH: 400,
    });
    expect(r.sw).toBeCloseTo(3000, 3);
    expect(r.sh).toBeCloseTo(3750, 3);
  });

  it('khung đúng tỉ lệ ảnh thì lấy trọn ảnh', () => {
    const r = cropRegionFor({ ...base, frameW: 400, frameH: 300 });
    expect(r.sx).toBeCloseTo(0, 3);
    expect(r.sy).toBeCloseTo(0, 3);
    expect(r.sw).toBeCloseTo(4000, 3);
    expect(r.sh).toBeCloseTo(3000, 3);
  });

  it('kích thước hỏng (0) thì trả về cả ảnh chứ không ném lỗi', () => {
    const r = cropRegionFor({ ...base, imageW: 0, frameW: 0, frameH: 0 });
    expect(r.sw).toBeGreaterThan(0);
    expect(r.sh).toBeGreaterThan(0);
  });
});

describe('maxOffset / clampOffset', () => {
  it('ở 1×, trục vừa khít có biên bằng 0', () => {
    // Ảnh ngang trong khung vuông: chiều cao vừa khít ⇒ không kéo dọc được.
    expect(maxOffset(base).y).toBeCloseTo(0, 6);
    expect(maxOffset(base).x).toBeCloseTo(50, 6);
  });

  it('kẹp cả hai chiều âm dương', () => {
    expect(clampOffset({ ...base, offsetX: 999 }).x).toBeCloseTo(50, 6);
    expect(clampOffset({ ...base, offsetX: -999 }).x).toBeCloseTo(-50, 6);
  });
});

describe('fitFrame', () => {
  it('lấp hết bề ngang khi chiều cao còn dư', () => {
    expect(fitFrame(1, 350, 500)).toEqual({ width: 350, height: 350 });
  });

  it('hạ theo chiều cao khi khung quá cao', () => {
    expect(fitFrame(4 / 5, 350, 400)).toEqual({ width: 320, height: 400 });
  });

  it('tỉ lệ hỏng thì vẫn trả khung dùng được', () => {
    const f = fitFrame(Number.NaN, 350, 400);
    expect(f.width).toBe(350);
    expect(f.height).toBeGreaterThan(0);
  });
});
