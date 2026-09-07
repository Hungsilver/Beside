import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { LocationsController } from './locations.controller';
import { LocationsGateway } from './locations.gateway';
import { LocationsService } from './locations.service';
import { LocationRetentionJob } from './location-retention.job';

@Module({
  // Gateway cần TokenService để xác thực lúc bắt tay WebSocket.
  imports: [AuthModule, ScheduleModule.forRoot()],
  controllers: [LocationsController],
  providers: [LocationsService, LocationsGateway, LocationRetentionJob],
  exports: [LocationsService],
})
export class LocationsModule {}
