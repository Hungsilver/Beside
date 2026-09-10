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

/**
 * Vòng tròn bán kính THẬT (mét) dưới dạng vành toạ độ `[lng, lat]`.
 *
 * Dùng để vẽ hàng rào địa điểm lên bản đồ. Lớp `circle` của MapLibre nhận bán
 * kính tính bằng **pixel**, nên phóng to thu nhỏ là vòng tròn sai hoàn toàn —
 * mà đây là một khoảng cách thật ngoài đời, phải co giãn theo bản đồ. Cách đúng
 * là dựng hẳn một đa giác theo toạ độ địa lý.
 *
 * Tính theo "điểm đến từ một điểm, một hướng và một khoảng cách" trên hình cầu.
 * Nhờ vậy vòng tròn vẫn đúng ở vĩ độ cao, nơi 1 độ kinh ngắn hơn 1 độ vĩ nhiều.
 *
 * Vành trả về **khép kín** (điểm cuối trùng điểm đầu) — GeoJSON Polygon bắt buộc.
 */
export function circlePolygon(
  center: LatLng,
  radiusM: number,
  steps = 64,
): [number, number][] {
  if (!isValidLatLng(center) || !Number.isFinite(radiusM) || radiusM <= 0) return [];

  const safeSteps = Math.max(8, Math.min(256, Math.round(steps)));
  const angular = radiusM / EARTH_RADIUS_M;
  const lat = toRad(center.lat);
  const lng = toRad(center.lng);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinAng = Math.sin(angular);
  const cosAng = Math.cos(angular);

  const ring: [number, number][] = [];
  for (let i = 0; i < safeSteps; i += 1) {
    const bearing = (2 * Math.PI * i) / safeSteps;
    const pointLat = Math.asin(sinLat * cosAng + cosLat * sinAng * Math.cos(bearing));
    const pointLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * sinAng * cosLat,
        cosAng - sinLat * Math.sin(pointLat),
      );
    // Đưa kinh độ về dải [-180, 180] để không vẽ ra một vệt vòng quanh Trái Đất
    // khi vòng tròn nằm vắt qua kinh tuyến 180.
    ring.push([((toDeg(pointLng) + 540) % 360) - 180, toDeg(pointLat)]);
  }
  ring.push(ring[0]!);
  return ring;
}

/**
 * Toạ độ dạng người đọc được: `10.776900, 106.700900`.
 *
 * Sáu chữ số thập phân ≈ 11 cm — thừa cho mọi mục đích hiển thị, và là dạng
 * Google Maps / Apple Maps nhận trực tiếp khi dán vào ô tìm kiếm.
 *
 * Cố ý KHÔNG dùng `toLocaleString`: dấu thập phân ở vi-VN là dấu phẩy, dán
 * `10,7769` vào Google Maps là ra một chỗ hoàn toàn khác.
 */
export function formatLatLng(point: LatLng, digits = 6): string {
  if (!isValidLatLng(point)) return '';
  return `${point.lat.toFixed(digits)}, ${point.lng.toFixed(digits)}`;
}

/**
 * Link chỉ đường Google Maps tới một toạ độ.
 *
 * Dùng cú pháp chính thức `maps/dir/?api=1` chứ không phải link `maps?q=` kiểu
 * cũ: bản `api=1` được Google cam kết giữ ổn định, mở đúng app Google Maps trên
 * cả iOS lẫn Android khi đã cài, và tự rơi về trang web khi chưa cài — cùng lý
 * do với nút nhắn tin ở §7.3 (không dùng scheme riêng `comgooglemaps://`).
 *
 * Trả `null` khi toạ độ không dùng được, để giao diện ẩn hẳn nút thay vì hiện
 * một nút bấm vào chẳng đi đâu.
 */
export function googleMapsDirectionsUrl(point: LatLng): string | null {
  if (!isValidLatLng(point)) return null;
  const dest = encodeURIComponent(`${point.lat},${point.lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/** Link xem một toạ độ trên Google Maps (không chỉ đường). */
export function googleMapsPlaceUrl(point: LatLng): string | null {
  if (!isValidLatLng(point)) return null;
  const q = encodeURIComponent(`${point.lat},${point.lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
