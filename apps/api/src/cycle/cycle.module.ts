import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { PushModule } from '../push/push.module';
import { CycleController } from './cycle.controller';
import { CycleService } from './cycle.service';
import { CycleReminderJob } from './cycle-reminder.job';

/** F14 — theo dõi chu kỳ kinh nguyệt. Dữ liệu của MỘT người, không của couple. */
@Module({
  imports: [LocationsModule, PushModule],
  controllers: [CycleController],
  providers: [CycleService, CycleReminderJob],
})
export class CycleModule {}
