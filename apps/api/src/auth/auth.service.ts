import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import {
  ERROR_CODES,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
} from '@beside/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { PasswordService } from './password.service';
import { TokenService, type IssuedRefreshToken } from './token.service';
import { toSelfUser } from '../users/user.mapper';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface LoginResult {
  auth: AuthResponse;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterInput, meta: SessionMeta): Promise<LoginResult> {
    const passwordHash = await this.passwords.hash(input.password);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
        },
      });
    } catch (err) {
      // P2002 = vi phạm ràng buộc unique. Bắt bằng mã lỗi của DB thay vì
      // "kiểm tra trước rồi mới ghi" — cách đó có khe hở khi hai request cùng lúc.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw AppError.conflict(
          ERROR_CODES.EMAIL_TAKEN,
          'Email này đã được đăng ký',
        );
      }
      throw err;
    }

    return this.buildSession(user, meta);
  }

  async login(input: LoginInput, meta: SessionMeta): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      // Vẫn tiêu tốn thời gian băm để "sai email" và "sai mật khẩu"
      // không phân biệt được qua thời gian phản hồi.
      await this.passwords.burnCycles();
      throw this.invalidCredentials();
    }

    const ok = await this.passwords.verify(input.password, user.passwordHash);
    if (!ok) throw this.invalidCredentials();

    return this.buildSession(user, meta);
  }

  async refresh(rawRefreshToken: string, meta: SessionMeta): Promise<LoginResult> {
    const { userId, refresh } = await this.tokens.rotateRefreshToken(
      rawRefreshToken,
      meta,
    );

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      // Tài khoản đã bị xoá nhưng token còn sống → dọn sạch.
      await this.tokens.revokeAllForUser(userId);
      throw AppError.unauthorized(
        ERROR_CODES.REFRESH_TOKEN_INVALID,
        'Tài khoản không còn tồn tại',
      );
    }

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      cid: user.coupleId,
    });

    return {
      auth: {
        accessToken,
        expiresIn: this.tokens.accessTokenTtlSeconds(),
        user: toSelfUser(user),
      },
      refresh,
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return; // Đăng xuất luôn "thành công", kể cả khi không có cookie.
    await this.tokens.revokeToken(rawRefreshToken);
  }

  // ------------------------------------------------------------------

  private async buildSession(user: User, meta: SessionMeta): Promise<LoginResult> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.signAccessToken({ sub: user.id, cid: user.coupleId }),
      this.tokens.issueRefreshToken(user.id, undefined, meta),
    ]);

    return {
      auth: {
        accessToken,
        expiresIn: this.tokens.accessTokenTtlSeconds(),
        user: toSelfUser(user),
      },
      refresh,
    };
  }

  private invalidCredentials(): AppError {
    // Cùng một câu cho cả hai trường hợp — không tiết lộ email nào đã tồn tại.
    return AppError.unauthorized(
      ERROR_CODES.INVALID_CREDENTIALS,
      'Email hoặc mật khẩu không đúng',
    );
  }
}
