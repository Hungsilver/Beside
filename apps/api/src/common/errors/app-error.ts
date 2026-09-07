import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@beside/shared';

/**
 * Lỗi nghiệp vụ có mã. Client xử lý theo `code`, người dùng đọc `message`.
 * Không bao giờ nhét chi tiết kỹ thuật (SQL, stack) vào `message`.
 */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super({ code, message, statusCode: status, fieldErrors }, status);
  }

  static badRequest(code: ErrorCode, message: string): AppError {
    return new AppError(code, message, HttpStatus.BAD_REQUEST);
  }

  static unauthorized(code: ErrorCode, message: string): AppError {
    return new AppError(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(code: ErrorCode, message: string): AppError {
    return new AppError(code, message, HttpStatus.FORBIDDEN);
  }

  static notFound(code: ErrorCode, message: string): AppError {
    return new AppError(code, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: ErrorCode, message: string): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT);
  }

  static validation(fieldErrors: Record<string, string[]>): AppError {
    return new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      'Dữ liệu gửi lên không hợp lệ',
      HttpStatus.UNPROCESSABLE_ENTITY,
      fieldErrors,
    );
  }
}
