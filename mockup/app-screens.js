/* =========================================================
   Beside — Mockup các màn hình ĐÃ DỰNG THẬT (Phase 1 + 2)
   Khác với screens.js (bản phác thảo Phase 0), file này bám sát
   giao diện đang chạy trong apps/web: đúng chữ, đúng trạng thái,
   đúng luồng — kể cả các trạng thái lỗi và rỗng.
   ========================================================= */

/* ---------- Thanh trạng thái ---------- */
function sb2(dark) {
  return (
    '<div class="statusbar' + (dark ? ' on-dark' : '') + '">' +
    '<span class="num">21:45</span>' +
    '<span class="sb-right"><span>Wi-Fi</span><span>92%</span></span></div>'
  );
}

/* ---------- Thanh tab 5 khe (TabBar.tsx) ---------- */
function tabbar2(active) {
  var items = [
    { id: 'home', icon: '🏠', label: 'Nhà', ready: true },
    { id: 'map', icon: '🗺️', label: 'Bản đồ', ready: true },
    { id: 'checkin', icon: '＋', label: '', fab: true, ready: false },
    { id: 'schedule', icon: '🗓️', label: 'Lịch', ready: false },
    { id: 'feed', icon: '💖', label: 'Kỷ niệm', ready: false },
  ];
  return (
    '<nav class="tabbar">' +
    items
      .map(function (t) {
        if (t.fab) {
          return (
            '<button class="tab" title="Sắp có ở Phase 3">' +
            '<span class="tab-fab" style="opacity:.45">' + t.icon + '</span></button>'
          );
        }
        var on = t.id === active;
        var dim = t.ready ? '' : 'opacity:.4;';
        return (
          '<button class="tab' + (on ? ' active' : '') + '" data-goto="' + t.id + '"' +
          (t.ready ? '' : ' title="Sắp có"') + ' style="' + dim + '">' +
          '<span class="ti">' + t.icon + '</span><span>' + t.label + '</span></button>'
        );
      })
      .join('') +
    '</nav>'
  );
}

/* ---------- Công tắc (Toggle trong SettingsScreen) ---------- */
function sw2(on) {
  return (
    '<span class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '"></span>'
  );
}

/* =========================================================
   1 · ĐĂNG NHẬP  (LoginScreen.tsx)
   ========================================================= */
var A_LOGIN =
  sb2() +
  '<div class="screen-body pad" style="display:flex;flex-direction:column;justify-content:center">' +
  '<div style="text-align:center;margin-bottom:32px">' +
  '<div class="brand-mark" style="margin:0 auto 16px">💞</div>' +
  '<h1 class="h1" style="font-size:28px">Beside</h1>' +
  '<p class="muted" style="margin-top:6px;font-size:14px">Ở cạnh nhau, dù đang ở đâu.</p>' +
  '</div>' +
  '<div class="stack">' +
  '<div><label class="label">Email</label>' +
  '<input class="input" value="an@example.com"></div>' +
  '<div><label class="label">Mật khẩu</label>' +
  '<input class="input" type="password" value="••••••••"></div>' +
  '<button class="btn btn-primary btn-block" data-goto="home" style="margin-top:8px">Đăng nhập</button>' +
  '</div>' +
  '<p class="muted" style="text-align:center;margin-top:24px;font-size:13.5px">' +
  'Chưa có tài khoản? <b style="color:var(--rose-600)">Đăng ký</b></p>' +
  '</div>';

/* =========================================================
   2 · ĐĂNG NHẬP — TRẠNG THÁI LỖI
   ========================================================= */
var A_LOGIN_ERR =
  sb2() +
  '<div class="screen-body pad" style="display:flex;flex-direction:column;justify-content:center">' +
  '<div style="text-align:center;margin-bottom:28px">' +
  '<div class="brand-mark" style="margin:0 auto 16px">💞</div>' +
  '<h1 class="h1" style="font-size:28px">Beside</h1></div>' +
  '<div class="stack">' +
  '<div style="border:1px solid var(--rose-200);background:var(--rose-50);border-radius:16px;' +
  'padding:12px 16px;font-size:13px;font-weight:650;color:var(--rose-700)">' +
  'Email hoặc mật khẩu không đúng</div>' +
  '<div><label class="label">Email</label>' +
  '<input class="input" value="an@example.com" style="border-color:var(--rose-600)"></div>' +
  '<div><label class="label">Mật khẩu</label>' +
  '<input class="input" type="password" value="•••" style="border-color:var(--rose-600)">' +
  '<p style="margin:6px 0 0;font-size:12px;font-weight:650;color:var(--rose-600)">' +
  'Vui lòng nhập mật khẩu</p></div>' +
  '<button class="btn btn-primary btn-block" style="margin-top:8px">Đăng nhập</button>' +
  '</div>' +
  '<div class="card tight" style="margin-top:26px;background:var(--ink-100);box-shadow:none;border:0">' +
  '<p class="tiny" style="line-height:1.6">' +
  '<b>Vì sao cùng một câu lỗi?</b> Sai mật khẩu và email không tồn tại đều trả về ' +
  'đúng câu này, với thời gian phản hồi gần bằng nhau — để không ai dò được ' +
  'email nào đã đăng ký. (trace TC-05)</p></div>' +
  '</div>';

/* =========================================================
   3 · GHÉP ĐÔI — TẠO MÃ  (PairScreen.tsx)
   ========================================================= */
var A_PAIR =
  sb2(true) +
  '<div class="screen-body pad" style="background:var(--grad-dusk);color:#fff;' +
  'display:flex;flex-direction:column;justify-content:center">' +
  '<div style="text-align:center;margin-bottom:26px">' +
  '<div class="brand-mark" style="margin:0 auto 16px;width:64px;height:64px;font-size:32px">💞</div>' +
  '<h1 class="h1" style="font-size:26px">Chào An!</h1>' +
  '<p style="margin-top:8px;font-size:14px;opacity:.9;line-height:1.55">' +
  'Ghép đôi để bắt đầu hành trình chung.<br>Một người tạo mã, người kia nhập mã.</p></div>' +

  '<div style="display:flex;gap:6px;background:rgba(255,255,255,.2);border-radius:999px;padding:6px">' +
  '<button style="flex:1;min-height:44px;border:0;border-radius:999px;background:#fff;' +
  'color:var(--rose-600);font-weight:700;font-size:13.5px;font-family:var(--font)">Tạo mã mời</button>' +
  '<button style="flex:1;min-height:44px;border:0;border-radius:999px;background:none;' +
  'color:rgba(255,255,255,.85);font-weight:700;font-size:13.5px;font-family:var(--font)">Nhập mã</button>' +
  '</div>' +

  '<div style="background:#fff;color:var(--ink-900);border-radius:var(--r-2xl);padding:20px;' +
  'margin-top:16px;box-shadow:var(--sh-lg)">' +
  '<h2 class="h3" style="font-size:17px">Hai đứa bắt đầu từ ngày nào?</h2>' +
  '<p class="muted" style="margin-top:4px">Ngày này dùng để đếm số ngày yêu. Đổi lại được sau.</p>' +
  '<label class="label" style="margin-top:16px">Ngày bắt đầu yêu</label>' +
  '<input class="input" value="14/02/2023">' +
  '<button class="btn btn-primary btn-block" data-goto="pair-wait" style="margin-top:14px">' +
  'Tạo mã ghép đôi</button></div>' +

  '<p style="margin-top:20px;font-size:11.5px;opacity:.85;text-align:center;line-height:1.6">' +
  'Vị trí của bạn chỉ được chia sẻ với duy nhất một người bạn ghép đôi.<br>' +
  'Bạn có thể tắt chia sẻ bất cứ lúc nào.</p></div>';

/* =========================================================
   4 · GHÉP ĐÔI — ĐANG CHỜ
   ========================================================= */
var A_PAIR_WAIT =
  sb2(true) +
  '<div class="screen-body pad" style="background:var(--grad-dusk);color:#fff;' +
  'display:flex;flex-direction:column;justify-content:center;text-align:center">' +
  '<div class="brand-mark" style="margin:0 auto 16px;width:64px;height:64px;font-size:32px">💞</div>' +
  '<h1 class="h1" style="font-size:24px">Đang chờ người ấy...</h1>' +
  '<p style="margin-top:8px;font-size:14px;opacity:.9">Gửi mã này cho người ấy nhé</p>' +

  '<div style="background:#fff;color:var(--ink-900);border-radius:var(--r-2xl);padding:20px;' +
  'margin-top:24px;box-shadow:var(--sh-lg)">' +
  '<div style="display:flex;gap:8px">' +
  ['L', 'V', '7', 'K', '2', '9']
    .map(function (c) {
      return (
        '<div style="flex:1;aspect-ratio:1;border-radius:16px;background:var(--rose-50);' +
        'border:1.5px dashed var(--rose-200);display:flex;align-items:center;justify-content:center;' +
        'font-size:22px;font-weight:800;color:var(--rose-600)">' + c + '</div>'
      );
    })
    .join('') +
  '</div>' +
  '<p class="tiny" style="margin-top:12px">Còn hiệu lực 23:47:12</p>' +
  '<button class="btn btn-ghost btn-block" style="margin-top:14px">📋 Sao chép mã</button>' +
  '</div>' +

  '<p style="margin-top:20px;font-size:12px;opacity:.85">' +
  'Màn hình này sẽ tự chuyển khi người ấy nhập mã.</p>' +
  '<p class="tiny" style="margin-top:6px;color:rgba(255,255,255,.7)">' +
  'Mã bỏ hẳn số 0/1 và chữ O/I để không đọc nhầm</p></div>';

/* =========================================================
   5 · TRANG CHỦ  (HomeScreen.tsx)
   ========================================================= */
var A_HOME =
  sb2() +
  '<div class="screen-body pb-tab">' +
  '<div class="scr-head">' +
  '<div><p class="tiny" style="margin-bottom:2px">Tối muộn rồi ✨</p>' +
  '<h1 class="h1">Chào An</h1></div>' +
  '<span class="av-ring" data-goto="settings" style="cursor:pointer">' +
  '<span class="av av-40 av-a">A</span></span></div>' +

  '<div class="pad stack">' +

  /* Bộ đếm ngày yêu */
  '<div class="love-hero">' +
  '<p style="margin:0 0 6px;font-size:12px;font-weight:700;opacity:.9;letter-spacing:1.2px">' +
  'CHÚNG MÌNH ĐÃ BÊN NHAU</p>' +
  '<div class="row" style="align-items:baseline;gap:8px">' +
  '<span class="love-num">1.302</span>' +
  '<span style="font-size:16px;font-weight:700;opacity:.92">ngày</span></div>' +
  '<p style="margin:6px 0 0;font-size:12.5px;opacity:.88">Từ 14/02/2023 · 3 năm 6 tháng 24 ngày</p>' +
  '<div style="margin-top:18px">' +
  '<div class="row between" style="font-size:11.5px;font-weight:650;opacity:.92;margin-bottom:6px">' +
  '<span>💍 Còn 159 ngày tới mốc 1.460 ngày</span><span>56%</span></div>' +
  '<div class="progress"><i style="width:56%"></i></div></div></div>' +

  /* Thẻ người ấy */
  '<div class="card tight">' +
  '<div class="row">' +
  '<span class="av av-48 av-b">B</span>' +
  '<div class="grow">' +
  '<div class="row" style="gap:6px"><b style="font-size:15.5px">Bình</b>' +
  '<span class="pill pill-live"><i class="dot-live"></i>Trực tiếp</span></div>' +
  '<p class="muted" style="margin-top:2px">Cập nhật 12 giây trước</p></div>' +
  '<div style="text-align:right"><b style="font-size:15px;display:block">4,2 km</b>' +
  '<span class="tiny">cách bạn</span></div></div>' +
  '<button class="btn btn-primary btn-sm btn-block" data-goto="map" style="margin-top:12px">' +
  '🧭 Xem trên bản đồ</button>' +
  '<button class="btn btn-ghost btn-sm btn-block" style="margin-top:8px">💬 Nhắn Zalo</button>' +
  '</div>' +

  /* Nhắc cấu hình */
  '<div class="card tight" style="border:1px solid var(--rose-200)">' +
  '<p class="eyebrow">Còn thiếu một chút</p>' +
  '<p class="muted" style="margin-top:6px">Bạn chưa cài số Zalo/Messenger, nên người ấy chưa có ' +
  'nút nhắn tin nhanh.<br><b style="color:var(--rose-600)">Bấm vào đây để thêm →</b></p></div>' +

  '<div class="card tight">' +
  '<p class="eyebrow">Sắp có</p>' +
  '<p class="muted" style="margin-top:6px">Check-in bằng ảnh, lịch trình chung và thông báo đẩy ' +
  'khi người ấy tới nơi.</p></div>' +

  '</div></div>' +
  tabbar2('home');

/* =========================================================
   6 · BẢN ĐỒ — ĐANG CHIA SẺ TRỰC TIẾP  (MapScreen.tsx)
   ========================================================= */
function mapScreen(opts) {
  var o = opts || {};
  return (
    sb2() +
    '<div class="screen-body no-pad" style="position:relative">' +
    '<div class="map-canvas">' + MAP_SVG + '</div>' +

    (o.ghost
      ? ''
      : '<div class="mk-acc" style="left:52%;top:34%;width:' + (o.fuzzed ? '150px' : '78px') +
        ';height:' + (o.fuzzed ? '150px' : '78px') + ';background:rgba(106,123,255,.14);' +
        'border-color:rgba(106,123,255,.35)"></div>' +
        '<div class="mk" style="left:52%;top:34%">' +
        '<span class="mk-label">Bình</span>' +
        '<div class="mk-pin av-b" style="display:flex;align-items:center;justify-content:center;' +
        'color:#fff;font-weight:800;font-size:16px">B</div></div>') +

    '<div class="mk-acc" style="left:26%;top:70%;width:60px;height:60px"></div>' +
    '<div class="mk" style="left:26%;top:70%">' +
    '<span class="mk-label">Bạn</span>' +
    '<div class="mk-pin av-a" style="width:38px;height:38px;display:flex;align-items:center;' +
    'justify-content:center;color:#fff;font-weight:800;font-size:14px">A</div></div>' +

    '<div class="map-overlay">' +
    /* Thanh trên */
    '<div style="padding:6px 16px 0">' +
    '<div class="row" style="gap:8px">' +
    '<div class="grow" style="background:rgba(255,255,255,.95);border-radius:var(--r-full);' +
    'padding:11px 16px;box-shadow:var(--sh-sm);font-size:13px;font-weight:650">' +
    (o.ghost
      ? '<span style="color:var(--ink-500)">Chưa có vị trí của Bình</span>'
      : o.live
        ? '<span class="row" style="gap:8px"><i class="dot-live"></i>Bình đang chia sẻ trực tiếp</span>'
        : '<span style="color:var(--ink-500)">Bình · 18 phút trước</span>') +
    '</div>' +
    '<button class="icon-btn" data-goto="settings" style="width:40px;height:40px">⚙︎</button></div>' +
    (o.fuzzed
      ? '<p class="pill" style="margin-top:8px;background:rgba(255,255,255,.95);' +
        'color:var(--ink-500);box-shadow:var(--sh-xs)">🔒 Bình đang bật làm mờ vị trí</p>'
      : '') +
    '</div>' +

    '<div class="map-fabs" style="bottom:320px"><button class="map-fab">🧭</button></div>' +

    /* Bảng dưới */
    '<div class="sheet" style="padding-bottom:112px">' +
    '<div class="sheet-grip"></div>' +
    '<div class="row">' +
    '<span class="av av-48 av-b">B</span>' +
    '<div class="grow">' +
    '<div class="row" style="gap:6px"><b style="font-size:16px">Bình</b>' +
    (o.live && !o.ghost ? '<span class="pill pill-live"><i class="dot-live"></i>Trực tiếp</span>' : '') +
    '</div>' +
    '<p class="muted" style="margin-top:2px">' +
    (o.ghost ? 'Chưa nhận được vị trí nào' : o.live ? 'Cập nhật 3 giây trước' : 'Cập nhật 18 phút trước') +
    '</p></div></div>' +

    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px">' +
    [
      ['Khoảng cách', o.ghost ? '—' : o.fuzzed ? '9,5 km' : '4,2 km'],
      ['Độ chính xác', o.ghost ? '—' : o.fuzzed ? '500 m' : '12 m'],
      ['Pin', o.ghost ? '—' : '62%'],
    ]
      .map(function (s) {
        return (
          '<div style="background:var(--rose-50);border-radius:var(--r-md);padding:10px 8px;' +
          'text-align:center"><p class="tiny" style="margin-bottom:3px">' + s[0] + '</p>' +
          '<b style="font-size:14.5px">' + s[1] + '</b></div>'
        );
      })
      .join('') +
    '</div>' +

    (o.myLive
      ? '<button class="btn btn-ghost btn-block" data-goto="map" style="margin-top:12px">' +
        '⏹ Dừng chia sẻ trực tiếp</button>' +
        '<p class="tiny" style="margin-top:9px;text-align:center">' +
        'Đang chia sẻ · màn hình được giữ sáng · tự dừng sau 60 phút</p>'
      : '<button class="btn btn-primary btn-block" data-goto="map-live" style="margin-top:12px">' +
        '📡 Chia sẻ vị trí trực tiếp</button>' +
        '<p class="tiny" style="margin-top:9px;text-align:center">' +
        'Chia sẻ trực tiếp chỉ chạy khi app đang mở trên màn hình</p>') +
    '</div></div></div>' +
    tabbar2('map')
  );
}

var A_MAP = mapScreen({ live: false, myLive: false });
var A_MAP_LIVE = mapScreen({ live: true, myLive: true });
var A_MAP_FUZZ = mapScreen({ live: true, myLive: true, fuzzed: true });
var A_MAP_GHOST = mapScreen({ ghost: true, myLive: false });

/* =========================================================
   7 · BẢN ĐỒ — BỊ TỪ CHỐI QUYỀN VỊ TRÍ
   ========================================================= */
var A_MAP_DENIED =
  sb2() +
  '<div class="screen-body no-pad" style="position:relative">' +
  '<div class="map-canvas">' + MAP_SVG + '</div>' +
  '<div class="map-overlay">' +
  '<div style="padding:6px 16px 0"><div class="row" style="gap:8px">' +
  '<div class="grow" style="background:rgba(255,255,255,.95);border-radius:var(--r-full);' +
  'padding:11px 16px;box-shadow:var(--sh-sm);font-size:13px;font-weight:650;color:var(--ink-500)">' +
  'Đang kết nối lại...</div>' +
  '<button class="icon-btn" style="width:40px;height:40px">⚙︎</button></div></div>' +

  '<div class="sheet" style="padding-bottom:112px">' +
  '<div class="sheet-grip"></div>' +
  '<div class="row"><span class="av av-48 av-b">B</span>' +
  '<div class="grow"><b style="font-size:16px">Bình</b>' +
  '<p class="muted" style="margin-top:2px">Chưa nhận được vị trí nào</p></div></div>' +

  '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px">' +
  [['Khoảng cách', '—'], ['Độ chính xác', '—'], ['Pin', '—']]
    .map(function (s) {
      return (
        '<div style="background:var(--rose-50);border-radius:var(--r-md);padding:10px 8px;' +
        'text-align:center"><p class="tiny" style="margin-bottom:3px">' + s[0] + '</p>' +
        '<b style="font-size:14.5px">' + s[1] + '</b></div>'
      );
    })
    .join('') +
  '</div>' +

  '<div style="margin-top:12px;border-radius:16px;background:var(--ink-100);padding:12px 16px;' +
  'font-size:12.5px;line-height:1.6;color:var(--ink-600)">' +
  'Trình duyệt đang chặn quyền vị trí. Mở phần cài đặt trang web của trình duyệt để bật lại, ' +
  'rồi tải lại trang.</div>' +
  '</div></div></div>' +
  tabbar2('map');

/* =========================================================
   8 · CÀI ĐẶT  (SettingsScreen.tsx)
   ========================================================= */
var A_SETTINGS =
  sb2() +
  '<div class="screen-body pb-tab">' +
  '<div class="scr-head" style="justify-content:flex-start;gap:12px">' +
  '<button class="icon-btn" data-goto="home">‹</button>' +
  '<h1 class="h1" style="font-size:22px">Cài đặt</h1></div>' +

  '<div class="pad stack">' +

  /* Hồ sơ */
  '<div class="card">' +
  '<h2 class="h3" style="font-size:15px">🙋 Hồ sơ của bạn</h2>' +
  '<div style="margin-top:16px"><label class="label">Tên hiển thị</label>' +
  '<input class="input" value="An">' +
  '<p class="tiny" style="margin-top:6px">Tên người ấy nhìn thấy</p></div>' +
  '<div style="margin-top:14px"><label class="label">Ngày sinh</label>' +
  '<input class="input" value="12/05/1998">' +
  '<p class="tiny" style="margin-top:6px">Để trống nếu không muốn khai</p></div>' +
  '<button class="btn btn-primary btn-block" style="margin-top:16px">Lưu thay đổi</button></div>' +

  /* Nhắn tin */
  '<div class="card">' +
  '<h2 class="h3" style="font-size:15px">💬 Nút nhắn tin</h2>' +
  '<p class="muted" style="margin-top:6px">Beside không có chat riêng. Nút “Nhắn tin” sẽ mở thẳng ' +
  'app bên dưới — người ấy bấm là nhắn được cho bạn.</p>' +
  '<label class="label" style="margin-top:16px">Mở bằng</label>' +
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
  [['Zalo', 1], ['Messenger', 0], ['Gọi điện', 0], ['Tin nhắn SMS', 0]]
    .map(function (a) {
      return (
        '<button style="min-height:44px;border-radius:16px;font-family:var(--font);' +
        'font-size:13.5px;font-weight:700;cursor:pointer;border:1.5px solid ' +
        (a[1] ? 'var(--rose-400);background:var(--rose-50);color:var(--rose-700)' :
                'var(--ink-200);background:#fff;color:var(--ink-700)') + '">' + a[0] + '</button>'
      );
    })
    .join('') +
  '</div>' +
  '<div style="margin-top:14px"><label class="label">Số điện thoại</label>' +
  '<input class="input" value="0912345678"></div>' +
  '<p style="margin-top:10px;background:var(--mint-100);border-radius:16px;padding:8px 12px;' +
  'font-size:12px;font-weight:650;color:#127A5E">✓ Sẽ mở: https://zalo.me/84912345678</p>' +
  '<button class="btn btn-primary btn-block" style="margin-top:14px">Lưu thay đổi</button></div>' +

  /* Quyền riêng tư */
  '<div class="card">' +
  '<h2 class="h3" style="font-size:15px">🔒 Quyền riêng tư</h2>' +
  '<div style="margin-top:6px">' +
  [
    ['👻', 'Chế độ ẩn danh', 'Tạm ẩn hoàn toàn. Server sẽ KHÔNG ghi lại và KHÔNG gửi vị trí của bạn đi.', 0],
    ['📡', 'Chia sẻ vị trí trực tiếp', 'Tắt thì người ấy chỉ thấy vị trí lần cuối bạn mở app.', 1],
    ['🎯', 'Làm mờ vị trí', 'Người ấy chỉ thấy bạn trong bán kính 500m thay vì chính xác.', 0],
  ]
    .map(function (r) {
      return (
        '<div class="lrow"><span class="lico">' + r[0] + '</span>' +
        '<div class="grow"><b style="font-size:14px">' + r[1] + '</b>' +
        '<p class="tiny" style="margin-top:2px;line-height:1.5">' + r[2] + '</p></div>' +
        sw2(r[3]) + '</div>'
      );
    })
    .join('') +
  '</div></div>' +

  /* Couple */
  '<div class="card">' +
  '<h2 class="h3" style="font-size:15px">💞 Chuyện của hai đứa</h2>' +
  '<div style="margin-top:16px"><label class="label">Ngày bắt đầu yêu</label>' +
  '<input class="input" value="14/02/2023">' +
  '<p class="tiny" style="margin-top:6px">Bộ đếm ngày yêu tính từ ngày này</p></div>' +
  '<button class="btn btn-primary btn-block" style="margin-top:16px">Lưu thay đổi</button></div>' +

  '<div class="card tight"><b style="font-size:14px;color:var(--ink-700)">Đăng xuất</b></div>' +

  /* Huỷ ghép đôi */
  '<div class="card" style="border:1px solid var(--rose-200)">' +
  '<h2 class="h3" style="font-size:15px">💔 Huỷ ghép đôi</h2>' +
  '<p class="muted" style="margin-top:8px">Xoá vĩnh viễn toàn bộ dữ liệu chung: vị trí, kỷ niệm, ' +
  'lịch trình, địa điểm. Tài khoản của hai người vẫn còn. <b>Không thể khôi phục.</b></p>' +
  '<button class="btn btn-block" style="margin-top:12px;background:#fff;' +
  'border:1.5px solid var(--rose-300);color:var(--rose-600)">Tôi muốn huỷ ghép đôi</button></div>' +

  '<p class="tiny" style="text-align:center;padding:6px 0 10px">Beside v0.1.0 · an@example.com</p>' +
  '</div></div>' +
  tabbar2(null);

/* =========================================================
   Đăng ký danh sách
   ========================================================= */
var APP_SCREENS = [
  { id: 'login', icon: '🔑', name: 'Đăng nhập',
    desc: 'LoginScreen.tsx — validate bằng chính schema Zod mà server dùng.', html: A_LOGIN },
  { id: 'login-err', icon: '⚠️', name: 'Đăng nhập — lỗi',
    desc: 'Lỗi từng trường + lỗi chung. Sai mật khẩu và email không tồn tại trả cùng một câu.',
    html: A_LOGIN_ERR },
  { id: 'pair', icon: '💞', name: 'Ghép đôi — tạo mã',
    desc: 'PairScreen.tsx — chọn ngày yêu rồi sinh mã 6 ký tự.', html: A_PAIR },
  { id: 'pair-wait', icon: '⏳', name: 'Ghép đôi — đang chờ',
    desc: 'Hiện mã + đếm ngược 24h, tự hỏi lại server mỗi 10 giây.', html: A_PAIR_WAIT },
  { id: 'home', icon: '🏠', name: 'Trang chủ',
    desc: 'HomeScreen.tsx — đếm ngày yêu, trạng thái người ấy, khoảng cách, nút nhắn Zalo.',
    html: A_HOME },
  { id: 'map', icon: '🗺️', name: 'Bản đồ — chưa chia sẻ',
    desc: 'MapScreen.tsx — chỉ thấy vị trí lần cuối của người ấy.', html: A_MAP },
  { id: 'map-live', icon: '📡', name: 'Bản đồ — đang trực tiếp',
    desc: 'Cả hai chấm + vệt đường + vòng sai số. Màn hình được giữ sáng, tự dừng sau 60 phút.',
    html: A_MAP_LIVE },
  { id: 'map-fuzz', icon: '🎯', name: 'Bản đồ — người ấy làm mờ',
    desc: 'Vòng sai số nở ra 500m, badge 🔒, khoảng cách làm tròn theo bội số 500m.',
    html: A_MAP_FUZZ },
  { id: 'map-ghost', icon: '👻', name: 'Bản đồ — người ấy ẩn danh',
    desc: 'Chấm biến mất, và cả ô "Khoảng cách" cũng thành — (không lộ gián tiếp).',
    html: A_MAP_GHOST },
  { id: 'map-denied', icon: '🚫', name: 'Bản đồ — bị chặn quyền',
    desc: 'Trình duyệt từ chối quyền vị trí: hướng dẫn cụ thể thay vì nút bấm vô dụng.',
    html: A_MAP_DENIED },
  { id: 'settings', icon: '⚙️', name: 'Cài đặt',
    desc: 'SettingsScreen.tsx — hồ sơ, nút nhắn tin (có xem trước link), quyền riêng tư, ngày kỷ niệm.',
    html: A_SETTINGS },
];

var APP_TABS = ['home', 'map', 'settings'];

function appScreenById(id) {
  for (var i = 0; i < APP_SCREENS.length; i++) if (APP_SCREENS[i].id === id) return APP_SCREENS[i];
  return APP_SCREENS[0];
}

function renderAppPhone(screen) {
  return '<div class="dynamic-island"></div>' + screen.html;
}
