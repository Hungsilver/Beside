import { z } from 'zod';

/**
 * Kiểm tra biến môi trường NGAY khi khởi động.
 * Thà chết lúc boot còn hơn chạy được rồi mới lỗi lúc 2 giờ sáng.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    API_PORT: z.coerce.number().int().positive().max(65535).default(3000),

    DATABASE_URL: z.string().min(1, 'Thiếu DATABASE_URL'),
    REDIS_URL: z.string().optional(),

    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET phải dài tối thiểu 32 ký tự'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET phải dài tối thiểu 32 ký tự'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),
    INVITE_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(24),

    S3_ENDPOINT: z.string().url('S3_ENDPOINT phải là URL đầy đủ').default('http://localhost:9000'),
    S3_BUCKET: z.string().min(1).default('beside-media'),
    MINIO_ROOT_USER: z.string().min(1).default('beside'),
    MINIO_ROOT_PASSWORD: z.string().min(1).default('beside'),

    APP_ORIGIN: z.string().url('APP_ORIGIN phải là URL đầy đủ, ví dụ https://easytech.io.vn'),
    COOKIE_DOMAIN: z.string().optional(),
    /** Các origin được phép gọi API khi dev (ngăn cách bằng dấu phẩy). */
    CORS_EXTRA_ORIGINS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message:
          'JWT_REFRESH_SECRET phải KHÁC JWT_ACCESS_SECRET — dùng chung khiến access token ' +
          'có thể được dùng làm refresh token.',
      });
    }
    if (env.NODE_ENV === 'production' && !env.APP_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_ORIGIN'],
        message:
          'Chạy production phải dùng https:// — Geolocation API của trình duyệt ' +
          'chỉ hoạt động trên secure context.',
      });
    }

    if (isPublicProduction(env)) {
      checkProductionHardening(env, ctx);
    }
  });

/**
 * "Production thật" = NODE_ENV=production VÀ phục vụ một domain công khai.
 *
 * Phân biệt với `npm run docker:up` trên máy dev: cấu hình đó cũng chạy
 * NODE_ENV=production (cố ý — để thử đúng nhánh code thật: cookie secure,
 * log rút gọn), nhưng phục vụ `localhost` bằng secret dev. Nếu áp luật
 * production cho cả trường hợp đó thì máy dev không khởi động được.
 */
function isPublicProduction(env: {
  NODE_ENV: string;
  APP_ORIGIN: string;
}): boolean {
  if (env.NODE_ENV !== 'production') return false;
  const host = safeHostname(env.APP_ORIGIN);
  return host !== null && !LOCAL_HOSTS.has(host);
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Dấu hiệu của một giá trị "để tạm" — mẫu trong .env.example, secret của máy dev,
 * hoặc chuỗi ai cũng đoán được.
 */
const PLACEHOLDER_PATTERNS = [
  'doi-gia-tri-nay',
  'change-me',
  'changeme',
  'example',
  'password',
  'secret123',
  'dev_',
  'dev-',
  '_dev',
  '-dev',
  'localhost',
  'test',
  'todo',
  'xxx',
];

function looksLikePlaceholder(value: string): boolean {
  const v = value.toLowerCase();
  if (PLACEHOLDER_PATTERNS.some((p) => v.includes(p))) return true;
  // Chuỗi chỉ gồm một vài ký tự lặp đi lặp lại (aaaa..., 123123123...)
  return new Set(v).size <= 4;
}

/**
 * Rào chắn cuối cùng trước khi một cấu hình dev lọt lên máy chủ thật.
 *
 * Có rào này vì kịch bản dễ xảy ra nhất là: `scp .env` từ máy dev lên VPS cho nhanh.
 * Khi đó mọi thứ vẫn khởi động bình thường — secret dev dài đúng 32 ký tự nên qua
 * được luật độ dài — và không ai biết cho tới lúc token bị giả mạo.
 * Thà chết lúc boot với thông báo rõ ràng.
 */
function checkProductionHardening(
  env: {
    JWT_ACCESS_SECRET: string;
    JWT_REFRESH_SECRET: string;
    DATABASE_URL: string;
    APP_ORIGIN: string;
    COOKIE_DOMAIN?: string | undefined;
    CORS_EXTRA_ORIGINS?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const fail = (path: string, message: string): void => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  };

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (looksLikePlaceholder(env[key])) {
      fail(
        key,
        `${key} trông như giá trị để tạm hoặc secret của máy dev. ` +
          'Sinh giá trị mới bằng: openssl rand -base64 48',
      );
    }
  }

  const dbPassword = passwordFromUrl(env.DATABASE_URL);
  if (dbPassword && looksLikePlaceholder(dbPassword)) {
    fail(
      'DATABASE_URL',
      'Mật khẩu PostgreSQL trong DATABASE_URL trông như giá trị để tạm. ' +
        'Đổi cả POSTGRES_PASSWORD lẫn DATABASE_URL.',
    );
  }

  // Cookie domain lệch với domain đang phục vụ → trình duyệt vứt cookie refresh,
  // người dùng đăng nhập xong bị đá ra ngay. Bắt lỗi lúc boot dễ hiểu hơn nhiều
  // so với việc ngồi đoán tại sao đăng nhập không giữ được phiên.
  const host = safeHostname(env.APP_ORIGIN);
  if (host && env.COOKIE_DOMAIN) {
    const cookieDomain = env.COOKIE_DOMAIN.replace(/^\./, '').toLowerCase();
    if (host !== cookieDomain && !host.endsWith(`.${cookieDomain}`)) {
      fail(
        'COOKIE_DOMAIN',
        `COOKIE_DOMAIN ("${env.COOKIE_DOMAIN}") không khớp với APP_ORIGIN ("${host}"). ` +
          'Cookie refresh sẽ bị trình duyệt vứt và người dùng đăng nhập xong bị đá ra ngay.',
      );
    }
  }

  // Mở CORS cho http:// hoặc localhost ở production là để hở cho trang khác
  // gọi API kèm cookie của người dùng.
  const extra = (env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of extra) {
    const h = safeHostname(origin);
    if (origin.startsWith('http://') || (h && LOCAL_HOSTS.has(h))) {
      fail(
        'CORS_EXTRA_ORIGINS',
        `Không được cho phép origin "${origin}" ở production. ` +
          'Xoá biến này khỏi .env trên máy chủ.',
      );
    }
  }
}

/** Lấy mật khẩu từ chuỗi kết nối, trả null nếu không đọc được. */
function passwordFromUrl(url: string): string | null {
  try {
    const password = new URL(url).password;
    return password.length > 0 ? decodeURIComponent(password) : null;
  } catch {
    return null;
  }
}

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(gốc)'}: ${i.message}`,
    );
    throw new Error(
      `Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}\n` +
        `Xem lại file .env (mẫu ở .env.example).`,
    );
  }
  return result.data;
}

/** Danh sách origin được phép gọi API. */
export function corsOrigins(env: Env): string[] {
  const extra = (env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [env.APP_ORIGIN, ...extra];
}
