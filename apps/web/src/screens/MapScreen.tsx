import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  haversineMeters,
  LIVE_STALE_AFTER_MS,
  type PartnerLocationEvent,
} from '@beside/shared';
import { useCouple } from '@/lib/couple-api';
import { usePartnerLatest, usePartnerTrail } from '@/lib/location-api';
import { useRealtime } from '@/lib/realtime';
import { useLiveLocation } from '@/lib/use-live-location';
import CoupleMap, {
  type MapMarker,
  type MapPhotoPin,
  type MapPlace,
} from '@/components/CoupleMap';
import { usePlaces } from '@/lib/places-api';
import DraggableSheet from '@/components/DraggableSheet';
import MapControls from '@/components/MapControls';
import {
  readSavedPhotoPins,
  readSavedStyle,
  savePhotoPins,
  saveStyle,
  type MapStyleId,
} from '@/lib/map-styles';
import { useFeed } from '@/lib/posts-api';
import TabBar from '@/components/TabBar';
import Avatar from '@/components/Avatar';

export default function MapScreen() {
  const coupleQuery = useCouple();
  const partnerQuery = usePartnerLatest();
  const navigate = useNavigate();
  const [styleId, setStyleId] = useState<MapStyleId>(readSavedStyle);
  const [photoPinsOn, setPhotoPinsOn] = useState(readSavedPhotoPins);
  const trailQuery = usePartnerTrail();
  const placesQuery = usePlaces();
  /*
   * Chỉ lấy bài CÓ GHIM toạ độ. Bộ lọc `pinned` đã có sẵn từ Phase 3 nên
   * không phải tải cả dòng kỷ niệm rồi lọc ở client.
   */
  const pinnedQuery = useFeed('pinned', null, null);
  const { connected, partnerLocation, partnerPresence } = useRealtime();
  const live = useLiveLocation();

  const [recenterToken, setRecenterToken] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Nhịp 1 giây để câu "cập nhật x giây trước" tự chạy
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const partner = coupleQuery.data?.partner ?? null;

  /**
   * Vị trí đối phương: ưu tiên điểm đến từ WebSocket (mới nhất), rơi về
   * kết quả REST khi socket chưa kết nối hoặc chưa có điểm nào.
   */
  const partnerPoint: PartnerLocationEvent | null = useMemo(() => {
    const fromRest = partnerQuery.data?.location ?? null;
    if (!partnerLocation) return fromRest;
    if (!fromRest) return partnerLocation;
    return partnerLocation.ts >= fromRest.ts ? partnerLocation : fromRest;
  }, [partnerLocation, partnerQuery.data]);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];

    if (partnerPoint && partner) {
      list.push({
        id: 'partner',
        label: partner.displayName,
        point: { lat: partnerPoint.lat, lng: partnerPoint.lng },
        accuracyM: partnerPoint.accuracyM,
        showAccuracy: true,
        color: 'blue',
        headingDeg: partnerPoint.headingDeg,
      });
    }

    if (live.myLocation) {
      list.push({
        id: 'me',
        label: 'Bạn',
        point: { lat: live.myLocation.lat, lng: live.myLocation.lng },
        accuracyM: live.myLocation.accuracyM,
        showAccuracy: true,
        color: 'rose',
      });
    }

    return list;
  }, [partnerPoint, partner, live.myLocation]);

  // Khoảng cách: tự tính khi có cả hai điểm; nếu chưa bật chia sẻ thì
  // dùng con số server tính từ vị trí lần cuối của cả hai.
  const distanceM = useMemo(() => {
    if (live.myLocation && partnerPoint) {
      return Math.round(haversineMeters(live.myLocation, partnerPoint));
    }
    return partnerQuery.data?.distanceM ?? null;
  }, [live.myLocation, partnerPoint, partnerQuery.data]);

  const partnerIsLive =
    Boolean(partnerPresence?.live) &&
    Boolean(partnerPoint) &&
    now - (partnerPoint?.ts ?? 0) < LIVE_STALE_AFTER_MS;

  const places = useMemo<MapPlace[]>(
    () =>
      (placesQuery.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        point: { lat: p.lat, lng: p.lng },
        radiusM: p.radiusM,
        active: p.peopleInside.length > 0,
      })),
    [placesQuery.data],
  );

  const photoPins = useMemo<MapPhotoPin[]>(() => {
    const posts = pinnedQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return posts
      .filter((post) => post.lat !== null && post.lng !== null && post.photos.length > 0)
      .slice(0, 40) // Nhiều hơn nữa thì bản đồ rối và tốn data tải ảnh
      .map((post) => ({
        id: post.id,
        point: { lat: post.lat!, lng: post.lng! },
        thumbPath: post.photos[0]!.urlThumb,
        placeholder: post.photos[0]!.placeholder,
        label: post.caption ?? `Khoảnh khắc của ${post.authorName}`,
      }));
  }, [pinnedQuery.data]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-canvas">
      <CoupleMap
        markers={markers}
        styleId={styleId}
        trail={trailQuery.data?.points}
        places={places}
        photoPins={photoPinsOn ? photoPins : []}
        onPhotoPinClick={() => void navigate('/ky-niem')}
        recenterToken={recenterToken}
      />

      {/* Thanh trên cùng */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex-1 rounded-full bg-white/95 px-4 py-2.5 text-[13px] font-semibold shadow-[0_2px_8px_rgba(35,19,32,0.12)] backdrop-blur">
            {connected ? (
              partnerIsLive ? (
                <span className="flex items-center gap-2">
                  <i className="size-2 animate-pulse rounded-full bg-mint-400" />
                  {partner?.displayName} đang chia sẻ trực tiếp
                </span>
              ) : (
                <span className="text-ink-500">
                  {partnerPoint
                    ? `${partner?.displayName} · ${relativeTime(now - partnerPoint.ts)}`
                    : `Chưa có vị trí của ${partner?.displayName ?? 'người ấy'}`}
                </span>
              )
            ) : (
              <span className="text-ink-500">Đang kết nối lại...</span>
            )}
          </div>
          <Link
            to="/cai-dat"
            aria-label="Cài đặt"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-[16px] shadow-sm"
          >
            ⚙︎
          </Link>
        </div>

        {partnerPoint?.fuzzed && (
          <p className="pointer-events-auto mt-2 inline-block rounded-full bg-white/95 px-3 py-1.5 text-[11.5px] font-semibold text-ink-500 shadow-sm">
            🔒 {partner?.displayName} đang bật làm mờ vị trí
          </p>
        )}
      </div>

      {/* Nút nổi */}
      {/*
        Cụm nút nổi. Bám mép PHẢI và cách đáy một khoảng cố định, không bám theo
        bảng thông tin — bảng giờ kéo được nên chiều cao của nó thay đổi liên tục.
      */}
      <div className="pointer-events-none absolute bottom-[120px] right-4 z-30">
        <MapControls
          styleId={styleId}
          onStyleChange={(id) => {
            setStyleId(id);
            saveStyle(id);
          }}
          photoPinsOn={photoPinsOn}
          onTogglePhotoPins={() => {
            setPhotoPinsOn((v) => {
              savePhotoPins(!v);
              return !v;
            });
          }}
          photoPinCount={photoPins.length}
          onFitBoth={() => setRecenterToken((n) => n + 1)}
          canFitBoth={markers.length > 0}
        />
      </div>

      {/* Bảng thông tin — vuốt lên/xuống để đổi nấc */}
      <DraggableSheet>
        <div className="flex items-center gap-3">
          <Avatar
            url={partner?.avatarUrl ?? null}
            name={partner?.displayName ?? '?'}
            size={48}
            fallbackClassName="bg-gradient-to-br from-[#9BC4FF] to-[#6A7BFF] text-white"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <b className="truncate text-[16px]">{partner?.displayName ?? 'Chưa ghép đôi'}</b>
              {partnerIsLive && (
                <span className="flex items-center gap-1 rounded-full bg-mint-100 px-2 py-0.5 text-[11px] font-bold text-[#03372A]">
                  <i className="size-1.5 animate-pulse rounded-full bg-[#03A47B]" />
                  Trực tiếp
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-ink-500">
              {partnerPoint
                ? `Cập nhật ${relativeTime(now - partnerPoint.ts)}`
                : 'Chưa nhận được vị trí nào'}
            </p>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-2">
          <Stat label="Khoảng cách" value={distanceM === null ? '—' : formatDistance(distanceM)} />
          <Stat
            label="Độ chính xác"
            value={partnerPoint ? `${Math.round(partnerPoint.accuracyM)} m` : '—'}
          />
          <Stat
            label="Pin"
            value={partnerPoint?.battery != null ? `${partnerPoint.battery}%` : '—'}
          />
        </div>

        {live.error && (
          <p role="alert" className="mt-3 rounded-2xl bg-love-50 px-4 py-3 text-[12.5px] font-semibold text-love-700">
            {live.error}
          </p>
        )}

        {live.permission === 'denied' ? (
          <div className="mt-3 rounded-2xl bg-ink-100 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
            Trình duyệt đang chặn quyền vị trí. Mở phần cài đặt trang web của trình duyệt
            để bật lại, rồi tải lại trang.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => (live.live ? live.stopLive() : void live.startLive())}
            className={live.live ? 'btn-ghost mt-3 w-full' : 'btn-primary mt-3 w-full'}
          >
            {live.live ? '⏹ Dừng chia sẻ trực tiếp' : '📡 Chia sẻ vị trí trực tiếp'}
          </button>
        )}

        <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-ink-400">
          {live.live
            ? `Đang chia sẻ${live.screenAwake ? ' · màn hình được giữ sáng' : ''} · tự dừng sau 60 phút`
            : 'Chia sẻ trực tiếp chỉ chạy khi app đang mở trên màn hình'}
        </p>
      </DraggableSheet>

      <TabBar />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-love-50 px-2 py-2.5 text-center">
      <p className="text-[11px] text-ink-400">{label}</p>
      <b className="mt-0.5 block text-[14.5px]">{value}</b>
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

function relativeTime(deltaMs: number): string {
  const s = Math.max(0, Math.round(deltaMs / 1000));
  if (s < 10) return 'vừa xong';
  if (s < 60) return `${s} giây trước`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}
