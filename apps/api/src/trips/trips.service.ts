import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import {
  DISPLAY_TIMEZONE,
  ERROR_CODES,
  estimateRemainingMs,
  haversineMeters,
  TRIP_MAX_DURATION_MS,
  type TripResponse,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';
import { PushService } from '../push/push.service';

/** Quan hệ cần cho mọi câu trả lời về chuyến đi. */
const TRIP_INCLUDE = {
  user: { select: { id: true, displayName: true } },
  place: { select: { id: true, name: true, emoji: true, lat: true, lng: true } },
} as const;

type TripRow = Prisma.TripGetPayload<{ include: typeof TRIP_INCLUDE }>;

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly push: PushService,
  ) {}

  // ------------------------------------------------------------------

  /**
   * Bắt đầu một chuyến.
   *
   * Chế độ ẩn danh thì KHÔNG cho bắt đầu: chuyến đi là một lời mời "nhìn tôi
   * về tới nơi", mà ẩn danh nghĩa là server không phát vị trí nào cả. Bật cả
   * hai cùng lúc chỉ tạo ra một thanh trạng thái đứng im mãi mãi.
   */
  async start(userId: string, placeId: string): Promise<TripResponse> {
    const ctx = await this.locations.getContext(userId);

    if (ctx.privacy.ghostMode) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        'Đang bật chế độ ẩn danh nên không chia sẻ chuyến đi được. Tắt ẩn danh rồi thử lại nhé.',
      );
    }

    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, coupleId: true, name: true, emoji: true },
    });
    // Cùng một câu trả lời cho "không tồn tại" và "không phải của couple bạn".
    if (!place || place.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy địa điểm này');
    }

    // Mỗi người một chuyến: bắt đầu chuyến mới thì chuyến cũ coi như huỷ.
    await this.prisma.trip.updateMany({
      where: { userId, status: TripStatus.ACTIVE },
      data: { status: TripStatus.CANCELLED, endedAt: new Date() },
    });

    const trip = await this.prisma.trip.create({
      data: { coupleId: ctx.coupleId, userId, placeId },
      include: TRIP_INCLUDE,
    });

    const response = await this.toResponse(trip);

    // Không await: báo cho người ấy là việc phụ, không được làm chậm hay làm
    // hỏng câu trả lời cho người vừa bấm nút.
    void this.push.sendToPartner(userId, {
      kind: 'TRIP_STARTED',
      title: `${trip.user.displayName} đang trên đường`,
      body: response.etaAt
        ? `Về ${place.emoji} ${place.name} · dự kiến ${formatClock(response.etaAt)}`
        : `Về ${place.emoji} ${place.name}`,
      url: '/ban-do',
      tag: `trip:${trip.id}`,
      at: Date.now(),
    });

    return response;
  }

  // ------------------------------------------------------------------

  /**
   * Chuyến đang chạy của CẶP ĐÔI — của mình hoặc của người ấy.
   *
   * Trả về chuyến của cả hai chứ không riêng mình: màn Bản đồ cần biết "người
   * ấy đang về" để hiện thanh trạng thái, và đó mới là nửa có giá trị nhất.
   */
  async current(userId: string): Promise<TripResponse | null> {
    const ctx = await this.locations.getContext(userId);

    const trip = await this.prisma.trip.findFirst({
      where: { coupleId: ctx.coupleId, status: TripStatus.ACTIVE },
      orderBy: { startedAt: 'desc' },
      include: TRIP_INCLUDE,
    });
    if (!trip) return null;

    // Quá hạn mà cron chưa kịp quét: đóng ngay tại chỗ thay vì trả về một
    // chuyến treo. Cron vẫn giữ vai trò dọn cho các couple không mở app.
    if (Date.now() - trip.startedAt.getTime() > TRIP_MAX_DURATION_MS) {
      await this.expire(trip.id);
      return null;
    }

    return this.toResponse(trip);
  }

  /** Tự bấm "đã tới nơi". */
  async arrive(userId: string, tripId: string): Promise<TripResponse> {
    const ctx = await this.locations.getContext(userId);
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: TRIP_INCLUDE });

    if (!trip || trip.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy chuyến đi này');
    }
    // Người kia không bấm hộ được: chỉ người đang đi mới biết mình tới chưa.
    if (trip.userId !== userId) {
      throw AppError.forbidden(ERROR_CODES.FORBIDDEN, 'Chỉ người đang đi mới kết thúc được chuyến');
    }
    if (trip.status !== TripStatus.ACTIVE) return this.toResponse(trip);

    return this.toResponse(await this.markArrived(trip));
  }

  /** Huỷ chuyến (đổi ý, không về nữa). */
  async cancel(userId: string, tripId: string): Promise<void> {
    const ctx = await this.locations.getContext(userId);
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });

    if (!trip || trip.coupleId !== ctx.coupleId) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy chuyến đi này');
    }
    if (trip.userId !== userId) {
      throw AppError.forbidden(ERROR_CODES.FORBIDDEN, 'Chỉ người đang đi mới huỷ được chuyến');
    }
    if (trip.status !== TripStatus.ACTIVE) return;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.CANCELLED, endedAt: new Date() },
    });
  }

  // ------------------------------------------------------------------

  /**
   * Hàng rào ảo báo người này vừa tới một địa điểm.
   *
   * Nếu đó đúng là điểm đến của chuyến đang chạy thì chuyến tự kết thúc — đây
   * chính là lý do chuyến đi chỉ nhận điểm đến là một `Place` đã lưu.
   *
   * KHÔNG bao giờ ném lỗi ra ngoài: nó được gọi trong luồng ghi nhận vị trí,
   * hỏng thì chỉ mất một thông báo, không được kéo theo cả luồng đó.
   */
  async onArrivedAtPlace(userId: string, placeId: string, at: Date): Promise<void> {
    try {
      const trip = await this.prisma.trip.findFirst({
        where: { userId, placeId, status: TripStatus.ACTIVE },
        include: TRIP_INCLUDE,
      });
      if (!trip) return;
      await this.markArrived(trip, at);
    } catch (err) {
      this.logger.warn(`Không đóng được chuyến đi khi tới nơi: ${(err as Error).message}`);
    }
  }

  /** Dọn các chuyến đi mãi không tới nơi. Cron gọi. */
  async expireStale(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - TRIP_MAX_DURATION_MS);
    const { count } = await this.prisma.trip.updateMany({
      where: { status: TripStatus.ACTIVE, startedAt: { lt: cutoff } },
      data: { status: TripStatus.EXPIRED, endedAt: now },
    });
    if (count > 0) this.logger.log(`Đã đóng ${count} chuyến đi quá hạn`);
    return count;
  }

  // ------------------------------------------------------------------

  private async markArrived(trip: TripRow, at: Date = new Date()): Promise<TripRow> {
    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { status: TripStatus.ARRIVED, arrivedAt: at, endedAt: at },
      include: TRIP_INCLUDE,
    });

    void this.push.sendToPartner(trip.userId, {
      kind: 'TRIP_ARRIVED',
      title: `${trip.user.displayName} đã về tới nơi`,
      body: `${trip.place.emoji} ${trip.place.name} · an toàn rồi nhé 💕`,
      url: '/ban-do',
      tag: `trip:${trip.id}`,
      at: at.getTime(),
    });

    return updated;
  }

  private async expire(tripId: string): Promise<void> {
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.EXPIRED, endedAt: new Date() },
    });
  }

  /**
   * Dựng câu trả lời, kèm khoảng cách còn lại và giờ dự kiến.
   *
   * Hai con số đó được tính LÚC ĐỌC từ điểm vị trí mới nhất của người đang đi,
   * không lưu trong bảng. Lưu thì phải có một job cập nhật liên tục, và mỗi lần
   * server ngủ dậy là một con số cũ nằm chình ình trên màn hình người kia.
   *
   * Toạ độ của người đang đi KHÔNG bao giờ đi ra khỏi hàm này — chỉ khoảng
   * cách và giờ dự kiến. Vị trí thật vẫn đi theo đúng đường cũ (§6.2), nơi đã
   * có sẵn luật ẩn danh và làm mờ.
   */
  private async toResponse(trip: TripRow): Promise<TripResponse> {
    const last = await this.prisma.locationPoint.findFirst({
      where: { userId: trip.userId },
      orderBy: { recordedAt: 'desc' },
      select: { lat: true, lng: true, speedMps: true, recordedAt: true },
    });

    const remainingM = last
      ? Math.round(
          haversineMeters(
            { lat: last.lat, lng: last.lng },
            { lat: trip.place.lat, lng: trip.place.lng },
          ),
        )
      : null;

    const remainingMs = estimateRemainingMs(remainingM, last?.speedMps ?? null);

    return {
      id: trip.id,
      status: trip.status,
      userId: trip.userId,
      userName: trip.user.displayName,
      placeId: trip.place.id,
      placeName: trip.place.name,
      placeEmoji: trip.place.emoji,
      startedAt: trip.startedAt.toISOString(),
      arrivedAt: trip.arrivedAt?.toISOString() ?? null,
      remainingM,
      etaAt: remainingMs === null ? null : new Date(Date.now() + remainingMs).toISOString(),
      basedOnTs: last?.recordedAt.getTime() ?? null,
    };
  }
}

/** "22:15" theo giờ Việt Nam — dùng trong nội dung thông báo đẩy. */
function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
