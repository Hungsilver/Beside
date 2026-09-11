import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocationsModule } from '../locations/locations.module';
import { StudyController } from './study.controller';
import { StudyService } from './study.service';
import { StudyPlanService } from './study-plan.service';
import { StudyGateway } from './study.gateway';
import { StudyClockJob } from './study-clock.job';

@Module({
  // AuthModule: gateway tự xác thực token ở bước bắt tay, cần TokenService.
  // LocationsModule: dùng lại `getContext()` để kiểm quyền theo coupleId —
  // một nguồn sự thật cho "ai thuộc couple nào".
  imports: [AuthModule, LocationsModule],
  controllers: [StudyController],
  providers: [StudyService, StudyPlanService, StudyGateway, StudyClockJob],
  exports: [StudyService],
})
export class StudyModule {}
