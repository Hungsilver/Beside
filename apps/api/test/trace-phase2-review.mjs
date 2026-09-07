/**
 * Trace Phase 2 — LƯỢT RÀ SOÁT LẠI.
 *
 * Bộ trace gốc (trace-phase2-realtime.mjs) chạy khi Redis đang TẮT, nên toàn bộ
 * nhánh cache chưa từng được kiểm — mà đó lại chính là cấu hình production.
 * File này nhắm vào những khoảng trống đó cùng vài biên chưa ai chạm tới.
 *
 *   npm run trace:review
 */
import { io } from 'socket.io-client';

const BASE = process.env.TRACE_BASE_URL ?? 'https://localhost/api/v1';
const WS_ORIGIN = process.env.TRACE_WS_ORIGIN ?? 'https://localhost';
const INSECURE_TLS = process.env.TRACE_INSECURE_TLS !== '0';
if (INSECURE_TLS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let pass = 0;
let fail = 0;
const rows = [];

function rec(id, name, expected, actual, ok) {
  rows.push({ id, name, expected, actual, ok });
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}`);
  if (!ok) console.log(`        ky vong: ${expected}\n        thuc te : ${actual}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 204 */
  }
  return { status: res.status, body: json };
}

function connect(token) {
  return new Promise((resolve) => {
    const s = io(`${WS_ORIGIN}/rt`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      timeout: 8000,
      rejectUnauthorized: !INSECURE_TLS,
    });
    const received = { loc: [], errors: [], disconnected: null };
    s.on('loc:partner', (e) => received.loc.push(e));
    s.on('rt:error', (e) => received.errors.push(e));
    s.on('disconnect', (r) => {
      received.disconnected = r;
    });
    s.on('connect', () => resolve({ socket: s, received }));
    s.on('connect_error', () => resolve({ socket: s, received, error: true }));
  });
}

const stamp = Date.now();
const email = (n) => `${n}.rv.${stamp}@beside.test`;
const TRUTH = { lat: 10.776901, lng: 106.700903 };

const run = async () => {
  // ---------------------------------------------------------------- chuẩn bị
  const reg = async (name, mail) => {
    const r = await call('POST', '/auth/register', {
      body: { displayName: name, email: mail, password: 'matkhau123' },
    });
    if (r.status !== 201) throw new Error(`Khong tao duoc ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.accessToken;
  };

  const an = await reg('An', email('an'));
  const binh = await reg('Binh', email('binh'));

  const c = await call('POST', '/couples', { body: { anniversaryAt: '2023-02-14' }, token: an });
  await call('POST', '/couples/join', { body: { inviteCode: c.body.inviteCode }, token: binh });

  const setPrivacy = (token, patch) => call('PATCH', '/me/privacy', { body: patch, token });
  const ping = (token, extra = {}) =>
    call('POST', '/locations', {
      body: { ...TRUTH, accuracyM: 8, ts: Date.now(), ...extra },
      token,
    });
  const latest = (token) => call('GET', '/locations/partner/latest', { token });

  // ================================================================
  // A · CACHE vs QUYỀN RIÊNG TƯ  (nhánh chưa từng được kiểm)
  // ================================================================
  {
    await setPrivacy(an, { ghostMode: false, shareLive: true, fuzzRadiusM: 0 });
    await ping(an);
    const before = await latest(binh);
    rec('RV-01', 'Chua lam mo: Binh thay toa do chinh xac',
      'lat khop, fuzzed=false',
      `lat=${before.body?.location?.lat} fuzzed=${before.body?.location?.fuzzed}`,
      Math.abs((before.body?.location?.lat ?? 0) - TRUTH.lat) < 1e-9 &&
      before.body?.location?.fuzzed === false);
  }

  {
    // An bat lam mo NHUNG khong gui diem moi (dung yen / da dong app).
    // Cache van con diem cu — no KHONG duoc phep lo toa do chinh xac.
    await setPrivacy(an, { fuzzRadiusM: 500 });
    const after = await latest(binh);
    const loc = after.body?.location;
    const leaked = Math.abs((loc?.lat ?? 0) - TRUTH.lat) < 1e-9;
    rec('RV-02', 'BAT lam mo, KHONG gui diem moi -> cache khong duoc lo toa do that',
      'fuzzed=true, toa do da bi bat vao luoi, accuracyM=500',
      `lat=${loc?.lat} fuzzed=${loc?.fuzzed} acc=${loc?.accuracyM}`,
      !leaked && loc?.fuzzed === true && loc?.accuracyM === 500);
  }

  {
    const r = await latest(binh);
    rec('RV-03', 'BAT lam mo -> khoang cach cung phai lam tho ngay',
      'distanceM null hoac boi so cua 500',
      `distanceM=${r.body?.distanceM}`,
      r.body?.distanceM === null || r.body?.distanceM % 500 === 0);
  }

  {
    // Tat lam mo, van khong gui diem moi -> phai chinh xac tro lai NGAY
    await setPrivacy(an, { fuzzRadiusM: 0 });
    const r = await latest(binh);
    const loc = r.body?.location;
    rec('RV-04', 'TAT lam mo, khong gui diem moi -> chinh xac tro lai ngay',
      'lat khop lai, fuzzed=false',
      `lat=${loc?.lat} fuzzed=${loc?.fuzzed}`,
      Math.abs((loc?.lat ?? 0) - TRUTH.lat) < 1e-9 && loc?.fuzzed === false);
  }

  {
    // An danh: cache co du lieu nhung tuyet doi khong duoc tra ve
    await setPrivacy(an, { ghostMode: true });
    const r = await latest(binh);
    rec('RV-05', 'BAT an danh, khong gui diem moi -> cache khong duoc tra ve gi',
      'location=null va distanceM=null',
      `location=${r.body?.location} distanceM=${r.body?.distanceM}`,
      r.body?.location === null && r.body?.distanceM === null);
    await setPrivacy(an, { ghostMode: false });
  }

  // ================================================================
  // B · KIỂM TRA ĐẦU VÀO CỦA /me/privacy
  // ================================================================
  {
    const r = await setPrivacy(an, { fuzzRadiusM: 99999 });
    rec('RV-06', 'Ban kinh lam mo vuot tran (99999 > 5000)',
      '422', `${r.status} + ${r.body?.code}`, r.status === 422);
  }
  {
    const r = await setPrivacy(an, { fuzzRadiusM: -100 });
    rec('RV-07', 'Ban kinh lam mo am',
      '422', `${r.status} + ${r.body?.code}`, r.status === 422);
  }
  {
    const r = await setPrivacy(an, {});
    rec('RV-08', 'PATCH /me/privacy voi body rong',
      '422 — khong co gi de cap nhat', `${r.status} + ${r.body?.code}`, r.status === 422);
  }
  {
    const r = await setPrivacy(an, { ghostMode: 'co' });
    rec('RV-09', 'ghostMode khong phai boolean',
      '422', `${r.status} + ${r.body?.code}`, r.status === 422);
  }

  // ================================================================
  // C · KIỂM TRA ĐẦU VÀO CỦA ĐIỂM VỊ TRÍ
  // ================================================================
  {
    const r = await ping(an, { accuracyM: -5 });
    rec('RV-10', 'Sai so am', '422', `${r.status}`, r.status === 422);
  }
  {
    const r = await ping(an, { battery: 150 });
    rec('RV-11', 'Pin ngoai khoang 0-100', '422', `${r.status}`, r.status === 422);
  }
  {
    const r = await ping(an, { headingDeg: 400 });
    rec('RV-12', 'Huong ngoai khoang 0-360', '422', `${r.status}`, r.status === 422);
  }
  {
    const r = await ping(an, { ts: 0 });
    rec('RV-13', 'Moc thoi gian = 0', '422', `${r.status}`, r.status === 422);
  }
  {
    // Dong ho may cham 2 gio: server kep ve toi da 5 phut truoc
    await sleep(3100);
    const twoHoursAgo = Date.now() - 2 * 3_600_000;
    await ping(an, { ts: twoHoursAgo });
    const r = await latest(binh);
    const age = Date.now() - (r.body?.location?.ts ?? 0);
    rec('RV-14', 'Dong ho may cham 2 gio -> server kep ve toi da 5 phut',
      'diem duoc luu voi moc khong qua 5 phut truoc',
      `moc cach hien tai ${Math.round(age / 1000)} giay`,
      age >= 0 && age <= 5 * 60_000 + 5000);
  }
  {
    const r = await call('GET', '/locations/partner/trail?limit=99999', { token: binh });
    rec('RV-15', 'limit vuot tran (99999 > 2000)', '422', `${r.status}`, r.status === 422);
  }

  // ================================================================
  // D · HUỶ GHÉP ĐÔI KHI ĐANG KẾT NỐI
  // ================================================================
  {
    const anSock = await connect(an);
    const binhSock = await connect(binh);
    await sleep(300);

    // Binh huy ghep doi trong luc ca hai dang mo socket
    const del = await call('DELETE', '/couples/me', { body: { confirm: true }, token: binh });
    await sleep(400);

    // An gui vi tri -> server phai ngat, khong duoc chap nhan
    anSock.socket.emit('loc:update', { ...TRUTH, accuracyM: 8, ts: Date.now() });
    await sleep(800);

    rec('RV-16', 'Huy ghep doi khi socket dang mo -> lan gui tiep theo bi ngat',
      'socket cua An bi ngat',
      `huy=${del.status} · An connected=${anSock.socket.connected}`,
      del.status === 204 && anSock.socket.connected === false);

    anSock.socket.close();
    binhSock.socket.close();
  }

  {
    const r = await latest(an);
    rec('RV-17', 'Sau khi huy ghep doi: doc vi tri doi phuong',
      '404 NOT_IN_COUPLE', `${r.status} + ${r.body?.code}`,
      r.status === 404 && r.body?.code === 'NOT_IN_COUPLE');
  }
  {
    const r = await ping(an);
    rec('RV-18', 'Sau khi huy ghep doi: gui vi tri',
      '404 NOT_IN_COUPLE', `${r.status} + ${r.body?.code}`,
      r.status === 404 && r.body?.code === 'NOT_IN_COUPLE');
  }
  {
    const r = await connect(an);
    await sleep(300);
    rec('RV-19', 'Sau khi huy ghep doi: khong ket noi WebSocket duoc nua',
      'bi tu choi hoac ngat ngay',
      `error=${Boolean(r.error)} connected=${r.socket.connected}`,
      r.socket.connected === false);
    r.socket.close();
  }

  // ================================================================
  // E · GHÉP ĐÔI LẠI — LỊCH SỬ CŨ KHÔNG ĐƯỢC RÒ SANG
  // ================================================================
  {
    const c2 = await call('POST', '/couples', { body: { anniversaryAt: '2024-01-01' }, token: an });
    const chi = await reg('Chi', email('chi'));
    await call('POST', '/couples/join', { body: { inviteCode: c2.body.inviteCode }, token: chi });

    const r = await latest(chi);
    rec('RV-20', 'Ghep doi voi nguoi MOI: khong duoc thay lich su vi tri cu cua An',
      'location=null (du lieu cu da bi xoa cung couple cu)',
      `location=${JSON.stringify(r.body?.location)?.slice(0, 60)}`,
      r.body?.location === null);

    const trail = await call('GET', '/locations/partner/trail', { token: chi });
    rec('RV-21', 'Vet duong voi nguoi moi cung phai rong',
      'points=[]', `${trail.body?.points?.length} diem`,
      trail.body?.points?.length === 0);
  }

  // ---------------------------------------------------------------- tổng kết
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

run().catch((e) => {
  console.error('LOI KHI CHAY TRACE:', e);
  process.exit(2);
});
