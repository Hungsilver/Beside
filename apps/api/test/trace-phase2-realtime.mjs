/**
 * Trace Phase 2 — Vị trí thời gian thực.
 *
 * Chạy thật vào API + PostgreSQL, dùng cả REST lẫn WebSocket như client thật.
 *
 * Cách chạy:
 *   npm run dev:api          # ở cửa sổ khác (hoặc node apps/api/dist/main.js)
 *   npm run trace:phase2
 *
 * LƯU Ý: ghi dữ liệu THẬT vào DB (tài khoản đuôi @beside.test). Chỉ chạy trên
 * DB dev. Hạn mức đăng ký 20/giờ/IP — chạy lại nhiều lần thì khởi động lại API
 * để xoá bộ đếm (throttler lưu trong bộ nhớ).
 */
import { io } from 'socket.io-client';

const BASE = process.env.TRACE_BASE_URL ?? 'http://localhost:3000/api/v1';
const WS_ORIGIN = process.env.TRACE_WS_ORIGIN ?? 'http://localhost:3000';
/** Bỏ qua kiểm tra chứng chỉ — chỉ dùng khi trỏ vào https://localhost của Caddy. */
const INSECURE_TLS = process.env.TRACE_INSECURE_TLS === '1';

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

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
    this.access = null;
    this.socket = null;
    this.received = { loc: [], presence: [], errors: [] };
  }

  absorb(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (v === '') this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }

  async req(method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.access) headers.Authorization = `Bearer ${this.access}`;
    const ck = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (ck) headers.Cookie = ck;

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    this.absorb(res);
    let json = null;
    if (res.status !== 204) {
      try {
        json = await res.json();
      } catch {
        /* không phải JSON */
      }
    }
    return { status: res.status, body: json };
  }

  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b); }
  patch(p, b) { return this.req('PATCH', p, b); }

  /** Kết nối WebSocket và chờ tới khi thật sự nối được (hoặc bị từ chối). */
  connect(tokenOverride) {
    return new Promise((resolve) => {
      const socket = io(`${WS_ORIGIN}/rt`, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: { token: tokenOverride !== undefined ? tokenOverride : this.access },
        reconnection: false,
        timeout: 8000,
        // Khi chạy qua https://localhost, Caddy dùng chứng chỉ do CA NỘI BỘ của nó
        // cấp. Node `fetch` chấp nhận qua NODE_TLS_REJECT_UNAUTHORIZED=0, nhưng
        // thư viện `ws` bên dưới socket.io-client thì KHÔNG — phải nói riêng.
        // Chỉ ảnh hưởng kịch bản test, không dính gì tới code chạy thật.
        rejectUnauthorized: !INSECURE_TLS,
      });
      this.socket = socket;

      socket.on('loc:partner', (e) => this.received.loc.push(e));
      socket.on('presence', (e) => this.received.presence.push(e));
      socket.on('rt:error', (e) => this.received.errors.push(e));

      socket.on('connect', () => resolve({ ok: true }));
      socket.on('connect_error', (err) => resolve({ ok: false, error: err.message }));
      socket.on('disconnect', (reason) => {
        if (!socket.connected) resolve({ ok: false, error: `disconnect: ${reason}` });
      });
    });
  }

  emit(event, payload) { this.socket?.emit(event, payload); }
  close() { this.socket?.close(); this.socket = null; }
  clear() { this.received = { loc: [], presence: [], errors: [] }; }
}

const stamp = Date.now();
const email = (n) => `${n}.p2.${stamp}@beside.test`;

/** Tuyến đường giả định: Quận 1 → Thủ Đức, đi về hướng Đông Bắc. */
const START = { lat: 10.7769, lng: 106.7009 };
const step = (i) => ({
  lat: START.lat + i * 0.0009,
  lng: START.lng + i * 0.0011,
});

const run = async () => {
  // ---------------------------------------------------------------- chuẩn bị
  const an = new Client('An');
  const binh = new Client('Bình');

  {
    const r = await an.post('/auth/register', {
      displayName: 'An', email: email('an'), password: 'matkhau123',
    });
    if (r.status !== 201) throw new Error(`Khong tao duoc An: ${r.status} ${JSON.stringify(r.body)}`);
    an.access = r.body.accessToken;

    const r2 = await binh.post('/auth/register', {
      displayName: 'Binh', email: email('binh'), password: 'matkhau456',
    });
    if (r2.status !== 201) throw new Error(`Khong tao duoc Binh: ${r2.status}`);
    binh.access = r2.body.accessToken;

    const c = await an.post('/couples', { anniversaryAt: '2023-02-14' });
    if (c.status !== 201) throw new Error(`Khong tao duoc couple: ${c.status}`);
    const j = await binh.post('/couples/join', { inviteCode: c.body.inviteCode });
    if (j.status !== 200) throw new Error(`Binh khong ghep duoc: ${j.status}`);
  }

  rec('TC-50', 'Mac dinh quyen rieng tu khi vua dang ky',
    'ghostMode=false, shareLive=true, fuzzRadiusM=0',
    JSON.stringify((await an.get('/me')).body?.privacy),
    (() => true)());

  {
    const p = (await an.get('/me')).body?.privacy;
    rows.pop(); pass -= 1;
    rec('TC-50', 'Mac dinh quyen rieng tu khi vua dang ky',
      'ghostMode=false, shareLive=true, fuzzRadiusM=0',
      JSON.stringify(p),
      p?.ghostMode === false && p?.shareLive === true && p?.fuzzRadiusM === 0);
  }

  // ---------------------------------------------------------------- WebSocket
  {
    const guest = new Client('vo-danh');
    const r = await guest.connect('token-gia-mao');
    guest.close();
    rec('TC-51', 'Ket noi WebSocket bang token rac',
      'bi tu choi', r.ok ? 'ket noi duoc (SAI)' : `tu choi: ${r.error}`,
      r.ok === false);
  }

  {
    const r1 = await an.connect();
    const r2 = await binh.connect();
    await sleep(300);
    rec('TC-52', 'Hai nguoi cung vao phong couple',
      'ca hai ket noi thanh cong',
      `An:${r1.ok} Binh:${r2.ok}`,
      r1.ok === true && r2.ok === true);
  }

  {
    // Binh phai nhan duoc presence cua An khi An bat "live"
    binh.clear();
    an.emit('live:start');
    await sleep(400);
    const ev = binh.received.presence.filter((p) => p.live === true);
    rec('TC-53', 'Bat chia se truc tiep -> doi phuong nhan duoc presence',
      'Binh nhan presence {live:true} cua An',
      JSON.stringify(ev[ev.length - 1] ?? null),
      ev.length > 0);
  }

  // ---------------------------------------------------------------- luong vi tri
  {
    binh.clear();
    an.emit('loc:update', {
      lat: START.lat, lng: START.lng, accuracyM: 8, speedMps: 0,
      headingDeg: 45, battery: 62, ts: Date.now(),
    });
    await sleep(500);
    const e = binh.received.loc[0];
    rec('TC-54', 'HAPPY PATH — An gui vi tri, Binh nhan duoc',
      'Binh nhan loc:partner voi dung toa do',
      e ? `lat=${e.lat} lng=${e.lng} acc=${e.accuracyM} pin=${e.battery} fuzzed=${e.fuzzed}` : 'khong nhan duoc gi',
      Boolean(e) && Math.abs(e.lat - START.lat) < 1e-9 && Math.abs(e.lng - START.lng) < 1e-9 &&
      e.fuzzed === false && e.battery === 62);
  }

  {
    an.clear();
    binh.emit('loc:update', {
      lat: 10.8231, lng: 106.6297, accuracyM: 15, speedMps: 3, ts: Date.now(),
    });
    await sleep(500);
    rec('TC-55', 'Chieu nguoc lai cung hoat dong',
      'An nhan duoc vi tri cua Binh',
      JSON.stringify(an.received.loc[0] ?? null).slice(0, 90),
      an.received.loc.length === 1);
  }

  {
    an.clear();
    an.emit('loc:update', { lat: 10.78, lng: 106.71, accuracyM: 9, ts: Date.now() });
    await sleep(400);
    rec('TC-56', 'Nguoi gui KHONG nhan lai chinh diem cua minh',
      'An khong nhan loc:partner cua chinh An',
      `An nhan ${an.received.loc.length} su kien`,
      an.received.loc.length === 0);
  }

  {
    binh.clear();
    an.emit('loc:update', { lat: 999, lng: 106.7, accuracyM: 8, ts: Date.now() });
    await sleep(400);
    rec('TC-57', 'Toa do khong hop le bi tu choi, khong lam sap ket noi',
      'nhan rt:error VALIDATION_FAILED, socket van song',
      `errors=${JSON.stringify(an.received.errors)} connected=${an.socket?.connected}`,
      an.received.errors.some((e) => e.code === 'VALIDATION_FAILED') && an.socket?.connected === true);
  }

  // ---------------------------------------------------------------- rate limit
  {
    await sleep(3100); // cho cua so han muc trong lai
    binh.clear();
    an.clear();
    for (let i = 0; i < 12; i += 1) {
      an.emit('loc:update', { ...step(i + 5), accuracyM: 8, speedMps: 12, ts: Date.now() + i });
    }
    await sleep(900);
    rec('TC-58', 'Ban 12 diem trong 1 giay tu cua so trong',
      'chi 2 diem lot qua (han muc 2 diem / 3 giay), 10 diem bi chan',
      `Binh nhan ${binh.received.loc.length} diem`,
      binh.received.loc.length === 2);
  }

  // ---------------------------------------------------------------- lam mo vi tri
  {
    const r = await an.patch('/me/privacy', { fuzzRadiusM: 500 });
    rec('TC-59', 'Bat lam mo vi tri 500m',
      '200 + privacy.fuzzRadiusM = 500',
      `${r.status} + ${JSON.stringify(r.body?.privacy)}`,
      r.status === 200 && r.body?.privacy?.fuzzRadiusM === 500);
  }

  {
    await sleep(3100); // cho qua cua so rate limit
    binh.clear();
    const truth = { lat: 10.776901, lng: 106.700903 };
    an.emit('loc:update', { ...truth, accuracyM: 8, ts: Date.now() });
    await sleep(500);
    const e = binh.received.loc[0];
    const moved = e
      ? Math.hypot((e.lat - truth.lat) * 111320, (e.lng - truth.lng) * 109600)
      : -1;
    rec('TC-60', 'Lam mo: Binh nhan toa do da bi bat vao luoi',
      'fuzzed=true, lech < 500m, accuracyM bao dung 500, khong lo huong/toc do',
      e ? `fuzzed=${e.fuzzed} lech=${moved.toFixed(0)}m acc=${e.accuracyM} heading=${e.headingDeg} speed=${e.speedMps}` : 'khong nhan duoc',
      Boolean(e) && e.fuzzed === true && moved > 0 && moved < 500 &&
      e.accuracyM === 500 && e.headingDeg === null && e.speedMps === null);
  }

  {
    // Gui hai diem cach nhau vai met -> phai ra CUNG mot toa do da lam mo
    await sleep(3100);
    binh.clear();
    an.emit('loc:update', { lat: 10.776901, lng: 106.700903, accuracyM: 8, ts: Date.now() });
    await sleep(3200);
    an.emit('loc:update', { lat: 10.776955, lng: 106.700940, accuracyM: 8, ts: Date.now() });
    await sleep(500);
    const [a, b] = binh.received.loc;
    rec('TC-61', 'Lam mo on dinh: hai diem cach 6m ra cung mot o luoi',
      'toa do nhan duoc giong het nhau (khong the lay trung binh de suy nguoc)',
      a && b ? `${a.lat.toFixed(6)},${a.lng.toFixed(6)} vs ${b.lat.toFixed(6)},${b.lng.toFixed(6)}` : 'thieu diem',
      Boolean(a && b) && a.lat === b.lat && a.lng === b.lng);
  }

  {
    // Lam mo cung phai lam tho ca khoang cach, neu khong thi biet vi tri minh
    // + khoang cach chinh xac la khoanh duoc doi phuong vao mot duong tron.
    const r = await binh.get('/locations/partner/latest');
    const d = r.body?.distanceM;
    rec('TC-61b', 'Lam mo: khoang cach cung bi lam tron theo ban kinh mo',
      'distanceM la boi so cua 500',
      `distanceM = ${d}`,
      typeof d === 'number' && d % 500 === 0);
  }

  await an.patch('/me/privacy', { fuzzRadiusM: 0 });

  // ---------------------------------------------------------------- ghost mode
  {
    const r = await an.patch('/me/privacy', { ghostMode: true });
    await sleep(3100);
    binh.clear();
    an.emit('loc:update', { ...step(30), accuracyM: 8, ts: Date.now() });
    await sleep(600);
    rec('TC-62', 'CHE DO AN DANH — server khong phat vi tri di',
      'Binh KHONG nhan duoc diem nao',
      `${r.status} · Binh nhan ${binh.received.loc.length} diem`,
      r.status === 200 && binh.received.loc.length === 0);
  }

  {
    const r = await binh.get('/locations/partner/latest');
    rec('TC-63', 'An dang an danh: REST cung khong tra vi tri',
      'location = null', JSON.stringify(r.body),
      r.status === 200 && r.body?.location === null);

    rec('TC-63b', 'An dang an danh: KHONG duoc lo ca khoang cach',
      'distanceM = null (neu khong thi an danh chi co tac dung mot nua)',
      `distanceM = ${r.body?.distanceM}`,
      r.body?.distanceM === null);
  }

  {
    const r = await binh.get('/locations/partner/trail');
    rec('TC-64', 'An dang an danh: vet duong cung rong',
      'points = []', `${r.status} · ${r.body?.points?.length} diem`,
      r.status === 200 && r.body?.points?.length === 0);
  }

  {
    // Tat an danh -> phai hoat dong lai NGAY, khong phai cho cache het han
    await an.patch('/me/privacy', { ghostMode: false });
    await sleep(3100);
    binh.clear();
    an.emit('loc:update', { ...step(31), accuracyM: 8, ts: Date.now() });
    await sleep(600);
    rec('TC-65', 'Tat an danh -> co hieu luc NGAY o diem ke tiep',
      'Binh nhan duoc diem moi (server doc lai quyen rieng tu moi lan, khong cache)',
      `Binh nhan ${binh.received.loc.length} diem`,
      binh.received.loc.length === 1);
  }

  // ---------------------------------------------------------------- tat chia se truc tiep
  {
    await an.patch('/me/privacy', { shareLive: false });
    await sleep(3100);
    binh.clear();
    an.emit('loc:update', { ...step(32), accuracyM: 8, ts: Date.now() });
    await sleep(600);
    rec('TC-66', 'Tat "chia se truc tiep": chan luong LIVE',
      'Binh khong nhan diem LIVE',
      `Binh nhan ${binh.received.loc.length} diem`,
      binh.received.loc.length === 0);
  }

  {
    // ...nhung ping bi dong (REST) van duoc chap nhan
    const r = await an.post('/locations', {
      lat: step(33).lat, lng: step(33).lng, accuracyM: 30, ts: Date.now(),
    });
    rec('TC-67', 'Tat chia se truc tiep NHUNG ping bi dong van duoc luu',
      'accepted=true — de doi phuong con thay "lan cuoi o dau"',
      JSON.stringify(r.body),
      r.status === 200 && r.body?.accepted === true);
  }

  {
    const r = await an.patch('/me/privacy', { ghostMode: true });
    const ping = await an.post('/locations', {
      lat: 10.9, lng: 106.9, accuracyM: 20, ts: Date.now(),
    });
    await an.patch('/me/privacy', { ghostMode: false, shareLive: true });
    rec('TC-68', 'An danh cung chan ca ping bi dong',
      'accepted=false, reason=GHOST_MODE',
      `${r.status} · ${JSON.stringify(ping.body)}`,
      ping.status === 200 && ping.body?.accepted === false && ping.body?.reason === 'GHOST_MODE');
  }

  // ---------------------------------------------------------------- REST doc
  {
    await sleep(3100);
    const target = step(40);
    an.emit('loc:update', { ...target, accuracyM: 11, speedMps: 7, battery: 55, ts: Date.now() });
    await sleep(700);

    const r = await binh.get('/locations/partner/latest');
    const loc = r.body?.location;
    rec('TC-69', 'GET /locations/partner/latest tra dung diem vua gui',
      'toa do khop, source=LIVE',
      loc ? `lat=${loc.lat.toFixed(5)} lng=${loc.lng.toFixed(5)} source=${loc.source}` : 'null',
      Boolean(loc) && Math.abs(loc.lat - target.lat) < 1e-6 && loc.source === 'LIVE');
  }

  {
    const r = await binh.get('/locations/partner/latest');
    rec('TC-70', 'Khoang cach giua hai nguoi tinh bang PostGIS',
      'distanceM la so duong (An o Q1 mo rong, Binh o Q3)',
      `${r.body?.distanceM} m`,
      typeof r.body?.distanceM === 'number' && r.body.distanceM > 0);
  }

  {
    const r = await binh.get('/locations/partner/trail?limit=500');
    const pts = r.body?.points ?? [];
    const shaped = pts.every((p) => Array.isArray(p) && p.length === 3);
    rec('TC-71', 'Vet duong tra ve day du diem LIVE',
      'nhieu diem, moi diem dang [lng, lat, ts], co tong quang duong',
      `${pts.length} diem · dung dinh dang: ${shaped} · quang duong ${r.body?.distanceM}m`,
      pts.length >= 3 && shaped && typeof r.body?.distanceM === 'number');
  }

  {
    const r = await binh.get('/locations/partner/trail?from=9999999999999&to=1');
    rec('TC-72', 'Khoang thoi gian nguoc (from > to)',
      '422 VALIDATION_FAILED', `${r.status} + ${r.body?.code}`,
      r.status === 422);
  }

  // ---------------------------------------------------------------- moc thoi gian
  {
    await sleep(3100);
    binh.clear();
    const future = Date.now() + 3 * 3_600_000; // dong ho may lech 3 gio
    an.emit('loc:update', { ...step(41), accuracyM: 8, ts: future });
    await sleep(600);
    const e = binh.received.loc[0];
    rec('TC-73', 'Dong ho may lech 3 gio ve tuong lai',
      'server kep ts ve gio hien tai, khong nhan moc tuong lai',
      e ? `ts lech ${Math.round((e.ts - Date.now()) / 1000)}s so voi bay gio` : 'khong nhan duoc',
      Boolean(e) && e.ts <= Date.now() + 2000);
  }

  // ---------------------------------------------------------------- presence
  {
    binh.clear();
    an.emit('live:stop');
    await sleep(400);
    const ev = binh.received.presence.filter((p) => p.live === false);
    rec('TC-74', 'Tat chia se truc tiep -> doi phuong biet ngay',
      'Binh nhan presence {live:false}',
      JSON.stringify(ev[ev.length - 1] ?? null),
      ev.length > 0);
  }

  {
    binh.clear();
    an.close();
    await sleep(500);
    const off = binh.received.presence.filter((p) => p.online === false);
    rec('TC-75', 'Dong app -> doi phuong thay offline',
      'Binh nhan presence {online:false}',
      JSON.stringify(off[off.length - 1] ?? null),
      off.length > 0);
  }

  {
    // An mo hai tab, dong mot tab thi KHONG duoc bao offline
    const tab1 = new Client('An-tab1');
    const tab2 = new Client('An-tab2');
    tab1.access = an.access;
    tab2.access = an.access;
    await tab1.connect();
    await tab2.connect();
    await sleep(300);

    binh.clear();
    tab1.close();
    await sleep(600);
    const off = binh.received.presence.filter((p) => p.online === false);
    tab2.close();

    rec('TC-76', 'Dong 1 trong 2 tab: KHONG duoc bao offline oan',
      'Binh khong nhan presence offline',
      `Binh nhan ${off.length} su kien offline`,
      off.length === 0);
  }

  binh.close();

  // ---------------------------------------------------------------- tong ket
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
