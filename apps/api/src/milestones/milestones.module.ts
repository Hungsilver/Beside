import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';
import { MilestoneReminderJob } from './milestone-reminder.job';

@Module({
  // LocationsModule: dùng lại getContext() để lấy coupleId, như mọi module khác.
  imports: [LocationsModule],
  controllers: [MilestonesController],
  providers: [MilestonesService, MilestoneReminderJob],
  exports: [MilestonesService],
})
export class MilestonesModule {}
