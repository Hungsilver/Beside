import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { Env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  /** coupleId tại thời điểm cấp token — CHỈ dùng để gợi ý, không dùng để phân quyền.
   *  Phân quyền luôn đọc lại từ DB, vì người dùng có thể huỷ ghép đôi giữa chừng. */
  cid: string | null;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/** Tên cookie chứa refresh token. */
export const REFRESH_COOKIE_NAME = 'beside_rt';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  // ------------------------------------------------------------------
  // Access token
  // ------------------------------------------------------------------

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL', { infer: true }),
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw AppError.unauthorized(
        ERROR_CODES.UNAUTHENTICATED,
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
      );
    }
  }

  /** Số giây còn hiệu lực của access token, để client hẹn giờ refresh sớm. */
  accessTokenTtlSeconds(): number {
    const raw = this.config.get('ACCESS_TOKEN_TTL', { infer: true });
    return parseDuration(raw);
  }

  // ------------------------------------------------------------------
  // Refresh token — chuỗi ngẫu nhiên, chỉ lưu SHA-256 trong DB
  // ------------------------------------------------------------------

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async issueRefreshToken(
    userId: string,
    familyId: string = randomUUID(),
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<IssuedRefreshToken> {
    const raw = randomBytes(48).toString('base64url');
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + days * 86_400_000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.hashToken(raw),
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ip: meta.ip ?? null,
      },
    });

    return { token: raw, expiresAt };
  }

  /**
   * Xoay vòng refresh token (rotation).
   *
   * Nếu token đã bị thu hồi mà vẫn được dùng lại → nhiều khả năng đã bị đánh cắp
   * → thu hồi TOÀN BỘ family, buộc đăng nhập lại trên mọi thiết bị.
   */
  async rotateRefreshToken(
    rawToken: string,
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw AppError.unauthorized(
        ERROR_CODES.REFRESH_TOKEN_INVALID,
        'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại',
      );
    }

    if (existing.revokedAt) {
      this.logger.warn(
        `Phát hiện refresh token bị dùng lại (family=${existing.familyId}) — thu hồi toàn bộ`,
      );
      await this.revokeFamily(existing.familyId);
      throw AppError.unauthorized(
        ERROR_CODES.REFRESH_TOKEN_REUSED,
        'Phát hiện đăng nhập bất thường. Vui lòng đăng nhập lại.',
      );
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw AppError.unauthorized(
        ERROR_CODES.REFRESH_TOKEN_INVALID,
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
      );
    }

    const next = await this.issueRefreshToken(existing.userId, existing.familyId, meta);

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        replacedById: this.hashToken(next.token),
      },
    });

    return { userId: existing.userId, refresh: next };
  }

  async revokeToken(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/** Đổi chuỗi kiểu "15m" / "2h" / "45s" / "900" thành số giây. */
export function parseDuration(input: string): number {
  const m = /^(\d+)\s*([smhd]?)$/i.exec(input.trim());
  if (!m) return 900; // mặc định 15 phút nếu cấu hình sai
  const value = Number(m[1]);
  switch ((m[2] ?? '').toLowerCase()) {
    case 'd':
      return value * 86_400;
    case 'h':
      return value * 3_600;
    case 'm':
      return value * 60;
    default:
      return value;
  }
}
