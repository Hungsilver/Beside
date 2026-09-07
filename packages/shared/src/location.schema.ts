import { z } from 'zod';
import { GPS_SAMPLING } from './constants';

/** Một điểm vị trí do client gửi lên (qua WebSocket hoặc REST). */
export const locationPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().max(100_000),
  speedMps: z.number().nonnegative().max(400).nullable().optional(),
  headingDeg: z.number().min(0).max(360).nullable().optional(),
  battery: z.number().int().min(0).max(100).nullable().optional(),
  /** Mốc thời gian của phép đo (epoch ms). */
  ts: z.number().int().positive(),
});
export type LocationPointInput = z.infer<typeof locationPointSchema>;

/** Ping bị động lúc mở app (lớp L2 trong ARCHITECTURE.md §2). */
export const locationPingSchema = locationPointSchema;

export const trailQuerySchema = z
  .object({
    from: z.coerce.number().int().positive().optional(),
    to: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(2000).default(500),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, {
    message: 'Khoảng thời gian không hợp lệ (from phải trước to)',
    path: ['from'],
  });
export type TrailQuery = z.infer<typeof trailQuerySchema>;

/** Cài đặt riêng tư (F8). */
export const privacySchema = z.object({
  /** Tạm ẩn hoàn toàn: server KHÔNG ghi và KHÔNG phát vị trí. */
  ghostMode: z.boolean(),
  /** Cho phép chia sẻ vị trí trực tiếp khi app đang mở. */
  shareLive: z.boolean(),
  /** Làm mờ vị trí trong bán kính này (mét). 0 = không làm mờ. */
  fuzzRadiusM: z.number().int().min(0).max(5000),
});
export type Privacy = z.infer<typeof privacySchema>;

export const DEFAULT_PRIVACY: Privacy = {
  ghostMode: false,
  shareLive: true,
  fuzzRadiusM: 0,
};

export const updatePrivacySchema = privacySchema.partial().refine(
  (o) => Object.values(o).some((v) => v !== undefined),
  'Không có thay đổi nào để cập nhật',
);

/**
 * Đọc cột `privacy` (kiểu Json) từ DB một cách an toàn.
 * Dữ liệu cũ hoặc bị sửa tay đều rơi về mặc định thay vì làm sập request —
 * và mặc định đó phải là AN TOÀN cho người dùng, không phải "lộ hết".
 */
export function parsePrivacy(raw: unknown): Privacy {
  const result = privacySchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_PRIVACY;
}

// ---------------------------------------------------------------------------
// Hợp đồng WebSocket (ARCHITECTURE.md §7.2)
// ---------------------------------------------------------------------------

export const RT_NAMESPACE = '/rt';

export const RT_EVENTS = {
  // client → server
  LOC_UPDATE: 'loc:update',
  LIVE_START: 'live:start',
  LIVE_STOP: 'live:stop',
  // server → client
  LOC_PARTNER: 'loc:partner',
  PRESENCE: 'presence',
  ERROR: 'rt:error',
} as const;

/** Vị trí của đối phương do server phát về. */
export interface PartnerLocationEvent {
  userId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  battery: number | null;
  /** Toạ độ đã bị làm mờ theo cài đặt riêng tư của người gửi. */
  fuzzed: boolean;
  ts: number;
}

export interface PresenceEvent {
  userId: string;
  online: boolean;
  /** Đang bật chia sẻ trực tiếp (app đang mở ở tiền cảnh). */
  live: boolean;
  battery: number | null;
  /** Lần cuối server nhận được vị trí, epoch ms. */
  lastSeenAt: number | null;
}

export interface RtErrorEvent {
  code: string;
  message: string;
}

/** Vị trí gần nhất của đối phương, trả qua REST khi mới mở app. */
export interface PartnerLatestLocation extends PartnerLocationEvent {
  /** 'LIVE' = đang chia sẻ trực tiếp, 'PING' = chỉ là lần mở app gần nhất. */
  source: 'LIVE' | 'PING' | 'CHECKIN';
}

/** Một điểm trong vệt đường. Mảng số cho gọn vì có thể có hàng trăm điểm. */
export type TrailPoint = [lng: number, lat: number, ts: number];

export interface PartnerTrail {
  userId: string;
  points: TrailPoint[];
  /** Tổng quãng đường của vệt, tính bằng mét. */
  distanceM: number;
}

/** Ngưỡng dùng chung để hiển thị — khớp với logic lấy mẫu. */
export const LIVE_STALE_AFTER_MS = GPS_SAMPLING.STILL.intervalMs * 3;
