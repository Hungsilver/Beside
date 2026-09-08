/**
 * Trace — Hồ sơ cá nhân đầy đủ: ảnh đại diện, lời giới thiệu, địa chỉ.
 *
 *   node apps/api/test/trace-profile-avatar.mjs
 *
 * Chạy thật vào API + MinIO. Ảnh test sinh tại chỗ bằng sharp, có nhúng EXIF
 * GPS thật để kiểm rằng ảnh đại diện cũng bị xoá metadata như ảnh check-in —
 * đây là đường ống mới nên không được tin là "chắc cũng giống".
 */
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';

const BASE = process.env.TRACE_BASE_URL ?? 'https://localhost/api/v1';
const ORIGIN = new URL(BASE).origin;
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

async function call(method, path, { body, token, form } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 204 hoặc thân không phải JSON */
  }
  return { status: res.status, body: json };
}

/** Tải một ảnh (nhị phân) theo đường dẫn tương đối mà API trả về. */
async function fetchBinary(path, token) {
  const res = await fetch(`${ORIGIN}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  return { status: res.status, buf, headers: res.headers };
}

/** Ảnh JPEG vuông có nhúng toạ độ GPS trong EXIF. */
async function makeAvatar({ size = 900, r = 240, g = 90, b = 140 } = {}) {
  return sharp({ create: { width: size, height: size, channels: 3, background: { r, g, b } } })
    .withMetadata({
      exif: {
        IFD0: { Make: 'BesideTestCam', Model: 'SecretPhone9' },
        GPS: {
          GPSLatitude: '10/1 46/1 3684/100',
          GPSLatitudeRef: 'N',
          GPSLongitude: '106/1 42/1 316/100',
          GPSLongitudeRef: 'E',
        },
      },
    })
    .jpeg()
    .toBuffer();
}

function formWith(buf, filename = 'avatar.jpg', type = 'image/jpeg', field = 'avatar') {
  const form = new FormData();
  form.append(field, new Blob([buf], { type }), filename);
  return form;
}

const run = async () => {
  const reg = async (name, mail) => {
    const r = await call('POST', '/auth/register', {
      body: { displayName: name, email: mail, password: 'matkhau123' },
    });
    if (r.status !== 201) {
      throw new Error(`Khong tao duoc ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    }
    return { token: r.body.accessToken, id: r.body.user.id };
  };

  const an = await reg('An', email('an'));
  const binh = await reg('Binh', email('binh'));
  const cuong = await reg('Cuong', email('cuong')); // người ngoài, không cùng couple

  const c = await call('POST', '/couples', {
    body: { anniversaryAt: '2023-02-14' },
    token: an.token,
  });
  await call('POST', '/couples/join', {
    body: { inviteCode: c.body.inviteCode },
    token: binh.token,
  });

  // ------------------------------------------------- PA-01 chưa có ảnh
  {
    const me = await call('GET', '/me', { token: an.token });
    rec('PA-01', 'Chua dat anh thi avatarUrl la null',
      'null',
      String(me.body.avatarUrl),
      me.body.avatarUrl === null);
  }

  // ------------------------------------------------- PA-02..06 tải ảnh lên
  let currentUrl = null;
  {
    const buf = await makeAvatar();

    // Tự kiểm ảnh test trước: nếu nó KHÔNG mang GPS thì phép kiểm xoá EXIF bên
    // dưới chỉ là xanh giả — đúng cái bẫy đã dính ở trace Phase 3.
    const srcMeta = await sharp(buf).metadata();
    rec('PA-02', 'Anh test that su co EXIF GPS truoc khi gui',
      'exif co du lieu',
      srcMeta.exif ? `exif ${srcMeta.exif.length} byte` : 'khong co exif',
      Boolean(srcMeta.exif));

    const up = await call('POST', '/me/avatar', { form: formWith(buf), token: an.token });
    rec('PA-03', 'Tai anh dai dien len thanh cong',
      '200/201 va avatarUrl khac null',
      `${up.status} · ${up.body?.avatarUrl}`,
      (up.status === 200 || up.status === 201) && Boolean(up.body?.avatarUrl));

    currentUrl = up.body?.avatarUrl ?? null;
    rec('PA-04', 'avatarUrl mang tham so phien ban ?v=',
      'duong dan tuong doi co ?v=<uuid>',
      String(currentUrl),
      typeof currentUrl === 'string' &&
        currentUrl.startsWith('/api/v1/users/') &&
        currentUrl.includes('?v='));

    const got = await fetchBinary(currentUrl, an.token);
    const meta = got.buf ? await sharp(got.buf).metadata() : null;
    rec('PA-05', 'Anh tra ve la WebP va da bi xoa sach EXIF',
      'format=webp, khong con exif',
      meta ? `format=${meta.format}, exif=${meta.exif ? 'CON' : 'khong'}` : `HTTP ${got.status}`,
      meta?.format === 'webp' && !meta.exif);

    rec('PA-06', 'Canh dai nhat da thu ve toi da 512px',
      '<= 512',
      meta ? `${meta.width}x${meta.height}` : 'khong doc duoc',
      Boolean(meta && Math.max(meta.width, meta.height) <= 512));
  }

  // ------------------------------------------------- PA-07..09 quyền xem
  {
    const partner = await fetchBinary(currentUrl, binh.token);
    rec('PA-07', 'Nguoi ay xem duoc anh dai dien cua minh',
      '200',
      String(partner.status),
      partner.status === 200);

    const outsider = await fetchBinary(currentUrl, cuong.token);
    rec('PA-08', 'Nguoi ngoai couple KHONG xem duoc',
      '404',
      String(outsider.status),
      outsider.status === 404);

    const anon = await fetchBinary(currentUrl, null);
    rec('PA-09', 'Khong dang nhap thi khong xem duoc',
      '401',
      String(anon.status),
      anon.status === 401);
  }

  // ------------------------------------------------- PA-10..11 đổi ảnh
  {
    const previousUrl = currentUrl;
    const buf2 = await makeAvatar({ r: 40, g: 200, b: 120 });
    const up2 = await call('POST', '/me/avatar', { form: formWith(buf2), token: an.token });
    currentUrl = up2.body?.avatarUrl ?? null;

    rec('PA-10', 'Doi anh sinh URL MOI (cache khong giu duoc anh cu)',
      'khac URL lan truoc',
      `${previousUrl} -> ${currentUrl}`,
      Boolean(currentUrl) && currentUrl !== previousUrl);

    // URL cũ mang `?v=<avatarId cũ>`. Phải 404 chứ không được lặng lẽ phục vụ
    // ảnh mới: header của route này là `immutable`, đã hứa nội dung không đổi.
    const oldOne = await fetchBinary(previousUrl, an.token);
    rec('PA-11', 'URL anh CU khong con phuc vu duoc nua',
      '404',
      String(oldOne.status),
      oldOne.status === 404);
  }

  // ------------------------------------------------- PA-12..14 case lỗi
  {
    const notImage = Buffer.from('day khong phai anh, chi la van ban thuan tuy');
    const bad = await call('POST', '/me/avatar', {
      form: formWith(notImage, 'avatar.jpg', 'image/jpeg'),
      token: an.token,
    });
    rec('PA-12', 'Tep khong phai anh (doi duoi thanh .jpg) bi tu choi',
      '400',
      String(bad.status),
      bad.status === 400);

    const empty = await call('POST', '/me/avatar', { token: an.token, form: new FormData() });
    rec('PA-13', 'Khong chon anh nao thi bao loi ro rang',
      '400',
      String(empty.status),
      empty.status === 400);

    // Header hợp lệ nhưng thân bị cắt cụt — sharp chỉ chết lúc GIẢI MÃ thật,
    // ngoài mọi try/catch dựa trên metadata(). Đây là lỗi L24 của Phase 3.
    const full = await makeAvatar();
    const truncated = full.subarray(0, Math.floor(full.length / 3));
    const broken = await call('POST', '/me/avatar', {
      form: formWith(truncated),
      token: an.token,
    });
    rec('PA-14', 'Anh hong giua chung tra 400, KHONG phai 500',
      '400',
      String(broken.status),
      broken.status === 400);
  }

  // ------------------------------------------------- PA-15..18 bio & địa chỉ
  {
    const saved = await call('PATCH', '/me', {
      body: { bio: '  Thich ca phe sang  ', address: '  So 1 Dai Co Viet, Ha Noi  ' },
      token: an.token,
    });
    rec('PA-15', 'Luu bio + dia chi, cat khoang trang thua',
      'bio va address da duoc cat gon',
      `bio=${JSON.stringify(saved.body?.bio)} address=${JSON.stringify(saved.body?.address)}`,
      saved.body?.bio === 'Thich ca phe sang' &&
        saved.body?.address === 'So 1 Dai Co Viet, Ha Noi');

    const partial = await call('PATCH', '/me', {
      body: { displayName: 'An Nguyen' },
      token: an.token,
    });
    rec('PA-16', 'Cap nhat truong khac KHONG lam mat bio/dia chi',
      'bio va address giu nguyen',
      `bio=${JSON.stringify(partial.body?.bio)} address=${JSON.stringify(partial.body?.address)}`,
      partial.body?.bio === 'Thich ca phe sang' &&
        partial.body?.address === 'So 1 Dai Co Viet, Ha Noi');

    const cleared = await call('PATCH', '/me', { body: { bio: '   ' }, token: an.token });
    rec('PA-17', 'Gui chuoi toan khoang trang = XOA bio, khong dung toi dia chi',
      'bio = null, address con nguyen',
      `bio=${JSON.stringify(cleared.body?.bio)} address=${JSON.stringify(cleared.body?.address)}`,
      cleared.body?.bio === null && cleared.body?.address === 'So 1 Dai Co Viet, Ha Noi');

    const tooLong = await call('PATCH', '/me', {
      body: { bio: 'a'.repeat(200) },
      token: an.token,
    });
    // 422 là quy ước của dự án cho lỗi validate (xem trace Phase 1), không phải 400.
    rec('PA-18', 'Bio dai qua tran bi tu choi',
      '422 + VALIDATION_FAILED',
      `${tooLong.status} + ${tooLong.body?.code}`,
      tooLong.status === 422 && tooLong.body?.code === 'VALIDATION_FAILED');
  }

  // ------------------------------------------------- PA-19 người ấy nhìn thấy
  {
    const couple = await call('GET', '/couples/me', { token: binh.token });
    const partner = couple.body?.partner;
    rec('PA-19', 'Nguoi ay doc duoc avatarUrl va dia chi cua minh',
      'partner co avatarUrl va address',
      `avatarUrl=${partner?.avatarUrl} address=${JSON.stringify(partner?.address)}`,
      Boolean(partner?.avatarUrl) && partner?.address === 'So 1 Dai Co Viet, Ha Noi');
  }

  // ------------------------------------------------- PA-20..22 gỡ ảnh
  {
    const removed = await call('DELETE', '/me/avatar', { token: an.token });
    rec('PA-20', 'Go anh dai dien thi avatarUrl ve null',
      'null',
      String(removed.body?.avatarUrl),
      (removed.body?.avatarUrl ?? null) === null);

    const gone = await fetchBinary(currentUrl, an.token);
    rec('PA-21', 'Anh vua go khong con tai duoc nua',
      '404',
      String(gone.status),
      gone.status === 404);

    const again = await call('DELETE', '/me/avatar', { token: an.token });
    rec('PA-22', 'Go lan hai khong loi (thao tac lap lai an toan)',
      '200/204 va avatarUrl null',
      `${again.status} · ${again.body?.avatarUrl}`,
      (again.status === 200 || again.status === 204) &&
        (again.body?.avatarUrl ?? null) === null);
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
