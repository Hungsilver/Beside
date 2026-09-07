import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  // Caddy đứng trước → tin X-Forwarded-* để req.ip ra IP thật của client,
  // nếu không thì rate limit sẽ tính chung cho mọi người (đều là IP của proxy).
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Trang web do Caddy phục vụ, không phải API. Đặt CSP ở một nơi duy nhất
      // (Caddyfile) để tránh hai chỗ cấu hình lệch nhau.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());

  const origins = [
    config.get('APP_ORIGIN', { infer: true }),
    ...(config.get('CORS_EXTRA_ORIGINS', { infer: true }) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ];

  app.enableCors({
    origin: origins,
    credentials: true, // bắt buộc để trình duyệt gửi cookie refresh token
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  logger.log(`API chạy ở http://0.0.0.0:${port}/api/v1`);
  logger.log(`Origin được phép: ${origins.join(', ')}`);
}

void bootstrap();
