import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  ERROR_CODES,
  loginSchema,
  registerSchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { AppError } from '../common/errors/app-error';
import { AuthService, type LoginResult, type SessionMeta } from './auth.service';
import { REFRESH_COOKIE_NAME } from './token.service';
import { Public } from './jwt-auth.guard';
import type { Env } from '../config/env';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('register')
  /*
   * Chặn tạo hàng loạt tài khoản: 20 lần / giờ / IP.
   * Không siết chặt hơn (kiểu 5 lần/10 phút) vì ở Việt Nam rất nhiều người dùng
   * mạng di động đi qua CGNAT — hàng nghìn thuê bao dùng chung một IP công cộng,
   * siết quá tay sẽ chặn nhầm người thật. Rào chắn thật nằm ở chỗ email phải
   * là duy nhất và mật khẩu được băm bằng scrypt.
   */
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  async register(
    @Body(new ZodBody(registerSchema)) dto: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(dto, this.metaOf(req));
    return this.finish(res, result);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Chặn dò mật khẩu: 10 lần / 5 phút / IP
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  async login(
    @Body(new ZodBody(loginSchema)) dto: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(dto, this.metaOf(req));
    return this.finish(res, result);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!raw) {
      throw AppError.unauthorized(
        ERROR_CODES.REFRESH_TOKEN_INVALID,
        'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại',
      );
    }
    const result = await this.auth.refresh(raw, this.metaOf(req));
    return this.finish(res, result);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions(0));
  }

  // Hồ sơ người dùng nằm ở GET/PATCH /me (UsersController) — không đặt ở đây
  // để tránh hai đường dẫn cùng trả về một tài nguyên.

  // ------------------------------------------------------------------

  private finish(res: Response, result: LoginResult): AuthResponse {
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refresh.token,
      this.cookieOptions(result.refresh.expiresAt.getTime() - Date.now()),
    );
    return result.auth;
  }

  private cookieOptions(maxAgeMs: number): CookieOptions {
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    const domain = this.config.get('COOKIE_DOMAIN', { infer: true });

    return {
      httpOnly: true,
      // Bắt buộc secure ở production; ở dev cho phép http://localhost.
      secure: isProd,
      sameSite: 'lax',
      // Giới hạn cookie chỉ gửi tới nhóm endpoint auth — giảm bề mặt tấn công.
      path: '/api/v1/auth',
      ...(isProd && domain ? { domain } : {}),
      maxAge: maxAgeMs > 0 ? maxAgeMs : undefined,
    };
  }

  private metaOf(req: Request): SessionMeta {
    return {
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip ?? undefined,
    };
  }
}
