import { forwardRef, Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { GeofenceService } from './geofence.service';

/**
 * forwardRef vì hai module cần nhau theo hai chiều:
 *   - PlacesService dùng LocationsService.getContext() để lấy coupleId
 *   - LocationsService gọi GeofenceService mỗi lần nhận một điểm vị trí
 *
 * Tách GeofenceService ra một module riêng cũng được, nhưng nó thuộc về khái
 * niệm "địa điểm" chứ không phải "vị trí" — để chung ở đây dễ tìm hơn.
 */
@Module({
  imports: [forwardRef(() => LocationsModule)],
  controllers: [PlacesController],
  providers: [PlacesService, GeofenceService],
  exports: [GeofenceService],
})
export class PlacesModule {}
