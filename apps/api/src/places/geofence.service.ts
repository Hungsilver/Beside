import { Injectable, Logger } from '@nestjs/common';
import { GeofenceEventType } from '@prisma/client';
import {
  accuracyUsableFor,
  decideTransition,
  GEOFENCE_MIN_DWELL_MS,
  haversineMeters,
  type PushPayload,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { PushService } from '../push/push.service';

export interface GeofencePoint {
  lat: number;
  lng: number;
  accuracyM: number;
  at: Date;
}

export interface GeofenceContext {
  userId: string;
  coupleId: string;
  partnerId: string | null;
  displayName: string;
  /** Bán kính làm mờ vị trí của chính người này (0 = không làm mờ). */
  fuzzRadiusM: number;
}

/**
 * Hàng rào ảo phía server (ARCHITECTURE.md §2, lớp L3).
 *
 * Chạy trên server chứ không trên máy người dùng: không tốn pin, không phụ thuộc
 * quyền nền của iOS, và logic nằm một chỗ nên test được.
 *
 * Ba thứ chống báo sai, theo đúng thứ tự quan trọng:
 *
 *   1. **Chặn theo sai số GPS.** Một điểm sai số 500 m không thể trả lời
 *      "có đang trong vòng 150 m quanh nhà không". Bỏ qua điểm đó.
 *   2. **Khoảng chênh vào/ra.** Ra phải xa hơn vào 35% mới tính là đã rời đi,
 *      nếu không người ngồi ngay mép hàng rào sẽ sinh một tràng thông báo.
 *   3. **Phải ở đủ lâu.** Đi xe ngang qua nhà không phải là về tới nhà.
 */
@Injectable()
export class GeofenceService {
  private readonly logger = new Logger(GeofenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Đối chiếu một điểm vị trí với mọi địa điểm đã lưu của cặp đôi.
   *
   * KHÔNG bao giờ ném lỗi ra ngoài: đây là việc phụ chạy kèm mỗi lần nhận vị
   * trí, hỏng thì chỉ mất thông báo, không được làm hỏng luồng vị trí.
   */
  async evaluate(ctx: GeofenceContext, point: GeofencePoint): Promise<void> {
    try {
      await this.evaluateInner(ctx, point);
    } catch (err) {
      this.logger.warn(`Đối chiếu hàng rào thất bại: ${(err as Error).message}`);
    }
  }

  private async evaluateInner(ctx: GeofenceContext, point: GeofencePoint): Promise<void> {
    const places = await this.prisma.place.findMany({
      where: { coupleId: ctx.coupleId },
      select: {
        id: true,
        name: true,
        emoji: true,
        lat: true,
        lng: true,
        radiusM: true,
        notifyOnArrive: true,
        notifyOnLeave: true,
      },
    });
    if (places.length === 0) return;

    const states = await this.prisma.geofenceState.findMany({
      where: { userId: ctx.userId, placeId: { in: places.map((p) => p.id) } },
    });
    const stateOf = new Map(states.map((s) => [s.placeId, s]));

    for (const place of places) {
      // Sai số quá lớn so với bán kính → điểm này không kết luận được gì.
      // Giữ nguyên trạng thái cũ, đợi điểm tốt hơn.
      if (!accuracyUsableFor(point.accuracyM, place.radiusM)) continue;

      const distanceM = haversineMeters(
        { lat: point.lat, lng: point.lng },
        { lat: place.lat, lng: place.lng },
      );
      const previous = stateOf.get(place.id);
      const wasInside = previous?.inside ?? false;
      const transition = decideTransition(wasInside, distanceM, place.radiusM);

      if (transition === 'STAY_OUT') {
        // Đã ra hẳn thì xoá luôn mốc "đang chờ đủ lâu" của lượt vào dở dang.
        if (previous?.candidateSince) {
          await this.saveState(ctx.userId, place.id, false, null);
        }
        continue;
      }

      if (transition === 'STAY_IN') {
        if (previous?.candidateSince) {
          await this.saveState(ctx.userId, place.id, true, null);
        }
        continue;
      }

      if (transition === 'ENTER') {
        const since = previous?.candidateSince;
        if (!since) {
          // Lần đầu thấy ở trong: bắt đầu bấm giờ, chưa báo gì cả.
          await this.saveState(ctx.userId, place.id, false, point.at);
          continue;
        }
        if (point.at.getTime() - since.getTime() < GEOFENCE_MIN_DWELL_MS) {
          continue; // vẫn đang bấm giờ
        }
        await this.saveState(ctx.userId, place.id, true, null);
        await this.record(ctx, place, GeofenceEventType.ARRIVED, point.at);
        continue;
      }

      // EXIT
      await this.saveState(ctx.userId, place.id, false, null);
      await this.record(ctx, place, GeofenceEventType.LEFT, point.at);
    }
  }

  private async saveState(
    userId: string,
    placeId: string,
    inside: boolean,
    candidateSince: Date | null,
  ): Promise<void> {
    await this.prisma.geofenceState.upsert({
      where: { userId_placeId: { userId, placeId } },
      create: { userId, placeId, inside, candidateSince },
      update: { inside, candidateSince },
    });
  }

  private async record(
    ctx: GeofenceContext,
    place: { id: string; name: string; emoji: string; radiusM: number; notifyOnArrive: boolean; notifyOnLeave: boolean },
    type: GeofenceEventType,
    at: Date,
  ): Promise<void> {
    await this.prisma.geofenceEvent.create({
      data: {
        coupleId: ctx.coupleId,
        userId: ctx.userId,
        placeId: place.id,
        type,
        occurredAt: at,
      },
    });

    const wants = type === GeofenceEventType.ARRIVED ? place.notifyOnArrive : place.notifyOnLeave;
    if (!wants || !ctx.partnerId) return;

    /*
     * Tôn trọng "làm mờ vị trí".
     *
     * Nếu người dùng đã chọn chỉ chia sẻ ở mức 500 m mà server lại nhắn "vừa
     * tới Nhà" thì hoá ra lại tiết lộ CHÍNH XÁC HƠN mức họ đồng ý — tên một
     * địa điểm cụ thể còn rõ hơn một toạ độ mờ. Nên khi bán kính làm mờ rộng
     * bằng hoặc hơn hàng rào, giữ lại lịch sử cho chính chủ nhưng không báo
     * cho người kia.
     */
    if (ctx.fuzzRadiusM > 0 && ctx.fuzzRadiusM >= place.radiusM) return;

    const arrived = type === GeofenceEventType.ARRIVED;
    const payload: PushPayload = {
      kind: arrived ? 'PARTNER_ARRIVED' : 'PARTNER_LEFT',
      title: `${place.emoji} ${ctx.displayName} ${arrived ? 'vừa tới' : 'vừa rời'} ${place.name}`,
      body: arrived ? 'Nhắn cho người ấy một câu nhé 💕' : 'Chắc đang trên đường đi',
      url: '/ban-do',
      // Cùng một địa điểm thì gộp, không xếp chồng trong khay.
      tag: `place:${place.id}`,
      at: at.getTime(),
    };

    await this.push.sendToUser(ctx.partnerId, payload);
  }

  /** Ai đang ở trong hàng rào nào — dùng để tô màu danh sách địa điểm. */
  async insideByPlace(coupleId: string): Promise<Map<string, string[]>> {
    const rows = await this.prisma.geofenceState.findMany({
      where: { inside: true, place: { coupleId } },
      select: { userId: true, placeId: true },
    });
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const list = map.get(r.placeId);
      if (list) list.push(r.userId);
      else map.set(r.placeId, [r.userId]);
    }
    return map;
  }
}
