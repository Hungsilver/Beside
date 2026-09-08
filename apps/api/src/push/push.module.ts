import { Global, Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/**
 * Global: gần như module nghiệp vụ nào cũng có lúc cần gửi thông báo
 * (nhắc lịch, geofence, check-in mới), nên đăng ký một lần cho gọn.
 */
@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
