import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Public } from '../auth/jwt-auth.guard';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Dùng cho healthcheck của Docker và giám sát ngoài. Không trả thông tin nội bộ. */
  @Public()
  @Get()
  async check(): Promise<{ status: string; db: string; uptimeSec: number }> {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
