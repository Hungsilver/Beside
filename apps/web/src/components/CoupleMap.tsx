import { useEffect, useRef } from 'react';
import maplibregl, { type LngLatLike, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLng, TrailPoint } from '@beside/shared';

const STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

/** Trung tâm TP.HCM — chỉ dùng khi chưa biết vị trí ai cả. */
const FALLBACK_CENTER: LngLatLike = [106.7009, 10.7769];

export interface MapMarker {
  id: string;
  label: string;
  point: LatLng;
  accuracyM: number;
  /** Vẽ vòng tròn sai số quanh chấm. */
  showAccuracy: boolean;
  color: 'rose' | 'blue';
  headingDeg?: number | null;
}

interface Props {
  markers: MapMarker[];
  trail?: TrailPoint[];
  /** Đổi giá trị này để buộc bản đồ căn lại khung nhìn. */
  recenterToken?: number;
  onMapReady?: () => void;
}

const COLORS = {
  rose: { fill: '#FF4D7D', ring: 'rgba(255,77,125,0.14)', stroke: 'rgba(255,77,125,0.35)' },
  blue: { fill: '#6A7BFF', ring: 'rgba(106,123,255,0.14)', stroke: 'rgba(106,123,255,0.35)' },
} as const;

/**
 * Bản đồ dùng MapLibre GL (ARCHITECTURE.md §3) — không dùng Google Maps.
 *
 * Marker được cập nhật theo kiểu mệnh lệnh (giữ trong ref), KHÔNG dựng lại
 * theo mỗi lần render React: dựng lại marker mỗi giây sẽ làm chấm nhấp nháy
 * và bản đồ giật.
 */
export default function CoupleMap({ markers, trail, recenterToken, onMapReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const readyRef = useRef(false);

  // ---------------------------------------------------------------- khởi tạo
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: FALLBACK_CENTER,
      zoom: 13,
      attributionControl: { compact: true },
      // Xoay/nghiêng bản đồ trên điện thoại hay bị kích hoạt nhầm khi vuốt hai ngón.
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      readyRef.current = true;

      // Nguồn + lớp cho vệt đường, tạo sẵn rỗng rồi cập nhật dữ liệu sau.
      map.addSource('trail', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FF4D7D',
          'line-width': 4,
          'line-opacity': 0.75,
          // Nét đứt cho thấy đây là đường ĐÃ ĐI QUA, không phải chỉ đường
          'line-dasharray': [0.4, 2],
        },
      });

      onMapReady?.();
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // Chỉ chạy một lần — bản đồ là tài nguyên nặng, không dựng lại theo props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();

    for (const m of markers) {
      seen.add(m.id);
      const lngLat: [number, number] = [m.point.lng, m.point.lat];
      const existing = markersRef.current.get(m.id);

      if (existing) {
        existing.setLngLat(lngLat);
        updateMarkerElement(existing.getElement(), m, map);
        continue;
      }

      const el = buildMarkerElement(m, map);
      const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
      markersRef.current.set(m.id, marker);
    }

    // Gỡ marker của người đã biến mất (ví dụ đối phương bật chế độ ẩn danh)
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [markers]);

  // Vòng tròn sai số phải đổi kích thước theo mức thu phóng, vì nó là
  // khoảng cách THẬT tính bằng mét chứ không phải kích thước cố định trên màn hình.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onZoom = () => {
      for (const m of markers) {
        const el = markersRef.current.get(m.id)?.getElement();
        if (el) updateAccuracyRing(el, m, map);
      }
    };
    map.on('zoom', onZoom);
    return () => {
      map.off('zoom', onZoom);
    };
  }, [markers]);

  // ---------------------------------------------------------------- vệt đường
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    const source = map.getSource('trail') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const coords = (trail ?? []).map(([lng, lat]) => [lng, lat]);
    source.setData(
      coords.length >= 2
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          }
        : { type: 'FeatureCollection', features: [] },
    );
  }, [trail]);

  // ---------------------------------------------------------------- căn khung nhìn
  useEffect(() => {
    const map = mapRef.current;
    if (!map || markers.length === 0) return;

    if (markers.length === 1) {
      map.easeTo({ center: [markers[0]!.point.lng, markers[0]!.point.lat], zoom: 15 });
      return;
    }

    // Nhiều người → khung nhìn ôm hết, chừa chỗ cho bảng kéo lên ở dưới.
    const bounds = new maplibregl.LngLatBounds();
    markers.forEach((m) => bounds.extend([m.point.lng, m.point.lat]));
    map.fitBounds(bounds, {
      padding: { top: 90, bottom: 300, left: 60, right: 60 },
      maxZoom: 16,
      duration: 700,
    });
  }, [markers, recenterToken]);

  return <div ref={containerRef} className="absolute inset-0" aria-label="Bản đồ" />;
}

// ---------------------------------------------------------------------------

function buildMarkerElement(m: MapMarker, map: MapLibreMap): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'relative flex items-center justify-center';

  const ring = document.createElement('div');
  ring.dataset.role = 'ring';
  ring.className = 'absolute rounded-full';
  wrap.appendChild(ring);

  const dot = document.createElement('div');
  dot.dataset.role = 'dot';
  dot.className =
    'relative flex size-11 items-center justify-center rounded-full border-[3px] border-white text-[15px] font-extrabold text-white shadow-[0_6px_18px_rgba(35,19,32,0.3)]';
  wrap.appendChild(dot);

  const label = document.createElement('span');
  label.dataset.role = 'label';
  label.className =
    'absolute -top-7 whitespace-nowrap rounded-full bg-white px-2.5 py-[3px] text-[10.5px] font-bold shadow-[0_2px_8px_rgba(35,19,32,0.18)]';
  wrap.appendChild(label);

  updateMarkerElement(wrap, m, map);
  return wrap;
}

function updateMarkerElement(el: HTMLElement, m: MapMarker, map: MapLibreMap): void {
  const c = COLORS[m.color];

  const dot = el.querySelector<HTMLElement>('[data-role="dot"]');
  if (dot) {
    dot.style.background = c.fill;
    dot.textContent = m.label.trim().charAt(0).toUpperCase() || '?';
  }

  const label = el.querySelector<HTMLElement>('[data-role="label"]');
  if (label) label.textContent = m.label;

  updateAccuracyRing(el, m, map);
}

function updateAccuracyRing(el: HTMLElement, m: MapMarker, map: MapLibreMap): void {
  const ring = el.querySelector<HTMLElement>('[data-role="ring"]');
  if (!ring) return;

  if (!m.showAccuracy || !Number.isFinite(m.accuracyM) || m.accuracyM <= 0) {
    ring.style.display = 'none';
    return;
  }

  const c = COLORS[m.color];
  const px = metersToPixels(m.accuracyM, m.point.lat, map.getZoom());
  // Dưới 20px thì vòng tròn chỉ làm rối, không cho biết thêm điều gì.
  const size = Math.min(320, Math.max(0, px * 2));

  ring.style.display = size < 20 ? 'none' : 'block';
  ring.style.width = `${size}px`;
  ring.style.height = `${size}px`;
  ring.style.background = c.ring;
  ring.style.border = `1.5px solid ${c.stroke}`;
}

/** Đổi mét sang pixel trên màn hình tại một vĩ độ và mức thu phóng. */
function metersToPixels(meters: number, lat: number, zoom: number): number {
  const metersPerPixel =
    (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return meters / metersPerPixel;
}
