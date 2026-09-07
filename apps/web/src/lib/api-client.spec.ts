import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiRequestError,
  getAccessToken,
  setAccessToken,
  setUnauthenticatedHandler,
} from './api-client';

/** Tạo Response giả cho fetch. */
function res(
  status: number,
  body?: unknown,
  opts: { json?: boolean } = { json: true },
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (opts.json === false) throw new SyntaxError('không phải JSON');
      return body;
    },
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken(null);
  setUnauthenticatedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  setUnauthenticatedHandler(null);
});

/** Đọc headers của lần gọi fetch thứ n. */
function headersOf(callIndex: number): Record<string, string> {
  return (fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined)
    ?.headers as Record<string, string>;
}

describe('apiRequest — cơ bản', () => {
  it('gắn Bearer token khi đã đăng nhập, và luôn gửi cookie', async () => {
    setAccessToken('token-abc');
    fetchMock.mockResolvedValueOnce(res(200, { ok: true }));

    await api.get('/couples/me');

    expect(headersOf(0).Authorization).toBe('Bearer token-abc');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe('include');
  });

  it('không gắn Authorization khi chưa có token', async () => {
    fetchMock.mockResolvedValueOnce(res(200, {}));
    await api.get('/health');
    expect(headersOf(0).Authorization).toBeUndefined();
  });

  it('trả undefined với 204 thay vì cố đọc JSON rỗng', async () => {
    setAccessToken('t');
    fetchMock.mockResolvedValueOnce(res(204));
    await expect(api.delete('/couples/me', { confirm: true })).resolves.toBeUndefined();
  });

  it('dựng ApiRequestError đủ code/message/fieldErrors', async () => {
    fetchMock.mockResolvedValueOnce(
      res(422, {
        statusCode: 422,
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu gửi lên không hợp lệ',
        fieldErrors: { password: ['Mật khẩu tối thiểu 8 ký tự'] },
      }),
    );

    const err = (await api
      .post('/auth/register', {}, { skipRefresh: true })
      .catch((e: unknown) => e)) as ApiRequestError;

    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fieldError('password')).toBe('Mật khẩu tối thiểu 8 ký tự');
    expect(err.fieldError('email')).toBeUndefined();
  });

  it('phản hồi lỗi KHÔNG phải JSON (ví dụ 502 của proxy) vẫn ra câu tiếng Việt dễ hiểu', async () => {
    fetchMock.mockResolvedValueOnce(res(502, undefined, { json: false }));

    const err = (await api
      .get('/couples/me')
      .catch((e: unknown) => e)) as ApiRequestError;

    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(502);
    expect(err.message).toContain('Không kết nối được máy chủ');
  });

  it('mất mạng thì báo lỗi tử tế, không để TypeError lọt ra ngoài', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const err = (await api
      .get('/couples/me')
      .catch((e: unknown) => e)) as ApiRequestError;

    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.status).toBe(0);
  });
});

describe('apiRequest — làm mới access token', () => {
  it('gặp 401 thì refresh rồi thử lại đúng một lần, với token mới', async () => {
    setAccessToken('token-cu');

    fetchMock
      .mockResolvedValueOnce(res(401, { code: 'UNAUTHENTICATED' })) // lần đầu
      .mockResolvedValueOnce(res(200, { accessToken: 'token-moi' })) // /auth/refresh
      .mockResolvedValueOnce(res(200, { id: 'u1' })); // thử lại

    const out = await api.get<{ id: string }>('/couples/me');

    expect(out).toEqual({ id: 'u1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/auth/refresh');
    // Lần thử lại phải dùng token MỚI, không phải token cũ
    expect(headersOf(2).Authorization).toBe('Bearer token-moi');
    expect(getAccessToken()).toBe('token-moi');
  });

  it('NHIỀU request cùng dính 401 chỉ gọi /auth/refresh MỘT lần', async () => {
    // Đây là chỗ dễ sai nhất: nếu mỗi request tự gọi refresh thì refresh token
    // bị xoay vòng nhiều lần, các lần sau bị server coi là "token dùng lại"
    // và đăng xuất người dùng oan.
    setAccessToken('token-cu');

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/auth/refresh')) {
        return res(200, { accessToken: 'token-moi' });
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return auth === 'Bearer token-moi' ? res(200, { ok: true }) : res(401, {});
    });

    await Promise.all([
      api.get('/couples/me'),
      api.get('/couples/me/love-summary'),
      api.get('/me'),
    ]);

    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('refresh thất bại thì xoá token, gọi handler đăng xuất và ném lỗi', async () => {
    setAccessToken('token-cu');
    const onUnauth = vi.fn();
    setUnauthenticatedHandler(onUnauth);

    fetchMock
      .mockResolvedValueOnce(res(401, { code: 'UNAUTHENTICATED', message: 'Hết hạn' }))
      .mockResolvedValueOnce(res(401, {})); // /auth/refresh cũng hỏng

    await expect(api.get('/couples/me')).rejects.toBeInstanceOf(ApiRequestError);

    expect(getAccessToken()).toBeNull();
    expect(onUnauth).toHaveBeenCalledTimes(1);
    // Không được thử lại vô hạn
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skipRefresh: đăng nhập sai mật khẩu KHÔNG được kéo theo lời gọi refresh', async () => {
    fetchMock.mockResolvedValueOnce(
      res(401, { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng' }),
    );

    const err = (await api
      .post('/auth/login', { email: 'a@b.com', password: 'sai' }, { skipRefresh: true })
      .catch((e: unknown) => e)) as ApiRequestError;

    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
