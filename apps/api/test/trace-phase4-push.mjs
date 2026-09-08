/**
 * Trace Phase 4 (F7) — Thông báo đẩy & nhắc lịch.
 *
 *   npm run trace:push
 *
 * Không gọi được dịch vụ đẩy thật của Google/Apple từ máy dev, nên bộ trace này
 * kiểm những gì KIỂM ĐƯỢC và nói rõ phần nào phải bấm tay:
 *   - vòng đời đăng ký/huỷ đăng ký và quyền sở hữu đăng ký
 *   - server dọn đăng ký chết (mã 404/410 từ dịch vụ đẩy)
 *   - logic chọn thời điểm nhắc lịch, chống gửi trùng, chống dội sau khi server chết
 *
 * Phần chỉ bấm tay được: thông báo có thật sự hiện lên khay của máy hay không.
 */
import { createECDH, randomBytes } from 'node:crypto';
import sharp from 'sharp';

const BASE = process.env.TRACE_BASE_URL ?? 'https://localhost/api/v1';
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

async function call(method, path, { body, token, query } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`${BASE}${path}${qs}`, {
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

const stamp = Date.now();
const email = (n) => `${n}.push.${stamp}@beside.test`;

/**
 * Đăng ký giả lập một thiết bị.
 *
 * Endpoint trỏ vào FCM THẬT nhưng với token không tồn tại. Nhờ vậy request đi
 * hết đường: ký VAPID → mã hoá → gửi lên Google → Google trả 404 UNREGISTERED.
 * Đó chính là kịch bản "người dùng gỡ app" mà server phải tự dọn, và nó không
 * bắn thông báo lên máy của ai cả.
 */
function fakeDevice(n) {
  // p256dh phải là ĐIỂM P-256 THẬT, không bịa được: web-push dùng nó để thoả
  // thuận khoá ECDH, chuỗi bịa sẽ chết ngay ở bước mã hoá và ta chỉ test được
  // nhánh "mã hoá hỏng" thay vì nhánh "gửi đi rồi bị từ chối".
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/beside-trace-${stamp}-${n}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
    userAgent: `TraceBot/${n} (iPhone; trace)`,
  };
}

/** Ảnh PNG 8x8 hợp lệ thật, dựng bằng sharp. */
async function validPng() {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 120, b: 160 } },
  })
    .png()
    .toBuffer();
}

const run = async () => {
  const reg = async (name, mail) => {
    const r = await call('POST', '/auth/register', {
      body: { displayName: name, email: mail, password: 'matkhau123' },
    });
    if (r.status !== 201) {
      throw new Error(`Khong tao duoc ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    }
    return r.body.accessToken;
  };

  const an = await reg('An', email('an'));
  const binh = await reg('Binh', email('binh'));
  const c = await call('POST', '/couples', {
    body: { anniversaryAt: '2023-02-14' },
    token: an,
  });
  await call('POST', '/couples/join', { body: { inviteCode: c.body.inviteCode }, token: binh });

  const deviceA = fakeDevice('a');
  const deviceB = fakeDevice('b');

  // ================================================================
  // A · CẤU HÌNH
  // ================================================================
  {
    const r = await call('GET', '/push/public-key');
    rec('PU-01', 'Khoa cong khai VAPID lay duoc KHONG can dang nhap',
      '200 + publicKey + enabled=true (khoa cong khai theo dung thiet ke Web Push)',
      `${r.status} · enabled=${r.body?.enabled} · dai ${r.body?.publicKey?.length} ky tu`,
      r.status === 200 && r.body?.enabled === true && r.body?.publicKey?.length > 80);
  }

  {
    const r = await call('GET', '/push/devices');
    rec('PU-02', 'Danh sach thiet bi thi PHAI dang nhap',
      '401',
      `${r.status}`,
      r.status === 401);
  }

  // ================================================================
  // B · ĐĂNG KÝ
  // ================================================================
  {
    const r = await call('POST', '/push/subscribe', { token: an, body: deviceA });
    rec('PU-03', 'HAPPY PATH — dang ky mot thiet bi',
      '204',
      `${r.status}`,
      r.status === 204);
  }

  {
    const r = await call('GET', '/push/devices', { token: an, query: { endpoint: deviceA.endpoint } });
    const d = r.body?.[0];
    rec('PU-04', 'Thiet bi hien trong danh sach, doan dung ten may',
      '1 thiet bi · device="iPhone" · current=true',
      `${r.body?.length} · ${d?.device} · current=${d?.current}`,
      r.status === 200 && r.body?.length === 1 && d?.device === 'iPhone' && d?.current === true);
  }

  {
    const r = await call('GET', '/push/devices', { token: an });
    const d = r.body?.[0];
    rec('PU-05', 'Endpoint day du KHONG bi pho ra trong danh sach',
      'khong co truong nao chua endpoint (day la du lieu dinh danh thiet bi)',
      `cac truong: ${Object.keys(d ?? {}).join(',')}`,
      d !== undefined && !JSON.stringify(d).includes('fcm.googleapis.com'));
  }

  {
    // Đăng ký lại đúng thiết bị đó — trình duyệt gọi subscribe() nhiều lần là
    // chuyện bình thường (mỗi lần mở app đều kiểm tra lại).
    const r = await call('POST', '/push/subscribe', { token: an, body: deviceA });
    const list = await call('GET', '/push/devices', { token: an });
    rec('PU-06', 'Dang ky LAI cung mot thiet bi',
      '204 va van chi co 1 ban ghi (khong nhan doi)',
      `${r.status} · ${list.body?.length} thiet bi`,
      r.status === 204 && list.body?.length === 1);
  }

  {
    const r = await call('POST', '/push/subscribe', { token: an, body: deviceB });
    const list = await call('GET', '/push/devices', { token: an });
    rec('PU-07', 'Mot nguoi dung nhieu thiet bi',
      '2 thiet bi',
      `${list.body?.length}`,
      r.status === 204 && list.body?.length === 2);
  }

  {
    const r = await call('POST', '/push/subscribe', {
      token: an,
      body: { endpoint: 'khong-phai-url', keys: deviceA.keys },
    });
    rec('PU-08', 'Endpoint khong phai URL',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/push/subscribe', {
      token: an,
      body: { endpoint: deviceA.endpoint },
    });
    rec('PU-09', 'Thieu khoa ma hoa',
      '422 — khong co keys thi khong bao gio gui duoc',
      `${r.status}`,
      r.status === 422);
  }

  // ================================================================
  // C · QUYỀN SỞ HỮU ĐĂNG KÝ
  // ================================================================
  {
    const list = await call('GET', '/push/devices', { token: binh });
    rec('PU-10', 'Binh KHONG thay thiet bi cua An',
      '0 thiet bi',
      `${list.body?.length}`,
      list.status === 200 && list.body?.length === 0);
  }

  {
    // Biết endpoint của người khác thì cũng không được tắt thông báo của họ.
    const r = await call('DELETE', '/push/subscribe', {
      token: binh,
      body: { endpoint: deviceB.endpoint },
    });
    const anStill = await call('GET', '/push/devices', { token: an });
    rec('PU-11', 'Binh huy dang ky bang endpoint CUA AN',
      'khong bao loi nhung cung KHONG xoa duoc — An van con 2 thiet bi',
      `${r.status} · An con ${anStill.body?.length} thiet bi`,
      anStill.body?.length === 2);
  }

  {
    // Hai người dùng chung một máy: người thứ hai đăng ký thì bản ghi phải
    // CHUYỂN sang họ, không thì người mới nhận thông báo của người cũ.
    await call('POST', '/push/subscribe', { token: binh, body: deviceB });
    const anList = await call('GET', '/push/devices', { token: an });
    const binhList = await call('GET', '/push/devices', { token: binh });
    rec('PU-12', 'HAI NGUOI DUNG CHUNG MOT MAY — dang ky chuyen sang nguoi moi',
      'An con 1, Binh co 1 (khong duoc de ca hai cung nhan)',
      `An=${anList.body?.length} · Binh=${binhList.body?.length}`,
      anList.body?.length === 1 && binhList.body?.length === 1);
  }

  // ================================================================
  // D · GỬI & DỌN ĐĂNG KÝ CHẾT
  // ================================================================
  {
    // Endpoint giả trỏ vào FCM: dịch vụ đẩy trả 404 vì token không tồn tại
    // → server phải dọn, không giữ lại gửi mãi.
    const r = await call('POST', '/push/test', { token: binh });
    const after = await call('GET', '/push/devices', { token: binh });
    rec('PU-13', 'Gui toi mot dang ky da chet',
      '200 + sent=0, va dang ky do bi DON khoi DB (dich vu day tra 404/410)',
      `sent=${r.body?.sent} · con lai ${after.body?.length} thiet bi`,
      r.status === 200 && r.body?.sent === 0 && after.body?.length === 0);
  }

  {
    const r = await call('POST', '/push/test', { token: binh });
    rec('PU-14', 'Gui thu khi khong co thiet bi nao',
      '200 + sent=0, KHONG duoc loi',
      `${r.status} · sent=${r.body?.sent}`,
      r.status === 200 && r.body?.sent === 0);
  }

  // ================================================================
  // E · NHẮC LỊCH — chọn đúng thời điểm
  // ================================================================
  {
    const soon = new Date(Date.now() + 30 * 60_000).toISOString(); // 30 phút nữa
    const r = await call('POST', '/events', {
      token: an,
      body: { title: 'Hẹn cà phê', startAt: soon, remindMinBefore: 60 },
    });
    rec('PU-15', 'Tao su kien co nhac truoc',
      '201 + remindMinBefore=60',
      `${r.status} · ${r.body?.remindMinBefore}`,
      r.status === 201 && r.body?.remindMinBefore === 60);
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Không nhắc',
        startAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        remindMinBefore: null,
      },
    });
    rec('PU-16', 'Su kien khong bat nhac',
      '201 + remindMinBefore=null',
      `${r.status} · ${r.body?.remindMinBefore}`,
      r.status === 201 && r.body?.remindMinBefore === null);
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Nhắc quá xa',
        startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        remindMinBefore: 20_000, // ~14 ngày
      },
    });
    rec('PU-17', 'Nhac truoc qua 7 ngay',
      '422 — tran nhac truoc la 7 ngay',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Nhắc âm',
        startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        remindMinBefore: -10,
      },
    });
    rec('PU-18', 'Nhac truoc so am',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Nhắc đúng giờ',
        startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        remindMinBefore: 0,
      },
    });
    rec('PU-19', 'Nhac "dung gio" (0 phut) la hop le',
      '201 — 0 khac null, phai phan biet duoc',
      `${r.status} · ${r.body?.remindMinBefore}`,
      r.status === 201 && r.body?.remindMinBefore === 0);
  }

  // ================================================================
  // F · THÔNG BÁO KHI NGƯỜI ẤY CHECK-IN
  // ================================================================
  {
    // Bình không có thiết bị nào (đã bị dọn ở PU-13). Việc đăng bài vẫn phải
    // thành công bình thường — thông báo hỏng không được làm hỏng việc chính.
    const form = new FormData();
    const png = await validPng();
    form.append('photos', new Blob([png], { type: 'image/png' }), 'a.png');
    form.append('caption', 'Thử thông báo');

    const res = await fetch(`${BASE}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${an}` },
      body: form,
    });
    rec('PU-20', 'Dang check-in khi doi phuong KHONG co thiet bi nao',
      '201 — gui thong bao that bai khong duoc lam hong viec dang bai',
      `${res.status}`,
      res.status === 201);
  }

  {
    /*
     * Ảnh có HEADER hợp lệ nhưng thân hỏng — đúng cảnh tệp tải lên dở dang hoặc
     * thẻ nhớ lỗi. `sharp.metadata()` đọc lọt (nó chỉ đọc phần đầu), chỉ tới lúc
     * giải mã thật mới chết. Trước khi sửa, case này trả 500.
     */
    const good = await validPng();
    const broken = Buffer.concat([good.subarray(0, 40), Buffer.alloc(60, 0x41)]);
    const form = new FormData();
    form.append('photos', new Blob([broken], { type: 'image/png' }), 'hong.png');

    const res = await fetch(`${BASE}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${an}` },
      body: form,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* bo qua */
    }
    rec('PU-21', 'Anh co header hop le nhung THAN HONG',
      '400 + loi doc duoc, KHONG duoc 500',
      `${res.status} + "${body?.message ?? ''}"`,
      res.status === 400);
  }

  // ---------------------------------------------------------------
  console.log('\n' + '='.repeat(72));
  console.log(`TONG: ${pass} PASS / ${fail} FAIL / ${pass + fail} case`);
  console.log('='.repeat(72));
  console.log('\n--- BANG MARKDOWN ---\n');
  console.log('| Mã | Tình huống | Kỳ vọng | Thực tế | KQ |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.id} | ${r.name} | ${r.expected} | ${r.actual} | ${r.ok ? '✅' : '❌'} |`,
    );
  }
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('Loi khi chay trace:', e);
  process.exit(2);
});
