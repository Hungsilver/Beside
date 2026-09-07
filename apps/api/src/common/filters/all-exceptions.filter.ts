import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ApiError } from '@beside/shared';

/**
 * Chuẩn hoá MỌI lỗi về cùng một khuôn ApiError.
 * Nguyên tắc: không để lộ chi tiết nội bộ (SQL, stack, tên bảng) ra ngoài.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toApiError(exception);

    if (body.statusCode >= 500) {
      // Chỉ log chi tiết ở phía server.
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${req.method} ${req.originalUrl} → ${body.statusCode} ${body.code}`,
      );
    }

    res.status(body.statusCode).json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const p = payload as Record<string, unknown>;
        return {
          statusCode: status,
          code: typeof p.code === 'string' ? p.code : this.defaultCode(status),
          message:
            typeof p.message === 'string'
              ? p.message
              : this.defaultMessage(status),
          ...(p.fieldErrors
            ? { fieldErrors: p.fieldErrors as Record<string, string[]> }
            : {}),
        };
      }

      return {
        statusCode: status,
        code: this.defaultCode(status),
        message: typeof payload === 'string' ? payload : this.defaultMessage(status),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL,
      message: 'Có lỗi xảy ra phía máy chủ. Vui lòng thử lại sau.',
    };
  }

  private defaultCode(status: number): string {
    if (status === HttpStatus.UNAUTHORIZED) return ERROR_CODES.UNAUTHENTICATED;
    if (status === HttpStatus.TOO_MANY_REQUESTS) return ERROR_CODES.RATE_LIMITED;
    if (status >= 500) return ERROR_CODES.INTERNAL;
    return 'HTTP_ERROR';
  }

  private defaultMessage(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'Bạn cần đăng nhập để tiếp tục';
      case HttpStatus.FORBIDDEN:
        return 'Bạn không có quyền thực hiện thao tác này';
      case HttpStatus.NOT_FOUND:
        return 'Không tìm thấy dữ liệu';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Bạn thao tác hơi nhanh, thử lại sau ít giây nhé';
      default:
        return 'Yêu cầu không hợp lệ';
    }
  }
}
