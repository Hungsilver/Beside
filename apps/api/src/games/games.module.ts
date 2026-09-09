import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocationsModule } from '../locations/locations.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { GamesGateway } from './games.gateway';
import { GameClockJob } from './game-clock.job';

@Module({
  // AuthModule: gateway tự xác thực token ở bước bắt tay, cần TokenService.
  // LocationsModule: dùng lại `getContext()` để kiểm quyền theo coupleId —
  // một nguồn sự thật cho "ai thuộc couple nào", không viết lại lần thứ hai.
  imports: [AuthModule, LocationsModule],
  controllers: [GamesController],
  providers: [GamesService, GamesGateway, GameClockJob],
  exports: [GamesService],
})
export class GamesModule {}
