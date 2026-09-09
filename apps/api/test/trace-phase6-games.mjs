/**
 * Trace — Phase 6: Cờ caro & Tiến lên miền Nam (F10/F11).
 *
 *   node apps/api/test/trace-phase6-games.mjs
 *
 * Chạy THẬT vào API + WebSocket `/rtg` qua HTTPS. Bộ này cố tình không lặp lại
 * việc mà 84 unit test luật đã làm (nhận diện bộ, so bộ, chặt heo, luật caro VN)
 * — nó kiểm những thứ chỉ lộ ra khi đi qua đủ mạng, DB và trọng tài thật:
 *
 *   · bài trên tay đối phương có RỜI server không (hàng rào quan trọng nhất);
 *   · quyền theo `coupleId` ở tầng service;
 *   · khoá lạc quan `version` khi hai bên cùng ghi;
 *   · đồng hồ: đặt, tạm dừng khi ẩn app, chạy tiếp khi quay lại;
 *   · WebSocket đẩy state riêng cho từng người.
 */
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const BASE = process.env.TRACE_BASE_URL ?? 'https://localhost/api/v1';
const WS_ORIGIN = new URL(BASE).origin;
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

const email = (who) => `${who}-${randomUUID().slice(0, 8)}@beside.test`;
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
    /* 204 hoặc thân không phải JSON */
  }
  return { status: res.status, body: json };
}

/** Một người xem ván qua WebSocket, gom lại mọi state nhận được. */
class Watcher {
  constructor(token) {
    this.token = token;
    this.states = [];
    this.overs = [];
  }

  connect() {
    return new Promise((resolve) => {
      const socket = io(`${WS_ORIGIN}/rtg`, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: { token: this.token },
        reconnection: false,
        timeout: 8000,
        // Caddy dùng CA nội bộ cho localhost. `fetch` chấp nhận qua biến môi
        // trường, nhưng `ws` bên dưới socket.io-client thì phải nói riêng.
        rejectUnauthorized: !INSECURE_TLS,
      });
      this.socket = socket;
      socket.on('g:state', (s) => this.states.push(s));
      socket.on('g:over', (e) => this.overs.push(e));
      socket.on('connect', () => resolve({ ok: true }));
      socket.on('connect_error', (err) => resolve({ ok: false, error: err.message }));
    });
  }

  watch(gameId) {
    this.socket?.emit('g:watch', { gameId });
  }
  away() {
    this.socket?.emit('g:away');
  }
  back() {
    this.socket?.emit('g:back');
  }
  last() {
    return this.states[this.states.length - 1] ?? null;
  }
  clear() {
    this.states = [];
    this.overs = [];
  }
  close() {
    this.socket?.close();
    this.socket = null;
  }
}

const run = async () => {
  const reg = async (name, mail) => {
    const r = await call('POST', '/auth/register', {
      body: { displayName: name, email: mail, password: 'matkhau123' },
    });
    if (r.status !== 201) {
      throw new Error(`Khong tao duoc ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    }
    return { token: r.body.accessToken, id: r.body.user.id, name };
  };

  const an = await reg('An', email('an'));
  const binh = await reg('Binh', email('binh'));
  // Người ngoài, KHÔNG cùng couple — dùng để thử hàng rào quyền.
  const cuong = await reg('Cuong', email('cuong'));
  const duyen = await reg('Duyen', email('duyen'));

  const couple = await call('POST', '/couples', {
    body: { anniversaryAt: '2023-02-14' },
    token: an.token,
  });
  await call('POST', '/couples/join', {
    body: { inviteCode: couple.body.inviteCode },
    token: binh.token,
  });

  // Cường + Duyên thành một couple khác, để thử "ván của cặp đôi khác".
  const couple2 = await call('POST', '/couples', {
    body: { anniversaryAt: '2024-01-01' },
    token: cuong.token,
  });
  await call('POST', '/couples/join', {
    body: { inviteCode: couple2.body.inviteCode },
    token: duyen.token,
  });

  // =====================================================================
  // A · CỜ CARO
  // =====================================================================
  let caro = null;
  {
    const r = await call('POST', '/games', { body: { kind: 'CARO' }, token: an.token });
    caro = r.body;
    rec('G6-01', 'Tao van caro thanh cong, nguoi tao di truoc',
      `201 · turnUserId = An · status PLAYING`,
      `${r.status} · turn=${r.body?.turnUserId === an.id ? 'An' : r.body?.turnUserId} · ${r.body?.status}`,
      (r.status === 200 || r.status === 201) &&
        r.body?.turnUserId === an.id &&
        r.body?.status === 'PLAYING');

    rec('G6-02', 'Ban co rong dung 225 o, nguoi tao cam quan X',
      '225 dau cham · An = X',
      `${r.body?.state?.board?.length} ky tu · An=${r.body?.state?.marks?.[an.id]}`,
      r.body?.state?.board === '.'.repeat(225) && r.body?.state?.marks?.[an.id] === 'X');

    rec('G6-03', 'Dong ho duoc dat ngay khi tao van',
      'turnDeadlineAt trong khoang 25–31 giay toi',
      `con ${Math.round(((r.body?.turnDeadlineAt ?? 0) - Date.now()) / 1000)}s`,
      (r.body?.turnDeadlineAt ?? 0) - Date.now() > 25_000 &&
        (r.body?.turnDeadlineAt ?? 0) - Date.now() <= 31_000);
  }

  {
    const r = await call('POST', '/games', { body: { kind: 'CARO' }, token: binh.token });
    rec('G6-04', 'Khong tao duoc van caro thu hai khi con van dang chay',
      '409 va kem gameId cua van dang chay',
      `${r.status} · gameId=${r.body?.fieldErrors?.gameId?.[0] === caro.id ? 'khop' : 'khong khop'}`,
      r.status === 409 && r.body?.fieldErrors?.gameId?.[0] === caro.id);
  }

  {
    const r = await call('GET', `/games/${caro.id}`, { token: cuong.token });
    rec('G6-05', 'Nguoi ngoai couple KHONG doc duoc van',
      '404 (khong phai 403 — 403 tu no da lo ra id co that)',
      String(r.status),
      r.status === 404);
  }

  {
    const r = await call('POST', `/games/${caro.id}/moves`, {
      body: { version: caro.version, move: { r: 7, c: 7 } },
      token: binh.token,
    });
    rec('G6-06', 'Di khi chua toi luot bi tu choi',
      '409 · "Chua toi luot ban"',
      `${r.status} · ${r.body?.message}`,
      r.status === 409 && /Chưa tới lượt/i.test(r.body?.message ?? ''));
  }

  {
    const r = await call('POST', `/games/${caro.id}/moves`, {
      body: { version: caro.version, move: { r: 99, c: 7 } },
      token: an.token,
    });
    rec('G6-07', 'O ngoai ban co bi tu choi ngay o tang schema',
      '400/422',
      String(r.status),
      r.status === 400 || r.status === 422);
  }

  // --- WebSocket: hai người cùng xem một ván ---
  const anWs = new Watcher(an.token);
  const binhWs = new Watcher(binh.token);
  {
    const a = await anWs.connect();
    const b = await binhWs.connect();
    rec('G6-08', 'Ca hai ket noi duoc WebSocket namespace /rtg',
      'ca hai ok',
      `An=${a.ok} Binh=${b.ok}`,
      a.ok && b.ok);

    anWs.watch(caro.id);
    binhWs.watch(caro.id);
    await sleep(700);
    rec('G6-09', 'Vao xem thi nhan duoc state ngay',
      'ca hai co it nhat 1 state',
      `An=${anWs.states.length} Binh=${binhWs.states.length}`,
      anWs.states.length > 0 && binhWs.states.length > 0);
  }

  {
    const badWs = new Watcher('token-bia-dat');
    const r = await badWs.connect();
    badWs.close();
    rec('G6-10', 'Token sai bi chan ngay o buoc BAT TAY',
      'connect_error, khong bao gio vao duoc',
      r.ok ? 'ket noi duoc (SAI)' : `bi tu choi: ${r.error}`,
      !r.ok);
  }

  let caroVersion = caro.version;
  {
    anWs.clear();
    binhWs.clear();
    const r = await call('POST', `/games/${caro.id}/moves`, {
      body: { version: caroVersion, move: { r: 7, c: 7 } },
      token: an.token,
    });
    caroVersion = r.body?.version ?? caroVersion;
    await sleep(600);

    rec('G6-11', 'Di mot nuoc: quan len ban, luot sang nguoi kia',
      'o (7,7) = X · turn = Binh',
      `o=${r.body?.state?.board?.[7 * 15 + 7]} · turn=${r.body?.turnUserId === binh.id ? 'Binh' : '?'}`,
      r.body?.state?.board?.[7 * 15 + 7] === 'X' && r.body?.turnUserId === binh.id);

    rec('G6-12', 'WebSocket day state moi cho CA HAI nguoi',
      'ca hai nhan duoc state co quan vua di',
      `An=${anWs.last()?.state?.board?.[112] ?? '-'} Binh=${binhWs.last()?.state?.board?.[112] ?? '-'}`,
      anWs.last()?.state?.board?.[112] === 'X' && binhWs.last()?.state?.board?.[112] === 'X');

    rec('G6-13', 'Dong ho duoc dat lai cho luot moi',
      'turnDeadlineAt con > 25 giay',
      `con ${Math.round(((r.body?.turnDeadlineAt ?? 0) - Date.now()) / 1000)}s`,
      (r.body?.turnDeadlineAt ?? 0) - Date.now() > 25_000);
  }

  {
    const r = await call('POST', `/games/${caro.id}/moves`, {
      body: { version: caroVersion, move: { r: 7, c: 7 } },
      token: binh.token,
    });
    rec('G6-14', 'Danh vao o da co quan bi tu choi',
      '400 · "da co quan roi"',
      `${r.status} · ${r.body?.message}`,
      r.status === 400 && /đã có quân/i.test(r.body?.message ?? ''));
  }

  {
    // Gửi kèm version CŨ — mô phỏng hai bên cùng ghi.
    const stale = caroVersion - 1;
    const r = await call('POST', `/games/${caro.id}/moves`, {
      body: { version: stale, move: { r: 0, c: 0 } },
      token: binh.token,
    });
    rec('G6-15', 'Khoa lac quan chan nuoc di dua tren state cu',
      '409 · van khong bi ghi de',
      `${r.status} · ${r.body?.message ?? ''}`,
      r.status === 409);
  }

  // --- Đồng hồ: ẩn app thì phải dừng ---
  {
    // Lượt đang của Bình. Bình ẩn app → đồng hồ phải dừng.
    binhWs.away();
    await sleep(700);
    const r = await call('GET', `/games/${caro.id}`, { token: an.token });
    rec('G6-16', 'Nguoi toi luot an app thi DONG HO TAM DUNG',
      'turnDeadlineAt = null, con luu turnRemainingMs',
      `deadline=${r.body?.turnDeadlineAt} · con ${r.body?.turnRemainingMs}ms`,
      r.body?.turnDeadlineAt === null && r.body?.turnRemainingMs > 0);

    binhWs.back();
    await sleep(700);
    const r2 = await call('GET', `/games/${caro.id}`, { token: an.token });
    rec('G6-17', 'Quay lai thi dong ho chay tiep tu cho da dung',
      'turnDeadlineAt khac null',
      `deadline con ${Math.round(((r2.body?.turnDeadlineAt ?? 0) - Date.now()) / 1000)}s`,
      r2.body?.turnDeadlineAt !== null);
  }

  {
    // An ẩn app trong khi lượt là của Bình — KHÔNG được ảnh hưởng gì.
    const before = await call('GET', `/games/${caro.id}`, { token: an.token });
    anWs.away();
    await sleep(700);
    const after = await call('GET', `/games/${caro.id}`, { token: an.token });
    rec('G6-18', 'Nguoi KHONG toi luot an app thi dong ho van chay',
      'turnDeadlineAt van khac null',
      `truoc=${before.body?.turnDeadlineAt !== null} sau=${after.body?.turnDeadlineAt !== null}`,
      after.body?.turnDeadlineAt !== null);
    anWs.back();
    await sleep(300);
  }

  {
    const r = await call('POST', `/games/${caro.id}/resign`, { token: binh.token });
    await sleep(500);
    rec('G6-19', 'Dau hang: nguoi kia thang, van dong lai',
      'FINISHED · winner = An · endReason DAU_HANG',
      `${r.body?.status} · winner=${r.body?.winnerId === an.id ? 'An' : r.body?.winnerId} · ${r.body?.endReason}`,
      r.body?.status === 'FINISHED' &&
        r.body?.winnerId === an.id &&
        r.body?.endReason === 'DAU_HANG');

    const again = await call('POST', `/games/${caro.id}/moves`, {
      body: { version: r.body?.version, move: { r: 1, c: 1 } },
      token: an.token,
    });
    rec('G6-20', 'Van da ket thuc thi khong di them duoc nua',
      '409',
      String(again.status),
      again.status === 409);
  }

  anWs.close();
  binhWs.close();

  // =====================================================================
  // B · TIẾN LÊN MIỀN NAM
  // =====================================================================
  let tl = null;
  {
    const r = await call('POST', '/games', { body: { kind: 'TIEN_LEN' }, token: an.token });
    tl = r.body;
    rec('G6-21', 'Tao van tien len thanh cong',
      '201 · PLAYING',
      `${r.status} · ${r.body?.status}`,
      (r.status === 200 || r.status === 201) && r.body?.status === 'PLAYING');

    rec('G6-22', 'Chia dung 13 la cho nguoi xem',
      'myHand = 13 la',
      `${r.body?.state?.myHand?.length} la`,
      r.body?.state?.myHand?.length === 13);

    rec('G6-23', 'Doi phuong CHI lo ra so la, khong lo bai',
      'opponentCount = 13, khong co truong nao chua bai ho',
      `count=${r.body?.state?.opponentCount} · keys=${Object.keys(r.body?.state ?? {}).join(',')}`,
      r.body?.state?.opponentCount === 13 &&
        !('hands' in (r.body?.state ?? {})) &&
        !('opponentHand' in (r.body?.state ?? {})));
  }

  // Hàng rào quan trọng nhất: soi thẳng JSON đi qua dây.
  {
    const anView = await call('GET', `/games/${tl.id}`, { token: an.token });
    const binhView = await call('GET', `/games/${tl.id}`, { token: binh.token });

    const anHand = anView.body?.state?.myHand ?? [];
    const binhHand = binhView.body?.state?.myHand ?? [];
    const overlap = anHand.filter((c) => binhHand.includes(c));

    rec('G6-24', 'Hai nguoi cam hai bo bai KHAC nhau, khong trung la nao',
      '0 la trung',
      `${overlap.length} la trung`,
      overlap.length === 0);

    const wire = JSON.stringify(anView.body);
    const leaked = binhHand.filter((c) => !anHand.includes(c) && wire.includes(`,${c},`));
    rec('G6-25', 'Ban tra ve cho An KHONG chua la nao chi Binh moi co',
      '0 la ro ri',
      `${leaked.length} la ro ri`,
      leaked.length === 0);

    rec('G6-26', 'Ca hai deu thay cung mot la bat buoc o nuoc dau',
      'mustInclude giong nhau va la la nho nhat da chia',
      `An=${anView.body?.state?.mustInclude} Binh=${binhView.body?.state?.mustInclude}`,
      anView.body?.state?.mustInclude === binhView.body?.state?.mustInclude &&
        anView.body?.state?.mustInclude === Math.min(...anHand, ...binhHand));
  }

  // Ai cầm lá nhỏ nhất thì người đó đi trước.
  let first;
  let second;
  {
    const anView = await call('GET', `/games/${tl.id}`, { token: an.token });
    const must = anView.body?.state?.mustInclude;
    const anHasIt = (anView.body?.state?.myHand ?? []).includes(must);
    first = anHasIt ? an : binh;
    second = anHasIt ? binh : an;

    rec('G6-27', 'Nguoi cam la NHO NHAT DA CHIA di truoc',
      'turnUserId = nguoi giu la do',
      `turn=${tl.turnUserId === first.id ? first.name : 'sai nguoi'}`,
      anView.body?.turnUserId === first.id);
  }

  let tlVersion = (await call('GET', `/games/${tl.id}`, { token: an.token })).body.version;
  {
    const view = await call('GET', `/games/${tl.id}`, { token: first.token });
    const hand = view.body.state.myHand;
    const must = view.body.state.mustInclude;
    // Một lá bất kỳ KHÁC lá bắt buộc.
    const other = hand.find((c) => c !== must);

    const r = await call('POST', `/games/${tl.id}/moves`, {
      body: { version: tlVersion, move: { cards: [other] } },
      token: first.token,
    });
    rec('G6-28', 'Nuoc dau KHONG chua la bat buoc bi tu choi',
      '400 · nhac ten la bat buoc',
      `${r.status} · ${r.body?.message}`,
      r.status === 400 && /Nước đầu tiên phải có/i.test(r.body?.message ?? ''));
  }

  {
    const r = await call('POST', `/games/${tl.id}/moves`, {
      body: { version: tlVersion, move: { pass: true } },
      token: first.token,
    });
    rec('G6-29', 'Ban trong thi KHONG duoc bo luot',
      '400 · "dang duoc ra bai"',
      `${r.status} · ${r.body?.message}`,
      r.status === 400 && /không bỏ lượt được/i.test(r.body?.message ?? ''));
  }

  {
    const view = await call('GET', `/games/${tl.id}`, { token: first.token });
    const must = view.body.state.mustInclude;
    const r = await call('POST', `/games/${tl.id}/moves`, {
      body: { version: tlVersion, move: { cards: [must] } },
      token: first.token,
    });
    tlVersion = r.body?.version ?? tlVersion;

    rec('G6-30', 'Danh la bat buoc thi di duoc, bai giam mot la',
      '12 la con lai · ban co bai · luot sang nguoi kia',
      `${r.body?.state?.myHand?.length} la · table=${r.body?.state?.table?.cards?.length} · turn=${r.body?.turnUserId === second.id ? 'nguoi kia' : 'sai'}`,
      r.body?.state?.myHand?.length === 12 &&
        r.body?.state?.table?.cards?.length === 1 &&
        r.body?.turnUserId === second.id);

    rec('G6-31', 'Rang buoc la bat buoc duoc go sau nuoc dau',
      'mustInclude = null',
      String(r.body?.state?.mustInclude),
      r.body?.state?.mustInclude === null);
  }

  {
    const view = await call('GET', `/games/${tl.id}`, { token: second.token });
    const notMine = (await call('GET', `/games/${tl.id}`, { token: first.token })).body.state
      .myHand[0];
    const r = await call('POST', `/games/${tl.id}/moves`, {
      body: { version: view.body.version, move: { cards: [notMine] } },
      token: second.token,
    });
    rec('G6-32', 'Danh la KHONG co trong tay minh bi tu choi',
      '400 · "khong nam trong bai cua ban"',
      `${r.status} · ${r.body?.message}`,
      r.status === 400 && /không nằm trong bài/i.test(r.body?.message ?? ''));
  }

  {
    const view = await call('GET', `/games/${tl.id}`, { token: second.token });
    const r = await call('POST', `/games/${tl.id}/moves`, {
      body: { version: view.body.version, move: { pass: true } },
      token: second.token,
    });
    rec('G6-33', 'Bo luot khi ban co bai: nguoi kia an vong, ban duoc don',
      'table = null · luot ve nguoi ra bai truoc',
      `table=${r.body?.state?.table} · turn=${r.body?.turnUserId === first.id ? 'nguoi ra bai' : 'sai'}`,
      r.body?.state?.table === null && r.body?.turnUserId === first.id);

    const back = await call('GET', `/games/${tl.id}`, { token: first.token });
    rec('G6-34', 'Nguoi an vong thay co "doi phuong da bo luot"',
      'opponentPassed = true',
      String(back.body?.state?.opponentPassed),
      back.body?.state?.opponentPassed === true);
  }

  {
    const r = await call('GET', '/games/summary', { token: an.token });
    const caroRow = r.body?.items?.find((i) => i.kind === 'CARO');
    const tlRow = r.body?.items?.find((i) => i.kind === 'TIEN_LEN');
    rec('G6-35', 'Bang diem: dem dung van caro da xong va van tien len dang chay',
      'CARO: 1 van, An thang 1 · TIEN_LEN: activeGameId khac null',
      `caro played=${caroRow?.played} anWin=${caroRow?.wins?.[an.id]} · tl active=${tlRow?.activeGameId === tl.id}`,
      caroRow?.played === 1 && caroRow?.wins?.[an.id] === 1 && tlRow?.activeGameId === tl.id);
  }

  {
    const r = await call('GET', `/games/${tl.id}`, { token: cuong.token });
    rec('G6-36', 'Nguoi couple KHAC khong doc duoc van tien len',
      '404',
      String(r.status),
      r.status === 404);

    const m = await call('POST', `/games/${tl.id}/moves`, {
      body: { version: 0, move: { pass: true } },
      token: cuong.token,
    });
    rec('G6-37', 'Nguoi couple KHAC khong di duoc nuoc nao',
      '404',
      String(m.status),
      m.status === 404);
  }

  {
    const r = await call('GET', '/games', { token: an.token });
    const ids = (r.body ?? []).map((g) => g.id);
    rec('G6-38', 'Danh sach van chi gom van cua chinh couple minh',
      'co ca 2 van vua tao',
      `${ids.length} van`,
      ids.includes(caro.id) && ids.includes(tl.id));

    const other = await call('GET', '/games', { token: cuong.token });
    rec('G6-39', 'Couple khac thay danh sach RONG',
      '0 van',
      `${(other.body ?? []).length} van`,
      (other.body ?? []).length === 0);
  }

  // =====================================================================
  // C · HẾT GIỜ — chỗ DUY NHẤT hai game xử khác nhau
  // =====================================================================
  //
  // Phải mở socket và ở lại xem: đồng hồ CHỈ chạy khi người tới lượt đang mở
  // app. Không có bước này thì server tự dừng đồng hồ và ván không bao giờ hết
  // giờ — đúng như thiết kế, nhưng cũng nghĩa là không test được gì.
  {
    const cuongWs = new Watcher(cuong.token);
    await cuongWs.connect();
    const caro2 = await call('POST', '/games', { body: { kind: 'CARO' }, token: cuong.token });
    cuongWs.watch(caro2.body.id);

    const firstWs = new Watcher(first.token);
    await firstWs.connect();
    firstWs.watch(tl.id);
    await sleep(900);

    const tlBefore = await call('GET', `/games/${tl.id}`, { token: first.token });
    rec('G6-40', 'Nguoi toi luot dang XEM thi dong ho that su chay',
      'turnDeadlineAt khac null o ca hai van',
      `caro=${caro2.body?.turnDeadlineAt !== null} tienlen=${tlBefore.body?.turnDeadlineAt !== null}`,
      caro2.body?.turnDeadlineAt !== null && tlBefore.body?.turnDeadlineAt !== null);

    const handBefore = tlBefore.body.state.myHand.length;
    const turnBefore = tlBefore.body.turnUserId;

    // 30 giây đồng hồ + cron quét mỗi 5 giây ⇒ chậm nhất là 35 giây.
    console.log('      ... cho 40 giay de dong ho het gio ...');
    await sleep(40_000);

    const caroAfter = await call('GET', `/games/${caro2.body.id}`, { token: cuong.token });
    rec('G6-41', 'CARO het gio = THUA van (khong co nuoc "bo luot" trong co)',
      'FINISHED · winner = Duyen · endReason HET_GIO',
      `${caroAfter.body?.status} · winner=${caroAfter.body?.winnerId === duyen.id ? 'Duyen' : caroAfter.body?.winnerId} · ${caroAfter.body?.endReason}`,
      caroAfter.body?.status === 'FINISHED' &&
        caroAfter.body?.winnerId === duyen.id &&
        caroAfter.body?.endReason === 'HET_GIO');

    const tlAfter = await call('GET', `/games/${tl.id}`, { token: first.token });
    rec('G6-42', 'TIEN LEN het gio = MAT LUOT, van van chay tiep',
      'PLAYING · luot da sang nguoi kia',
      `${tlAfter.body?.status} · turn doi=${tlAfter.body?.turnUserId !== turnBefore}`,
      tlAfter.body?.status === 'PLAYING' && tlAfter.body?.turnUserId !== turnBefore);

    rec('G6-43', 'Dang duoc ra bai tu do thi tu danh la le nho nhat, khong bo luot',
      'bai giam dung 1 la · ban co bai',
      `bai ${handBefore} -> ${tlAfter.body?.state?.myHand?.length} · table=${tlAfter.body?.state?.table?.cards?.length ?? 0} la`,
      tlAfter.body?.state?.myHand?.length === handBefore - 1 &&
        (tlAfter.body?.state?.table?.cards?.length ?? 0) === 1);

    rec('G6-44', 'Nuoc do duoc danh dau la do DONG HO sinh ra',
      'lastMoveAuto = true',
      String(tlAfter.body?.lastMoveAuto),
      tlAfter.body?.lastMoveAuto === true);

    rec('G6-45', 'WebSocket bao ket thuc cho van caro het gio',
      'nhan duoc su kien g:over voi HET_GIO',
      `${cuongWs.overs.length} su kien · ${cuongWs.overs[0]?.endReason ?? '-'}`,
      cuongWs.overs.some((e) => e.endReason === 'HET_GIO'));

    cuongWs.close();
    firstWs.close();
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
    console.log(
      `| ${r.id} | ${esc(r.name)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.ok ? '✅' : '❌'} |`,
    );
  }
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('LOI KHI CHAY TRACE:', e);
  process.exit(2);
});
