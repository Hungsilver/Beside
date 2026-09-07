import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ERROR_CODES } from '@beside/shared';
import { AppError } from '../common/errors/app-error';

/**
 * Lấy id người dùng đã đăng nhập.
 * Ném lỗi nếu không có — nghĩa là ai đó quên bỏ @Public() hoặc guard chưa chạy.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const id = req.user?.id;
    if (!id) {
      throw AppError.unauthorized(
        ERROR_CODES.UNAUTHENTICATED,
        'Bạn cần đăng nhập để tiếp tục',
      );
    }
    return id;
  },
);
