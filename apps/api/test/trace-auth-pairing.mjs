/**
 * Trace Phase 1 — Auth & Ghép đôi.
 * Chạy thật vào API đang chạy ở localhost:3000, dùng dữ liệu giả định.
 * In ra bảng kết quả để dán vào docs/traces/.
 *
 * Cách chạy:
 *   npm run infra:up && npm run db:migrate     # Postgres phải đang chạy
 *   npm run dev:api                            # ở cửa sổ khác
 *   npm run trace:phase1
 *
 * LƯU Ý: kịch bản ghi dữ liệu THẬT vào DB (mỗi lần chạy tạo ~30 tài khoản test
 * có đuôi @beside.test). Chỉ chạy trên DB dev, không bao giờ chạy trên production.
 * Hạn mức đăng ký là 20/giờ/IP nên chạy lại trong vòng 1 giờ sẽ bị chặn —
 * khởi động lại API để xoá bộ đếm (throttler lưu trong bộ nhớ).
 */
const BASE = process.env.TRACE_BASE_URL ?? 'http://localhost:3000/api/v1';

let pass = 0, fail = 0;
const rows = [];

function rec(id, name, expected, actual, ok, note = '') {
  rows.push({ id, name, expected, actual, ok, note });
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}`);
  if (!ok) console.log(`        ky vong: ${expected}\n        thuc te : ${actual}`);
}

/** Mỗi "thiết bị" giữ cookie riêng, giống trình duyệt thật. */
class Client {
  constructor(label) { this.label = label; this.cookies = new Map(); this.access = null; }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  absorb(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (v === '') this.cookies.delete(k); else this.cookies.set(k, v);
    }
  }

  async req(method, path, body, opts = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.access && !opts.noAuth) headers.Authorization = `Bearer ${this.access}`;
    const ck = this.cookieHeader();
    if (ck) headers.Cookie = ck;
    if (opts.cookieOverride) headers.Cookie = opts.cookieOverride;

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    this.absorb(res);
    let json = null;
    if (res.status !== 204) { try { json = await res.json(); } catch { /* không phải JSON */ } }
    return { status: res.status, body: json };
  }

  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b, o) { return this.req('POST', p, b, o); }
  patch(p, b) { return this.req('PATCH', p, b); }
  del(p, b) { return this.req('DELETE', p, b); }
}

const stamp = Date.now();
const email = (n) => `${n}.${stamp}@beside.test`;

const run = async () => {
  // ---------------------------------------------------------------- HEALTH
  {
    const c = new Client('probe');
    const r = await c.get('/health');
    rec('TC-00', 'GET /health khi DB đang chạy',
      '200 + db:"up"', `${r.status} + db:"${r.body?.db}"`,
      r.status === 200 && r.body?.db === 'up');
  }

  // ---------------------------------------------------------------- ĐĂNG KÝ
  const an = new Client('An');
  {
    const r = await an.post('/auth/register',
      { displayName: 'An', email: email('an'), password: 'matkhau123' }, { noAuth: true });
    an.access = r.body?.accessToken ?? null;
    const hasCookie = an.cookies.has('beside_rt');
    rec('TC-01', 'Đăng ký hợp lệ (happy path)',
      '201 + accessToken + cookie beside_rt + user.coupleId=null',
      `${r.status} + token:${Boolean(an.access)} + cookie:${hasCookie} + coupleId:${r.body?.user?.coupleId}`,
      r.status === 201 && Boolean(an.access) && hasCookie && r.body?.user?.coupleId === null);

    rec('TC-01b', 'Phản hồi KHÔNG chứa passwordHash',
      'không có trường passwordHash',
      JSON.stringify(r.body?.user ?? {}),
      !JSON.stringify(r.body ?? {}).includes('passwordHash'));
  }

  {
    const c = new Client('trung-email');
    const r = await c.post('/auth/register',
      { displayName: 'Ke gia mao', email: an.emailUsed ?? email('an'), password: 'matkhau123' },
      { noAuth: true });
    rec('TC-02', 'Đăng ký trùng email',
      '409 + code EMAIL_TAKEN', `${r.status} + ${r.body?.code}`,
      r.status === 409 && r.body?.code === 'EMAIL_TAKEN');
  }

  {
    const c = new Client('mk-yeu');
    const r = await c.post('/auth/register',
      { displayName: 'X', email: email('yeu'), password: '123' }, { noAuth: true });
    rec('TC-03', 'Mật khẩu ngắn hơn 8 ký tự',
      '422 + VALIDATION_FAILED + lỗi ở trường password',
      `${r.status} + ${r.body?.code} + ${JSON.stringify(r.body?.fieldErrors ?? {})}`,
      r.status === 422 && r.body?.code === 'VALIDATION_FAILED' && Boolean(r.body?.fieldErrors?.password));
  }

  {
    const c = new Client('mk-dai');
    const r = await c.post('/auth/register',
      { displayName: 'X', email: email('dai'), password: 'ế'.repeat(30) }, { noAuth: true });
    rec('TC-04', 'Mật khẩu tiếng Việt 30 ký tự = 90 byte (vượt trần 72 byte)',
      '422 (đo bằng byte, không phải số ký tự)', `${r.status} + ${r.body?.code}`,
      r.status === 422);
  }

  // ---------------------------------------------------------------- ĐĂNG NHẬP
  const anEmail = email('an');
  {
    const c = new Client('sai-mk');
    const t0 = Date.now();
    const r1 = await c.post('/auth/login', { email: anEmail, password: 'sai-mat-khau' }, { noAuth: true });
    const dtWrongPassword = Date.now() - t0;

    const t1 = Date.now();
    const r2 = await c.post('/auth/login',
      { email: `khongtontai.${stamp}@beside.test`, password: 'matkhau123' }, { noAuth: true });
    const dtNoUser = Date.now() - t1;

    rec('TC-05', 'Sai mật khẩu và email không tồn tại trả CÙNG một lỗi',
      'cả hai đều 401 + INVALID_CREDENTIALS + cùng message',
      `${r1.status}/${r1.body?.code} vs ${r2.status}/${r2.body?.code}; msg giống: ${r1.body?.message === r2.body?.message}`,
      r1.status === 401 && r2.status === 401 &&
      r1.body?.code === 'INVALID_CREDENTIALS' && r2.body?.code === 'INVALID_CREDENTIALS' &&
      r1.body?.message === r2.body?.message);

    const ratio = Math.max(dtWrongPassword, dtNoUser) / Math.max(1, Math.min(dtWrongPassword, dtNoUser));
    rec('TC-05b', 'Thời gian phản hồi hai trường hợp không chênh lệch lớn (chống dò email)',
      'tỉ lệ < 4x', `sai mk ${dtWrongPassword}ms vs không tồn tại ${dtNoUser}ms (tỉ lệ ${ratio.toFixed(2)}x)`,
      ratio < 4);
  }

  {
    const c = new Client('An-may-2');
    const r = await c.post('/auth/login', { email: anEmail.toUpperCase(), password: 'matkhau123' }, { noAuth: true });
    rec('TC-06', 'Đăng nhập bằng email VIẾT HOA (chuẩn hoá về chữ thường)',
      '200 + accessToken', `${r.status}`,
      r.status === 200 && Boolean(r.body?.accessToken));
  }

  // ---------------------------------------------------------------- BẢO VỆ ENDPOINT
  {
    const c = new Client('vo-danh');
    const r = await c.get('/me', { noAuth: true });
    rec('TC-07', 'Goi /me khi chua dang nhap',
      '401 + UNAUTHENTICATED', `${r.status} + ${r.body?.code}`,
      r.status === 401 && r.body?.code === 'UNAUTHENTICATED');
  }
  {
    const c = new Client('token-rac');
    c.access = 'token.gia.mao';
    const r = await c.get('/me');
    rec('TC-08', 'Token rác',
      '401', `${r.status} + ${r.body?.code}`, r.status === 401);
  }

  // ---------------------------------------------------------------- GHÉP ĐÔI
  {
    const r = await an.get('/couples/me');
    rec('TC-09', 'Xem couple khi chưa ghép đôi',
      '404 + NOT_IN_COUPLE', `${r.status} + ${r.body?.code}`,
      r.status === 404 && r.body?.code === 'NOT_IN_COUPLE');
  }

  {
    const tomorrow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const r = await an.post('/couples', { anniversaryAt: tomorrow });
    rec('TC-10', 'Ngày yêu ở TƯƠNG LAI',
      '422 + VALIDATION_FAILED', `${r.status} + ${r.body?.code}`,
      r.status === 422 && r.body?.code === 'VALIDATION_FAILED');
  }
  {
    const r = await an.post('/couples', { anniversaryAt: '1899-06-01' });
    rec('TC-11', 'Ngày yêu trước năm 1900 (gõ nhầm)',
      '422', `${r.status} + ${r.body?.code}`, r.status === 422);
  }
  {
    const r = await an.post('/couples', { anniversaryAt: 'hom-qua' });
    rec('TC-12', 'Ngày yêu là chuỗi vô nghĩa',
      '422, KHÔNG được 500', `${r.status} + ${r.body?.code}`, r.status === 422);
  }

  let inviteCode = null;
  {
    const r = await an.post('/couples', { anniversaryAt: '2023-02-14' });
    inviteCode = r.body?.inviteCode ?? null;
    const validChars = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(inviteCode ?? '');
    rec('TC-13', 'Tạo couple với ngày 14/02/2023 (happy path)',
      '201 + mã 6 ký tự không chứa 0/1/O/I + anniversaryAt=2023-02-14 + members=1',
      `${r.status} + "${inviteCode}" hợp lệ:${validChars} + ${r.body?.anniversaryAt} + members:${r.body?.members?.length}`,
      r.status === 201 && validChars && r.body?.anniversaryAt === '2023-02-14' && r.body?.members?.length === 1);
  }

  {
    const r = await an.post('/couples', { anniversaryAt: '2024-01-01' });
    rec('TC-14', 'Tạo couple lần hai khi đã có couple',
      '409 + ALREADY_IN_COUPLE', `${r.status} + ${r.body?.code}`,
      r.status === 409 && r.body?.code === 'ALREADY_IN_COUPLE');
  }

  {
    const r = await an.post('/couples/join', { inviteCode });
    rec('TC-15', 'Tự ghép đôi bằng mã của chính mình',
      '409 ALREADY_IN_COUPLE (chặn ngay ở bước "đã có couple")',
      `${r.status} + ${r.body?.code}`,
      r.status === 409 && r.body?.code === 'ALREADY_IN_COUPLE');
  }

  // Bình
  const binh = new Client('Bình');
  {
    const r = await binh.post('/auth/register',
      { displayName: 'Bình', email: email('binh'), password: 'matkhau456' }, { noAuth: true });
    if (r.status !== 201) throw new Error(`Khong tao duoc Binh: ${r.status} ${JSON.stringify(r.body)}`);
    binh.access = r.body?.accessToken;
  }

  {
    const r = await binh.post('/couples/join', { inviteCode: 'ZZZZZZ' });
    rec('TC-16', 'Nhập mã không tồn tại',
      '404 + INVITE_NOT_FOUND', `${r.status} + ${r.body?.code}`,
      r.status === 404 && r.body?.code === 'INVITE_NOT_FOUND');
  }
  {
    const r = await binh.post('/couples/join', { inviteCode: 'LV7K2O' }); // chữ O
    rec('TC-17', 'Mã chứa ký tự bị cấm (chữ O)',
      '422 VALIDATION_FAILED', `${r.status} + ${r.body?.code}`, r.status === 422);
  }
  {
    const r = await binh.post('/couples/join', { inviteCode: ` ${inviteCode.toLowerCase()} ` });
    rec('TC-18', 'Ghép đôi bằng mã viết thường + có khoảng trắng (happy path)',
      '200 + members=2 + inviteCode bị xoá (null) + partner=An',
      `${r.status} + members:${r.body?.members?.length} + inviteCode:${r.body?.inviteCode} + partner:${r.body?.partner?.displayName}`,
      r.status === 200 && r.body?.members?.length === 2 &&
      r.body?.inviteCode === null && r.body?.partner?.displayName === 'An');
  }

  {
    const chi = new Client('Chi');
    const reg = await chi.post('/auth/register',
      { displayName: 'Chi', email: email('chi'), password: 'matkhau789' }, { noAuth: true });
    if (reg.status !== 201) throw new Error(`Khong tao duoc Chi: ${reg.status} ${JSON.stringify(reg.body)}`);
    chi.access = reg.body?.accessToken;
    const r = await chi.post('/couples/join', { inviteCode });
    rec('TC-19', 'Nguoi thu 3 dung lai ma da ghep xong',
      '409 COUPLE_FULL — bao dung ly do, khong phai "ma khong ton tai"',
      `${r.status} + ${r.body?.code} + "${r.body?.message}"`,
      r.status === 409 && r.body?.code === 'COUPLE_FULL');
  }

  {
    const r = await an.get('/couples/me');
    rec('TC-20', 'An xem couple sau khi Bình đã vào',
      '200 + partner=Bình + inviteCode ẩn (null)',
      `${r.status} + partner:${r.body?.partner?.displayName} + inviteCode:${r.body?.inviteCode}`,
      r.status === 200 && r.body?.partner?.displayName === 'Bình' && r.body?.inviteCode === null);
  }

  // ---------------------------------------------------------------- ĐẾM NGÀY YÊU
  {
    const r = await an.get('/couples/me/love-summary');
    const days = r.body?.daysTogether;
    // Tính lại độc lập bằng ngày lịch giờ VN
    const vnToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const expected = Math.round(
      (Date.parse(`${vnToday}T00:00:00Z`) - Date.parse('2023-02-14T00:00:00Z')) / 86400000);
    rec('TC-21', 'Đếm ngày yêu từ 14/02/2023',
      `daysTogether = ${expected} (tính lại độc lập)`,
      `${days} · ${r.body?.years}n ${r.body?.months}th ${r.body?.days}ng · mốc kế: ${r.body?.nextMilestone?.title} còn ${r.body?.nextMilestone?.daysLeft} ngày`,
      r.status === 200 && days === expected);

    const nm = r.body?.nextMilestone;
    rec('TC-22', 'Mốc kế tiếp hợp lệ',
      'daysLeft > 0 và progressPercent trong [0,100]',
      `daysLeft:${nm?.daysLeft} progress:${nm?.progressPercent}%`,
      nm && nm.daysLeft > 0 && nm.progressPercent >= 0 && nm.progressPercent <= 100);
  }

  // ---------------------------------------------------------------- REFRESH TOKEN
  {
    const oldCookie = an.cookieHeader();
    const r1 = await an.post('/auth/refresh', undefined, { noAuth: true });
    const rotated = an.cookieHeader() !== oldCookie;
    rec('TC-23', 'Refresh token xoay vòng',
      '200 + access token mới + cookie ĐỔI', `${r1.status} + cookie đổi: ${rotated}`,
      r1.status === 200 && rotated);

    // Dùng lại cookie CŨ → coi như bị đánh cắp
    const r2 = await an.post('/auth/refresh', undefined, { noAuth: true, cookieOverride: oldCookie });
    rec('TC-24', 'Dùng lại refresh token cũ (mô phỏng token bị đánh cắp)',
      '401 + REFRESH_TOKEN_REUSED', `${r2.status} + ${r2.body?.code}`,
      r2.status === 401 && r2.body?.code === 'REFRESH_TOKEN_REUSED');

    // Sau khi phát hiện tái sử dụng, cả family bị thu hồi
    const r3 = await an.post('/auth/refresh', undefined, { noAuth: true });
    rec('TC-25', 'Toàn bộ family bị thu hồi sau khi phát hiện tái sử dụng',
      '401 (phải đăng nhập lại)', `${r3.status} + ${r3.body?.code}`,
      r3.status === 401);
  }

  // Đăng nhập lại để tiếp tục
  {
    const r = await an.post('/auth/login', { email: anEmail, password: 'matkhau123' }, { noAuth: true });
    an.access = r.body?.accessToken;
  }

  // ---------------------------------------------------------------- ĐUA GHÉP ĐÔI
  {
    const host = new Client('Host');
    const reg = await host.post('/auth/register',
      { displayName: 'Host', email: email('host'), password: 'matkhau123' }, { noAuth: true });
    if (reg.status !== 201) throw new Error(`Khong tao duoc Host: ${reg.status} ${JSON.stringify(reg.body)}`);
    host.access = reg.body?.accessToken;
    const cr = await host.post('/couples', { anniversaryAt: '2024-06-01' });
    const code = cr.body?.inviteCode;

    const racers = [];
    for (const n of ['r1', 'r2']) {
      const c = new Client(n);
      const g = await c.post('/auth/register',
        { displayName: n, email: email(n), password: 'matkhau123' }, { noAuth: true });
      if (g.status !== 201) throw new Error(`Khong tao duoc ${n}: ${g.status} ${JSON.stringify(g.body)}`);
      c.access = g.body?.accessToken;
      racers.push(c);
    }

    const results = await Promise.all(racers.map((c) => c.post('/couples/join', { inviteCode: code })));
    const ok = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status !== 200);
    const desc = rejected.map((r) => `${r.status}/${r.body?.code}`).join(', ') || 'khong co';
    rec('TC-26', 'Hai nguoi bam "Ket doi" cung luc voi cung mot ma',
      'dung 1 nguoi thanh cong, nguoi kia bi tu choi',
      `thanh cong: ${ok}; bi tu choi: ${desc}`,
      ok === 1);
    rec('TC-26b', 'Nguoi thua cuoc dua nhan loi THAN THIEN, khong phai 500',
      '409 + COUPLE_FULL (khong duoc 500 INTERNAL)', desc,
      rejected.length === 1 && rejected[0].status === 409 && rejected[0].body?.code === 'COUPLE_FULL');

    const after = await host.get('/couples/me');
    rec('TC-27', 'Số thành viên sau cuộc đua',
      'đúng 2', `${after.body?.members?.length}`,
      after.body?.members?.length === 2);
  }

  // ---------------------------------------------------------------- HO SO CA NHAN
  {
    const r = await an.get('/me');
    rec('TC-36', 'Doc ho so cua chinh minh',
      '200 + displayName An + messagingApp mac dinh ZALO',
      `${r.status} + ${r.body?.displayName} + ${r.body?.messagingApp} + handle:${r.body?.messagingHandle}`,
      r.status === 200 && r.body?.displayName === 'An' &&
      r.body?.messagingApp === 'ZALO' && r.body?.messagingHandle === null);
  }

  {
    const r = await an.patch('/me', { displayName: '  Nguyen An  ', birthday: '1998-05-12' });
    rec('TC-37', 'Sua ten + ngay sinh (happy path)',
      '200 + ten da cat khoang trang + birthday 1998-05-12',
      `${r.status} + "${r.body?.displayName}" + ${r.body?.birthday}`,
      r.status === 200 && r.body?.displayName === 'Nguyen An' &&
      r.body?.birthday === '1998-05-12');
  }

  {
    const r = await an.patch('/me', {});
    rec('TC-38', 'PATCH /me voi body rong',
      '422 — khong co gi de cap nhat', `${r.status} + ${r.body?.code}`,
      r.status === 422);
  }

  {
    const tomorrow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const r = await an.patch('/me', { birthday: tomorrow });
    rec('TC-39', 'Ngay sinh o tuong lai',
      '422', `${r.status} + ${r.body?.code}`, r.status === 422);
  }

  {
    const r = await an.patch('/me', { birthday: 'sinh-nhat-toi' });
    rec('TC-40', 'Ngay sinh la chuoi vo nghia',
      '422, KHONG duoc 500', `${r.status} + ${r.body?.code}`, r.status === 422);
  }

  {
    const r = await an.patch('/me', { messagingApp: 'ZALO', messagingHandle: '0912345678' });
    rec('TC-41', 'Cai Zalo bang so dien thoai (happy path)',
      '200 + luu dung so', `${r.status} + ${r.body?.messagingApp}/${r.body?.messagingHandle}`,
      r.status === 200 && r.body?.messagingApp === 'ZALO' &&
      r.body?.messagingHandle === '0912345678');
  }

  {
    const r = await an.patch('/me', { messagingHandle: 'khong-phai-so-dien-thoai' });
    rec('TC-42', 'Doi RIENG so dien thoai thanh chuoi rac (app van la Zalo)',
      '422 + goi y cu the cho Zalo (server phai tron voi app dang luu)',
      `${r.status} + ${JSON.stringify(r.body?.fieldErrors ?? {})}`,
      r.status === 422 && Boolean(r.body?.fieldErrors?.messagingHandle));
  }

  {
    const r = await an.patch('/me', { messagingApp: 'MESSENGER' });
    rec('TC-43', 'Doi RIENG app sang Messenger trong khi handle dang la so dien thoai',
      '422 — so dien thoai khong phai username Facebook',
      `${r.status} + ${JSON.stringify(r.body?.fieldErrors ?? {})}`,
      r.status === 422 && Boolean(r.body?.fieldErrors?.messagingHandle));
  }

  {
    const r = await an.patch('/me', { messagingApp: 'MESSENGER', messagingHandle: 'nguyen.an' });
    rec('TC-44', 'Doi CA HAI cung luc sang Messenger + username',
      '200', `${r.status} + ${r.body?.messagingApp}/${r.body?.messagingHandle}`,
      r.status === 200 && r.body?.messagingApp === 'MESSENGER' &&
      r.body?.messagingHandle === 'nguyen.an');
  }

  {
    const r = await an.patch('/me', { messagingHandle: '' });
    rec('TC-45', 'Xoa thong tin lien he (chuoi rong -> null)',
      '200 + handle null (giao dien se an nut nhan tin)',
      `${r.status} + ${r.body?.messagingHandle}`,
      r.status === 200 && r.body?.messagingHandle === null);
  }

  {
    const r = await binh.get('/couples/me');
    const p = r.body?.partner;
    rec('TC-46', 'Nguoi ay thay duoc ten moi cua An qua partner',
      'partner.displayName = "Nguyen An"',
      `${r.status} + ${p?.displayName} + app:${p?.messagingApp}`,
      r.status === 200 && p?.displayName === 'Nguyen An');
  }

  {
    const r = await binh.patch('/me', { displayName: 'Ke pha hoai', messagingApp: 'PHONE' });
    const check = await an.get('/me');
    rec('TC-47', 'Binh sua ho so cua chinh minh, KHONG dung toi An',
      'An van la "Nguyen An"',
      `Binh -> ${r.body?.displayName}; An van la ${check.body?.displayName}`,
      r.status === 200 && check.body?.displayName === 'Nguyen An');
  }

  {
    const r = await an.patch('/couples/me', { anniversaryAt: '2024-03-08' });
    const love = await an.get('/couples/me/love-summary');
    rec('TC-48', 'Doi ngay ky niem trong app',
      '200 + bo dem ngay yeu tinh lai theo ngay moi',
      `${r.status} + ${r.body?.anniversaryAt} + daysTogether ${love.body?.daysTogether}`,
      r.status === 200 && r.body?.anniversaryAt === '2024-03-08' &&
      love.body?.anniversaryAt.startsWith('2024-03-08'));
  }

  {
    const tomorrow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const r = await an.patch('/couples/me', { anniversaryAt: tomorrow });
    rec('TC-49', 'Doi ngay ky niem sang ngay tuong lai',
      '422', `${r.status} + ${r.body?.code}`, r.status === 422);
  }

  // ---------------------------------------------------------------- HUỶ GHÉP ĐÔI
  {
    const r1 = await binh.del('/couples/me', {});
    rec('TC-28', 'Huỷ ghép đôi mà không xác nhận',
      '422 (bắt buộc confirm:true)', `${r1.status} + ${r1.body?.code}`,
      r1.status === 422);

    const r2 = await binh.del('/couples/me', { confirm: true });
    rec('TC-29', 'Huỷ ghép đôi có xác nhận',
      '204', `${r2.status}`, r2.status === 204);

    const r3 = await binh.get('/couples/me');
    rec('TC-30', 'Bình xem couple sau khi huỷ',
      '404 NOT_IN_COUPLE', `${r3.status} + ${r3.body?.code}`,
      r3.status === 404 && r3.body?.code === 'NOT_IN_COUPLE');

    const r4 = await an.get('/couples/me');
    rec('TC-31', 'An cũng bị gỡ khỏi couple (huỷ là xoá cả hai)',
      '404 NOT_IN_COUPLE', `${r4.status} + ${r4.body?.code}`,
      r4.status === 404 && r4.body?.code === 'NOT_IN_COUPLE');

    const r5 = await an.get('/me');
    rec('TC-32', 'Tài khoản An vẫn còn (chỉ couple bị xoá)',
      '200 + coupleId=null', `${r5.status} + coupleId:${r5.body?.coupleId}`,
      r5.status === 200 && r5.body?.coupleId === null);
  }

  // ---------------------------------------------------------------- ĐĂNG XUẤT
  {
    const r1 = await an.post('/auth/logout', undefined, { noAuth: true });
    rec('TC-33', 'Đăng xuất', '204 + cookie bị xoá',
      `${r1.status} + còn cookie: ${an.cookies.has('beside_rt')}`,
      r1.status === 204 && !an.cookies.has('beside_rt'));

    const r2 = await an.post('/auth/refresh', undefined, { noAuth: true });
    rec('TC-34', 'Refresh sau khi đăng xuất',
      '401', `${r2.status} + ${r2.body?.code}`, r2.status === 401);
  }

  // ---------------------------------------------------------------- RATE LIMIT
  // Đặt CUỐI CÙNG vì case này cố tình làm cạn hạn mức đăng ký của IP.
  {
    let blocked = null;
    let attempts = 0;
    for (let i = 0; i < 30; i += 1) {
      const c = new Client(`spam${i}`);
      const r = await c.post('/auth/register',
        { displayName: `spam${i}`, email: email(`spam${i}`), password: 'matkhau123' },
        { noAuth: true });
      attempts += 1;
      if (r.status === 429) { blocked = r; break; }
    }
    rec('TC-35', 'Đăng ký hàng loạt từ cùng một IP',
      '429 + RATE_LIMITED trong vòng 30 lần thử',
      blocked ? `bị chặn ở lần thứ ${attempts}: ${blocked.status} + ${blocked.body?.code}` : 'KHÔNG bị chặn sau 30 lần',
      Boolean(blocked) && blocked.status === 429 && blocked.body?.code === 'RATE_LIMITED');
  }

  // ---------------------------------------------------------------- TỔNG KẾT
  console.log('\n' + '='.repeat(72));
  console.log(`TONG: ${pass} PASS / ${fail} FAIL / ${rows.length} case`);
  console.log('='.repeat(72));

  console.log('\n--- BANG MARKDOWN ---\n');
  console.log('| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) {
    const esc = (s) => String(s).replace(/\|/g, '\\|');
    console.log(`| ${r.id} | ${esc(r.name)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.ok ? '✅' : '❌'} |`);
  }

  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => { console.error('LOI KHI CHAY TRACE:', e); process.exit(2); });
