import { Injectable } from '@nestjs/common';
import type { Place } from '@prisma/client';
import {
  ERROR_CODES,
  MAX_PLACES_PER_COUPLE,
  type CreatePlaceInput,
  type PlaceResponse,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { LocationsService } from '../locations/locations.service';
import { GeofenceService } from './geofence.service';

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly geofence: GeofenceService,
  ) {}

  async list(userId: string): Promise<PlaceResponse[]> {
    const ctx = await this.locations.getContext(userId);
    const [places, inside] = await Promise.all([
      this.prisma.place.findMany({
        where: { coupleId: ctx.coupleId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.geofence.insideByPlace(ctx.coupleId),
    ]);
    return places.map((p) => this.toResponse(p, inside.get(p.id) ?? []));
  }

  async create(userId: string, input: CreatePlaceInput): Promise<PlaceResponse> {
    const ctx = await this.locations.getContext(userId);

    const count = await this.prisma.place.count({ where: { coupleId: ctx.coupleId } });
    if (count >= MAX_PLACES_PER_COUPLE) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Tối đa ${MAX_PLACES_PER_COUPLE} địa điểm — xoá bớt chỗ cũ trước nhé`,
      );
    }

    const place = await this.prisma.place.create({
      data: {
        coupleId: ctx.coupleId,
        name: input.name,
        emoji: input.emoji,
        lat: input.lat,
        lng: input.lng,
        radiusM: input.radiusM,
        notifyOnArrive: input.notifyOnArrive,
        notifyOnLeave: input.notifyOnLeave,
      },
    });
    return this.toResponse(place, []);
  }

  async update(
    userId: string,
    placeId: string,
    input: CreatePlaceInput,
  ): Promise<PlaceResponse> {
    const ctx = await this.locations.getContext(userId);
    const existing = await this.prisma.place.findFirst({
      where: { id: placeId, coupleId: ctx.coupleId },
      select: { id: true, lat: true, lng: true, radiusM: true },
    });
    if (!existing) throw this.notFound();

    const moved =
      existing.lat !== input.lat ||
      existing.lng !== input.lng ||
      existing.radiusM !== input.radiusM;

    const place = await this.prisma.place.update({
      where: { id: placeId },
      data: {
        name: input.name,
        emoji: input.emoji,
        lat: input.lat,
        lng: input.lng,
        radiusM: input.radiusM,
        notifyOnArrive: input.notifyOnArrive,
        notifyOnLeave: input.notifyOnLeave,
      },
    });

    /*
     * Dời hàng rào hoặc đổi bán kính thì trạng thái cũ vô nghĩa: người đang
     * "ở trong" hàng rào cũ có thể đã nằm ngoài hàng rào mới. Không xoá thì
     * họ sẽ nhận một thông báo "vừa rời đi" từ một nơi chưa từng tới.
     */
    if (moved) {
      await this.prisma.geofenceState.deleteMany({ where: { placeId } });
    }

    return this.toResponse(place, moved ? [] : ((await this.geofence.insideByPlace(ctx.coupleId)).get(placeId) ?? []));
  }

  async remove(userId: string, placeId: string): Promise<void> {
    const ctx = await this.locations.getContext(userId);
    const existing = await this.prisma.place.findFirst({
      where: { id: placeId, coupleId: ctx.coupleId },
      select: { id: true },
    });
    if (!existing) throw this.notFound();

    // Trạng thái và lịch sử sự kiện cascade theo khoá ngoại.
    await this.prisma.place.delete({ where: { id: placeId } });
  }

  private notFound(): AppError {
    return AppError.notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy địa điểm này');
  }

  private toResponse(place: Place, peopleInside: string[]): PlaceResponse {
    return {
      id: place.id,
      name: place.name,
      emoji: place.emoji,
      lat: place.lat,
      lng: place.lng,
      radiusM: place.radiusM,
      notifyOnArrive: place.notifyOnArrive,
      notifyOnLeave: place.notifyOnLeave,
      peopleInside,
    };
  }
}
