import type { StyleSpecification } from 'maplibre-gl';

/**
 * Các loại bản đồ người dùng chọn được.
 *
 * Tiêu chí chọn nguồn (ARCHITECTURE.md §3.2): **miễn phí, không cần API key,
 * không phải gắn thẻ tín dụng**. Đó là lý do dự án chọn MapLibre thay vì Google
 * Maps ngay từ đầu; thêm một nguồn cần key sẽ phá chính quyết định đó.
 *
 * KHÔNG có lớp giao thông. Dữ liệu kẹt xe theo thời gian thực chỉ Google /
 * TomTom / HERE / Mapbox có, và cả bốn đều đòi key gắn billing.
 */

export type MapStyleId = 'street' | 'light' | 'dark' | 'satellite';

export interface MapStyleOption {
  id: MapStyleId;
  label: string;
  emoji: string;
  /** Nền tối → chấm và nhãn phải đổi màu cho đọc được. */
  dark: boolean;
}

export const MAP_STYLES: MapStyleOption[] = [
  { id: 'street', label: 'Đường phố', emoji: '🗺️', dark: false },
  { id: 'light', label: 'Tối giản', emoji: '🤍', dark: false },
  { id: 'dark', label: 'Ban đêm', emoji: '🌙', dark: true },
  { id: 'satellite', label: 'Vệ tinh', emoji: '🛰️', dark: true },
];

export const DEFAULT_MAP_STYLE: MapStyleId = 'street';

/** Nguồn vector của OpenFreeMap — cùng nhà, đổi qua lại rất nhanh. */
const OPENFREEMAP = 'https://tiles.openfreemap.org/styles';

/**
 * Style vệ tinh phải tự dựng bằng tay.
 *
 * Esri World Imagery phát tile **raster** chứ không có sẵn file style theo chuẩn
 * Mapbox Style Spec, nên ở đây mô tả trực tiếp một style tối thiểu. Miễn phí cho
 * dùng phi thương mại, điều kiện duy nhất là **ghi nguồn** — nên `attribution`
 * dưới đây là bắt buộc, không được bỏ.
 */
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        'Ảnh vệ tinh © Esri · Maxar, Earthstar Geographics, và cộng đồng người dùng GIS',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } },
    { id: 'esri-imagery', type: 'raster', source: 'esri-imagery' },
  ],
};

/**
 * Nguồn style cho MapLibre — chuỗi URL hoặc đối tượng style.
 *
 * `VITE_MAP_STYLE_URL` vẫn được tôn trọng cho loại "Đường phố": ai muốn tự host
 * tile (Phase 6, PMTiles) chỉ cần đổi biến môi trường, không phải sửa code.
 */
export function styleSourceFor(id: MapStyleId): string | StyleSpecification {
  switch (id) {
    case 'satellite':
      return SATELLITE_STYLE;
    case 'light':
      return `${OPENFREEMAP}/positron`;
    case 'dark':
      return `${OPENFREEMAP}/dark`;
    case 'street':
    default:
      return (
        (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ??
        `${OPENFREEMAP}/liberty`
      );
  }
}

export function isDarkStyle(id: MapStyleId): boolean {
  return MAP_STYLES.find((s) => s.id === id)?.dark ?? false;
}

// ---------------------------------------------------------------------------
// Ghi nhớ lựa chọn
// ---------------------------------------------------------------------------

const STYLE_KEY = 'beside:map-style';
const PINS_KEY = 'beside:map-photo-pins';

/**
 * Đọc/ghi qua `localStorage`, bọc try/catch vì chế độ ẩn danh của một số trình
 * duyệt ném lỗi ngay khi chạm vào. Mất lựa chọn thì chỉ là bất tiện nhỏ, không
 * được để nó làm hỏng cả màn bản đồ.
 */
export function readSavedStyle(): MapStyleId {
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    return MAP_STYLES.some((s) => s.id === raw) ? (raw as MapStyleId) : DEFAULT_MAP_STYLE;
  } catch {
    return DEFAULT_MAP_STYLE;
  }
}

export function saveStyle(id: MapStyleId): void {
  try {
    localStorage.setItem(STYLE_KEY, id);
  } catch {
    /* bỏ qua */
  }
}

export function readSavedPhotoPins(): boolean {
  try {
    // Mặc định BẬT: người dùng mới nên thấy ảnh của mình trên bản đồ.
    return localStorage.getItem(PINS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function savePhotoPins(on: boolean): void {
  try {
    localStorage.setItem(PINS_KEY, on ? 'on' : 'off');
  } catch {
    /* bỏ qua */
  }
}
