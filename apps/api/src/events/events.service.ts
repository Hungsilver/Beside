import { Injectable } from '@nestjs/common';
import { Prisma, type Event, type User } from '@prisma/client';
import {
  ERROR_CODES,
  normalizeEventTimes,
  type CreateEventInput,
  type EventRangeQuery,
  type EventResponse,
  type EventVisibility,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';

type EventWithAuthor = Event & { createdBy: Pick<User, 'id' | 'displayName'> };

const withAuthor = {
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.EventInclude;

/** Emoji mặc định khi người dùng không chọn gì. */
const DEFAULT_EMOJI = '📅';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  // ------------------------------------------------------------------

  async create(userId: string, input: CreateEventInput): Promise<EventResponse> {
    const ctx = await this.locations.getContext(userId);
    const times = normalizeEventTimes(input);
    await this.assertPlaceBelongsToCouple(ctx.coupleId, input.placeId);

    const event = await this.prisma.event.create({
      data: {
        coupleId: ctx.coupleId,
        createdById: userId,
        title: input.title,
        note: input.note ?? null,
        emoji: input.emoji ?? DEFAULT_EMOJI,
        allDay: times.allDay,
        startAt: new Date(times.startAtMs),
        endAt: times.endAtMs === null ? null : new Date(times.endAtMs),
        placeId: input.placeId ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        remindMinBefore: input.remindMinBefore ?? null,
        visibility: input.visibility,
      },
      include: withAuthor,
    });

    return this.toResponse(event, userId);
  }

  // ------------------------------------------------------------------

  /**
   * Sự kiện GIAO với khoảng [from, to).
   *
   * Điều kiện giao là `startAt < to AND (endAt ?? startAt) >= from` — không
   * phải `startAt >= from AND startAt < to`. Nếu lọc theo mỗi `startAt` thì
   * chuyến đi 3 ngày bắt đầu từ hôm qua sẽ biến mất khỏi lịch hôm nay, đúng
   * lúc người dùng cần thấy nó nhất.
   */
  async findRange(userId: string, range: EventRangeQuery): Promise<EventResponse[]> {
    const ctx = await this.locations.getContext(userId);
    const from = new Date(range.from);
    const to = new Date(range.to);

    const events = await this.prisma.event.findMany({
      where: {
        coupleId: ctx.coupleId,
        // Việc riêng thì chỉ người tạo nhìn thấy — kiểm ở TẦNG SERVICE (R3).
        OR: [{ visibility: 'SHARED' }, { createdById: userId }],
        startAt: { lt: to },
        AND: [
          {
            OR: [{ endAt: { gte: from } }, { endAt: null, startAt: { gte: from } }],
          },
        ],
      },
      include: withAuthor,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });

    return events.map((e) => this.toResponse(e, userId));
  }

  // ------------------------------------------------------------------

  async findOne(userId: string, eventId: string): Promise<EventResponse> {
    const ctx = await this.locations.getContext(userId);
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        coupleId: ctx.coupleId,
        OR: [{ visibility: 'SHARED' }, { createdById: userId }],
      },
      include: withAuthor,
    });
    if (!event) throw this.notFound();
    return this.toResponse(event, userId);
  }

  // ------------------------------------------------------------------

  async update(
    userId: string,
    eventId: string,
    input: CreateEventInput,
  ): Promise<EventResponse> {
    const ctx = await this.locations.getContext(userId);

    // Tìm trong phạm vi couple trước, rồi mới xét quyền sửa. Hai bước tách
    // riêng để phân biệt "không có" (404) với "có nhưng không phải của bạn" (403).
    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, coupleId: ctx.coupleId },
      select: { id: true, createdById: true, visibility: true },
    });
    if (!existing) throw this.notFound();
    // Việc riêng của người kia thì coi như không tồn tại, không được lộ ra là có.
    if (existing.visibility === 'PRIVATE' && existing.createdById !== userId) {
      throw this.notFound();
    }
    if (existing.createdById !== userId) {
      throw AppError.forbidden(
        ERROR_CODES.FORBIDDEN,
        'Chỉ người tạo mới sửa được sự kiện này',
      );
    }

    const times = normalizeEventTimes(input);
    await this.assertPlaceBelongsToCouple(ctx.coupleId, input.placeId);

    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        title: input.title,
        note: input.note ?? null,
        emoji: input.emoji ?? DEFAULT_EMOJI,
        allDay: times.allDay,
        startAt: new Date(times.startAtMs),
        endAt: times.endAtMs === null ? null : new Date(times.endAtMs),
        placeId: input.placeId ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        remindMinBefore: input.remindMinBefore ?? null,
        visibility: input.visibility,
      },
      include: withAuthor,
    });

    return this.toResponse(event, userId);
  }

  // ------------------------------------------------------------------

  async remove(userId: string, eventId: string): Promise<void> {
    const ctx = await this.locations.getContext(userId);

    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, coupleId: ctx.coupleId },
      select: { id: true, createdById: true, visibility: true },
    });
    if (!existing) throw this.notFound();
    if (existing.visibility === 'PRIVATE' && existing.createdById !== userId) {
      throw this.notFound();
    }
    if (existing.createdById !== userId) {
      throw AppError.forbidden(
        ERROR_CODES.FORBIDDEN,
        'Chỉ người tạo mới xoá được sự kiện này',
      );
    }

    await this.prisma.event.delete({ where: { id: eventId } });
  }

  // ------------------------------------------------------------------

  /**
   * Địa điểm gắn kèm phải thuộc chính couple này. Không kiểm thì người dùng có
   * thể gắn `placeId` của cặp đôi khác và moi được tên/toạ độ nơi đó ra.
   */
  private async assertPlaceBelongsToCouple(
    coupleId: string,
    placeId: string | undefined,
  ): Promise<void> {
    if (!placeId) return;
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, coupleId },
      select: { id: true },
    });
    if (!place) {
      throw AppError.notFound(ERROR_CODES.NOT_FOUND, 'Địa điểm này không tồn tại');
    }
  }

  /** Dùng chung một câu chữ cho mọi trường hợp "không thấy" — không rò rỉ id nào có thật. */
  private notFound(): AppError {
    return AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy sự kiện này');
  }

  private toResponse(event: EventWithAuthor, viewerId: string): EventResponse {
    return {
      id: event.id,
      title: event.title,
      note: event.note,
      emoji: event.emoji,
      allDay: event.allDay,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt?.toISOString() ?? null,
      placeId: event.placeId,
      lat: event.lat,
      lng: event.lng,
      remindMinBefore: event.remindMinBefore,
      visibility: event.visibility as EventVisibility,
      createdById: event.createdById,
      createdByName: event.createdBy.displayName,
      canEdit: event.createdById === viewerId,
    };
  }
}
