import { forwardRef, Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { PushModule } from '../push/push.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripExpiryJob } from './trip-expiry.job';

/**
 * F13 — "Đang trên đường về".
 *
 * `forwardRef` với LocationsModule vì hàng rào ảo (nằm trong luồng vị trí) gọi
 * ngược vào `TripsService.onArrivedAtPlace()` để đóng chuyến khi tới nơi.
 */
@Module({
  imports: [forwardRef(() => LocationsModule), PushModule],
  controllers: [TripsController],
  providers: [TripsService, TripExpiryJob],
  exports: [TripsService],
})
export class TripsModule {}
