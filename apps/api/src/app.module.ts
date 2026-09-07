import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { StorageModule } from './common/storage/storage.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CouplesModule } from './couples/couples.module';
import { LocationsModule } from './locations/locations.module';
import { PostsModule } from './posts/posts.module';
import { EventsModule } from './events/events.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Đọc .env ở gốc monorepo để API và Docker dùng chung một file.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      // Hạn mức chung; endpoint nhạy cảm siết thêm bằng @Throttle tại chỗ.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    RedisModule,
    StorageModule,
    AuthModule,
    UsersModule,
    CouplesModule,
    LocationsModule,
    PostsModule,
    EventsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Thứ tự quan trọng: chặn spam TRƯỚC khi tốn công xác thực token.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
