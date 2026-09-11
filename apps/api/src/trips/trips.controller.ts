import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { startTripSchema, type StartTripInput, type TripResponse } from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { TripsService } from './trips.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  /** Chuyến đang chạy của couple — của mình HOẶC của người ấy. */
  @Get('current')
  async current(@CurrentUserId() userId: string): Promise<{ trip: TripResponse | null }> {
    return { trip: await this.trips.current(userId) };
  }

  @Post()
  async start(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(startTripSchema)) dto: StartTripInput,
  ): Promise<TripResponse> {
    return this.trips.start(userId, dto.placeId);
  }

  @Post(':id/arrive')
  @HttpCode(HttpStatus.OK)
  async arrive(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TripResponse> {
    return this.trips.arrive(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.trips.cancel(userId, id);
  }
}
