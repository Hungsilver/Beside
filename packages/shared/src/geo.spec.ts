import { describe, expect, it } from 'vitest';
import {
  bearingDegrees,
  circlePolygon,
  haversineMeters,
  isValidLatLng,
  snapToGrid,
} from './geo';

// Toạ độ thật trong bộ dữ liệu giả định của dự án
const NHA_AN = { lat: 10.7769, lng: 106.7009 }; // Quận 1
const CONG_TY_BINH = { lat: 10.8231, lng: 106.6297 }; // Quận 3

describe('haversineMeters', () => {
  it('khớp với kết quả PostGIS cho tuyến Quận 1 → Quận 3', () => {
    // PostGIS ST_Distance trả 9313,7 m; haversine sai lệch < 0,5% là đạt
    const d = haversineMeters(NHA_AN, CONG_TY_BINH);
    expect(d).toBeGreaterThan(9260);
    expect(d).toBeLessThan(9360);
  });

  it('hai điểm trùng nhau thì bằng 0', () => {
    expect(haversineMeters(NHA_AN, NHA_AN)).toBe(0);
  });

  it('đối xứng', () => {
    expect(haversineMeters(NHA_AN, CONG_TY_BINH)).toBeCloseTo(
      haversineMeters(CONG_TY_BINH, NHA_AN),
      6,
    );
  });

  it('1 độ vĩ độ ≈ 111 km', () => {
    const d = haversineMeters({ lat: 10, lng: 106 }, { lat: 11, lng: 106 });
    expect(d).toBeGreaterThan(110_500);
    expect(d).toBeLessThan(111_500);
  });

  it('chính xác ở khoảng cách rất nhỏ (vài mét) — quan trọng cho lọc nhiễu', () => {
    // 0,00001 độ vĩ ≈ 1,11 m
    const d = haversineMeters({ lat: 10.7769, lng: 106.7009 }, { lat: 10.77691, lng: 106.7009 });
    expect(d).toBeGreaterThan(1.0);
    expect(d).toBeLessThan(1.2);
  });
});

describe('bearingDegrees', () => {
  it('đi thẳng lên phía Bắc là 0 độ', () => {
    expect(bearingDegrees({ lat: 10, lng: 106 }, { lat: 11, lng: 106 })).toBeCloseTo(0, 1);
  });

  it('đi thẳng sang Đông là ~90 độ', () => {
    // Không đúng CHẴN 90: đường ngắn nhất giữa hai điểm cùng vĩ độ là cung lớn,
    // hơi cong về phía cực, nên hướng ban đầu lệch xuống dưới 90 một chút.
    const b = bearingDegrees({ lat: 10, lng: 106 }, { lat: 10, lng: 107 });
    expect(b).toBeGreaterThan(89.5);
    expect(b).toBeLessThanOrEqual(90);
  });

  it('luôn nằm trong [0, 360)', () => {
    const b = bearingDegrees({ lat: 10, lng: 106 }, { lat: 9, lng: 105 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('snapToGrid — làm mờ vị trí', () => {
  it('cùng một chỗ luôn cho ra cùng một toạ độ (ổn định, không nhảy)', () => {
    const a = snapToGrid(NHA_AN, 500);
    const b = snapToGrid(NHA_AN, 500);
    expect(a).toEqual(b);
  });

  it('điểm sau khi làm mờ nằm trong bán kính đã khai báo', () => {
    // Nửa đường chéo ô lưới = radius * √2 / 2 ≈ 0,71 * radius
    for (let i = 0; i < 200; i += 1) {
      const p = { lat: 10.7 + i * 0.0007, lng: 106.7 + i * 0.0009 };
      expect(haversineMeters(p, snapToGrid(p, 500))).toBeLessThan(500);
    }
  });

  it('hai điểm cách nhau vài mét bị gộp về cùng một ô — không suy ngược được vị trí thật', () => {
    const p1 = { lat: 10.77690, lng: 106.70090 };
    const p2 = { lat: 10.77695, lng: 106.70093 }; // cách ~6 m
    expect(snapToGrid(p1, 500)).toEqual(snapToGrid(p2, 500));
  });

  it('lấy trung bình nhiều mẫu KHÔNG suy ngược được vị trí thật', () => {
    // Mô phỏng kẻ quan sát: thu 200 phép đo quanh một vị trí (nhiễu GPS ±20 m)
    // rồi gom lại. Nếu lưới ổn định thì tất cả chỉ rơi vào một vài ô.
    const truth = { lat: 10.776901, lng: 106.700903 };
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const noisy = {
        lat: truth.lat + Math.sin(i * 1.7) * 0.00018,
        lng: truth.lng + Math.cos(i * 2.3) * 0.00018,
      };
      const g = snapToGrid(noisy, 500);
      seen.add(g.lat.toFixed(9) + ',' + g.lng.toFixed(9));
    }
    expect(seen.size).toBeLessThanOrEqual(2);
  });

  it('bán kính 0 hoặc không hợp lệ thì giữ nguyên toạ độ', () => {
    expect(snapToGrid(NHA_AN, 0)).toEqual(NHA_AN);
    expect(snapToGrid(NHA_AN, -100)).toEqual(NHA_AN);
    expect(snapToGrid(NHA_AN, Number.NaN)).toEqual(NHA_AN);
  });
});

describe('isValidLatLng', () => {
  it('chấp nhận toạ độ hợp lệ', () => {
    expect(isValidLatLng(NHA_AN)).toBe(true);
  });

  it('từ chối (0,0) — gần như luôn là lỗi thiết bị chứ không phải vị trí thật', () => {
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(false);
  });

  it('từ chối toạ độ ngoài khoảng và giá trị không phải số', () => {
    expect(isValidLatLng({ lat: 91, lng: 106 })).toBe(false);
    expect(isValidLatLng({ lat: 10, lng: 181 })).toBe(false);
    expect(isValidLatLng({ lat: Number.NaN, lng: 106 })).toBe(false);
    expect(isValidLatLng({ lat: 10, lng: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('circlePolygon', () => {
  const HA_NOI = { lat: 21.0278, lng: 105.8342 };

  it('vành khép kín — GeoJSON Polygon bắt buộc điểm cuối trùng điểm đầu', () => {
    const ring = circlePolygon(NHA_AN, 150);
    expect(ring.length).toBeGreaterThan(8);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('MỌI điểm trên vành đều cách tâm đúng bán kính', () => {
    const radiusM = 150;
    const ring = circlePolygon(NHA_AN, radiusM);
    for (const [lng, lat] of ring) {
      const d = haversineMeters(NHA_AN, { lat, lng });
      // Sai số dưới 0,5 m trên bán kính 150 m
      expect(Math.abs(d - radiusM)).toBeLessThan(0.5);
    }
  });

  it('đúng cả ở vĩ độ cao, nơi 1 độ kinh ngắn hơn hẳn 1 độ vĩ', () => {
    // Nếu ai đó "làm cho nhanh" bằng cách cộng thẳng độ vào lat/lng thì vòng
    // tròn ở Hà Nội sẽ méo thành hình elip. Test này khoá lại điều đó.
    const ring = circlePolygon(HA_NOI, 500);
    for (const [lng, lat] of ring) {
      expect(Math.abs(haversineMeters(HA_NOI, { lat, lng }) - 500)).toBeLessThan(1);
    }
  });

  it('bán kính lớn 2km vẫn đúng', () => {
    const ring = circlePolygon(NHA_AN, 2000);
    const d = haversineMeters(NHA_AN, { lat: ring[0]![1], lng: ring[0]![0] });
    expect(Math.abs(d - 2000)).toBeLessThan(2);
  });

  it('số cạnh được kẹp trong khoảng hợp lý', () => {
    // Quá ít cạnh thì thành đa giác thô; quá nhiều thì tốn công vẽ vô ích.
    expect(circlePolygon(NHA_AN, 150, 2).length).toBe(8 + 1);
    expect(circlePolygon(NHA_AN, 150, 10_000).length).toBe(256 + 1);
  });

  it('đầu vào vô nghĩa trả mảng rỗng chứ không ném lỗi', () => {
    expect(circlePolygon(NHA_AN, 0)).toEqual([]);
    expect(circlePolygon(NHA_AN, -5)).toEqual([]);
    expect(circlePolygon(NHA_AN, Number.NaN)).toEqual([]);
    expect(circlePolygon({ lat: 999, lng: 0 }, 150)).toEqual([]);
  });

  it('kinh độ luôn nằm trong dải hợp lệ, kể cả khi vắt qua kinh tuyến 180', () => {
    // Không chuẩn hoá thì vòng tròn ở đây vẽ ra một vệt vòng quanh Trái Đất.
    const ring = circlePolygon({ lat: 0, lng: 179.99 }, 2000);
    for (const [lng] of ring) {
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
  });
});
