import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { LocSource, Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  haversineMeters,
  parsePrivacy,
  snapToGrid,
  type LocationPointInput,
  type PartnerLatestLocation,
  type PartnerLocationEvent,
  type PartnerTrail,
  type Privacy,
  type TrailPoint,
  type TrailQuery,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AppError } from '../common/errors/app-error';
import { SlidingWindowRateLimiter } from './rate-limiter';

export interface CoupleContext {
  userId: string;
  coupleId: string;
  partnerId: string | null;
  privacy: Privacy;
}

/** Điểm vị trí ở dạng THÔ — chưa áp quyền riêng tư. Đây là thứ được cache. */
export interface RawLastLocation {
  userId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  battery: number | null;
  ts: number;
  source: LocSource;
}

export type IngestResult =
  | { accepted: true; event: PartnerLocationEvent; partnerId: string | null; coupleId: string }
  | { accepted: false; reason: 'GHOST_MODE' | 'LIVE_DISABLED' | 'RATE_LIMITED' };

/** Gộp bao nhiêu điểm thì ghi DB một lần (ARCHITECTURE.md §5.1). */
const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 30_000;

/** Vị trí gần nhất giữ trong Redis 24h. */
const LAST_LOCATION_TTL_S = 86_400;

/** Chống spam: tối đa 2 điểm mỗi 3 giây cho mỗi người. */
const RATE_WINDOW_S = 3;
const RATE_MAX = 2;

@Injectable()
export class LocationsService implements OnModuleDestroy {
  private readonly logger = new Logger(LocationsService.name);

  /** Đệm ghi. Mất đệm khi tiến trình chết là chấp nhận được — mất tối đa 30 giây vệt đường. */
  private buffer: Prisma.LocationPointCreateManyInput[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  /** Lượt ghi đang chạy, để các lời gọi song song không giẫm lên nhau. */
  private flushing: Promise<void> | null = null;

  /**
   * Hàng rào chính, luôn chạy trong tiến trình.
   * Redis chỉ là lớp bổ sung cho trường hợp chạy nhiều instance — và nó cố tình
   * "mở" khi hỏng, nên KHÔNG được coi là hàng rào duy nhất (trace Phase 2, TC-58).
   */
  private readonly localRate = new SlidingWindowRateLimiter(RATE_MAX, RATE_WINDOW_S * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    await this.flush();
  }

  // ------------------------------------------------------------------
  // Bối cảnh người dùng
  // ------------------------------------------------------------------

  /**
   * Đọc couple + cài đặt riêng tư.
   *
   * CỐ TÌNH không cache: đây là nơi quyết định có phát vị trí đi hay không.
   * Người dùng bật "chế độ ẩn danh" thì phải có hiệu lực NGAY, không được
   * chờ cache hết hạn. Mỗi người gửi nhiều nhất 1 điểm/8 giây nên chi phí
   * một lần đọc Postgres ở đây là không đáng kể.
   */
  async getContext(userId: string): Promise<CoupleContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        coupleId: true,
        privacy: true,
        couple: { select: { members: { select: { id: true } } } },
      },
    });

    if (!user) {
      throw AppError.unauthorized(ERROR_CODES.UNAUTHENTICATED, 'Tài khoản không còn tồn tại');
    }
    if (!user.coupleId || !user.couple) {
      throw AppError.notFound(ERROR_CODES.NOT_IN_COUPLE, 'Bạn chưa ghép đôi với ai cả');
    }

    return {
      userId: user.id,
      coupleId: user.coupleId,
      partnerId: user.couple.members.find((m) => m.id !== userId)?.id ?? null,
      privacy: parsePrivacy(user.privacy),
    };
  }

  // ------------------------------------------------------------------
  // Nhận điểm vị trí
  // ------------------------------------------------------------------

  async ingest(
    ctx: CoupleContext,
    point: LocationPointInput,
    source: LocSource,
  ): Promise<IngestResult> {
    // Ẩn danh: không ghi, không phát. Người dùng biến mất hoàn toàn.
    if (ctx.privacy.ghostMode) {
      return { accepted: false, reason: 'GHOST_MODE' };
    }

    // Tắt chia sẻ trực tiếp: chặn luồng LIVE, nhưng vẫn cho ping bị động
    // để đối phương thấy được "lần cuối ở đâu" — đúng như hai công tắc
    // riêng biệt trong màn Cài đặt.
    if (source === LocSource.LIVE && !ctx.privacy.shareLive) {
      return { accepted: false, reason: 'LIVE_DISABLED' };
    }

    if (!this.localRate.allow(ctx.userId)) {
      return { accepted: false, reason: 'RATE_LIMITED' };
    }
    // Lớp thứ hai, chỉ có tác dụng khi Redis sống và khi chạy nhiều instance.
    const hits = await this.redis.incrWindow(`rt:rate:${ctx.userId}`, RATE_WINDOW_S);
    if (hits > RATE_MAX) {
      return { accepted: false, reason: 'RATE_LIMITED' };
    }

    // Mốc thời gian do client gửi không đáng tin (đồng hồ máy có thể lệch).
    // Kẹp về khoảng hợp lý quanh giờ server để vệt đường không nhảy lung tung.
    const recordedAt = this.clampTimestamp(point.ts);

    // LƯU chính xác, chỉ LÀM MỜ khi phát ra ngoài (xem toPartnerEvent).
    // Lịch sử của chính mình phải chính xác; làm mờ là để bảo vệ trước
    // đối phương, không phải để tự làm hỏng dữ liệu của mình.
    this.buffer.push({
      userId: ctx.userId,
      coupleId: ctx.coupleId,
      lat: point.lat,
      lng: point.lng,
      accuracyM: point.accuracyM,
      speedMps: point.speedMps ?? null,
      headingDeg: point.headingDeg ?? null,
      battery: point.battery ?? null,
      source,
      recordedAt,
    });
    this.scheduleFlush();

    const event = this.toPartnerEvent(ctx, point, recordedAt);

    // Cache SỐ LIỆU THÔ, không phải `event` (đã làm mờ). Xem giải thích ở cacheLast().
    await this.cacheLast(ctx.userId, {
      userId: ctx.userId,
      lat: point.lat,
      lng: point.lng,
      accuracyM: point.accuracyM,
      headingDeg: point.headingDeg ?? null,
      speedMps: point.speedMps ?? null,
      battery: point.battery ?? null,
      ts: recordedAt.getTime(),
      source,
    });

    return { accepted: true, event, partnerId: ctx.partnerId, coupleId: ctx.coupleId };
  }

  /** Dựng payload phát cho đối phương, đã áp dụng cài đặt làm mờ. */
  private toPartnerEvent(
    ctx: CoupleContext,
    point: LocationPointInput,
    recordedAt: Date,
  ): PartnerLocationEvent {
    const fuzz = ctx.privacy.fuzzRadiusM > 0;
    const coords = fuzz
      ? snapToGrid({ lat: point.lat, lng: point.lng }, ctx.privacy.fuzzRadiusM)
      : { lat: point.lat, lng: point.lng };

    return {
      userId: ctx.userId,
      lat: coords.lat,
      lng: coords.lng,
      // Khi đã làm mờ thì báo sai số bằng đúng bán kính làm mờ, nếu không
      // giao diện sẽ vẽ vòng tròn 8m quanh một toạ độ sai — trông như đang
      // rất chính xác trong khi thực tế không phải.
      accuracyM: fuzz ? ctx.privacy.fuzzRadiusM : point.accuracyM,
      headingDeg: fuzz ? null : (point.headingDeg ?? null),
      speedMps: fuzz ? null : (point.speedMps ?? null),
      battery: point.battery ?? null,
      fuzzed: fuzz,
      ts: recordedAt.getTime(),
    };
  }

  /**
   * Kẹp mốc thời gian của client về khoảng hợp lý.
   * Cho phép lệch 5 phút về quá khứ (điểm đến muộn do mạng chập chờn)
   * nhưng không cho phép ở tương lai.
   */
  private clampTimestamp(ts: number): Date {
    const now = Date.now();
    const min = now - 5 * 60_000;
    return new Date(Math.min(now, Math.max(min, ts)));
  }

  // ------------------------------------------------------------------
  // Ghi theo lô
  // ------------------------------------------------------------------

  private scheduleFlush(): void {
    if (this.buffer.length >= BATCH_SIZE) {
      void this.flush();
      return;
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), BATCH_INTERVAL_MS);
      // Không giữ tiến trình sống chỉ vì cái hẹn giờ này.
      this.flushTimer.unref?.();
    }
  }

  /**
   * Đẩy đệm xuống DB.
   *
   * Phải chờ lượt ghi đang chạy trước khi xét đệm hiện tại. Nếu không, hai
   * lời gọi song song — `getPartnerLatest` và `distanceBetween` chạy chung
   * `Promise.all` ở controller — sẽ có một cái thấy đệm đã rỗng, tưởng là
   * xong rồi và đi đọc DB NGAY KHI lượt ghi kia chưa hoàn tất, nên trả về
   * vị trí cũ. Đây đúng là lỗi TC-69 mà trace Phase 2 bắt được.
   */
  async flush(): Promise<void> {
    while (this.flushing) await this.flushing;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;

    // Lấy đệm ra một cách nguyên tử — giữa hai dòng này không có `await`
    // nên không lời gọi nào chen vào giữa được.
    const batch = this.buffer;
    this.buffer = [];

    this.flushing = this.prisma.locationPoint
      .createMany({ data: batch })
      .then(() => undefined)
      .catch((err: unknown) => {
        // Không đưa lô hỏng trở lại đệm: nếu lỗi là do dữ liệu thì sẽ lặp vô hạn.
        this.logger.error(
          `Không ghi được ${batch.length} điểm vị trí: ${(err as Error).message}`,
        );
      });

    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  // ------------------------------------------------------------------
  // Đọc
  // ------------------------------------------------------------------

  private lastKey(userId: string): string {
    return `loc:last:${userId}`;
  }

  /**
   * Cache CHỈ lưu số liệu THÔ, chưa áp quyền riêng tư.
   *
   * Trước đây chỗ này lưu payload đã làm mờ sẵn theo cài đặt tại thời điểm gửi.
   * Hậu quả: người dùng bật "làm mờ vị trí" nhưng chưa gửi điểm mới (đang đứng
   * yên, hoặc đã đóng app) thì đối phương VẪN nhận được toạ độ chính xác từ cache
   * trong tối đa 24 giờ — tính năng bảo vệ quyền riêng tư không có tác dụng.
   *
   * Lỗi này chỉ lộ ra khi Redis chạy thật, nên lượt trace Phase 2 đầu tiên
   * (chạy khi chưa có Redis) không bắt được.
   *
   * Quy tắc rút ra: cache lưu SỰ THẬT, quyền riêng tư áp ở ĐƯỜNG RA — giống hệt
   * cách lưu vào Postgres. Nhờ vậy nhánh cache và nhánh DB không thể lệch nhau.
   */
  private async cacheLast(userId: string, raw: RawLastLocation): Promise<void> {
    await this.redis.setEx(this.lastKey(userId), JSON.stringify(raw), LAST_LOCATION_TTL_S);
  }

  /** Áp cài đặt riêng tư HIỆN TẠI của người sở hữu điểm lên dữ liệu thô. */
  private applyPrivacy(
    raw: RawLastLocation,
    privacy: Privacy,
  ): PartnerLatestLocation {
    const fuzz = privacy.fuzzRadiusM > 0;
    const coords = fuzz
      ? snapToGrid({ lat: raw.lat, lng: raw.lng }, privacy.fuzzRadiusM)
      : { lat: raw.lat, lng: raw.lng };

    return {
      userId: raw.userId,
      lat: coords.lat,
      lng: coords.lng,
      // Đã làm mờ thì báo sai số bằng đúng bán kính mờ, nếu không giao diện sẽ
      // vẽ vòng tròn 8m quanh một toạ độ sai — trông như đang rất chính xác.
      accuracyM: fuzz ? privacy.fuzzRadiusM : raw.accuracyM,
      headingDeg: fuzz ? null : raw.headingDeg,
      speedMps: fuzz ? null : raw.speedMps,
      battery: raw.battery,
      fuzzed: fuzz,
      ts: raw.ts,
      source: raw.source,
    };
  }

  /** Vị trí gần nhất của đối phương. Trả null khi chưa có, hoặc khi họ đang ẩn danh. */
  async getPartnerLatest(userId: string): Promise<PartnerLatestLocation | null> {
    const ctx = await this.getContext(userId);
    if (!ctx.partnerId) return null;

    const partner = await this.prisma.user.findUnique({
      where: { id: ctx.partnerId },
      select: { privacy: true },
    });
    const partnerPrivacy = parsePrivacy(partner?.privacy);
    if (partnerPrivacy.ghostMode) return null;

    const raw = await this.readLastRaw(ctx.partnerId);
    return raw ? this.applyPrivacy(raw, partnerPrivacy) : null;
  }

  /** Điểm gần nhất ở dạng THÔ: thử cache trước, trượt thì đọc Postgres. */
  private async readLastRaw(userId: string): Promise<RawLastLocation | null> {
    const cached = await this.redis.get(this.lastKey(userId));
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as RawLastLocation;
        // Dữ liệu cũ từ bản trước có thể thiếu trường — bỏ qua, đọc lại từ DB.
        if (typeof parsed?.lat === 'number' && typeof parsed?.ts === 'number') {
          return parsed;
        }
      } catch {
        /* JSON hỏng — rơi xuống nhánh đọc DB */
      }
      await this.redis.del(this.lastKey(userId));
    }

    // Cache trượt → đọc Postgres. Phải flush đệm trước, nếu không điểm vừa
    // nhận vài giây trước sẽ chưa có trong bảng và ta trả về vị trí cũ.
    await this.flush();

    const row = await this.prisma.locationPoint.findFirst({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
    });
    if (!row) return null;

    return {
      userId: row.userId,
      lat: row.lat,
      lng: row.lng,
      accuracyM: row.accuracyM,
      headingDeg: row.headingDeg,
      speedMps: row.speedMps,
      battery: row.battery,
      ts: row.recordedAt.getTime(),
      source: row.source,
    };
  }

  /**
   * Xoá vị trí đã cache của một nhóm người dùng.
   *
   * Gọi khi huỷ ghép đôi. Dữ liệu trong Postgres bị xoá theo cascade của couple,
   * nhưng Redis thì KHÔNG biết gì về chuyện đó và giữ khoá `loc:last:*` tới 24 giờ.
   * Hậu quả: ghép đôi với người mới xong, người mới đọc trúng cache và thấy ngay
   * vị trí cuối cùng từ mối quan hệ trước (trace rà soát, RV-20).
   */
  async forgetCachedLocations(userIds: string[]): Promise<void> {
    await Promise.all(userIds.map((id) => this.redis.del(this.lastKey(id))));
  }

  /** Vệt đường của đối phương trong một khoảng thời gian. */
  async getPartnerTrail(userId: string, query: TrailQuery): Promise<PartnerTrail> {
    const ctx = await this.getContext(userId);
    if (!ctx.partnerId) {
      return { userId: '', points: [], distanceM: 0 };
    }

    const partner = await this.prisma.user.findUnique({
      where: { id: ctx.partnerId },
      select: { privacy: true },
    });
    const partnerPrivacy = parsePrivacy(partner?.privacy);
    if (partnerPrivacy.ghostMode) {
      return { userId: ctx.partnerId, points: [], distanceM: 0 };
    }

    await this.flush();

    const to = query.to ? new Date(query.to) : new Date();
    // Mặc định xem lại 12 giờ gần nhất — đủ cho "hôm nay đi những đâu"
    // mà không kéo về hàng nghìn điểm.
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 12 * 3_600_000);

    const rows = await this.prisma.locationPoint.findMany({
      where: {
        userId: ctx.partnerId,
        recordedAt: { gte: from, lte: to },
        // Chỉ lấy điểm của phiên chia sẻ trực tiếp; ping rời rạc nối lại
        // sẽ thành những đường thẳng dài vô nghĩa cắt ngang thành phố.
        source: LocSource.LIVE,
      },
      orderBy: { recordedAt: 'asc' },
      take: query.limit,
      select: { lat: true, lng: true, recordedAt: true },
    });

    const fuzz = partnerPrivacy.fuzzRadiusM > 0;
    const points: TrailPoint[] = [];
    let distanceM = 0;
    let prev: { lat: number; lng: number } | null = null;

    for (const r of rows) {
      const c = fuzz ? snapToGrid(r, partnerPrivacy.fuzzRadiusM) : { lat: r.lat, lng: r.lng };
      if (prev) distanceM += haversineMeters(prev, c);
      prev = c;
      points.push([c.lng, c.lat, r.recordedAt.getTime()]);
    }

    return { userId: ctx.partnerId, points, distanceM: Math.round(distanceM) };
  }

  /**
   * Khoảng cách giữa hai người ngay lúc này, tính bằng PostGIS.
   *
   * Phải TÔN TRỌNG cài đặt riêng tư của đối phương, không chỉ endpoint trả
   * toạ độ. Trace Phase 2 (TC-63) bắt được: khi An bật chế độ ẩn danh thì
   * `location` đã là null nhưng `distanceM` vẫn trả 9314 — Bình vẫn biết
   * chính xác An cách mình bao xa, tức là ẩn danh chỉ có tác dụng một nửa.
   *
   * Tương tự với làm mờ: biết vị trí của mình + khoảng cách chính xác là đủ
   * để khoanh đối phương vào một đường tròn; góp vài mẫu theo thời gian là
   * suy ra được vị trí thật. Nên khoảng cách cũng bị làm tròn theo bán kính mờ.
   */
  async distanceBetween(userId: string): Promise<number | null> {
    const ctx = await this.getContext(userId);
    if (!ctx.partnerId) return null;

    const partner = await this.prisma.user.findUnique({
      where: { id: ctx.partnerId },
      select: { privacy: true },
    });
    const partnerPrivacy = parsePrivacy(partner?.privacy);
    if (partnerPrivacy.ghostMode) return null;

    await this.flush();

    const rows = await this.prisma.$queryRaw<{ meters: number | null }[]>`
      WITH me AS (
        SELECT geog FROM location_points
         WHERE "userId" = ${ctx.userId} AND geog IS NOT NULL
         ORDER BY "recordedAt" DESC LIMIT 1
      ), partner AS (
        SELECT geog FROM location_points
         WHERE "userId" = ${ctx.partnerId} AND geog IS NOT NULL
         ORDER BY "recordedAt" DESC LIMIT 1
      )
      SELECT ST_Distance(me.geog, partner.geog) AS meters FROM me, partner
    `;

    const meters = rows[0]?.meters;
    if (typeof meters !== 'number') return null;

    if (partnerPrivacy.fuzzRadiusM > 0) {
      // Làm tròn theo đúng bán kính mờ để con số này không chính xác hơn
      // toạ độ mà đối phương đang cho phép nhìn thấy.
      const r = partnerPrivacy.fuzzRadiusM;
      return Math.round(meters / r) * r;
    }
    return Math.round(meters);
  }

  /** Dọn lịch sử vị trí theo chính sách lưu trữ (ARCHITECTURE.md §6). */
  async pruneOldLocations(now: Date = new Date()): Promise<{ deleted: number; thinned: number }> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

    // Quá 90 ngày: xoá hẳn
    const deleted = await this.prisma.locationPoint.deleteMany({
      where: { recordedAt: { lt: ninetyDaysAgo } },
    });

    // 7–90 ngày: nén còn 1 điểm mỗi 15 phút cho mỗi người.
    // Giữ lại điểm có id nhỏ nhất trong mỗi khung 15 phút.
    const thinned = await this.prisma.$executeRaw`
      DELETE FROM location_points lp
      WHERE lp."recordedAt" < ${sevenDaysAgo}
        AND lp."recordedAt" >= ${ninetyDaysAgo}
        AND lp.id NOT IN (
          SELECT MIN(id) FROM location_points
           WHERE "recordedAt" < ${sevenDaysAgo}
             AND "recordedAt" >= ${ninetyDaysAgo}
           GROUP BY "userId", date_trunc('hour', "recordedAt"),
                    (EXTRACT(MINUTE FROM "recordedAt")::int / 15)
        )
    `;

    return { deleted: deleted.count, thinned: Number(thinned) };
  }
}
