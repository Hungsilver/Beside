/**
 * Trace Phase 4 (F6) — Địa điểm & hàng rào ảo.
 *
 *   npm run trace:places
 *
 * Bộ này lái một chuyến đi giả lập: đi từ xa về nhà, ở lại đủ lâu, rồi rời đi.
 * Mỗi bước là một POST /locations thật, đúng như app gửi lên.
 *
 * Ba thứ chống báo sai được kiểm riêng từng cái:
 *   1. sai số GPS quá lớn so với bán kính → bỏ qua điểm
 *   2. khoảng chênh vào/ra → ngồi ngay mép không sinh tràng thông báo
 *   3. phải ở đủ lâu → đi ngang qua nhà không tính là về tới nhà
 */
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

const stamp = Date.now();
const email = (n) => `${n}.f6.${stamp}@beside.test`;

/** Nhà An — toạ độ Quận 1 dùng xuyên suốt dự án. */
const NHA_AN = { lat: 10.7769, lng: 106.7009 };

/**
 * Dịch một toạ độ đi `meters` mét về phía bắc.
 * 1 độ vĩ ≈ 111.320 m, đủ chính xác cho vài trăm mét.
 */
function north(from, meters) {
  return { lat: from.lat + meters / 111_320, lng: from.lng };
}

/**
 * Gửi một điểm vị trí như app thật, và **bảo đảm điểm đó thật sự được nhận**.
 *
 * Hai cái bẫy của bộ trace này, cả hai đều do server cố tình như vậy:
 *
 * 1. **Không tua được thời gian.** Server kẹp mốc `ts` do client gửi về quanh
 *    giờ của chính nó (chống đồng hồ máy lệch — trace Phase 2, TC-73). Muốn
 *    kiểm ngưỡng "ở đủ lâu" thì phải chờ thật.
 *
 * 2. **Hạn mức 2 điểm / 3 giây.** Gửi dồn thì điểm thứ ba bị từ chối ngay ở cửa
 *    và KHÔNG bao giờ tới được phần đối chiếu hàng rào. Lần đầu viết bộ trace
 *    này tôi không chờ, nên có case "xanh" chỉ vì điểm chưa từng được xử lý —
 *    xanh giả còn tệ hơn đỏ. Giờ hàm này chờ và thử lại cho tới khi
 *    `accepted === true`, rồi mới trả về.
 */
async function ping(token, coords, { accuracyM = 15 } = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const r = await call('POST', '/locations', {
      token,
      body: { lat: coords.lat, lng: coords.lng, accuracyM, ts: Date.now() },
    });
    if (r.body?.accepted === true) return r;
    if (r.body?.reason !== 'RATE_LIMITED') return r; // ẩn danh / tắt chia sẻ: trả nguyên
    await new Promise((res) => setTimeout(res, 1600));
  }
  throw new Error('Khong gui duoc diem vi tri: bi han muc chan lien tuc');
}

/** Ngưỡng "ở đủ lâu" là 60 giây; chờ dư 5 giây cho chắc. */
const DWELL_WAIT_MS = 65_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chờ một nhịp cho việc đối chiếu hàng rào chạy xong.
 *
 * Server cố tình KHÔNG chờ geofence trước khi trả lời `POST /locations` — đối
 * chiếu địa điểm là việc phụ, không được làm chậm đường vị trí thời gian thực
 * (xem `LocationsService.ingest`, chỗ `void this.geofence.evaluate`). Nên đọc
 * `/places` ngay lập tức là đọc phải trạng thái cũ. Đây là đặc tính của thiết
 * kế, không phải lỗi — bộ trace phải tự thích nghi.
 */
const settle = () => sleep(500);

/** Ai đang trong hàng rào của địa điểm đầu tiên. */
async function insideFirstPlace(token) {
  const r = await call('GET', '/places', { token });
  return r.body?.[0]?.peopleInside ?? [];
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

  let homeId = null;

  // ================================================================
  // A · CRUD ĐỊA ĐIỂM
  // ================================================================
  {
    const r = await call('POST', '/places', {
      token: an,
      body: { name: '  Nhà em  ', emoji: '🏠', ...NHA_AN },
    });
    homeId = r.body?.id;
    rec('PL-01', 'HAPPY PATH — luu mot dia diem',
      '201 + ten da cat khoang trang + ban kinh mac dinh 150m + bao khi toi noi',
      `${r.status} · "${r.body?.name}" · ${r.body?.radiusM}m · arrive=${r.body?.notifyOnArrive} leave=${r.body?.notifyOnLeave}`,
      r.status === 201 &&
        r.body?.name === 'Nhà em' &&
        r.body?.radiusM === 150 &&
        r.body?.notifyOnArrive === true &&
        r.body?.notifyOnLeave === false);
  }

  {
    const r = await call('GET', '/places', { token: binh });
    rec('PL-02', 'Doi phuong thay duoc dia diem chung',
      '1 dia diem — dia diem la cua CA CAP DOI, khong phai cua rieng ai',
      `${r.body?.length}`,
      r.status === 200 && r.body?.length === 1);
  }

  {
    const r = await call('POST', '/places', {
      token: an,
      body: { name: 'Quá nhỏ', ...NHA_AN, radiusM: 20 },
    });
    rec('PL-03', 'Ban kinh 20m',
      '422 — nho hon sai so GPS thi hang rao se bat/tat lien tuc',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/places', {
      token: an,
      body: { name: 'Quá to', ...NHA_AN, radiusM: 5000 },
    });
    rec('PL-04', 'Ban kinh 5km',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/places', {
      token: an,
      body: { name: 'Sai toạ độ', lat: 999, lng: 106.7 },
    });
    rec('PL-05', 'Toa do ngoai dai Trai Dat',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/places', { token: an, body: { name: '  ', ...NHA_AN } });
    rec('PL-06', 'Ten rong',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  // ================================================================
  // B · HÀNG RÀO: ĐI VỀ NHÀ
  //
  // Khối này phải CHỜ THẬT hai lần, mỗi lần 65 giây, vì ngưỡng "ở đủ lâu" là
  // 60 giây và server không cho tua thời gian bằng mốc `ts`. Đó là cái giá của
  // việc kiểm một tính năng dựa trên thời gian bằng đường đi thật.
  // ================================================================
  {
    // Cách nhà 800 m — ngoài hàng rào 150 m.
    const r = await ping(an, north(NHA_AN, 800));
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-07', 'Dang o XA nha (800m)',
      '200 + accepted, va khong ai trong hang rao',
      `${r.status} · accepted=${r.body?.accepted} · ${inside.length} nguoi`,
      r.status === 200 && r.body?.accepted === true && inside.length === 0);
  }

  {
    // Bước đầu tiên vào trong hàng rào: BẮT ĐẦU BẤM GIỜ, chưa tính là đã tới.
    await ping(an, north(NHA_AN, 50));
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-08', 'Vua buoc vao hang rao (diem dau tien)',
      'CHUA tinh la da toi — di xe ngang qua nha khong phai la ve toi nha',
      `${inside.length} nguoi`,
      inside.length === 0);
  }

  {
    // Điểm thứ hai ngay lập tức: vẫn chưa đủ 60 giây.
    await ping(an, north(NHA_AN, 40));
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-09', 'Diem thu hai, van chua du 60 giay',
      'van CHUA tinh la da toi',
      `${inside.length} nguoi`,
      inside.length === 0);
  }

  {
    console.log(`        (cho ${DWELL_WAIT_MS / 1000}s de vuot nguong "o du lau"...)`);
    await sleep(DWELL_WAIT_MS);
    await ping(an, north(NHA_AN, 30));
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-10', 'O trong hang rao du 65 giay',
      'BAY GIO moi tinh la da toi noi',
      `${inside.length} nguoi trong hang rao`,
      inside.length === 1);
  }

  {
    // Ngồi yên, GPS nhiễu đẩy ra 170 m (> bán kính 150 m nhưng chưa quá
    // 150 + 30 m khoảng chênh). Không được coi là đã rời đi.
    await ping(an, north(NHA_AN, 170));
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-11', 'KHOANG CHENH — GPS nhieu day ra 170m (ban kinh 150m)',
      'VAN tinh la dang trong hang rao, khong ban thong bao "vua roi di"',
      `${inside.length} nguoi`,
      inside.length === 1);
  }

  // ================================================================
  // C · SAI SỐ GPS — chốt chặn chống báo sai
  // ================================================================
  {
    // Điểm cách nhà 2 km NHƯNG sai số 500 m. Sai số lớn hơn bán kính 150 m nên
    // điểm này không kết luận được gì → phải BỎ QUA, giữ nguyên "đang ở trong".
    await ping(an, north(NHA_AN, 2000), { accuracyM: 500 });
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-12', 'Diem cach 2km nhung SAI SO 500m (hang rao 150m)',
      'BO QUA diem do, van "dang o trong" — mot diem sai so 500m khong tra loi duoc gi',
      `${inside.length} nguoi`,
      inside.length === 1);
  }

  {
    // Đúng toạ độ đó nhưng sai số tốt → lần này mới tính là đã rời đi.
    // Đây là phép đối chứng cho PL-12: chỉ khác mỗi độ chính xác.
    await ping(an, north(NHA_AN, 2000), { accuracyM: 15 });
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-13', 'DOI CHUNG: cung toa do do nhung sai so 15m',
      'lan nay moi tinh la da roi di — chot chan chi chan diem toi, khong chan vi tri',
      `${inside.length} nguoi`,
      inside.length === 0);
  }

  // ================================================================
  // D · ẨN DANH
  // ================================================================
  {
    const binhId = (await call('GET', '/me', { token: binh })).body?.id;
    await call('PATCH', '/me/privacy', { token: binh, body: { ghostMode: true } });
    const r = await ping(binh, NHA_AN);
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-14', 'AN DANH: Binh dung ngay trong nha',
      'diem bi tu choi ngay o cua (accepted=false + GHOST_MODE) nen Binh KHONG bao gio lot vao hang rao',
      `accepted=${r.body?.accepted} reason=${r.body?.reason} · co Binh trong hang rao: ${inside.includes(binhId)}`,
      r.body?.accepted === false &&
        r.body?.reason === 'GHOST_MODE' &&
        binhId !== undefined &&
        !inside.includes(binhId));
    await call('PATCH', '/me/privacy', { token: binh, body: { ghostMode: false } });
  }

  // ================================================================
  // E · SỬA & XOÁ ĐỊA ĐIỂM
  // ================================================================
  {
    // Đưa An vào lại trong hàng rào để thử "dời hàng rào lúc đang ở trong".
    await ping(an, NHA_AN);
    console.log(`        (cho ${DWELL_WAIT_MS / 1000}s lan hai...)`);
    await sleep(DWELL_WAIT_MS);
    await ping(an, NHA_AN);
    await settle();
    const inside = await insideFirstPlace(an);
    rec('PL-15', 'An vao lai hang rao (chuan bi cho PL-16)',
      '1 nguoi trong hang rao',
      `${inside.length}`,
      inside.length === 1);
  }

  {
    // Dời hàng rào đi 3 km → trạng thái cũ vô nghĩa.
    const moved = north(NHA_AN, 3000);
    const r = await call('PATCH', `/places/${homeId}`, {
      token: an,
      body: { name: 'Nhà em', emoji: '🏠', ...moved, radiusM: 150 },
    });
    const inside = await insideFirstPlace(an);
    rec('PL-16', 'DOI HANG RAO di 3km trong khi An dang o trong',
      'trang thai cu bi xoa — khong duoc ban "vua roi di" tu mot noi chua tung toi',
      `${r.status} · trong hang rao: ${inside.length}`,
      r.status === 200 && inside.length === 0);
  }

  {
    const r = await call('PATCH', `/places/${homeId}`, {
      token: binh,
      body: { name: 'Bình đổi tên', emoji: '🏠', ...NHA_AN, radiusM: 150 },
    });
    rec('PL-17', 'Binh sua dia diem do An tao',
      '200 — dia diem la cua CHUNG ca cap doi, khac voi su kien tren lich',
      `${r.status} · "${r.body?.name}"`,
      r.status === 200 && r.body?.name === 'Bình đổi tên');
  }

  {
    const r = await call('DELETE', '/places/11111111-1111-1111-1111-111111111111', {
      token: an,
    });
    rec('PL-18', 'Xoa dia diem khong ton tai',
      '404',
      `${r.status}`,
      r.status === 404);
  }

  {
    const r = await call('GET', '/places/khong-phai-uuid', { token: an });
    // Không có route GET /places/:id → Nest trả 404 cho đường dẫn không khớp.
    rec('PL-19', 'Duong dan khong hop le',
      '404',
      `${r.status}`,
      r.status === 404);
  }

  // ================================================================
  // F · CÁCH LY GIỮA HAI CẶP ĐÔI
  // ================================================================
  {
    const dung = await reg('Dung', email('dung'));
    const em = await reg('Em', email('em'));
    const c2 = await call('POST', '/couples', {
      body: { anniversaryAt: '2024-01-01' },
      token: dung,
    });
    await call('POST', '/couples/join', {
      body: { inviteCode: c2.body.inviteCode },
      token: em,
    });

    const list = await call('GET', '/places', { token: dung });
    rec('PL-20', 'Cap doi KHAC khong thay dia diem cua An va Binh',
      '0 dia diem',
      `${list.body?.length}`,
      list.status === 200 && list.body?.length === 0);

    const del = await call('DELETE', `/places/${homeId}`, { token: dung });
    rec('PL-21', 'Nguoi ngoai xoa dia diem cua couple khac',
      '404 — khong duoc lo la id do co that',
      `${del.status}`,
      del.status === 404);

    const patch = await call('PATCH', `/places/${homeId}`, {
      token: dung,
      body: { name: 'Chiếm', emoji: '🏠', ...NHA_AN, radiusM: 150 },
    });
    rec('PL-22', 'Nguoi ngoai sua dia diem cua couple khac',
      '404',
      `${patch.status}`,
      patch.status === 404);

    // Người ngoài dừng đúng toạ độ nhà An → không được lọt vào hàng rào của An.
    await ping(dung, NHA_AN);
    await settle();
    const inside = await insideFirstPlace(an);
    const dungId = (await call('GET', '/me', { token: dung })).body?.id;
    rec('PL-23', 'Nguoi ngoai dung DUNG toa do nha An',
      'khong lot vao hang rao cua An — hang rao chi doi chieu trong pham vi couple',
      `co Dung trong hang rao cua An: ${inside.includes(dungId)}`,
      dungId !== undefined && !inside.includes(dungId));
  }

  // ================================================================
  // G · TRẦN SỐ LƯỢNG & XÁC THỰC
  // ================================================================
  {
    const r = await call('GET', '/places');
    rec('PL-24', 'Xem dia diem khong kem token',
      '401',
      `${r.status}`,
      r.status === 401);
  }

  {
    const le = await reg('Le', email('le'));
    const r = await call('GET', '/places', { token: le });
    rec('PL-25', 'Nguoi chua ghep doi xem dia diem',
      '404 + NOT_IN_COUPLE',
      `${r.status} + ${r.body?.code}`,
      r.status === 404 && r.body?.code === 'NOT_IN_COUPLE');
  }

  {
    // Đã có 1 địa điểm, thêm cho đủ 20 rồi thử cái thứ 21.
    let lastStatus = 0;
    for (let i = 0; i < 20; i += 1) {
      const r = await call('POST', '/places', {
        token: an,
        body: { name: `Chỗ ${i}`, ...north(NHA_AN, 5000 + i * 500) },
      });
      lastStatus = r.status;
    }
    rec('PL-26', 'Them qua tran 20 dia diem',
      '400 — chan viec rai hang rao khap thanh pho',
      `${lastStatus}`,
      lastStatus === 400);
  }

  {
    const r = await call('DELETE', `/places/${homeId}`, { token: an });
    const list = await call('GET', '/places', { token: an });
    const stillThere = (list.body ?? []).some((p) => p.id === homeId);
    rec('PL-27', 'Xoa dia diem',
      '204 va bien mat khoi danh sach',
      `${r.status} · con trong danh sach: ${stillThere}`,
      r.status === 204 && stillThere === false);
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
