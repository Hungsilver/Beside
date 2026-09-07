import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { LocSource } from '@prisma/client';
import {
  locationPingSchema,
  trailQuerySchema,
  type LocationPointInput,
  type PartnerLatestLocation,
  type PartnerTrail,
  type TrailQuery,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { LocationsService } from './locations.service';

export interface PingResult {
  accepted: boolean;
  /** Lý do bị từ chối, để giao diện giải thích cho người dùng. */
  reason?: string;
}

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  /**
   * Lớp L2 — ping bị động lúc mở app (ARCHITECTURE.md §2).
   * Đây là thứ giữ cho "lần cuối thấy ở đâu" luôn có dữ liệu, kể cả khi
   * người dùng không bật chia sẻ trực tiếp.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async ping(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(locationPingSchema)) dto: LocationPointInput,
  ): Promise<PingResult> {
    const ctx = await this.locations.getContext(userId);
    const result = await this.locations.ingest(ctx, dto, LocSource.PING);

    return result.accepted ? { accepted: true } : { accepted: false, reason: result.reason };
  }

  @Get('partner/latest')
  async partnerLatest(
    @CurrentUserId() userId: string,
  ): Promise<{ location: PartnerLatestLocation | null; distanceM: number | null }> {
    const [location, distanceM] = await Promise.all([
      this.locations.getPartnerLatest(userId),
      this.locations.distanceBetween(userId),
    ]);
    return { location, distanceM };
  }

  @Get('partner/trail')
  async partnerTrail(
    @CurrentUserId() userId: string,
    @Query(new ZodBody(trailQuerySchema)) query: TrailQuery,
  ): Promise<PartnerTrail> {
    return this.locations.getPartnerTrail(userId, query);
  }
}
