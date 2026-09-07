/**
 * Phép tính địa lý dùng chung giữa API và web.
 * Không phụ thuộc thư viện bản đồ nào — chạy được cả ở Node lẫn trình duyệt.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8; // bán kính trung bình theo IUGG

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Khoảng cách giữa hai điểm, tính bằng mét (công thức haversine).
 *
 * Sai số ~0,5% do coi Trái Đất là hình cầu — thừa chính xác cho việc
 * "cách nhau bao xa" và "đã đi được bao nhiêu mét".
 * Các phép geofence nghiêm ngặt thì dùng PostGIS `ST_DWithin` ở server.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Hướng đi từ a tới b, tính theo độ (0 = Bắc, 90 = Đông). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Làm mờ vị trí bằng cách "bắt" toạ độ vào lưới ô vuông cạnh ~radiusM.
 *
 * Vì sao dùng lưới chứ không cộng một độ lệch ngẫu nhiên:
 * nếu lệch ngẫu nhiên mỗi lần gửi thì người đứng yên sẽ thấy chấm nhảy loạn xạ,
 * và kẻ quan sát chỉ cần lấy trung bình nhiều mẫu là suy ra được vị trí thật.
 * Bắt vào lưới thì cùng một chỗ luôn ra cùng một toạ độ — ổn định và không rò rỉ.
 */
export function snapToGrid(point: LatLng, radiusM: number): LatLng {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return point;

  // 1 độ vĩ độ ≈ 111.320 m ở mọi nơi.
  const latStep = radiusM / 111_320;
  const snappedLat = Math.round(point.lat / latStep) * latStep;

  // 1 độ kinh độ co lại theo cos(vĩ độ); chặn dưới để không chia cho ~0 ở gần cực.
  //
  // Phải tính theo vĩ độ ĐÃ LÀM TRÒN, không phải vĩ độ gốc. Nếu dùng vĩ độ gốc
  // thì bước lưới kinh độ đổi theo từng phép đo, hai điểm cách nhau vài mét sẽ
  // cho ra hai toạ độ khác nhau — kẻ quan sát chỉ cần lấy trung bình nhiều mẫu
  // là suy ngược được vị trí thật, tức là việc làm mờ mất tác dụng.
  const lngStep = radiusM / (111_320 * Math.max(0.01, Math.cos(toRad(snappedLat))));

  return {
    lat: snappedLat,
    lng: Math.round(point.lng / lngStep) * lngStep,
  };
}

/** Toạ độ có nằm trong khoảng hợp lệ không (WGS84). */
export function isValidLatLng(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    // (0,0) là điểm giữa Đại Tây Dương — gần như chắc chắn là lỗi thiết bị
    // hoặc giá trị mặc định chưa gán, không phải vị trí thật của người dùng.
    !(p.lat === 0 && p.lng === 0)
  );
}
