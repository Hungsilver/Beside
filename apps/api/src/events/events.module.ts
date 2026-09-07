import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  // LocationsModule: dùng lại `getContext()` để lấy coupleId + kiểm tra đã ghép đôi,
  // thay vì viết lại phép kiểm tra ấy ở đây (một nguồn sự thật cho quyền theo couple).
  imports: [LocationsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
