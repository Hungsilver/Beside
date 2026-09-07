import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KalmanLocationFilter,
  inferSpeedMps,
  shouldSend,
  type LastSent,
  type LatLng,
} from '@beside/shared';
import { api } from './api-client';
import { useRealtime } from './realtime';

export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface LiveLocationState {
  /** Vị trí của chính mình, đã lọc nhiễu. */
  myLocation: (LatLng & { accuracyM: number; ts: number }) | null;
  permission: GeoPermission;
  /** Đang chia sẻ trực tiếp. */
  live: boolean;
  error: string | null;
  /** Màn hình đang được giữ sáng (Wake Lock). */
  screenAwake: boolean;
  startLive: () => Promise<void>;
  stopLive: () => void;
}

/** Tự dừng chia sẻ sau 60 phút để không quên bật rồi hết pin. */
const AUTO_STOP_MS = 60 * 60_000;

/**
 * Lớp L1 — Live Session (ARCHITECTURE.md §2).
 *
 * Chỉ chạy khi app đang mở ở tiền cảnh. Trình duyệt KHÔNG cho lấy vị trí khi
 * app đã đóng hoặc khoá màn hình, đặc biệt trên iOS — đây là giới hạn nền tảng,
 * không phải thiếu sót của app (xem ARCHITECTURE.md §1.3).
 */
export function useLiveLocation(): LiveLocationState {
  const { sendLocation, setLive: notifyLive } = useRealtime();

  const [myLocation, setMyLocation] = useState<LiveLocationState['myLocation']>(null);
  const [permission, setPermission] = useState<GeoPermission>('unknown');
  const [live, setLiveState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenAwake, setScreenAwake] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const filterRef = useRef(new KalmanLocationFilter());
  const lastSentRef = useRef<LastSent>(null);
  const lastRawRef = useRef<(LatLng & { timestamp: number }) | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------- quyền

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }
    if (!navigator.permissions?.query) {
      setPermission('prompt'); // Safari cũ không có Permissions API
      return;
    }

    let status: PermissionStatus | null = null;
    const onChange = () => setPermission((status?.state as GeoPermission) ?? 'unknown');

    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        status = s;
        setPermission(s.state as GeoPermission);
        s.addEventListener('change', onChange);
      })
      .catch(() => setPermission('prompt'));

    return () => status?.removeEventListener('change', onChange);
  }, []);

  // ---------------------------------------------------------------- pin

  const readBattery = useCallback(async (): Promise<number | null> => {
    try {
      const nav = navigator as Navigator & {
        getBattery?: () => Promise<{ level: number }>;
      };
      if (!nav.getBattery) return null; // Safari không có API này
      const b = await nav.getBattery();
      return Math.round(b.level * 100);
    } catch {
      return null;
    }
  }, []);

  const batteryRef = useRef<number | null>(null);
  useEffect(() => {
    void readBattery().then((b) => {
      batteryRef.current = b;
    });
  }, [readBattery]);

  // ---------------------------------------------------------------- xử lý điểm

  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      setError(null);

      const raw = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        timestamp: pos.timestamp,
      };

      // 1. Lọc nhiễu trước — nếu không, chính điểm nhiễu sẽ được coi là
      //    "đã đi đủ xa" và được gửi lên server.
      const filtered = filterRef.current.process(raw);

      // 2. Tốc độ: ưu tiên thiết bị báo, không có thì suy từ hai điểm liên tiếp
      //    (iOS Safari thường trả null khi định vị bằng Wi-Fi).
      const speedMps =
        typeof pos.coords.speed === 'number' && pos.coords.speed >= 0
          ? pos.coords.speed
          : lastRawRef.current
            ? inferSpeedMps(lastRawRef.current, { ...filtered, timestamp: filtered.timestamp })
            : null;
      lastRawRef.current = { ...filtered, timestamp: filtered.timestamp };

      setMyLocation({
        lat: filtered.lat,
        lng: filtered.lng,
        accuracyM: filtered.accuracyM,
        ts: filtered.timestamp,
      });

      // 3. Lấy mẫu thích ứng — quyết định có tốn một gói tin hay không
      const decision = shouldSend(
        {
          lat: filtered.lat,
          lng: filtered.lng,
          accuracyM: filtered.accuracyM,
          speedMps,
          timestamp: filtered.timestamp,
        },
        lastSentRef.current,
      );
      if (!decision.send) return;

      const payload = {
        lat: filtered.lat,
        lng: filtered.lng,
        accuracyM: Math.round(filtered.accuracyM * 10) / 10,
        speedMps: speedMps === null ? null : Math.round(speedMps * 10) / 10,
        headingDeg:
          typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading)
            ? Math.round(pos.coords.heading)
            : null,
        battery: batteryRef.current,
        ts: filtered.timestamp,
      };

      // Chỉ đánh dấu "đã gửi" khi socket thật sự nhận — mất kết nối thì lần
      // sau vẫn phải gửi, nếu không vệt đường sẽ đứt một đoạn dài.
      if (sendLocation(payload)) {
        lastSentRef.current = {
          lat: filtered.lat,
          lng: filtered.lng,
          timestamp: filtered.timestamp,
        };
      }
    },
    [sendLocation],
  );

  const handleError = useCallback((err: GeolocationPositionError) => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        setPermission('denied');
        setError('Bạn chưa cho phép truy cập vị trí. Bật lại trong cài đặt trình duyệt nhé.');
        break;
      case err.POSITION_UNAVAILABLE:
        setError('Không lấy được vị trí. Thử ra chỗ thoáng hoặc bật GPS.');
        break;
      case err.TIMEOUT:
        setError('Chờ tín hiệu GPS quá lâu. Đang thử lại...');
        break;
      default:
        setError('Có lỗi khi lấy vị trí.');
    }
  }, []);

  // ---------------------------------------------------------------- bật/tắt

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
    setScreenAwake(false);
  }, []);

  const stopLive = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    releaseWakeLock();
    filterRef.current.reset();
    lastSentRef.current = null;
    lastRawRef.current = null;
    setLiveState(false);
    notifyLive(false);
  }, [notifyLive, releaseWakeLock]);

  const startLive = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setPermission('unsupported');
      setError('Trình duyệt này không hỗ trợ định vị.');
      return;
    }
    if (watchIdRef.current !== null) return; // đang chạy rồi

    setError(null);
    filterRef.current.reset();
    lastSentRef.current = null;

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      // Luôn lấy phép đo mới, không dùng lại vị trí cache của trình duyệt.
      maximumAge: 0,
      timeout: 20_000,
    });

    setLiveState(true);
    notifyLive(true);

    // Giữ màn hình sáng: watchPosition ngừng ngay khi máy khoá màn hình.
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setScreenAwake(true);
        wakeLockRef.current.addEventListener('release', () => setScreenAwake(false));
      }
    } catch {
      // Trình duyệt từ chối (thường do tab không ở tiền cảnh) — không sao,
      // chỉ là màn hình sẽ tự tắt sớm hơn.
    }

    autoStopRef.current = setTimeout(() => stopLive(), AUTO_STOP_MS);
  }, [handleError, handlePosition, notifyLive, stopLive]);

  // Trình duyệt tự thu hồi Wake Lock khi chuyển tab — xin lại khi quay về.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !live || wakeLockRef.current) return;
      void navigator.wakeLock
        ?.request('screen')
        .then((w) => {
          wakeLockRef.current = w;
          setScreenAwake(true);
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [live]);

  // Dọn dẹp khi rời màn hình — nếu quên, watchPosition chạy mãi và ngốn pin.
  useEffect(() => () => stopLive(), [stopLive]);

  return { myLocation, permission, live, error, screenAwake, startLive, stopLive };
}

/**
 * Lớp L2 — ping bị động một lần khi mở app (ARCHITECTURE.md §2).
 * Nhờ nó mà đối phương luôn thấy "lần cuối ở đâu", kể cả khi không ai bật
 * chia sẻ trực tiếp.
 */
export function sendPassivePing(): void {
  if (!('geolocation' in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      void api
        .post('/locations', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          speedMps: null,
          headingDeg: null,
          battery: null,
          ts: pos.timestamp,
        })
        .catch(() => undefined); // ping hỏng thì thôi, không làm phiền người dùng
    },
    () => undefined,
    { enableHighAccuracy: false, maximumAge: 120_000, timeout: 15_000 },
  );
}
