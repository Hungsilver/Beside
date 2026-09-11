export * from './constants';
export * from './datetime';
export * from './auth.schema';
export * from './user.schema';
export * from './couple.schema';
export * from './geo';
export * from './kalman';
export * from './sampling';
export * from './location.schema';
export * from './post.schema';
export * from './comment.schema';
export * from './event.schema';
export * from './push.schema';
export * from './place.schema';
export * from './trip.schema';
export * from './cycle';
export * from './milestone.schema';
export * from './love';
export * from './messaging';
export * from './caro';
export * from './tien-len';
export * from './tien-len-suggest';
export * from './tien-len-flow';
export * from './game.schema';
export * from './study.schema';

/** Khuôn lỗi thống nhất do API trả về (khớp với AllExceptionsFilter ở apps/api). */
export interface ApiError {
  statusCode: number;
  /** Mã lỗi để client xử lý bằng logic, không phụ thuộc câu chữ. */
  code: string;
  /** Câu tiếng Việt hiển thị thẳng cho người dùng. */
  message: string;
  /** Lỗi theo từng trường, dùng cho form. */
  fieldErrors?: Record<string, string[]>;
}

/** Mã lỗi nghiệp vụ — dùng chung giữa API và Web. */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  ALREADY_IN_COUPLE: 'ALREADY_IN_COUPLE',
  NOT_IN_COUPLE: 'NOT_IN_COUPLE',
  INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_SELF_JOIN: 'INVITE_SELF_JOIN',
  COUPLE_FULL: 'COUPLE_FULL',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
