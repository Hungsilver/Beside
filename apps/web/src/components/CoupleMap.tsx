import { useEffect, useRef, useState } from 'react';
import maplibregl, { type LngLatLike, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { circlePolygon, type LatLng, type TrailPoint } from '@beside/shared';
import {
  DEFAULT_MAP_STYLE,
  isDarkStyle,
  styleSourceFor,
  type MapStyleId,
} from '@/lib/map-styles';
import { fetchImageObjectUrl } from '@/lib/api-client';

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

/** Địa điểm đã lưu — vẽ thành hàng rào tròn theo bán kính THẬT. */
export interface MapPlace {
  id: string;
  name: string;
  emoji: string;
  point: LatLng;
  radiusM: number;
  /** Đang có người trong hàng rào → tô đậm hơn cho dễ thấy. */
  active: boolean;
}

/** Ảnh check-in đã ghim toạ độ. */
export interface MapPhotoPin {
  id: string;
  point: LatLng;
  /** Đường dẫn ảnh nhỏ, đi qua API nên cần token — xem AuthedImage. */
  thumbPath: string;
  /** Ảnh mờ nhúng sẵn, hiện ngay trong lúc ảnh thật đang tải. */
  placeholder: string;
  label: string;
}

interface Props {
  markers: MapMarker[];
  /** Loại bản đồ đang chọn (đường phố / tối giản / ban đêm / vệ tinh). */
  styleId?: MapStyleId;
  trail?: TrailPoint[];
  places?: MapPlace[];
  photoPins?: MapPhotoPin[];
  /** Bấm vào một ghim ảnh. */
  onPhotoPinClick?: (id: string) => void;
  /**
   * Bấm vào một chấm vị trí (`id` của marker: `partner` / `me`).
   *
   * Không truyền thì chấm vẫn chỉ là hình vẽ, không bắt sự kiện — màn chọn
   * toạ độ (`PlacePicker`) cần đúng như vậy.
   */
  onMarkerClick?: (id: string) => void;
  /**
   * Bật chế độ chọn toạ độ: bấm lên bản đồ để lấy điểm.
   * Khi bật, con trỏ đổi thành chữ thập và mọi cú bấm gọi hàm này.
   */
  onPickPoint?: (point: LatLng) => void;
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
export default function CoupleMap({
  markers,
  styleId = DEFAULT_MAP_STYLE,
  trail,
  places,
  photoPins,
  onPhotoPinClick,
  onMarkerClick,
  onPickPoint,
  recenterToken,
  onMapReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const photoMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const readyRef = useRef(false);

  /*
   * Giữ callback trong ref rồi mới dùng trong listener của MapLibre.
   *
   * Listener được gắn MỘT LẦN lúc khởi tạo bản đồ. Nếu bắt thẳng prop vào đó,
   * nó sẽ đóng băng ở giá trị của lần render đầu tiên và mọi cú bấm sau này
   * gọi vào một hàm cũ — đúng loại bẫy của L21.
   */
  const onPickPointRef = useRef(onPickPoint);
  onPickPointRef.current = onPickPoint;
  const onPhotoPinClickRef = useRef(onPhotoPinClick);
  onPhotoPinClickRef.current = onPhotoPinClick;
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const styleIdRef = useRef(styleId);
  styleIdRef.current = styleId;

  /*
   * Đếm số lần bản đồ sẵn sàng.
   *
   * Dữ liệu địa điểm có thể về TRƯỚC khi MapLibre bắn sự kiện `load`. Lúc đó
   * `getSource('places')` chưa tồn tại và effect lặng lẽ không làm gì — hàng
   * rào không bao giờ hiện. Tăng số này lúc `load` để effect chạy lại.
   */
  const [mapReadyTick, setMapReadyTick] = useState(0);

  /*
   * Số hình hàng rào và số ghim ảnh ĐANG THỰC SỰ nằm trên bản đồ.
   *
   * Trước đây hai thuộc tính data-* lấy thẳng độ dài của prop. Như thế chúng
   * chỉ nói "API trả về mấy địa điểm", chứ không nói "bản đồ có vẽ không" —
   * và test dựa vào chúng vẫn xanh cả khi lớp đã biến mất khỏi bản đồ. Giờ hai
   * con số này chỉ được đặt sau khi đã sờ vào nguồn dữ liệu / marker thật.
   */
  const [paintedPlaces, setPaintedPlaces] = useState(0);
  const [paintedPins, setPaintedPins] = useState(0);

  // ---------------------------------------------------------------- khởi tạo
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Chép ref ra biến cục bộ NGAY TẠI ĐÂY, không phải trong hàm dọn dẹp: tới
    // lúc dọn dẹp chạy, `markersRef.current` có thể đã trỏ sang đối tượng khác.
    // Ở đây Map chỉ tạo một lần nên thực tế không đổi, nhưng viết đúng mẫu để
    // lần sau sửa không dính bẫy — và đây chính là quy tắc react-hooks bắt.
    const markers = markersRef.current;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleSourceFor(styleIdRef.current),
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
      installLayers(map, styleIdRef.current);
      setMapReadyTick((n) => n + 1);
      onMapReady?.();
    });

    /*
     * Đổi loại bản đồ: `setStyle()` XOÁ SẠCH mọi nguồn và lớp mình đã thêm —
     * hàng rào địa điểm và vệt đường biến mất không báo trước. Phải dựng lại
     * sau mỗi lần style mới tải xong, rồi tăng `mapReadyTick` để các effect
     * nạp lại dữ liệu vào nguồn vừa dựng.
     */
    map.on('styledata', () => {
      if (!readyRef.current) return;
      // Style mới chưa có lớp của mình thì dựng lại. Nếu đã có (styledata còn
      // bắn cả khi chỉ dữ liệu nguồn thay đổi) thì thôi, tránh addSource trùng.
      if (!map.getSource('places')) installLayers(map, styleIdRef.current);
      // Tăng tick trong MỌI trường hợp, kể cả khi không dựng lại: các effect
      // phải chạy lại để soi nguồn dữ liệu và báo ra con số thật.
      setMapReadyTick((n) => n + 1);
    });

    // Chọn toạ độ bằng cách bấm lên bản đồ (dùng ở màn Địa điểm).
    map.on('click', (e) => {
      onPickPointRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    const photoMarkers = photoMarkersRef.current;

    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
      photoMarkers.forEach((m) => m.remove());
      photoMarkers.clear();
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

      const el = buildMarkerElement(m, map, Boolean(onMarkerClickRef.current), (id) =>
        onMarkerClickRef.current?.(id),
      );
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

  // ---------------------------------------------------------------- đổi loại bản đồ
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    // Nguồn/lớp riêng của mình sẽ được dựng lại ở listener `styledata`.
    map.setStyle(styleSourceFor(styleId));
  }, [styleId]);

  // ---------------------------------------------------------------- địa điểm
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const source = map.getSource('places') as maplibregl.GeoJSONSource | undefined;
    if (!source) {
      setPaintedPlaces(0);
      return;
    }

    const collection = {
      type: 'FeatureCollection' as const,
      features: (places ?? [])
        .map((place) => {
          const ring = circlePolygon(place.point, place.radiusM);
          if (ring.length === 0) return null;
          return {
            type: 'Feature' as const,
            properties: { name: place.name, emoji: place.emoji, active: place.active },
            geometry: { type: 'Polygon' as const, coordinates: [ring] },
          };
        })
        .filter((f) => f !== null),
    };

    source.setData(collection);
    setPaintedPlaces(collection.features.length);
  }, [places, mapReadyTick]);

  // ---------------------------------------------------------------- ghim ảnh
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();

    for (const pin of photoPins ?? []) {
      seen.add(pin.id);
      const lngLat: [number, number] = [pin.point.lng, pin.point.lat];
      const existing = photoMarkersRef.current.get(pin.id);
      if (existing) {
        existing.setLngLat(lngLat);
        continue;
      }

      const el = buildPhotoPinElement(pin);
      el.addEventListener('click', (ev) => {
        // Không để cú bấm rơi xuống bản đồ — nếu không, ở chế độ chọn toạ độ
        // bấm vào ảnh sẽ vừa mở ảnh vừa đặt một điểm mới.
        ev.stopPropagation();
        onPhotoPinClickRef.current?.(pin.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(lngLat)
        .addTo(map);
      photoMarkersRef.current.set(pin.id, marker);
    }

    for (const [id, marker] of photoMarkersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        photoMarkersRef.current.delete(id);
      }
    }

    setPaintedPins(photoMarkersRef.current.size);
  }, [photoPins]);

  // Con trỏ chữ thập khi đang ở chế độ chọn toạ độ.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    canvas.style.cursor = onPickPoint ? 'crosshair' : '';
  }, [onPickPoint]);

  // ---------------------------------------------------------------- vệt đường
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    /*
     * `getSource()` khai báo trả về `Source` — kiểu cha không có `setData`.
     * Phải ép về `GeoJSONSource` mới gọi được.
     *
     * ESLint `no-unnecessary-type-assertion` tưởng phép ép này thừa và `--fix`
     * đã gỡ nó, làm vỡ typecheck. Giữ lại và tắt quy tắc ngay tại đây, kèm lý do.
     */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
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
  }, [trail, mapReadyTick]);

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

  /*
   * Thẻ bọc giữ bố cục, thẻ trong mới giao cho MapLibre.
   *
   * KHÔNG đặt `absolute inset-0` thẳng lên thẻ của MapLibre: nó tự gắn class
   * `.maplibregl-map { position: relative }` từ maplibre-gl.css — file này
   * KHÔNG nằm trong cascade layer nào, còn utility của Tailwind v4 thì nằm
   * trong `@layer utilities`. Luật CSS cho rule không-layer thắng rule trong
   * layer bất kể thứ tự hay độ đặc hiệu ⇒ `absolute` bị đè thành `relative`,
   * `inset-0` mất tác dụng, thẻ co còn cao 0px và bản đồ biến mất hoàn toàn.
   * `size-full` thì an toàn vì maplibre-gl.css không đụng tới width/height.
   */
  return (
    <div className="absolute inset-0">
      {/*
        Hai thuộc tính data-* nói ra thứ MapLibre vẽ vào canvas — mà canvas thì
        không dò được từ bên ngoài. Nhờ chúng, E2E khẳng định được "hàng rào có
        thật sự lên bản đồ không", chứ không chỉ "khung bản đồ có tồn tại không".

        Giá trị lấy từ state đã sờ vào nguồn dữ liệu / marker thật, KHÔNG lấy từ
        độ dài prop — lấy từ prop thì lớp có biến mất khỏi bản đồ chúng vẫn báo
        con số cũ, và test dựa vào chúng sẽ xanh giả.
        Cũng tiện lúc gỡ lỗi bằng công cụ dành cho nhà phát triển.
      */}
      <div
        ref={containerRef}
        className="size-full"
        aria-label="Bản đồ"
        data-places={paintedPlaces}
        data-photo-pins={paintedPins}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function buildMarkerElement(
  m: MapMarker,
  map: MapLibreMap,
  clickable: boolean,
  onClick: (id: string) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'relative flex items-center justify-center';

  /*
   * Chấm vị trí bấm được để mở chi tiết (toạ độ + chỉ đường).
   *
   * Chỉ gắn khi nơi gọi THẬT SỰ cần: ở màn chọn toạ độ, một chấm nuốt mất cú
   * chạm là người dùng không dời được điểm vừa đặt.
   *
   * `stopPropagation` để cú chạm không rơi xuống bản đồ bên dưới, và có bàn
   * phím cho máy tính — đặt `role="button"` mà không nghe phím là hứa suông
   * với trình đọc màn hình.
   */
  if (clickable) {
    wrap.setAttribute('role', 'button');
    wrap.tabIndex = 0;
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick(m.id);
    });
    wrap.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      onClick(m.id);
    });
  }

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

  // Nhãn đọc-màn-hình phải theo tên mới nhất (đối phương đổi tên hiển thị).
  if (el.getAttribute('role') === 'button') {
    el.setAttribute('aria-label', `Xem vị trí của ${m.label}`);
  }

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

/**
 * Ghim ảnh check-in trên bản đồ.
 *
 * Ảnh nằm sau lớp xác thực nên `<img src>` sẽ nhận 401 — phải tải bằng fetch
 * kèm token rồi đổi sang blob URL, đúng cách `AuthedImage` làm. Trong lúc chờ,
 * hiện ảnh mờ nhúng sẵn để ghim không bị trống.
 *
 * Dựng bằng DOM thuần chứ không phải React: MapLibre quản lý vòng đời marker
 * theo kiểu mệnh lệnh, trộn hai mô hình vào nhau chỉ tổ rối.
 */
function buildPhotoPinElement(pin: MapPhotoPin): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', pin.label);
  el.style.cssText = [
    'width:46px',
    'height:46px',
    'padding:0',
    'border:2.5px solid #fff',
    'border-radius:14px',
    'overflow:hidden',
    'cursor:pointer',
    'background:#eee',
    'box-shadow:0 3px 10px rgba(35,19,32,0.3)',
    'display:block',
  ].join(';');

  const img = document.createElement('img');
  img.src = pin.placeholder;
  img.alt = '';
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
  el.appendChild(img);

  let objectUrl: string | null = null;
  void fetchImageObjectUrl(pin.thumbPath)
    .then((url) => {
      // Marker có thể đã bị gỡ trong lúc chờ mạng — kiểm trước khi gán.
      if (!el.isConnected) {
        URL.revokeObjectURL(url);
        return;
      }
      objectUrl = url;
      img.src = url;
    })
    .catch(() => undefined);

  /*
   * MapLibre không báo khi marker bị gỡ, nên tự theo dõi để thu hồi blob URL.
   * Không thu hồi thì mỗi lần mở lại bản đồ là rò thêm một ảnh trong bộ nhớ.
   */
  const observer = new MutationObserver(() => {
    if (!el.isConnected) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return el;
}

/**
 * Dựng nguồn + lớp riêng của app lên bản đồ.
 *
 * Phải tách thành hàm vì gọi ở HAI chỗ: lúc `load` đầu tiên, và mỗi lần
 * `setStyle()` nạp xong một loại bản đồ mới — `setStyle` xoá sạch mọi thứ
 * không thuộc về style, kể cả nguồn dữ liệu của mình.
 *
 * `dark` đổi màu chữ nhãn địa điểm: nền vệ tinh và nền ban đêm mà vẫn dùng chữ
 * tím trên viền trắng thì đọc không ra.
 */
function installLayers(map: MapLibreMap, styleId: MapStyleId): void {
  const dark = isDarkStyle(styleId);

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
      'line-color': dark ? '#FF9BB3' : '#FF4D7D',
      'line-width': 4,
      'line-opacity': 0.75,
      // Nét đứt cho thấy đây là đường ĐÃ ĐI QUA, không phải chỉ đường
      'line-dasharray': [0.4, 2],
    },
  });

  /*
   * Hàng rào địa điểm.
   *
   * Vẽ bằng đa giác toạ độ chứ KHÔNG dùng lớp `circle` của MapLibre: lớp đó
   * nhận bán kính tính bằng pixel, nên phóng to thu nhỏ là vòng tròn sai
   * hoàn toàn — trong khi đây là một khoảng cách thật ngoài đời.
   * `circlePolygon` ở packages/shared lo phần hình học (có 7 unit test).
   *
   * Chèn NGAY DƯỚI lớp vệt đường để đường đi không bị nền hàng rào che.
   */
  map.addSource('places', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer(
    {
      id: 'place-fill',
      type: 'fill',
      source: 'places',
      paint: {
        'fill-color': ['case', ['get', 'active'], '#03A47B', '#8B5CF6'],
        'fill-opacity': ['case', ['get', 'active'], 0.18, 0.08],
      },
    },
    'trail-line',
  );
  map.addLayer(
    {
      id: 'place-outline',
      type: 'line',
      source: 'places',
      paint: {
        'line-color': ['case', ['get', 'active'], '#03A47B', '#8B5CF6'],
        'line-width': 1.5,
        'line-opacity': 0.55,
      },
    },
    'trail-line',
  );
  map.addLayer({
    id: 'place-label',
    type: 'symbol',
    source: 'places',
    layout: {
      'text-field': ['concat', ['get', 'emoji'], ' ', ['get', 'name']],
      'text-size': 12,
      'text-anchor': 'top',
      // Đẩy chữ xuống dưới tâm để không đè lên chấm vị trí của người.
      'text-offset': [0, 0.6],
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': dark ? '#FFFFFF' : '#4A2540',
      'text-halo-color': dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.4,
    },
  });
}
