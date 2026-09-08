/**
 * Trace Phase 4 (F5) — Mốc kỷ niệm.
 *
 *   npm run trace:milestones
 *
 * Phần tính toán (năm nhuận, đúng hôm nay, mốc đã qua) đã có 26 unit test cho
 * hàm thuần `buildUpcomingMilestones`. Bộ trace này lo phần còn lại: API có
 * ghép đúng dữ liệu thật từ DB không, quyền theo cặp đôi có chặt không.
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
const email = (n) => `${n}.f5.${stamp}@beside.test`;

/** Ngày lịch hôm nay theo giờ VN, dạng YYYY-MM-DD. */
function todayVn() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts; // en-CA cho ra sẵn "YYYY-MM-DD"
}

/** Cộng n ngày vào một chuỗi YYYY-MM-DD (ngày trôi nổi). */
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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

  const TODAY = todayVn();
  let customId = null;

  // ================================================================
  // A · MỐC TỰ SINH
  // ================================================================
  {
    const r = await call('GET', '/milestones', { token: an });
    const kinds = new Set((r.body ?? []).map((i) => i.kind));
    rec('MS-01', 'Danh sach moc sap toi tinh duoc ngay khi vua ghep doi',
      '200 + co moc ngay (AUTO_DAYS) va ky niem hang nam (ANNIVERSARY), khong can them gi',
      `${r.status} · ${r.body?.length} moc · loai: ${[...kinds].join(',')}`,
      r.status === 200 && kinds.has('AUTO_DAYS') && kinds.has('ANNIVERSARY'));
  }

  {
    const r = await call('GET', '/milestones', { token: an });
    const left = (r.body ?? []).map((i) => i.daysLeft);
    const sorted = [...left].sort((a, b) => a - b);
    rec('MS-02', 'Sap xep theo ngay gan nhat truoc',
      'da sap xep tang dan theo daysLeft',
      JSON.stringify(left),
      JSON.stringify(left) === JSON.stringify(sorted));
  }

  {
    const r = await call('GET', '/milestones', { token: an });
    const autoOnes = (r.body ?? []).filter((i) => i.kind !== 'CUSTOM');
    rec('MS-03', 'Moc tu sinh KHONG co id',
      'id = null — khong sua/xoa duoc, giao dien phai an nut',
      `${autoOnes.length} moc tu sinh, tat ca id=null: ${autoOnes.every((i) => i.id === null)}`,
      autoOnes.length > 0 && autoOnes.every((i) => i.id === null));
  }

  {
    const r = await call('GET', '/milestones', { token: an });
    rec('MS-04', 'Chua ai nhap ngay sinh',
      'khong co moc SINH NHAT nao, va khong loi',
      `${(r.body ?? []).filter((i) => i.kind === 'BIRTHDAY').length} moc sinh nhat`,
      r.status === 200 && (r.body ?? []).every((i) => i.kind !== 'BIRTHDAY'));
  }

  {
    // Nhập ngày sinh cho Bình rơi vào 5 ngày nữa (theo lịch, bất kể hôm nay là ngày nào).
    const target = addDays(TODAY, 5);
    const birthday = `1999-${target.slice(5)}`;
    await call('PATCH', '/me', { token: binh, body: { birthday } });

    const r = await call('GET', '/milestones', { token: an });
    const b = (r.body ?? []).find((i) => i.kind === 'BIRTHDAY');
    rec('MS-05', 'Nhap ngay sinh xong thi moc SINH NHAT xuat hien ngay',
      `sinh nhat Binh · con 5 ngay · co so tuoi`,
      `${b?.title} · ${b?.daysLeft} ngay · ${b?.subtitle}`,
      b?.title === 'Sinh nhật Binh' && b?.daysLeft === 5 && Boolean(b?.subtitle));
  }

  // ================================================================
  // B · MỐC TỰ THÊM
  // ================================================================
  {
    const r = await call('POST', '/milestones', {
      token: an,
      body: { title: '  Ngày cưới  ', date: addDays(TODAY, 10), emoji: '💍', yearly: true },
    });
    const m = (r.body ?? []).find((i) => i.title === 'Ngày cưới');
    customId = m?.id;
    rec('MS-06', 'HAPPY PATH — them mot moc rieng',
      '201 + tra ve CA danh sach moi + ten da cat khoang trang + con 10 ngay',
      `${r.status} · ${r.body?.length} moc · "${m?.title}" · ${m?.daysLeft} ngay`,
      r.status === 201 && m?.title === 'Ngày cưới' && m?.daysLeft === 10);
  }

  {
    const r = await call('GET', '/milestones', { token: binh });
    const m = (r.body ?? []).find((i) => i.id === customId);
    rec('MS-07', 'Doi phuong thay duoc moc vua them',
      'co trong danh sach cua Binh — moc la cua CA CAP DOI',
      `thay=${Boolean(m)}`,
      Boolean(m));
  }

  {
    const r = await call('GET', '/milestones', { token: an });
    const m = (r.body ?? []).find((i) => i.id === customId);
    rec('MS-08', 'Moc tu them CO id de sua/xoa',
      'id khac null',
      `id=${m?.id ? 'co' : 'khong'}`,
      Boolean(m?.id));
  }

  {
    // Mốc MỘT LẦN đã qua thì phải biến mất khỏi danh sách "sắp tới".
    const r = await call('POST', '/milestones', {
      token: an,
      body: { title: 'Đám cưới bạn', date: addDays(TODAY, -30), emoji: '🎉', yearly: false },
    });
    const m = (r.body ?? []).find((i) => i.title === 'Đám cưới bạn');
    rec('MS-09', 'Moc MOT LAN da qua 30 ngay',
      'luu duoc nhung KHONG hien trong danh sach sap toi',
      `${r.status} · trong danh sach: ${Boolean(m)}`,
      r.status === 201 && !m);
  }

  {
    // Mốc HẰNG NĂM đã qua thì phải hiện lại vào năm sau.
    const r = await call('POST', '/milestones', {
      token: an,
      body: { title: 'Lần đầu gặp nhau', date: addDays(TODAY, -30), emoji: '⭐', yearly: true },
    });
    const m = (r.body ?? []).find((i) => i.title === 'Lần đầu gặp nhau');
    rec('MS-10', 'Moc HANG NAM da qua 30 ngay',
      'hien lai voi lan toi la nam sau (khoang 335 ngay nua)',
      `con ${m?.daysLeft} ngay · ${m?.subtitle}`,
      m !== undefined && m.daysLeft > 300 && m.daysLeft < 370);
  }

  {
    const r = await call('POST', '/milestones', {
      token: an,
      body: { title: 'Hôm nay luôn', date: TODAY, emoji: '💖', yearly: true },
    });
    const m = (r.body ?? []).find((i) => i.title === 'Hôm nay luôn');
    rec('MS-11', 'Moc roi DUNG HOM NAY',
      'daysLeft = 0 va van nam trong danh sach',
      `${m?.daysLeft}`,
      m?.daysLeft === 0);
  }

  {
    const r = await call('POST', '/milestones', {
      token: an,
      body: { title: 'Ngày nhuận', date: '2024-02-29', emoji: '💖', yearly: true },
    });
    const m = (r.body ?? []).find((i) => i.title === 'Ngày nhuận');
    const d = m ? m.date.slice(5, 10) : '';
    rec('MS-12', 'NAM NHUAN — moc 29/02 lap hang nam',
      'lan toi roi vao 02-29 (nam nhuan) hoac 02-28 (nam thuong), TUYET DOI khong troi sang 03-01',
      `lan toi: ${d}`,
      d === '02-29' || d === '02-28');
  }

  // ================================================================
  // C · SỬA & XOÁ
  // ================================================================
  {
    const r = await call('PATCH', `/milestones/${customId}`, {
      token: binh,
      body: { title: 'Ngày cưới của tụi mình', date: addDays(TODAY, 10), emoji: '💍', yearly: true },
    });
    const m = (r.body ?? []).find((i) => i.id === customId);
    rec('MS-13', 'Binh sua moc do An them',
      '200 — moc la cua CHUNG ca cap doi, ai cung sua duoc',
      `${r.status} · "${m?.title}"`,
      r.status === 200 && m?.title === 'Ngày cưới của tụi mình');
  }

  {
    const r = await call('PATCH', `/milestones/${customId}`, {
      token: an,
      body: { title: '   ', date: addDays(TODAY, 10), emoji: '💍', yearly: true },
    });
    rec('MS-14', 'Sua thanh ten rong',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('POST', '/milestones', {
      token: an,
      body: { title: 'Ngày sai', date: '11/11/2025', emoji: '💖', yearly: true },
    });
    rec('MS-15', 'Ngay sai dinh dang',
      '422',
      `${r.status}`,
      r.status === 422);
  }

  {
    const r = await call('DELETE', `/milestones/${customId}`, { token: binh });
    const after = await call('GET', '/milestones', { token: an });
    const still = (after.body ?? []).some((i) => i.id === customId);
    rec('MS-16', 'Xoa moc tu them',
      '204 va bien mat khoi danh sach',
      `${r.status} · con lai: ${still}`,
      r.status === 204 && still === false);
  }

  {
    const r = await call('DELETE', '/milestones/11111111-1111-1111-1111-111111111111', {
      token: an,
    });
    rec('MS-17', 'Xoa moc khong ton tai',
      '404',
      `${r.status}`,
      r.status === 404);
  }

  {
    const r = await call('DELETE', '/milestones/khong-phai-uuid', { token: an });
    rec('MS-18', 'Id khong phai UUID',
      '400 — chan o pipe, khong dam vao DB',
      `${r.status}`,
      r.status === 400);
  }

  // ================================================================
  // D · CÁCH LY GIỮA HAI CẶP ĐÔI
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

    // Mốc riêng của An & Bình (lấy một cái còn sống).
    const anList = await call('GET', '/milestones', { token: an });
    const anCustom = (anList.body ?? []).find((i) => i.id !== null);

    const dungList = await call('GET', '/milestones', { token: dung });
    const leaked = (dungList.body ?? []).some((i) => i.id === anCustom?.id);
    rec('MS-19', 'Cap doi KHAC khong thay moc rieng cua An va Binh',
      'khong ro ri',
      `ro ri: ${leaked}`,
      anCustom !== undefined && leaked === false);

    const del = await call('DELETE', `/milestones/${anCustom?.id}`, { token: dung });
    rec('MS-20', 'Nguoi ngoai xoa moc cua couple khac',
      '404 — khong duoc lo la id do co that',
      `${del.status}`,
      del.status === 404);

    const patch = await call('PATCH', `/milestones/${anCustom?.id}`, {
      token: dung,
      body: { title: 'Chiếm', date: TODAY, emoji: '💖', yearly: true },
    });
    rec('MS-21', 'Nguoi ngoai sua moc cua couple khac',
      '404',
      `${patch.status}`,
      patch.status === 404);

    const dungAuto = (dungList.body ?? []).filter((i) => i.kind === 'AUTO_DAYS');
    rec('MS-22', 'Couple moi co moc tu sinh cua RIENG ho',
      'tinh tu ngay yeu 01/01/2024 cua ho, khong phai cua An',
      `${dungAuto.length} moc ngay`,
      dungAuto.length > 0);
  }

  // ================================================================
  // E · XÁC THỰC & TRẦN SỐ LƯỢNG
  // ================================================================
  {
    const r = await call('GET', '/milestones');
    rec('MS-23', 'Xem moc khong kem token',
      '401',
      `${r.status}`,
      r.status === 401);
  }

  {
    const le = await reg('Le', email('le'));
    const r = await call('GET', '/milestones', { token: le });
    rec('MS-24', 'Nguoi chua ghep doi xem moc',
      '404 + NOT_IN_COUPLE',
      `${r.status} + ${r.body?.code}`,
      r.status === 404 && r.body?.code === 'NOT_IN_COUPLE');
  }

  {
    let lastStatus = 0;
    for (let i = 0; i < 30; i += 1) {
      const r = await call('POST', '/milestones', {
        token: an,
        body: { title: `Mốc ${i}`, date: addDays(TODAY, 50 + i), emoji: '⭐', yearly: true },
      });
      lastStatus = r.status;
    }
    rec('MS-25', 'Them qua tran 30 moc tu them',
      '400',
      `${lastStatus}`,
      lastStatus === 400);
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
