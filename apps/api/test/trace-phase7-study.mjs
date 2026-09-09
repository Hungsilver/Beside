/**
 * Trace — Phase 7: Phòng học chung (F12).
 *
 *   node apps/api/test/trace-phase7-study.mjs
 *
 * Chạy THẬT vào API + WebSocket `/rts` qua HTTPS.
 *
 * Bộ này kiểm những thứ chỉ lộ ra khi đi qua đủ mạng, DB và cron thật:
 *   · quyền theo `coupleId`;
 *   · hai người vào chung một phòng, đồng hồ giống hệt nhau trên cả hai máy;
 *   · người cuối rời phòng thì phiên đóng lại;
 *   · WebSocket nghe theo COUPLE nên biết cả lúc phiên vừa được mở ra;
 *   · chặng hết giờ thì tự sang chặng kế và ghi công đúng người.
 *
 * Chặng ngắn nhất cho chọn là 15 phút nên không chờ nổi trong một bộ trace —
 * phần "hết giờ" được thử bằng cách kéo `endsAt` về quá khứ ngay trong DB, rồi
 * để chính cron thật xử lý.
 */
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { io } from 'socket.io-client';

const BASE = process.env.TRACE_BASE_URL ?? 'https://localhost/api/v1';
const WS_ORIGIN = new URL(BASE).origin;
const INSECURE_TLS = process.env.TRACE_INSECURE_TLS !== '0';
if (INSECURE_TLS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/** Container Postgres — dùng để đẩy đồng hồ về quá khứ. */
const DB_CONTAINER = process.env.TRACE_DB_CONTAINER ?? 'beside-db';

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

/**
 * Kéo mốc hết giờ của một phiên về quá khứ để cron xử ngay.
 *
 * SQL đi qua STDIN chứ không phải tham số `-c`: câu lệnh có cả nháy kép (tên
 * cột `"endsAt"` phân biệt hoa thường) lẫn nháy đơn (chuỗi interval), và mọi
 * cách trích dẫn để nhét nó vào một dòng lệnh đều hỏng ở shell này hoặc shell kia.
 */
function expireNow(sessionId) {
  const sql = `UPDATE study_sessions SET "endsAt" = now() - interval '5 seconds' WHERE id = '${sessionId}';`;
  execSync(`docker exec -i ${DB_CONTAINER} psql -U beside -d beside`, {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

class Watcher {
  constructor(token) {
    this.token = token;
    this.states = [];
  }
  connect() {
    return new Promise((resolve) => {
      const socket = io(`${WS_ORIGIN}/rts`, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: { token: this.token },
        reconnection: false,
        timeout: 8000,
        rejectUnauthorized: !INSECURE_TLS,
      });
      this.socket = socket;
      socket.on('s:state', (s) => this.states.push(s));
      socket.on('connect', () => resolve({ ok: true }));
      socket.on('connect_error', (err) => resolve({ ok: false, error: err.message }));
    });
  }
  watch() {
    this.socket?.emit('s:watch');
  }
  last() {
    return this.states[this.states.length - 1] ?? null;
  }
  clear() {
    this.states = [];
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

  const couple2 = await call('POST', '/couples', {
    body: { anniversaryAt: '2024-01-01' },
    token: cuong.token,
  });
  await call('POST', '/couples/join', {
    body: { inviteCode: couple2.body.inviteCode },
    token: duyen.token,
  });

  // ---------------------------------------------------------------- mở phòng
  {
    const before = await call('GET', '/study/current', { token: an.token });
    rec('S7-01', 'Chua co phien nao thi /current tra ve rong',
      'null',
      JSON.stringify(before.body),
      before.body === null || before.body === '');
  }

  // WebSocket nối TRƯỚC khi có phiên — đây là điểm mấu chốt của thiết kế.
  const binhWs = new Watcher(binh.token);
  {
    const r = await binhWs.connect();
    binhWs.watch();
    await sleep(600);
    rec('S7-02', 'Nghe duoc ngay ca khi CHUA co phien nao',
      'ket noi ok, nhan state = null',
      `connect=${r.ok} · state=${JSON.stringify(binhWs.last())}`,
      r.ok && binhWs.last() === null);
    binhWs.clear();
  }

  let session = null;
  {
    const r = await call('POST', '/study', {
      body: { focusMin: 15, breakMin: 5 },
      token: an.token,
    });
    session = r.body;
    rec('S7-03', 'An mo phong hoc 15 phut',
      '201 · RUNNING · phase FOCUS · chi An trong phong',
      `${r.status} · ${r.body?.status} · ${r.body?.phase} · ${r.body?.presentUserIds?.length} nguoi`,
      (r.status === 200 || r.status === 201) &&
        r.body?.status === 'RUNNING' &&
        r.body?.phase === 'FOCUS' &&
        r.body?.presentUserIds?.length === 1 &&
        r.body?.presentUserIds?.[0] === an.id);

    const left = Math.round((r.body?.endsAt - Date.now()) / 1000);
    rec('S7-04', 'Dong ho dat dung 15 phut',
      'con khoang 895–900 giay',
      `con ${left}s`,
      left > 880 && left <= 900);
  }

  {
    await sleep(800);
    rec('S7-05', 'Binh dang mo app thi thay phong vua mo ra NGAY',
      'nhan duoc state co id phien vua tao',
      `state=${binhWs.last()?.id === session.id ? 'khop' : JSON.stringify(binhWs.last())}`,
      binhWs.last()?.id === session.id);
  }

  {
    const r = await call('POST', '/study', {
      body: { focusMin: 25, breakMin: 5 },
      token: binh.token,
    });
    rec('S7-06', 'Bam "bat dau" khi da co phong thi VAO CUNG, khong bao loi',
      'tra ve dung phien dang chay, co ca hai nguoi',
      `${r.status} · id ${r.body?.id === session.id ? 'khop' : 'khac'} · ${r.body?.presentUserIds?.length} nguoi`,
      r.status < 400 && r.body?.id === session.id && r.body?.presentUserIds?.length === 2);
  }

  {
    const anView = await call('GET', '/study/current', { token: an.token });
    const binhView = await call('GET', '/study/current', { token: binh.token });
    rec('S7-07', 'Hai nguoi thay CUNG mot dong ho',
      'endsAt giong het nhau',
      `An=${anView.body?.endsAt} Binh=${binhView.body?.endsAt}`,
      anView.body?.endsAt === binhView.body?.endsAt);
  }

  // ---------------------------------------------------------------- quyền
  {
    const r = await call('GET', '/study/current', { token: cuong.token });
    rec('S7-08', 'Couple khac KHONG thay phien cua nguoi ta',
      'null',
      JSON.stringify(r.body),
      r.body === null || r.body === '');

    const j = await call('POST', `/study/${session.id}/join`, { token: cuong.token });
    rec('S7-09', 'Couple khac khong vao duoc phong',
      '404',
      String(j.status),
      j.status === 404);
  }

  {
    const r = await call('POST', '/study', {
      body: { focusMin: 37 },
      token: an.token,
    });
    rec('S7-10', 'Thoi luong tu che bi tu choi',
      '400/422',
      String(r.status),
      r.status === 400 || r.status === 422);
  }

  // ---------------------------------------------------------------- hết giờ
  {
    binhWs.clear();
    expireNow(session.id);
    // Cron quét mỗi 10 giây.
    await sleep(13_000);

    const r = await call('GET', '/study/current', { token: an.token });
    rec('S7-11', 'Het chang HOC thi tu sang chang NGHI',
      'phase BREAK · roundsDone 1 · van RUNNING',
      `${r.body?.phase} · rounds=${r.body?.roundsDone} · ${r.body?.status}`,
      r.body?.phase === 'BREAK' && r.body?.roundsDone === 1 && r.body?.status === 'RUNNING');

    const left = Math.round((r.body?.endsAt - Date.now()) / 1000);
    rec('S7-12', 'Chang nghi dat dung 5 phut',
      'con khoang 290–300 giay',
      `con ${left}s`,
      left > 280 && left <= 300);

    rec('S7-13', 'WebSocket bao chang moi cho nguoi dang mo app',
      'nhan duoc state phase BREAK',
      `state phase=${binhWs.last()?.phase ?? '-'}`,
      binhWs.last()?.phase === 'BREAK');
  }

  {
    const r = await call('GET', '/study/summary', { token: an.token });
    const anStat = r.body?.people?.find((p) => p.userId === an.id);
    const binhStat = r.body?.people?.find((p) => p.userId === binh.id);
    rec('S7-14', 'CA HAI deu duoc ghi cong 15 phut vua hoc',
      'moi nguoi 15 phut hom nay',
      `An=${anStat?.todayMinutes} Binh=${binhStat?.todayMinutes}`,
      anStat?.todayMinutes === 15 && binhStat?.todayMinutes === 15);

    rec('S7-15', 'Chuoi ngay hoc bat dau tu 1',
      'streak = 1 cho ca hai',
      `An=${anStat?.streakDays} Binh=${binhStat?.streakDays}`,
      anStat?.streakDays === 1 && binhStat?.streakDays === 1);

    rec('S7-16', 'Chang ca hai cung ngoi duoc tinh vao "hoc cung nhau" MOT lan',
      '15 phut (khong phai 30)',
      `${r.body?.togetherMinutes} phut`,
      r.body?.togetherMinutes === 15);
  }

  // ---------------------------------------------------------------- rời phòng
  {
    const r = await call('POST', `/study/${session.id}/leave`, { token: binh.token });
    rec('S7-17', 'Mot nguoi roi thi phien VAN chay cho nguoi con lai',
      'RUNNING · con 1 nguoi',
      `${r.body?.status} · ${r.body?.presentUserIds?.length} nguoi`,
      r.body?.status === 'RUNNING' && r.body?.presentUserIds?.length === 1);

    const r2 = await call('POST', `/study/${session.id}/leave`, { token: an.token });
    rec('S7-18', 'Nguoi CUOI CUNG roi thi phien dong lai',
      'CANCELLED · khong con ai',
      `${r2.body?.status} · ${r2.body?.presentUserIds?.length} nguoi`,
      r2.body?.status === 'CANCELLED' && r2.body?.presentUserIds?.length === 0);

    const after = await call('GET', '/study/current', { token: an.token });
    rec('S7-19', 'Sau khi dong thi khong con phien dang chay',
      'null',
      JSON.stringify(after.body),
      after.body === null || after.body === '');
  }

  {
    const r = await call('POST', `/study/${session.id}/join`, { token: an.token });
    rec('S7-20', 'Khong vao lai duoc phien da ket thuc',
      '409',
      String(r.status),
      r.status === 409);
  }

  // ---------------------------------------------------------------- dừng hẳn
  {
    const fresh = await call('POST', '/study', {
      body: { focusMin: 15, breakMin: 5 },
      token: an.token,
    });
    await call('POST', `/study/${fresh.body.id}/join`, { token: binh.token });

    // Người KHÔNG mở phòng cũng dừng được — phòng học là hoạt động chung.
    const r = await call('POST', `/study/${fresh.body.id}/cancel`, { token: binh.token });
    rec('S7-21', 'Nguoi khong mo phong cung dung han duoc buoi hoc',
      'CANCELLED',
      String(r.body?.status),
      r.body?.status === 'CANCELLED');

    const stats = await call('GET', '/study/summary', { token: an.token });
    const anStat = stats.body?.people?.find((p) => p.userId === an.id);
    rec('S7-22', 'Dung giua chang thi KHONG duoc ghi cong them phut nao',
      'van la 15 phut nhu truoc',
      `${anStat?.todayMinutes} phut`,
      anStat?.todayMinutes === 15);
  }

  binhWs.close();

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
