/**
 * Trace Phase 4 — Lịch trình chung (F4).
 *
 *   npm run trace:phase4
 *
 * Chạy thật vào API. Tập trung vào ba chỗ dễ sai nhất của một cái lịch:
 * múi giờ (sự kiện cả ngày), biên thời gian (kết thúc trước bắt đầu), và
 * quyền xem (việc riêng của người kia).
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
const email = (n) => `${n}.p4.${stamp}@beside.test`;

/** Khoảng truy vấn rộng, dùng cho hầu hết các case. */
const WIDE = { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' };

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

  let dinnerId = null;
  let allDayId = null;
  let privateId = null;

  // ================================================================
  // A · HAPPY PATH
  // ================================================================
  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: '  Ăn tối kỷ niệm  ',
        note: 'Nhà hàng trên tầng 52',
        emoji: '🍽️',
        startAt: '2026-09-10T12:00:00.000Z', // 19:00 giờ VN
        endAt: '2026-09-10T14:00:00.000Z',
        remindMinBefore: 60,
      },
    });
    dinnerId = r.body?.id;
    rec('P4-01', 'HAPPY PATH — tao su kien co gio',
      '201 + ten da cat khoang trang + emoji + nhac truoc 60 phut',
      `${r.status} · title="${r.body?.title}" · ${r.body?.emoji} · remind=${r.body?.remindMinBefore}`,
      r.status === 201 &&
        r.body?.title === 'Ăn tối kỷ niệm' &&
        r.body?.emoji === '🍽️' &&
        r.body?.remindMinBefore === 60);
  }

  {
    const r = await call('GET', '/events', { token: binh, query: WIDE });
    const found = (r.body ?? []).find((e) => e.id === dinnerId);
    rec('P4-02', 'Doi phuong thay duoc su kien vua tao',
      'co trong lich cua Binh, kem ten nguoi tao',
      `${r.status} · thay=${Boolean(found)} · nguoi tao=${found?.createdByName}`,
      r.status === 200 && Boolean(found) && found.createdByName === 'An');
  }

  {
    const r = await call('GET', '/events', { token: binh, query: WIDE });
    const found = (r.body ?? []).find((e) => e.id === dinnerId);
    rec('P4-03', 'canEdit dung phia — Binh KHONG sua duoc su kien cua An',
      'canEdit=false', `${found?.canEdit}`,
      found?.canEdit === false);
  }

  // ================================================================
  // B · SỰ KIỆN CẢ NGÀY (múi giờ — chỗ dễ sai nhất)
  // ================================================================
  {
    const r = await call('POST', '/events', {
      token: an,
      body: { title: 'Sinh nhật Bình', emoji: '🎂', allDay: true, startDate: '2026-09-12' },
    });
    allDayId = r.body?.id;
    rec('P4-04', 'SU KIEN CA NGAY luu dung ngay lich, khong bi lech mui gio',
      'startAt = 2026-09-12T00:00:00.000Z (ngay troi noi) + allDay=true',
      `${r.status} · ${r.body?.startAt} · allDay=${r.body?.allDay}`,
      r.status === 201 &&
        r.body?.startAt === '2026-09-12T00:00:00.000Z' &&
        r.body?.allDay === true);
  }

  {
    // Đây là cái bẫy thật: nếu lưu theo 00:00 giờ VN thì mốc UTC rơi vào 17:00
    // ngày HÔM TRƯỚC, và một truy vấn bắt đầu từ 00:00 UTC ngày 12 sẽ bỏ sót nó.
    const r = await call('GET', '/events', {
      token: binh,
      query: { from: '2026-09-12T00:00:00.000Z', to: '2026-09-13T00:00:00.000Z' },
    });
    const found = (r.body ?? []).find((e) => e.id === allDayId);
    rec('P4-05', 'Su kien ca ngay nam dung o o lich ngay 12, khong troi sang ngay 11',
      'tim thay khi loc dung ngay 12',
      `thay=${Boolean(found)} · so su kien=${r.body?.length}`,
      Boolean(found));
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Đi Đà Lạt',
        allDay: true,
        startDate: '2026-10-01',
        endDate: '2026-10-03',
      },
    });
    rec('P4-06', 'Su kien ca ngay keo dai nhieu ngay',
      '201 + endAt = 2026-10-03T00:00:00.000Z',
      `${r.status} · ${r.body?.endAt}`,
      r.status === 201 && r.body?.endAt === '2026-10-03T00:00:00.000Z');
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: { title: 'Ngày ma', allDay: true, startDate: '2026-02-31' },
    });
    rec('P4-07', 'Ngay 31/02 khong co that',
      '422 — khong duoc am tham troi sang 03/03',
      `${r.status} + ${r.body?.code}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: { title: 'Ngày nhuận', allDay: true, startDate: '2024-02-29' },
    });
    rec('P4-08', 'Ngay 29/02 cua nam nhuan thi hop le',
      '201 + startAt = 2024-02-29T00:00:00.000Z',
      `${r.status} · ${r.body?.startAt}`,
      r.status === 201 && r.body?.startAt === '2024-02-29T00:00:00.000Z');
  }

  // ================================================================
  // C · BIÊN THỜI GIAN
  // ================================================================
  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Sai giờ',
        startAt: '2026-09-10T14:00:00.000Z',
        endAt: '2026-09-10T12:00:00.000Z',
      },
    });
    rec('P4-09', 'Gio ket thuc TRUOC gio bat dau',
      '422 + bao loi o truong endAt',
      `${r.status} · ${JSON.stringify(r.body?.fieldErrors?.endAt ?? null)}`,
      r.status === 422 && Boolean(r.body?.fieldErrors?.endAt));
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Trùng mốc',
        startAt: '2026-09-10T12:00:00.000Z',
        endAt: '2026-09-10T12:00:00.000Z',
      },
    });
    rec('P4-10', 'Gio ket thuc TRUNG gio bat dau',
      '422 — mot su kien 0 phut la go nham',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Nhầm năm',
        startAt: '2026-09-10T12:00:00.000Z',
        endAt: '2027-09-10T12:00:00.000Z',
      },
    });
    rec('P4-11', 'Su kien dai 1 nam — gan nhu chac chan go nham nam',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/events', { token: an, body: { title: 'Không giờ' } });
    rec('P4-12', 'Thieu gio bat dau',
      '422 + bao loi o truong startAt',
      `${r.status} · ${JSON.stringify(r.body?.fieldErrors?.startAt ?? null)}`,
      r.status === 422 && Boolean(r.body?.fieldErrors?.startAt));
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: { title: '   ', startAt: '2026-09-10T12:00:00.000Z' },
    });
    rec('P4-13', 'Ten rong',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/events', {
      token: an,
      body: { title: 'Giờ rác', startAt: 'hôm nào đó' },
    });
    rec('P4-14', 'Chuoi thoi gian vo nghia',
      '422, KHONG duoc 500',
      `${r.status}`,
      r.status === 422);
  }

  // ================================================================
  // D · SỰ KIỆN ĐÃ QUA & TRÙNG GIỜ
  // ================================================================
  {
    const r = await call('POST', '/events', {
      token: an,
      body: { title: 'Chuyến đi năm ngoái', startAt: '2020-01-01T00:00:00.000Z' },
    });
    rec('P4-15', 'Su kien trong QUA KHU van luu duoc',
      '201 — nguoi ta hay ghi lai viec da xay ra',
      `${r.status}`,
      r.status === 201);
  }

  {
    const a = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Họp công ty',
        startAt: '2026-11-05T02:00:00.000Z',
        endAt: '2026-11-05T04:00:00.000Z',
      },
    });
    const b = await call('POST', '/events', {
      token: binh,
      body: {
        title: 'Khám răng',
        startAt: '2026-11-05T03:00:00.000Z',
        endAt: '2026-11-05T05:00:00.000Z',
      },
    });
    const list = await call('GET', '/events', {
      token: an,
      query: { from: '2026-11-05T00:00:00.000Z', to: '2026-11-06T00:00:00.000Z' },
    });
    const ids = (list.body ?? []).map((e) => e.id);
    rec('P4-16', 'Hai su kien TRUNG GIO — ca hai deu duoc luu, khong cai nao bi chan',
      'ca hai cung xuat hien trong ngay 05/11',
      `${a.status}/${b.status} · so su kien trong ngay=${ids.length}`,
      a.status === 201 &&
        b.status === 201 &&
        ids.includes(a.body?.id) &&
        ids.includes(b.body?.id));
  }

  {
    const list = await call('GET', '/events', {
      token: an,
      query: { from: '2026-11-05T00:00:00.000Z', to: '2026-11-06T00:00:00.000Z' },
    });
    const times = (list.body ?? []).map((e) => e.startAt);
    const sorted = [...times].sort();
    rec('P4-17', 'Lich tra ve theo thu tu thoi gian tang dan',
      'da sap xep',
      `${JSON.stringify(times)}`,
      JSON.stringify(times) === JSON.stringify(sorted));
  }

  // ================================================================
  // E · TRUY VẤN KHOẢNG — sự kiện dài vắt qua đầu khoảng
  // ================================================================
  {
    // Chuyến đi 01→03/10. Hỏi lịch NGÀY 02 — nếu lọc theo mỗi startAt thì
    // chuyến đi này biến mất đúng lúc đang diễn ra.
    const r = await call('GET', '/events', {
      token: binh,
      query: { from: '2026-10-02T00:00:00.000Z', to: '2026-10-03T00:00:00.000Z' },
    });
    const found = (r.body ?? []).find((e) => e.title === 'Đi Đà Lạt');
    rec('P4-18', 'Su kien nhieu ngay van hien o NGAY GIUA chuyen di',
      'tim thay khi hoi rieng ngay 02/10',
      `thay=${Boolean(found)}`,
      Boolean(found));
  }

  {
    const r = await call('GET', '/events', {
      token: an,
      query: { from: '2026-12-01T00:00:00.000Z', to: '2026-12-02T00:00:00.000Z' },
    });
    rec('P4-19', 'Ngay khong co su kien nao',
      '200 + mang rong (khong phai 404)',
      `${r.status} · ${JSON.stringify(r.body)}`,
      r.status === 200 && Array.isArray(r.body) && r.body.length === 0);
  }

  {
    const r = await call('GET', '/events', {
      token: an,
      query: { from: '2026-12-31T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' },
    });
    rec('P4-20', 'Khoang thoi gian NGUOC (from > to)',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('GET', '/events', {
      token: an,
      query: { from: '2000-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' },
    });
    rec('P4-21', 'Quet 26 nam mot lan',
      '422 — chan truy van keo ca DB',
      `${r.status}`,
      r.status === 422);
  }

  // ================================================================
  // F · VIỆC RIÊNG (visibility = PRIVATE)
  // ================================================================
  {
    const r = await call('POST', '/events', {
      token: an,
      body: {
        title: 'Đi mua quà bí mật',
        startAt: '2026-09-20T02:00:00.000Z',
        visibility: 'PRIVATE',
      },
    });
    privateId = r.body?.id;
    rec('P4-22', 'Tao viec rieng',
      '201 + visibility=PRIVATE',
      `${r.status} · ${r.body?.visibility}`,
      r.status === 201 && r.body?.visibility === 'PRIVATE');
  }

  {
    const mine = await call('GET', '/events', { token: an, query: WIDE });
    const theirs = await call('GET', '/events', { token: binh, query: WIDE });
    const anSees = (mine.body ?? []).some((e) => e.id === privateId);
    const binhSees = (theirs.body ?? []).some((e) => e.id === privateId);
    rec('P4-23', 'VIEC RIENG: An thay, Binh KHONG thay',
      'An=true, Binh=false',
      `An=${anSees} · Binh=${binhSees}`,
      anSees === true && binhSees === false);
  }

  {
    const r = await call('GET', `/events/${privateId}`, { token: binh });
    rec('P4-24', 'Binh doc thang viec rieng bang id',
      '404 — khong duoc lo la id do co that',
      `${r.status} + ${r.body?.code}`,
      r.status === 404);
  }

  {
    const r = await call('DELETE', `/events/${privateId}`, { token: binh });
    rec('P4-25', 'Binh xoa viec rieng cua An',
      '404',
      `${r.status}`,
      r.status === 404);
  }

  // ================================================================
  // G · SỬA & XOÁ
  // ================================================================
  {
    const r = await call('PATCH', `/events/${dinnerId}`, {
      token: an,
      body: {
        title: 'Ăn tối kỷ niệm (đổi giờ)',
        startAt: '2026-09-10T13:00:00.000Z',
        endAt: '2026-09-10T15:00:00.000Z',
        emoji: '🍽️',
      },
    });
    rec('P4-26', 'Nguoi tao sua su kien',
      '200 + ten va gio moi',
      `${r.status} · "${r.body?.title}" · ${r.body?.startAt}`,
      r.status === 200 &&
        r.body?.title === 'Ăn tối kỷ niệm (đổi giờ)' &&
        r.body?.startAt === '2026-09-10T13:00:00.000Z');
  }

  {
    const r = await call('PATCH', `/events/${dinnerId}`, {
      token: binh,
      body: { title: 'Bình đổi trộm', startAt: '2026-09-10T13:00:00.000Z' },
    });
    rec('P4-27', 'Binh sua su kien CHUNG do An tao',
      '403 — su kien chung thi ai cung THAY, nhung chi nguoi tao moi SUA',
      `${r.status} + ${r.body?.code}`,
      r.status === 403 && r.body?.code === 'FORBIDDEN');
  }

  {
    const r = await call('PATCH', `/events/${dinnerId}`, {
      token: an,
      body: {
        title: 'Sửa sai giờ',
        startAt: '2026-09-10T15:00:00.000Z',
        endAt: '2026-09-10T13:00:00.000Z',
      },
    });
    const after = await call('GET', `/events/${dinnerId}`, { token: an });
    rec('P4-28', 'Sua bang du lieu sai thi KHONG duoc ghi de len ban cu',
      '422 + su kien giu nguyen gio cu',
      `${r.status} · gio hien tai=${after.body?.startAt}`,
      r.status === 422 && after.body?.startAt === '2026-09-10T13:00:00.000Z');
  }

  {
    const r = await call('DELETE', `/events/${dinnerId}`, { token: binh });
    rec('P4-29', 'Binh xoa su kien chung do An tao',
      '403',
      `${r.status} + ${r.body?.code}`,
      r.status === 403);
  }

  {
    const r = await call('DELETE', `/events/${dinnerId}`, { token: an });
    const after = await call('GET', `/events/${dinnerId}`, { token: an });
    rec('P4-30', 'Nguoi tao xoa duoc su kien cua minh',
      '204 + sau do doc lai la 404',
      `${r.status} → ${after.status}`,
      r.status === 204 && after.status === 404);
  }

  {
    const r = await call('DELETE', '/events/11111111-1111-1111-1111-111111111111', {
      token: an,
    });
    rec('P4-31', 'Xoa su kien khong ton tai',
      '404',
      `${r.status}`,
      r.status === 404);
  }

  {
    const r = await call('GET', '/events/khong-phai-uuid', { token: an });
    rec('P4-32', 'Id khong phai UUID',
      '400 — chan o pipe, khong dam vao DB',
      `${r.status}`,
      r.status === 400);
  }

  // ================================================================
  // H · CÁCH LY GIỮA HAI CẶP ĐÔI
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

    const list = await call('GET', '/events', { token: dung, query: WIDE });
    rec('P4-33', 'Cap doi KHAC khong thay lich cua An va Binh',
      '0 su kien',
      `${list.body?.length} su kien`,
      list.status === 200 && list.body?.length === 0);

    const peek = await call('GET', `/events/${allDayId}`, { token: dung });
    rec('P4-34', 'Nguoi ngoai doc su kien bang dung id',
      '404',
      `${peek.status}`,
      peek.status === 404);

    const del = await call('DELETE', `/events/${allDayId}`, { token: dung });
    rec('P4-35', 'Nguoi ngoai xoa su kien cua couple khac',
      '404',
      `${del.status}`,
      del.status === 404);
  }

  // ================================================================
  // I · CHƯA ĐĂNG NHẬP / CHƯA GHÉP ĐÔI
  // ================================================================
  {
    const r = await call('GET', '/events', { query: WIDE });
    rec('P4-36', 'Xem lich khong kem token',
      '401',
      `${r.status}`,
      r.status === 401);
  }

  {
    const le = await reg('Le', email('le'));
    const r = await call('GET', '/events', { token: le, query: WIDE });
    rec('P4-37', 'Nguoi chua ghep doi xem lich',
      '404 + NOT_IN_COUPLE',
      `${r.status} + ${r.body?.code}`,
      r.status === 404 && r.body?.code === 'NOT_IN_COUPLE');
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
