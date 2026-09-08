/**
 * Tạo 2 tài khoản demo đã ghép đôi, để bấm thử giao diện trên máy dev.
 *
 *   npm run seed:demo
 *
 * ⚠️ CHỈ DÙNG Ở MÁY DEV. Script từ chối chạy nếu địa chỉ không phải localhost —
 * dự án cố tình KHÔNG cắm sẵn dữ liệu cá nhân vào code (xem docs/BACKLOG.md);
 * trên máy chủ thật thì hai người tự đăng ký và tự nhập thông tin trong app.
 *
 * Chạy lại nhiều lần không sao: đã có tài khoản thì chỉ báo lại thông tin.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // chứng chỉ nội bộ của Caddy

const BASE = process.env.SEED_BASE_URL ?? 'https://localhost/api/v1';
const PASSWORD = 'beside2026';

const PEOPLE = [
  { displayName: 'An', email: 'an@beside.vn' },
  // Bình có sẵn số Zalo để thấy nút "Nhắn Zalo" hoạt động;
  // An để trống để thấy lời nhắc "còn thiếu một chút" ở trang chủ.
  { displayName: 'Bình', email: 'binh@beside.vn', zalo: '0912345678' },
];

const ANNIVERSARY = '2023-02-14';

/**
 * Địa điểm mẫu — toạ độ Quận 1 / Quận 3 dùng xuyên suốt dự án.
 * Có chúng thì mở tab Bản đồ ra là thấy hàng rào ngay, không phải tự nhập.
 */
const PLACES = [
  { name: 'Nhà em', emoji: '🏠', lat: 10.7769, lng: 106.7009, radiusM: 150 },
  { name: 'Công ty anh', emoji: '🏢', lat: 10.8231, lng: 106.6297, radiusM: 200 },
];

// ---------------------------------------------------------------- chốt chặn
const host = (() => {
  try {
    return new URL(BASE).hostname;
  } catch {
    return '';
  }
})();
if (!['localhost', '127.0.0.1'].includes(host)) {
  console.error(`Từ chối chạy: "${host}" không phải máy dev.`);
  console.error('Trên máy chủ thật, hai người tự đăng ký trong app.');
  process.exit(1);
}

// ----------------------------------------------------------------
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
    /* 204 hoặc không phải JSON */
  }
  return { status: res.status, body: json };
}

/** Đăng ký; nếu email đã tồn tại thì đăng nhập luôn. */
async function ensureAccount(person) {
  const reg = await call('POST', '/auth/register', {
    body: { displayName: person.displayName, email: person.email, password: PASSWORD },
  });
  if (reg.status === 201) return { token: reg.body.accessToken, created: true };

  if (reg.body?.code === 'EMAIL_TAKEN') {
    const login = await call('POST', '/auth/login', {
      body: { email: person.email, password: PASSWORD },
    });
    if (login.status === 200) return { token: login.body.accessToken, created: false };
    throw new Error(
      `${person.email} đã tồn tại nhưng mật khẩu khác "${PASSWORD}". ` +
        'Xoá tài khoản đó hoặc đăng nhập bằng mật khẩu bạn đã đặt.',
    );
  }

  if (reg.status === 429) {
    throw new Error(
      'Bị chặn vì hạn mức đăng ký (20 lần/giờ/IP). Khởi động lại API để xoá bộ đếm:\n' +
        '  docker compose -f docker-compose.yml -f docker-compose.local.yml restart api',
    );
  }
  throw new Error(`Không tạo được ${person.email}: ${reg.status} ${JSON.stringify(reg.body)}`);
}

/**
 * Đăng một khoảnh khắc có ảnh và có ghim toạ độ.
 *
 * Ảnh được sinh tại chỗ bằng sharp — không nhúng tệp nhị phân vào repo, và
 * cũng đi đúng đường xử lý ảnh thật (xoay, xoá EXIF, ba cỡ WebP).
 */
async function seedPinnedPost(token) {
  const { default: sharp } = await import('sharp');
  const photo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 255, g: 140, b: 175 } },
  })
    .jpeg()
    .toBuffer();

  const form = new FormData();
  form.append('photos', new Blob([photo], { type: 'image/jpeg' }), 'demo.jpg');
  form.append('caption', 'Hoàng hôn ở Thủ Thiêm');
  form.append('mood', '🥰');
  form.append('lat', String(PLACES[0].lat));
  form.append('lng', String(PLACES[0].lng));
  form.append('placeName', 'Quận 1');

  const res = await fetch(`${BASE}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    console.warn(`  (bỏ qua khoảnh khắc mẫu: HTTP ${res.status})`);
  }
}

const run = async () => {
  const health = await call('GET', '/health');
  if (health.status !== 200) {
    throw new Error(`API chưa chạy ở ${BASE}. Chạy trước: npm run docker:up`);
  }

  const [a, b] = await Promise.all(PEOPLE.map(ensureAccount));

  // Ghép đôi nếu chưa
  const existing = await call('GET', '/couples/me', { token: a.token });
  if (existing.status !== 200 || (existing.body?.members?.length ?? 0) < 2) {
    const created = await call('POST', '/couples', {
      body: { anniversaryAt: ANNIVERSARY },
      token: a.token,
    });
    const code =
      created.status === 201 ? created.body.inviteCode : existing.body?.inviteCode;
    if (code) {
      await call('POST', '/couples/join', { body: { inviteCode: code }, token: b.token });
    }
  }

  // Thông tin liên hệ
  for (const [i, person] of PEOPLE.entries()) {
    if (!person.zalo) continue;
    await call('PATCH', '/me', {
      body: { messagingApp: 'ZALO', messagingHandle: person.zalo },
      token: i === 0 ? a.token : b.token,
    });
  }

  // Địa điểm mẫu — bỏ qua nếu đã có, để chạy lại seed không đẻ ra bản trùng.
  const havePlaces = await call('GET', '/places', { token: a.token });
  if ((havePlaces.body?.length ?? 0) === 0) {
    for (const place of PLACES) {
      await call('POST', '/places', { body: place, token: a.token });
    }
  }

  // Một khoảnh khắc có ghim toạ độ, để bản đồ có ghim ảnh mà xem.
  const havePinned = await call('GET', '/posts?pinned=true&limit=1', { token: a.token });
  if ((havePinned.body?.items?.length ?? 0) === 0) {
    await seedPinnedPost(a.token);
  }

  const couple = await call('GET', '/couples/me', { token: a.token });
  const love = await call('GET', '/couples/me/love-summary', { token: a.token });

  console.log('');
  console.log('  Tài khoản demo (chỉ ở máy dev)');
  console.log('  ' + '─'.repeat(46));
  for (const p of PEOPLE) {
    console.log(`  ${p.displayName.padEnd(5)} ${p.email.padEnd(18)} ${PASSWORD}`);
  }
  console.log('  ' + '─'.repeat(46));
  console.log(`  Ghép đôi   : ${couple.body?.members?.map((m) => m.displayName).join(' + ')}`);
  console.log(`  Ngày yêu   : ${couple.body?.anniversaryAt} → ${love.body?.daysTogether} ngày`);
  console.log(`  Mốc kế tiếp: ${love.body?.nextMilestone?.title} (còn ${love.body?.nextMilestone?.daysLeft} ngày)`);
  console.log('');
  const places = await call('GET', '/places', { token: a.token });
  console.log(`  Địa điểm   : ${places.body?.map((p) => p.emoji + ' ' + p.name).join(' · ')}`);
  console.log('');
  console.log('  Mở https://localhost — đăng nhập An ở cửa sổ thường,');
  console.log('  Bình ở cửa sổ ẩn danh, rồi vào tab Bản đồ.');
  console.log('');
};

run().catch((e) => {
  console.error('\n' + e.message + '\n');
  process.exit(1);
});
