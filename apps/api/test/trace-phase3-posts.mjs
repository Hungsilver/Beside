/**
 * Trace Phase 3 — Check-in bằng ảnh & dòng kỷ niệm.
 *
 *   npm run trace:phase3
 *
 * Chạy thật vào API + MinIO. Ảnh test được sinh tại chỗ bằng sharp, có nhúng
 * EXIF thật (toạ độ GPS + thẻ xoay) để kiểm đúng hai thứ dễ sai nhất:
 * xoá metadata và xoay ảnh.
 */
import sharp from 'sharp';

const BASE = process.env.TRACE_BASE_URL ?? 'https://localhost/api/v1';
/** Gốc để ghép với đường dẫn ảnh tương đối mà API trả về. */
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
    /* 204 */
  }
  return { status: res.status, body: json };
}

// ---------------------------------------------------------------- ảnh test

/** Ảnh JPEG có nhúng EXIF: toạ độ GPS + thẻ xoay 90°. */
async function makePhotoWithExif({ width = 1200, height = 800, orientation = 6 } = {}) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 120, b: 160 },
    },
  })
    // PHẢI dùng `orientation` của withMetadata, không nhét Orientation vào
    // IFD0 qua withExifMerge — cách đó sharp ghi nhưng đọc lại vẫn ra 1,
    // nên ảnh test hoá ra không hề có thẻ xoay và phép kiểm trở nên vô nghĩa.
    .withMetadata({
      orientation,
      exif: {
        IFD0: { Make: 'BesideTestCam', Model: 'SecretPhone9' },
        // Toạ độ thật của Nhà An trong bộ dữ liệu giả định
        GPS: {
          GPSLatitude: '10/1 46/1 3684/100',
          GPSLatitudeRef: 'N',
          GPSLongitude: '106/1 42/1 323/100',
          GPSLongitudeRef: 'E',
        },
      },
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function makePlainPhoto(w, h) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 90, g: 160, b: 255 } },
  })
    .jpeg()
    .toBuffer();
}

function formWith(files, fields = {}) {
  const fd = new FormData();
  for (const [i, buf] of files.entries()) {
    fd.append('photos', new Blob([buf], { type: 'image/jpeg' }), `anh-${i}.jpg`);
  }
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) fd.append(k, String(v));
  }
  return fd;
}

/** Tải ảnh qua API (cần token) rồi đọc lại metadata. */
async function fetchImageMeta(path, token) {
  const res = await fetch(`${ORIGIN}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return { status: res.status, meta: null, headers: res.headers };
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    meta: await sharp(buf).metadata(),
    bytes: buf.length,
    headers: res.headers,
  };
}

const stamp = Date.now();
const email = (n) => `${n}.p3.${stamp}@beside.test`;

const run = async () => {
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

  let firstPostId = null;

  {
    // Tự kiểm ảnh test trước: nếu ảnh không thật sự mang thẻ xoay và toạ độ GPS
    // thì hai phép kiểm quan trọng nhất bên dưới chỉ là xanh giả.
    const probe = await makePhotoWithExif();
    const m = await sharp(probe).metadata();
    rec('P3-00', 'Anh test that su co the xoay 90 va EXIF GPS',
      'orientation=6 va co truong exif',
      `orientation=${m.orientation} · co exif=${Boolean(m.exif)} · ${m.width}x${m.height}`,
      m.orientation === 6 && Boolean(m.exif));
  }

  // ================================================================
  // A · HAPPY PATH + XỬ LÝ ẢNH
  // ================================================================
  {
    const photo = await makePhotoWithExif();
    const r = await call('POST', '/posts', {
      token: an,
      form: formWith([photo], {
        caption: '  Hoàng hôn Thủ Thiêm đẹp quá  ',
        mood: '🥰',
      }),
    });
    firstPostId = r.body?.id;
    rec('P3-01', 'HAPPY PATH — dang mot khoanh khac co anh',
      '201 + 1 anh + caption da cat khoang trang + mood',
      `${r.status} · anh=${r.body?.photos?.length} · caption="${r.body?.caption}" · mood=${r.body?.mood}`,
      r.status === 201 && r.body?.photos?.length === 1 &&
      r.body?.caption === 'Hoàng hôn Thủ Thiêm đẹp quá' && r.body?.mood === '🥰');
  }

  {
    const feed = await call('GET', '/posts', { token: binh });
    const p = feed.body?.items?.[0];
    const ph = p?.photos?.[0];
    rec('P3-02', 'Doi phuong thay duoc bai vua dang',
      'co bai, co du 3 link anh + anh dat cho',
      `bai=${feed.body?.items?.length} · thumb=${Boolean(ph?.urlThumb)} md=${Boolean(ph?.urlMd)} orig=${Boolean(ph?.urlOrig)} · placeholder=${ph?.placeholder?.slice(0, 22)}...`,
      feed.body?.items?.length === 1 && Boolean(ph?.urlThumb) && Boolean(ph?.urlMd) &&
      Boolean(ph?.urlOrig) && ph?.placeholder?.startsWith('data:image/webp;base64,'));
  }

  {
    const feed = await call('GET', '/posts', { token: an });
    const ph = feed.body.items[0].photos[0];
    const got = await fetchImageMeta(ph.urlOrig, an);
    rec('P3-03', 'ANH DA XOA SACH EXIF (toa do GPS, model may)',
      'khong con truong exif nao trong anh tra ve',
      `format=${got.meta?.format} · co exif=${Boolean(got.meta?.exif)} · co gps=${Boolean(got.meta?.exif)}`,
      got.status === 200 && !got.meta?.exif);
  }

  {
    const feed = await call('GET', '/posts', { token: an });
    const ph = feed.body.items[0].photos[0];
    const got = await fetchImageMeta(ph.urlOrig, an);
    // Anh goc 1200x800 co the xoay 90 (orientation=6) -> phai thanh 800x1200
    rec('P3-04', 'ANH DA DUOC XOAY theo the EXIF truoc khi xoa metadata',
      'anh 1200x800 co the xoay 90 phai tra ve 800x1200',
      `${got.meta?.width}x${got.meta?.height} · kich thuoc trong DB ${ph.width}x${ph.height}`,
      got.meta?.width === 800 && got.meta?.height === 1200 &&
      ph.width === 800 && ph.height === 1200);
  }

  {
    const feed = await call('GET', '/posts', { token: an });
    const ph = feed.body.items[0].photos[0];
    const [thumb, md] = await Promise.all([
      fetchImageMeta(ph.urlThumb, an),
      fetchImageMeta(ph.urlMd, an),
    ]);
    rec('P3-05', 'Ba muc kich thuoc deu la WebP va nho dan',
      'thumb <= 320px, md <= 1080px, thumb nhe hon md',
      `thumb ${thumb.meta?.width}x${thumb.meta?.height} (${thumb.bytes}B, ${thumb.meta?.format}) · md ${md.meta?.width}x${md.meta?.height} (${md.bytes}B)`,
      thumb.meta?.format === 'webp' && md.meta?.format === 'webp' &&
      Math.max(thumb.meta.width, thumb.meta.height) <= 320 &&
      Math.max(md.meta.width, md.meta.height) <= 1080 &&
      thumb.bytes < md.bytes);
  }

  {
    // Anh nho hon muc dich thi KHONG duoc phong to cho vo hat
    const small = await makePlainPhoto(200, 150);
    const r = await call('POST', '/posts', { token: an, form: formWith([small]) });
    const got = await fetchImageMeta(r.body.photos[0].urlOrig, an);
    rec('P3-06', 'Anh 200x150 nho hon muc dich -> giu nguyen, khong phong to',
      '200x150', `${got.meta?.width}x${got.meta?.height}`,
      got.meta?.width === 200 && got.meta?.height === 150);
    await call('DELETE', `/posts/${r.body.id}`, { token: an });
  }

  // ================================================================
  // B · BẢO MẬT LINK ẢNH
  // ================================================================
  {
    const feed = await call('GET', '/posts', { token: an });
    const url = feed.body.items[0].photos[0].urlOrig;
    const got = await fetchImageMeta(url, null);
    rec('P3-07', 'Xem anh KHONG kem token dang nhap',
      '401 — anh khong phai "ai co link thi xem duoc"',
      `status ${got.status}`, got.status === 401);
  }

  {
    const feed = await call('GET', '/posts', { token: an });
    const url = feed.body.items[0].photos[0].urlOrig;
    const got = await fetchImageMeta(url, an);
    const cache = got.headers?.get('cache-control') ?? '';
    rec('P3-08', 'Anh duoc cache vinh vien va rieng tu',
      'Cache-Control co private va immutable',
      cache,
      /private/.test(cache) && /immutable/.test(cache));
  }

  // ================================================================
  // C · KIỂM TRA ĐẦU VÀO
  // ================================================================
  {
    const r = await call('POST', '/posts', { token: an, form: formWith([], { caption: 'khong anh' }) });
    rec('P3-09', 'Dang bai khong co anh nao', '400/422',
      `${r.status} + ${r.body?.code}`, r.status === 400 || r.status === 422);
  }
  {
    const photos = await Promise.all([1, 2, 3, 4].map(() => makePlainPhoto(400, 300)));
    const r = await call('POST', '/posts', { token: an, form: formWith(photos) });
    rec('P3-10', 'Dang 4 anh (tran la 3)', 'bi tu choi',
      `${r.status}`, r.status >= 400);
  }
  {
    const notImage = Buffer.from('day khong phai anh, chi la van ban thuan tuy'.repeat(20));
    const fd = new FormData();
    fd.append('photos', new Blob([notImage], { type: 'image/jpeg' }), 'gia-mao.jpg');
    const r = await call('POST', '/posts', { token: an, form: fd });
    rec('P3-11', 'Tep van ban doi duoi thanh .jpg',
      '400/422 — server doc noi dung that, khong tin mimetype',
      `${r.status} + "${r.body?.message}"`,
      (r.status === 400 || r.status === 422) && /ảnh/i.test(r.body?.message ?? ''));
  }
  {
    const r = await call('POST', '/posts', {
      token: an,
      form: formWith([await makePlainPhoto(300, 300)], { caption: 'x'.repeat(600) }),
    });
    rec('P3-12', 'Loi nhan dai hon 500 ky tu', '422',
      `${r.status}`, r.status === 422);
  }
  {
    const r = await call('POST', '/posts', {
      token: an,
      form: formWith([await makePlainPhoto(300, 300)], { mood: '💩' }),
    });
    rec('P3-13', 'Emoji tam trang ngoai danh sach', '422',
      `${r.status}`, r.status === 422);
  }

  // ================================================================
  // D · GHIM LÊN BẢN ĐỒ + QUYỀN RIÊNG TƯ
  // ================================================================
  {
    const r = await call('POST', '/posts', {
      token: an,
      form: formWith([await makePlainPhoto(600, 400)], {
        caption: 'Bun bo Ba Tam',
        lat: 10.7769,
        lng: 106.7009,
        placeName: 'Quan 1',
      }),
    });
    rec('P3-14', 'Check-in co ghim toa do',
      '201 + luu dung lat/lng/placeName',
      `${r.status} · ${r.body?.lat},${r.body?.lng} · ${r.body?.placeName}`,
      r.status === 201 && r.body?.lat === 10.7769 && r.body?.placeName === 'Quan 1');
  }

  {
    const r = await call('GET', '/posts?pinned=true', { token: binh });
    rec('P3-15', 'Loc chi lay bai co ghim toa do',
      'chi tra ve bai co lat/lng',
      `${r.body?.items?.length} bai, tat ca deu co toa do: ${r.body?.items?.every((p) => p.lat !== null)}`,
      r.body?.items?.length >= 1 && r.body.items.every((p) => p.lat !== null));
  }

  {
    // An bat che do an danh roi check-in co ghim -> KHONG duoc luu toa do
    await call('PATCH', '/me/privacy', { body: { ghostMode: true }, token: an });
    const r = await call('POST', '/posts', {
      token: an,
      form: formWith([await makePlainPhoto(500, 500)], {
        caption: 'An danh',
        lat: 10.9,
        lng: 106.9,
      }),
    });
    rec('P3-16', 'AN DANH: check-in van dang duoc nhung KHONG ghim toa do',
      'bai duoc tao, lat/lng = null',
      `${r.status} · lat=${r.body?.lat} lng=${r.body?.lng}`,
      r.status === 201 && r.body?.lat === null && r.body?.lng === null);
    await call('DELETE', `/posts/${r.body.id}`, { token: an });
    await call('PATCH', '/me/privacy', { body: { ghostMode: false }, token: an });
  }

  // ================================================================
  // E · THẢ CẢM XÚC
  // ================================================================
  {
    const r = await call('POST', `/posts/${firstPostId}/reactions`, {
      body: { emoji: '❤️' },
      token: binh,
    });
    rec('P3-17', 'Binh tha tim len bai cua An', '200 + 1 cam xuc',
      `${r.status} · ${JSON.stringify(r.body?.reactions)}`,
      r.status === 200 && r.body?.reactions?.length === 1 && r.body.reactions[0].emoji === '❤️');
  }
  {
    const r = await call('POST', `/posts/${firstPostId}/reactions`, {
      body: { emoji: '🔥' },
      token: binh,
    });
    rec('P3-18', 'Doi sang emoji khac -> moi nguoi chi giu MOT cam xuc',
      'van 1 cam xuc, doi thanh 🔥',
      `${r.body?.reactions?.length} cam xuc: ${r.body?.reactions?.[0]?.emoji}`,
      r.body?.reactions?.length === 1 && r.body.reactions[0].emoji === '🔥');
  }
  {
    const r = await call('POST', `/posts/${firstPostId}/reactions`, {
      body: { emoji: '🔥' },
      token: binh,
    });
    rec('P3-19', 'Bam lai dung emoji dang chon -> bo tha cam xuc',
      '0 cam xuc', `${r.body?.reactions?.length}`,
      r.body?.reactions?.length === 0);
  }
  {
    const r = await call('POST', `/posts/${firstPostId}/reactions`, {
      body: { emoji: '💀' },
      token: binh,
    });
    rec('P3-20', 'Emoji ngoai danh sach cho phep', '422', `${r.status}`, r.status === 422);
  }

  // ================================================================
  // F · QUYỀN XOÁ
  // ================================================================
  {
    const r = await call('DELETE', `/posts/${firstPostId}`, { token: binh });
    rec('P3-21', 'Binh xoa bai cua An', '403 — chi nguoi dang moi xoa duoc',
      `${r.status} + ${r.body?.code}`, r.status === 403);
  }
  {
    const feed = await call('GET', '/posts', { token: an });
    const mine = feed.body.items.find((p) => p.id === firstPostId);
    rec('P3-22', 'Co canDelete de giao dien an nut xoa dung cho',
      'An: true', `An=${mine?.canDelete}`, mine?.canDelete === true);
  }
  {
    const feed = await call('GET', '/posts', { token: binh });
    const notMine = feed.body.items.find((p) => p.id === firstPostId);
    rec('P3-23', 'Voi Binh thi bai cua An co canDelete=false',
      'false', `${notMine?.canDelete}`, notMine?.canDelete === false);
  }
  {
    const r = await call('DELETE', '/posts/11111111-1111-1111-1111-111111111111', { token: an });
    rec('P3-24', 'Xoa bai khong ton tai', '404',
      `${r.status} + ${r.body?.code}`, r.status === 404);
  }

  // ================================================================
  // G · PHÂN TRANG BẰNG CON TRỎ
  // ================================================================
  {
    // Them bai cho du de phan trang
    for (let i = 0; i < 4; i += 1) {
      await call('POST', '/posts', {
        token: i % 2 === 0 ? an : binh,
        form: formWith([await makePlainPhoto(300, 200)], { caption: `bai ${i}` }),
      });
    }

    const p1 = await call('GET', '/posts?limit=3', { token: an });
    const p2 = await call('GET', `/posts?limit=3&cursor=${encodeURIComponent(p1.body.nextCursor)}`, {
      token: an,
    });
    const ids1 = p1.body.items.map((p) => p.id);
    const ids2 = p2.body.items.map((p) => p.id);
    const trung = ids1.filter((id) => ids2.includes(id));

    rec('P3-25', 'Phan trang khong lap bai giua hai trang',
      'khong co bai nao xuat hien o ca hai trang',
      `trang1=${ids1.length} trang2=${ids2.length} trung=${trung.length}`,
      ids1.length === 3 && ids2.length > 0 && trung.length === 0);
  }

  {
    // Dang mot bai MOI giua luc phan trang -> trang sau van khong lap
    const p1 = await call('GET', '/posts?limit=3', { token: an });
    await call('POST', '/posts', {
      token: an,
      form: formWith([await makePlainPhoto(300, 200)], { caption: 'chen giua' }),
    });
    const p2 = await call('GET', `/posts?limit=3&cursor=${encodeURIComponent(p1.body.nextCursor)}`, {
      token: an,
    });
    const trung = p1.body.items.map((p) => p.id).filter((id) => p2.body.items.some((q) => q.id === id));
    rec('P3-26', 'Co bai MOI chen vao giua luc dang cuon -> van khong lap',
      'khong lap (day la ly do dung con tro thay vi offset)',
      `trung=${trung.length}`, trung.length === 0);
  }

  {
    const r = await call('GET', '/posts?cursor=rac-khong-hop-le', { token: an });
    rec('P3-27', 'Con tro hong', '200 va tra ve trang dau, khong phai loi',
      `${r.status} · ${r.body?.items?.length} bai`,
      r.status === 200 && r.body?.items?.length > 0);
  }

  // ================================================================
  // H · CÁCH LY GIỮA CÁC COUPLE
  // ================================================================
  {
    const chi = await reg('Chi', email('chi'));
    const dung = await reg('Dung', email('dung'));
    const c2 = await call('POST', '/couples', { body: { anniversaryAt: '2024-01-01' }, token: chi });
    await call('POST', '/couples/join', { body: { inviteCode: c2.body.inviteCode }, token: dung });

    const feed = await call('GET', '/posts', { token: chi });
    rec('P3-28', 'Cap doi KHAC khong thay bai cua An va Binh',
      '0 bai', `${feed.body?.items?.length} bai`,
      feed.body?.items?.length === 0);

    const steal = await call('DELETE', `/posts/${firstPostId}`, { token: chi });
    rec('P3-29', 'Nguoi ngoai xoa bai cua couple khac',
      '404 — khong duoc lo la id do co that',
      `${steal.status} + ${steal.body?.code}`,
      steal.status === 404);

    const react = await call('POST', `/posts/${firstPostId}/reactions`, {
      body: { emoji: '❤️' },
      token: chi,
    });
    rec('P3-30', 'Nguoi ngoai tha cam xuc len bai cua couple khac',
      '404', `${react.status}`, react.status === 404);

    // Biet dung URL anh cung khong xem duoc — phan quyen o tung luot xem
    const feedAn = await call('GET', '/posts', { token: an });
    const stolenUrl = feedAn.body.items[0].photos[0].urlOrig;
    const peek = await fetchImageMeta(stolenUrl, chi);
    rec('P3-30b', 'Nguoi ngoai BIET DUNG URL anh cua couple khac',
      '404 — moi luot xem anh deu kiem tra quyen',
      `status ${peek.status}`, peek.status === 404);
  }

  // ================================================================
  // I · XOÁ BÀI THÌ XOÁ CẢ ẢNH
  // ================================================================
  {
    const feed = await call('GET', '/posts', { token: an });
    const target = feed.body.items.find((p) => p.canDelete);
    const url = target.photos[0].urlOrig;

    const before = await fetchImageMeta(url, an);
    const del = await call('DELETE', `/posts/${target.id}`, { token: an });
    const after = await fetchImageMeta(url, an);

    rec('P3-31', 'Xoa bai -> tep anh trong kho cung bi xoa',
      'truoc khi xoa 200, sau khi xoa khong con 200',
      `truoc=${before.status} · xoa=${del.status} · sau=${after.status}`,
      before.status === 200 && del.status === 204 && after.status !== 200);

    const feedAfter = await call('GET', '/posts', { token: an });
    rec('P3-32', 'Bai da bien mat khoi dong ky niem',
      'khong con trong danh sach',
      `con ${feedAfter.body.items.filter((p) => p.id === target.id).length} bai trung id`,
      feedAfter.body.items.every((p) => p.id !== target.id));
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
