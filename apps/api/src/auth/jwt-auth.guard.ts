import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ERROR_CODES } from '@beside/shared';
import { AppError } from '../common/errors/app-error';
import { TokenService } from './token.service';

export const IS_PUBLIC_KEY = 'beside:isPublic';

/** Đánh dấu endpoint KHÔNG cần đăng nhập. Mặc định mọi endpoint đều cần. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthenticatedUser {
  id: string;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * Guard toàn cục: mặc định CHẶN, phải gắn @Public() mới cho qua.
 * Cách này an toàn hơn "mặc định mở, nhớ gắn @Auth()" — quên gắn thì lộ dữ liệu.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req.header('authorization'));

    if (!token) {
      throw AppError.unauthorized(
        ERROR_CODES.UNAUTHENTICATED,
        'Bạn cần đăng nhập để tiếp tục',
      );
    }

    const payload = await this.tokens.verifyAccessToken(token);
    req.user = { id: payload.sub };
    return true;
  }
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}
