import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { CouplesController } from './couples.controller';
import { CouplesService } from './couples.service';

@Module({
  // Huỷ ghép đôi phải dọn cả vị trí đã cache trong Redis, không chỉ dữ liệu trong DB.
  imports: [LocationsModule],
  controllers: [CouplesController],
  providers: [CouplesService],
  exports: [CouplesService],
})
export class CouplesModule {}
