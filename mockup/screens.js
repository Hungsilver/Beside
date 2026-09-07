/* =========================================================
   Beside — Nội dung 9 màn hình mockup
   Dùng chung cho index.html (gallery) và prototype.html (bấm thử)
   Không phải code production — chỉ để duyệt giao diện.
   ========================================================= */

/* ---------- Thanh trạng thái giả lập ---------- */
function statusbar(dark) {
  return (
    '<div class="statusbar' + (dark ? ' on-dark' : '') + '">' +
      '<span class="num">21:45</span>' +
      '<span class="sb-right"><span>Wi-Fi</span><span>92%</span></span>' +
    '</div>'
  );
}

/* ---------- Bản đồ giả lập (production: MapLibre GL JS) ---------- */
var MAP_SVG = [
'<svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">',
  '<rect width="390" height="844" fill="#F7F3ED"/>',
  '<path d="M-10 96 L124 66 L166 178 L34 214 Z" fill="#E6F0DD"/>',
  '<circle cx="318" cy="676" r="86" fill="#E6F0DD"/>',
  '<rect x="212" y="96" width="120" height="86" rx="8" fill="#E9F1E2"/>',
  '<path d="M-20 452 C 80 420, 150 512, 252 482 S 372 528, 410 492 L410 566 ',
        'C 370 604, 256 560, 250 570 S 84 500, -20 540 Z" fill="#D8E9F6"/>',
  '<g fill="#EFE9E1">',
    '<rect x="20" y="252" width="96" height="70" rx="6"/>',
    '<rect x="132" y="244" width="72" height="82" rx="6"/>',
    '<rect x="222" y="238" width="108" height="60" rx="6"/>',
    '<rect x="26" y="344" width="120" height="64" rx="6"/>',
    '<rect x="168" y="336" width="88" height="72" rx="6"/>',
    '<rect x="278" y="330" width="96" height="80" rx="6"/>',
    '<rect x="14" y="596" width="104" height="76" rx="6"/>',
    '<rect x="134" y="612" width="90" height="60" rx="6"/>',
    '<rect x="42" y="700" width="130" height="72" rx="6"/>',
    '<rect x="196" y="716" width="84" height="66" rx="6"/>',
  '</g>',
  '<g stroke="#FFFFFF" fill="none" stroke-linecap="round">',
    '<path d="M-10 232 L400 196" stroke-width="17"/>',
    '<path d="M-10 424 L400 396" stroke-width="13"/>',
    '<path d="M-10 586 L400 572" stroke-width="15"/>',
    '<path d="M124 -10 L104 844" stroke-width="14"/>',
    '<path d="M266 -10 L286 844" stroke-width="12"/>',
    '<path d="M196 190 L210 844" stroke-width="9"/>',
    '<path d="M-10 314 L400 296" stroke-width="7"/>',
    '<path d="M-10 700 L400 688" stroke-width="8"/>',
    '<path d="M56 -10 L44 844" stroke-width="7"/>',
    '<path d="M340 -10 L356 844" stroke-width="7"/>',
  '</g>',
  '<g stroke="#FBE9C8" fill="none" stroke-width="9" stroke-linecap="round">',
    '<path d="M-10 128 C 120 150, 240 96, 400 132"/>',
  '</g>',
  '<g fill="#B9AEA4" font-family="sans-serif" font-size="9" font-weight="600">',
    '<text x="30" y="228" transform="rotate(-5 30 228)">Nguyen Hue</text>',
    '<text x="228" y="392" transform="rotate(-4 228 392)">Vo Van Kiet</text>',
    '<text x="118" y="150">Cong vien Tao Dan</text>',
    '<text x="286" y="524" fill="#8FB6CF">Song Sai Gon</text>',
  '</g>',
  '<path d="M117 523 C 148 474, 138 424, 172 382 C 190 358, 196 318, 203 287" ',
       'fill="none" stroke="#FF4D7D" stroke-width="4.5" stroke-linecap="round" ',
       'stroke-dasharray="1 11" opacity=".85"/>',
'</svg>'
].join('');

/* =========================================================
   1 · GHÉP ĐÔI
   ========================================================= */
var SCR_PAIR =
statusbar(true) +
'<div class="screen-body no-pad" style="background:var(--grad-dusk);color:#fff">' +
  '<div style="padding:26px 24px 0;text-align:center">' +
    '<div style="font-size:64px;line-height:1;margin-bottom:6px">💞</div>' +
    '<h1 class="h1" style="font-size:32px;letter-spacing:-1px">Beside</h1>' +
    '<p style="margin:8px 0 0;font-size:14px;opacity:.9;line-height:1.55">' +
      'Ở cạnh nhau, dù đang ở đâu.<br>Ghép đôi để bắt đầu hành trình chung.</p>' +
  '</div>' +

  '<div style="margin:24px 18px 0;background:#fff;color:var(--ink-900);' +
       'border-radius:var(--r-2xl);padding:20px;box-shadow:var(--sh-lg)">' +
    '<p class="eyebrow">Mã ghép đôi của bạn</p>' +
    '<div style="display:flex;gap:8px;margin:12px 0 6px">' +
      ['L','V','7','K','2','9'].map(function (c) {
        return '<div style="flex:1;aspect-ratio:1;border-radius:14px;background:var(--rose-50);' +
               'border:1.5px dashed var(--rose-200);display:flex;align-items:center;' +
               'justify-content:center;font-size:22px;font-weight:800;color:var(--rose-600)">' +
               c + '</div>';
      }).join('') +
    '</div>' +
    '<p class="tiny">Mã có hiệu lực trong 24 giờ · còn 23:47:12</p>' +
    '<div class="row" style="gap:8px;margin-top:14px">' +
      '<button class="btn btn-soft btn-sm grow">📋 Sao chép</button>' +
      '<button class="btn btn-soft btn-sm grow">🔗 Gửi cho người ấy</button>' +
    '</div>' +
  '</div>' +

  '<div style="display:flex;align-items:center;gap:12px;margin:22px 24px 0;opacity:.75">' +
    '<i style="flex:1;height:1px;background:#fff"></i>' +
    '<span style="font-size:12px;font-weight:700">HOẶC</span>' +
    '<i style="flex:1;height:1px;background:#fff"></i>' +
  '</div>' +

  '<div style="margin:18px 18px 0;background:rgba(255,255,255,.16);border-radius:var(--r-2xl);' +
       'padding:18px;backdrop-filter:blur(8px)">' +
    '<label class="label" style="color:#fff">Nhập mã của người ấy</label>' +
    '<input class="input" placeholder="VD: A3F9K1" ' +
           'style="text-align:center;letter-spacing:7px;font-weight:800;font-size:19px;border:0">' +
    '<button class="btn btn-block" data-goto="home" ' +
            'style="margin-top:12px;background:#fff;color:var(--rose-600)">' +
      'Kết đôi ngay 💘</button>' +
  '</div>' +

  '<p style="margin:20px 24px 30px;font-size:11.5px;opacity:.85;text-align:center;line-height:1.6">' +
    'Vị trí của bạn chỉ được chia sẻ với duy nhất một người bạn ghép đôi.<br>' +
    'Bạn có thể tắt chia sẻ bất cứ lúc nào.</p>' +
'</div>';

/* =========================================================
   2 · TRANG CHỦ
   ========================================================= */
var SCR_HOME =
statusbar() +
'<div class="screen-body pb-tab">' +
  '<div class="scr-head">' +
    '<div>' +
      '<p class="tiny" style="margin-bottom:2px">Tối muộn rồi ✨</p>' +
      '<h1 class="h1">Chào An</h1>' +
    '</div>' +
    '<div class="row" style="gap:8px">' +
      '<button class="icon-btn" style="position:relative">🔔' +
        '<i style="position:absolute;top:7px;right:8px;width:8px;height:8px;border-radius:50%;' +
           'background:var(--rose-500);border:2px solid #fff"></i></button>' +
      '<span class="av-ring" data-goto="settings" style="cursor:pointer">' +
        '<span class="av av-40 av-a">A</span></span>' +
    '</div>' +
  '</div>' +

  '<div class="pad stack">' +

    /* --- Bộ đếm ngày yêu --- */
    '<div class="love-hero" data-goto="love" style="cursor:pointer">' +
      '<div class="row between" style="align-items:flex-start">' +
        '<div>' +
          '<p style="margin:0 0 6px;font-size:12px;font-weight:700;opacity:.9;' +
             'letter-spacing:1.2px">CHÚNG MÌNH ĐÃ BÊN NHAU</p>' +
          '<div class="row" style="align-items:baseline;gap:8px">' +
            '<span class="love-num">1.302</span>' +
            '<span style="font-size:16px;font-weight:700;opacity:.92">ngày</span>' +
          '</div>' +
          '<p style="margin:6px 0 0;font-size:12.5px;opacity:.88">Từ 14/02/2023 · 3 năm 6 tháng</p>' +
        '</div>' +
        '<div class="love-faces">' +
          '<span class="av av-48 av-a">A</span><span class="av av-48 av-b">B</span>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:18px">' +
        '<div class="row between" style="font-size:11.5px;font-weight:650;opacity:.92;margin-bottom:6px">' +
          '<span>💍 Còn 63 ngày tới mốc 1.365 ngày</span><span>82%</span></div>' +
        '<div class="progress"><i style="width:82%"></i></div>' +
      '</div>' +
    '</div>' +

    /* --- Thẻ trạng thái đối phương --- */
    '<div class="card tight">' +
      '<div class="row">' +
        '<span class="av-ring"><span class="av av-48 av-b">B</span></span>' +
        '<div class="grow">' +
          '<div class="row" style="gap:6px">' +
            '<b style="font-size:15.5px">Bình</b>' +
            '<span class="pill pill-live"><i class="dot-live"></i>Trực tiếp</span>' +
          '</div>' +
          '<p class="muted" style="margin-top:2px">Đang di chuyển · 34 km/h</p>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<b style="font-size:15px;display:block">4,2 km</b>' +
          '<span class="tiny">≈ 12 phút</span>' +
        '</div>' +
      '</div>' +
      '<div style="height:96px;border-radius:var(--r-md);overflow:hidden;position:relative;' +
           'margin-top:12px;background:#F7F3ED">' +
        '<div class="map-canvas" style="border-radius:var(--r-md)">' + MAP_SVG + '</div>' +
        '<div class="mk" style="left:62%;top:38%">' +
          '<div class="mk-pin av-b" style="width:30px;height:30px;font-size:11px;' +
               'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800">B</div>' +
        '</div>' +
        '<div class="mk" style="left:26%;top:70%">' +
          '<div class="mk-pin av-a" style="width:24px;height:24px;font-size:10px;' +
               'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800">A</div>' +
        '</div>' +
      '</div>' +
      '<div class="row" style="gap:8px;margin-top:12px">' +
        '<button class="btn btn-primary btn-sm grow" data-goto="map">🧭 Xem trên bản đồ</button>' +
        '<button class="btn btn-ghost btn-sm grow">💬 Nhắn Zalo</button>' +
      '</div>' +
      '<p class="tiny" style="margin-top:10px;display:flex;gap:6px;align-items:center">' +
        '🔋 Pin 62% · Cập nhật 8 giây trước</p>' +
    '</div>' +

    /* --- Truy cập nhanh --- */
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">' +
      [['📸','Check-in','var(--rose-50)','checkin'],['🗓️','Hẹn hò','var(--plum-100)','schedule'],
       ['📍','Địa điểm','var(--mint-100)','places'],['💌','Lời yêu','var(--peach-100)','feed']]
       .map(function (q) {
        return '<div data-goto="' + q[3] + '" ' +
               'style="background:#fff;border-radius:var(--r-lg);padding:12px 6px;' +
               'text-align:center;box-shadow:var(--sh-xs);cursor:pointer">' +
               '<div style="width:40px;height:40px;margin:0 auto 6px;border-radius:14px;' +
               'background:' + q[2] + ';display:flex;align-items:center;justify-content:center;' +
               'font-size:19px">' + q[0] + '</div>' +
               '<span style="font-size:11px;font-weight:700">' + q[1] + '</span></div>';
      }).join('') +
    '</div>' +

    /* --- Hôm nay --- */
    '<div>' +
      '<div class="sec"><h3 class="h3">Hôm nay của chúng mình</h3><a href="#">Tất cả</a></div>' +
      '<div class="stack-sm">' +
        '<div class="ev">' +
          '<div class="ev-time"><b>19:30</b><small>2 giờ</small></div>' +
          '<i class="ev-bar" style="background:var(--rose-500)"></i>' +
          '<div class="grow">' +
            '<b style="font-size:14px">Ăn tối kỷ niệm 💕</b>' +
            '<p class="tiny" style="margin-top:3px">📍 Nhà hàng Sen · Quận 1</p>' +
            '<div class="row" style="gap:5px;margin-top:7px">' +
              '<span class="av av-32 av-a" style="width:22px;height:22px;font-size:9px">A</span>' +
              '<span class="av av-32 av-b" style="width:22px;height:22px;font-size:9px">B</span>' +
              '<span class="pill pill-rose">Cả hai</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="ev">' +
          '<div class="ev-time"><b>22:00</b><small>30 phút</small></div>' +
          '<i class="ev-bar" style="background:var(--plum-500)"></i>' +
          '<div class="grow">' +
            '<b style="font-size:14px">Gọi video chúc ngủ ngon</b>' +
            '<p class="tiny" style="margin-top:3px">🔁 Lặp lại mỗi ngày</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    /* --- Kỷ niệm gần đây --- */
    '<div>' +
      '<div class="sec"><h3 class="h3">Kỷ niệm gần đây</h3><a href="#">Xem hết</a></div>' +
      '<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">' +
        [['🌇','Hôm qua','var(--peach-100)'],['🍜','2 ngày trước','var(--rose-100)'],
         ['🎡','Tuần trước','var(--plum-100)'],['🏖️','12/08','var(--sky-100)']]
        .map(function (m) {
          return '<div style="flex:0 0 auto;width:104px">' +
            '<div style="height:104px;border-radius:var(--r-lg);background:' + m[2] + ';' +
            'display:flex;align-items:center;justify-content:center;font-size:38px">' + m[0] + '</div>' +
            '<p class="tiny" style="margin-top:5px;text-align:center">' + m[1] + '</p></div>';
        }).join('') +
      '</div>' +
    '</div>' +

  '</div>' +
'</div>';

/* =========================================================
   3 · BẢN ĐỒ THỜI GIAN THỰC
   ========================================================= */
var SCR_MAP =
statusbar() +
'<div class="screen-body no-pad" style="position:relative">' +
  '<div class="map-canvas">' + MAP_SVG + '</div>' +

  /* vòng tròn geofence "Nhà" */
  '<div class="mk-acc" style="left:26%;top:70%;width:112px;height:112px;' +
       'background:rgba(63,207,166,.12);border-color:rgba(63,207,166,.4)"></div>' +
  /* vòng tròn độ chính xác của Bình */
  '<div class="mk-acc" style="left:52%;top:34%;width:78px;height:78px"></div>' +

  /* Marker Bình (đang di chuyển) */
  '<div class="mk" style="left:52%;top:34%">' +
    '<span class="mk-label">Bình · 34 km/h</span>' +
    '<i class="mk-heading"></i>' +
    '<div class="mk-pin av-b" style="display:flex;align-items:center;justify-content:center;' +
         'color:#fff;font-weight:800;font-size:16px">B</div>' +
  '</div>' +
  /* Marker An */
  '<div class="mk" style="left:26%;top:70%">' +
    '<span class="mk-label">Bạn</span>' +
    '<div class="mk-pin av-a" style="width:38px;height:38px;display:flex;align-items:center;' +
         'justify-content:center;color:#fff;font-weight:800;font-size:14px">A</div>' +
  '</div>' +
  /* Ghim check-in ảnh */
  '<div class="mk" style="left:75%;top:56%">' +
    '<div class="mk-photo">🍜</div></div>' +
  '<div class="mk" style="left:17%;top:30%">' +
    '<div class="mk-photo" style="background:var(--plum-100)">🎡</div></div>' +

  '<div class="map-overlay">' +
    /* Thanh trên cùng */
    '<div style="padding:6px 16px 0">' +
      '<div class="row" style="gap:8px">' +
        '<div class="grow" style="background:rgba(255,255,255,.94);border-radius:var(--r-full);' +
             'padding:11px 16px;box-shadow:var(--sh-sm);display:flex;align-items:center;gap:9px">' +
          '<span style="font-size:15px">🔍</span>' +
          '<span style="font-size:14px;color:var(--ink-400)">Tìm địa điểm...</span></div>' +
        '<button class="icon-btn" style="width:42px;height:42px">⚙️</button>' +
      '</div>' +
      '<div style="display:flex;gap:7px;margin-top:10px">' +
        ['Trực tiếp', 'Hôm nay', '7 ngày'].map(function (t, i) {
          return '<button class="pill ' + (i === 0 ? 'pill-live' : '') + '" ' +
            'style="border:0;cursor:pointer;padding:7px 14px;font-size:12px;' +
            (i === 0 ? '' : 'background:rgba(255,255,255,.94);color:var(--ink-600);' +
              'box-shadow:var(--sh-xs);') + '">' +
            (i === 0 ? '<i class="dot-live"></i>' : '') + t + '</button>';
        }).join('') +
      '</div>' +
    '</div>' +

    /* Nút nổi */
    '<div class="map-fabs">' +
      '<button class="map-fab">🧭</button>' +
      '<button class="map-fab">🗂️</button>' +
      '<button class="map-fab" style="background:var(--grad-mint);color:#03372A">📡</button>' +
    '</div>' +

    /* Bảng kéo lên */
    '<div class="sheet">' +
      '<div class="sheet-grip"></div>' +
      '<div class="row">' +
        '<span class="av-ring"><span class="av av-48 av-b">B</span></span>' +
        '<div class="grow">' +
          '<div class="row" style="gap:6px">' +
            '<b style="font-size:16px">Bình</b>' +
            '<span class="pill pill-live"><i class="dot-live"></i>Trực tiếp</span></div>' +
          '<p class="muted" style="margin-top:2px">Đang trên đường Võ Văn Kiệt</p>' +
        '</div>' +
        '<button class="icon-btn solid">💬</button>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px">' +
        [['Khoảng cách', '4,2 km'], ['Dự kiến tới', '12 phút'], ['Pin', '62%']]
        .map(function (s) {
          return '<div style="background:var(--rose-50);border-radius:var(--r-md);padding:10px 8px;' +
            'text-align:center"><p class="tiny" style="margin-bottom:3px">' + s[0] + '</p>' +
            '<b style="font-size:14.5px">' + s[1] + '</b></div>';
        }).join('') +
      '</div>' +

      '<div class="card flat tight" style="margin-top:12px;background:var(--mint-100);border:0">' +
        '<div class="row" style="gap:10px">' +
          '<span style="font-size:20px">🏡</span>' +
          '<div class="grow"><b style="font-size:13.5px">Bình rời "Công ty" lúc 21:28</b>' +
            '<p class="tiny" style="margin-top:2px">Dự kiến về đến Nhà lúc 21:57</p></div>' +
        '</div>' +
      '</div>' +

      '<div class="row" style="gap:8px;margin-top:12px">' +
        '<button class="btn btn-primary grow">📡 Chia sẻ vị trí trực tiếp</button>' +
        '<button class="icon-btn" style="width:48px;height:48px">👻</button>' +
      '</div>' +
      '<p class="tiny" style="margin-top:9px;text-align:center">' +
        'Chia sẻ trực tiếp chỉ chạy khi app đang mở · tự dừng sau 60 phút</p>' +
    '</div>' +
  '</div>' +
'</div>';

/* =========================================================
   4 · CHECK-IN
   ========================================================= */
var SCR_CHECKIN =
statusbar() +
'<div class="screen-body pb-tab">' +
  '<div class="scr-head">' +
    '<button class="icon-btn" data-goto="home">✕</button>' +
    '<h2 class="h2" style="font-size:17px">Khoảnh khắc mới</h2>' +
    '<button class="btn btn-primary btn-sm" data-goto="feed">Đăng</button>' +
  '</div>' +

  '<div class="pad stack">' +
    '<div style="border-radius:var(--r-2xl);overflow:hidden;position:relative;' +
         'background:linear-gradient(160deg,#FFD9A8,#FF9EB5 60%,#B08BFF);height:300px;' +
         'display:flex;align-items:center;justify-content:center;box-shadow:var(--sh-md)">' +
      '<span style="font-size:96px">🌇</span>' +
      '<div style="position:absolute;left:12px;bottom:12px;display:flex;gap:7px">' +
        '<button class="pill" style="background:rgba(0,0,0,.45);color:#fff;border:0">🔄 Đổi ảnh</button>' +
        '<button class="pill" style="background:rgba(0,0,0,.45);color:#fff;border:0">✨ Bộ lọc</button>' +
      '</div>' +
      '<span class="pill" style="position:absolute;right:12px;top:12px;' +
             'background:rgba(0,0,0,.45);color:#fff">1 / 3</span>' +
    '</div>' +

    '<div class="card tight">' +
      '<textarea class="input" rows="3" placeholder="Kể cho người ấy nghe điều gì đó..." ' +
        'style="min-height:76px;padding:12px 14px;border:0;resize:none;line-height:1.5"' +
        '>Hoàng hôn Thủ Thiêm hôm nay đẹp quá, ước gì có em ở đây 🥺</textarea>' +
    '</div>' +

    '<div>' +
      '<label class="label">Tâm trạng</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        [['🥰', 1], ['😌', 0], ['🤩', 0], ['😢', 0], ['😴', 0], ['🔥', 0]].map(function (m) {
          return '<button style="width:48px;height:48px;border-radius:16px;font-size:22px;cursor:pointer;' +
            'border:1.5px solid ' + (m[1] ? 'var(--rose-400)' : 'var(--ink-200)') + ';' +
            'background:' + (m[1] ? 'var(--rose-50)' : '#fff') + '">' + m[0] + '</button>';
        }).join('') +
      '</div>' +
    '</div>' +

    '<div class="card tight">' +
      '<div class="lrow" style="padding-top:0">' +
        '<span class="lico">📍</span>' +
        '<div class="grow"><b style="font-size:14px">Cầu Thủ Thiêm 2</b>' +
          '<p class="tiny" style="margin-top:2px">Thủ Đức, TP.HCM · độ chính xác 8m</p></div>' +
        '<span class="chev">›</span>' +
      '</div>' +
      '<div class="lrow">' +
        '<span class="lico" style="background:var(--plum-100)">🗺️</span>' +
        '<div class="grow"><b style="font-size:14px">Ghim lên bản đồ chung</b>' +
          '<p class="tiny" style="margin-top:2px">Người ấy sẽ thấy ảnh này tại vị trí trên</p></div>' +
        '<span class="sw on"></span>' +
      '</div>' +
      '<div class="lrow" style="padding-bottom:0">' +
        '<span class="lico" style="background:var(--peach-100)">🔔</span>' +
        '<div class="grow"><b style="font-size:14px">Báo cho Bình ngay</b>' +
          '<p class="tiny" style="margin-top:2px">Gửi thông báo đẩy</p></div>' +
        '<span class="sw on"></span>' +
      '</div>' +
    '</div>' +

    '<div class="card tight" style="background:var(--rose-50);border:0;box-shadow:none">' +
      '<p class="tiny" style="line-height:1.6;color:var(--ink-600)">' +
        '🔒 Ảnh sẽ được nén và <b>xoá toàn bộ dữ liệu EXIF</b> trước khi lưu. ' +
        'Toạ độ chỉ được ghi khi bạn bật "Ghim lên bản đồ".</p>' +
    '</div>' +
  '</div>' +
'</div>';

/* =========================================================
   5 · DÒNG KỶ NIỆM
   ========================================================= */
function post(o) {
  return '<div class="post">' +
    '<div class="post-img" style="background:' + o.bg + '">' + o.emoji + '</div>' +
    '<div class="post-body">' +
      '<div class="row" style="gap:9px">' +
        '<span class="av av-32 ' + o.av + '">' + o.who + '</span>' +
        '<div class="grow"><b style="font-size:13.5px">' + o.name + '</b>' +
          '<p class="tiny" style="margin-top:1px">' + o.meta + '</p></div>' +
        '<span style="font-size:20px">' + o.mood + '</span>' +
      '</div>' +
      '<p style="margin:10px 0 0;font-size:14px;line-height:1.55">' + o.text + '</p>' +
      '<div class="react">' +
        '<span class="on">❤️</span><span>😍</span><span>🥺</span><span>🔥</span>' +
        '<span style="width:auto;padding:0 12px;font-size:12px;font-weight:700;' +
              'color:var(--ink-500)">💬 3</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

var SCR_FEED =
statusbar() +
'<div class="screen-body pb-tab">' +
  '<div class="scr-head">' +
    '<div><p class="eyebrow">1.302 ngày · 248 khoảnh khắc</p>' +
      '<h1 class="h1">Kỷ niệm</h1></div>' +
    '<button class="icon-btn solid" data-goto="checkin">＋</button>' +
  '</div>' +

  '<div style="display:flex;gap:7px;overflow-x:auto;padding:0 20px 14px">' +
    ['Tất cả', 'Của An', 'Của Bình', 'Có ghim 📍', 'Yêu thích ❤️'].map(function (t, i) {
      return '<button class="pill ' + (i === 0 ? 'pill-rose' : 'pill-grey') + '" ' +
        'style="border:0;cursor:pointer;flex:0 0 auto;padding:7px 14px;font-size:12px">' +
        t + '</button>';
    }).join('') +
  '</div>' +

  '<div class="pad stack">' +
    '<p class="eyebrow" style="color:var(--ink-400)">HÔM NAY</p>' +
    post({
      emoji: '🌇', bg: 'linear-gradient(160deg,#FFD9A8,#FF9EB5 60%,#B08BFF)',
      av: 'av-a', who: 'A', name: 'An', mood: '🥰',
      meta: '18:42 · 📍 Cầu Thủ Thiêm 2',
      text: 'Hoàng hôn Thủ Thiêm hôm nay đẹp quá, ước gì có em ở đây 🥺'
    }) +
    post({
      emoji: '☕', bg: 'linear-gradient(160deg,#FFE7C7,#E9C9A6)',
      av: 'av-b', who: 'B', name: 'Bình', mood: '😌',
      meta: '08:15 · 📍 The Coffee House Lê Lợi',
      text: 'Cà phê sáng nghĩ về em. Chiều nay tan làm sớm nha ☺️'
    }) +

    '<p class="eyebrow" style="color:var(--ink-400);margin-top:6px">HÔM QUA</p>' +
    post({
      emoji: '🍜', bg: 'linear-gradient(160deg,#FFCFCF,#FF9EB5)',
      av: 'av-b', who: 'B', name: 'Bình', mood: '🤩',
      meta: '19:20 · 📍 Bún bò Bà Tám',
      text: 'Quán ruột của hai đứa, lần thứ 37 rồi đó nha 🍲'
    }) +
  '</div>' +
'</div>';

/* =========================================================
   6 · LỊCH TRÌNH
   ========================================================= */
var SCR_SCHEDULE =
statusbar() +
'<div class="screen-body pb-tab">' +
  '<div class="scr-head">' +
    '<div><p class="eyebrow">Tháng 9, 2026</p><h1 class="h1">Lịch chung</h1></div>' +
    '<div class="row" style="gap:8px">' +
      '<button class="icon-btn">📅</button>' +
      '<button class="icon-btn solid">＋</button>' +
    '</div>' +
  '</div>' +

  '<div class="pad">' +
    '<div class="week">' +
      [['T2', 1, 0], ['T3', 2, 1], ['T4', 3, 0], ['T5', 4, 1], ['T6', 5, 1],
       ['T7', 6, 0], ['CN', 7, 1]].map(function (d, i) {
        return '<div class="wday' + (i === 0 ? ' on' : '') + '">' +
          '<small>' + d[0] + '</small><b>' + d[1] + '</b>' +
          (d[2] ? '<i class="wdot"></i>' : '<i class="wdot" style="opacity:0"></i>') + '</div>';
      }).join('') +
    '</div>' +

    '<div class="sec"><h3 class="h3">Thứ Hai, 07/09</h3>' +
      '<a href="#">3 sự kiện</a></div>' +

    '<div class="stack-sm">' +
      '<div class="ev past">' +
        '<div class="ev-time"><b>09:00</b><small>1 giờ</small></div>' +
        '<i class="ev-bar" style="background:var(--sky-400)"></i>' +
        '<div class="grow"><b style="font-size:14px">Bình họp dự án</b>' +
          '<p class="tiny" style="margin-top:3px">📍 Công ty · Riêng tư 🔒</p></div>' +
        '<span style="font-size:15px;color:var(--mint-400)">✓</span>' +
      '</div>' +

      '<div class="ev" style="box-shadow:var(--sh-md);border:1.5px solid var(--rose-200)">' +
        '<div class="ev-time"><b>19:30</b><small>2 giờ</small></div>' +
        '<i class="ev-bar" style="background:var(--rose-500)"></i>' +
        '<div class="grow">' +
          '<div class="row" style="gap:6px"><b style="font-size:14px">Ăn tối kỷ niệm 💕</b>' +
            '<span class="pill pill-rose">Sắp tới</span></div>' +
          '<p class="tiny" style="margin-top:3px">📍 Nhà hàng Sen · Quận 1</p>' +
          '<div class="row" style="gap:5px;margin-top:8px">' +
            '<span class="av av-a" style="width:22px;height:22px;font-size:9px">A</span>' +
            '<span class="av av-b" style="width:22px;height:22px;font-size:9px">B</span>' +
            '<span class="tiny" style="margin-left:4px">Nhắc trước 60 phút</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="ev">' +
        '<div class="ev-time"><b>22:00</b><small>30 phút</small></div>' +
        '<i class="ev-bar" style="background:var(--plum-500)"></i>' +
        '<div class="grow"><b style="font-size:14px">Gọi video chúc ngủ ngon</b>' +
          '<p class="tiny" style="margin-top:3px">🔁 Lặp lại mỗi ngày</p></div>' +
      '</div>' +
    '</div>' +

    '<div class="sec"><h3 class="h3">Sắp tới</h3><a href="#">Xem hết</a></div>' +
    '<div class="tl">' +
      [['12/09', 'Xem phim "Về nhà" 🎬', 'CGV Vincom · 20:00'],
       ['20/09', 'Đi Đà Lạt 3 ngày 2 đêm 🏔️', 'Cả ngày · 20–22/09'],
       ['09/11', 'Sinh nhật Bình 🎂', 'Cả ngày · còn 63 ngày']]
      .map(function (e) {
        return '<div class="tl-item"><p class="tiny" style="font-weight:700;' +
          'color:var(--rose-500)">' + e[0] + '</p>' +
          '<b style="font-size:14px;display:block;margin-top:2px">' + e[1] + '</b>' +
          '<p class="tiny" style="margin-top:2px">' + e[2] + '</p></div>';
      }).join('') +
    '</div>' +
  '</div>' +
'</div>';

/* =========================================================
   7 · ĐẾM NGÀY YÊU
   ========================================================= */
var SCR_LOVE =
statusbar() +
'<div class="screen-body pb-tab">' +
  '<div class="scr-head">' +
    '<h1 class="h1">Chuyện của mình</h1>' +
    '<button class="icon-btn">✏️</button>' +
  '</div>' +

  '<div class="pad stack">' +
    '<div class="love-hero" style="text-align:center;padding-top:26px">' +
      '<div class="love-faces" style="justify-content:center;margin-bottom:14px">' +
        '<span class="av av-56 av-a">A</span><span class="av av-56 av-b">B</span></div>' +
      '<p style="margin:0;font-size:12px;font-weight:700;opacity:.9;letter-spacing:1.2px">' +
        'AN ❤ BÌNH · TỪ 14/02/2023</p>' +
      '<div class="love-num" style="margin:10px 0 2px">1.302</div>' +
      '<p style="margin:0;font-size:14px;font-weight:600;opacity:.95">ngày bên nhau</p>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px">' +
        [['3', 'năm'], ['6', 'tháng'], ['22', 'ngày']].map(function (u) {
          return '<div style="background:rgba(255,255,255,.2);border-radius:var(--r-md);padding:9px 0">' +
            '<b style="font-size:20px;display:block">' + u[0] + '</b>' +
            '<small style="font-size:11px;opacity:.9">' + u[1] + '</small></div>';
        }).join('') +
      '</div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="row between">' +
        '<div><p class="eyebrow">Mốc kế tiếp</p>' +
          '<b style="font-size:17px;display:block;margin-top:4px">1.365 ngày 🎊</b>' +
          '<p class="tiny" style="margin-top:2px">Nhằm ngày 09/11/2026</p></div>' +
        '<div style="text-align:right"><b style="font-size:26px;color:var(--rose-500);' +
          'display:block;line-height:1">63</b><span class="tiny">ngày nữa</span></div>' +
      '</div>' +
      '<div class="progress" style="background:var(--ink-100);margin-top:14px">' +
        '<i style="width:82%;background:var(--grad-love)"></i></div>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">' +
      [['📸', '248', 'khoảnh khắc'], ['🚶', '1.847', 'km cùng nhau'], ['📍', '92', 'nơi đã tới']]
      .map(function (s) {
        return '<div class="card tight" style="text-align:center;padding:14px 6px">' +
          '<div style="font-size:22px">' + s[0] + '</div>' +
          '<b style="font-size:18px;display:block;margin-top:4px">' + s[1] + '</b>' +
          '<span class="tiny">' + s[2] + '</span></div>';
      }).join('') +
    '</div>' +

    '<div class="card">' +
      '<div class="sec" style="margin:0 0 4px"><h3 class="h3">Cột mốc</h3>' +
        '<a href="#">＋ Thêm</a></div>' +
      [['🎂', 'Sinh nhật Bình', '09/11/2026 · còn 63 ngày', 'var(--peach-100)', 0],
       ['🎊', '1.365 ngày bên nhau', '09/11/2026 · còn 63 ngày', 'var(--rose-100)', 0],
       ['💐', 'Kỷ niệm 4 năm', '14/02/2027 · còn 160 ngày', 'var(--plum-100)', 0],
       ['🏆', '1.000 ngày bên nhau', '10/11/2025 · đã qua', 'var(--ink-100)', 1]]
      .map(function (m) {
        return '<div class="mstone" ' + (m[4] ? 'style="opacity:.5"' : '') + '>' +
          '<span class="mstone-badge" style="background:' + m[3] + '">' + m[0] + '</span>' +
          '<div class="grow"><b style="font-size:14px">' + m[1] + '</b>' +
          '<p class="tiny" style="margin-top:2px">' + m[2] + '</p></div>' +
          (m[4] ? '<span style="font-size:16px">✓</span>' : '<span class="chev">›</span>') +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>' +
'</div>';

/* =========================================================
   8 · ĐỊA ĐIỂM & GEOFENCE
   ========================================================= */
var SCR_PLACES =
statusbar() +
'<div class="screen-body pb-tab">' +
  '<div class="scr-head">' +
    '<div><p class="eyebrow">4 địa điểm đã lưu</p><h1 class="h1">Địa điểm</h1></div>' +
    '<button class="icon-btn solid">＋</button>' +
  '</div>' +

  '<div class="pad stack">' +
    '<div class="card tight" style="background:var(--mint-100);border:0;box-shadow:none">' +
      '<div class="row" style="gap:10px">' +
        '<span style="font-size:22px">🔔</span>' +
        '<p class="tiny" style="line-height:1.55;color:var(--ink-700)">' +
          'Khi người ấy <b>đến</b> hoặc <b>rời</b> một địa điểm, bạn sẽ nhận thông báo tự động. ' +
          'Việc kiểm tra chạy ở server nên <b>không tốn pin</b> máy.</p>' +
      '</div>' +
    '</div>' +

    [['🏡', 'Nhà An', 'Quận 1 · bán kính 150m', 'var(--rose-100)', 'Bình đang ở đây', 1, 1],
     ['🏢', 'Công ty Bình', 'Quận 3 · bán kính 200m', 'var(--sky-100)', 'Rời lúc 21:28', 1, 0],
     ['🍜', 'Bún bò Bà Tám', 'Quận 1 · bán kính 80m', 'var(--peach-100)', 'Đã ghé 37 lần', 0, 0],
     ['🎡', 'Đầm Sen', 'Quận 11 · bán kính 300m', 'var(--plum-100)', 'Lần cuối 12/08', 0, 0]]
    .map(function (p) {
      return '<div class="card tight">' +
        '<div class="row">' +
          '<span class="lico" style="background:' + p[3] + ';width:46px;height:46px;font-size:21px">' +
            p[0] + '</span>' +
          '<div class="grow"><b style="font-size:15px">' + p[1] + '</b>' +
            '<p class="tiny" style="margin-top:2px">' + p[2] + '</p></div>' +
          (p[6] ? '<span class="pill pill-mint">Đang ở đây</span>' : '<span class="chev">›</span>') +
        '</div>' +
        '<div style="height:64px;border-radius:var(--r-md);overflow:hidden;position:relative;' +
             'margin-top:11px;background:#F7F3ED">' +
          '<div class="map-canvas" style="border-radius:var(--r-md)">' + MAP_SVG + '</div>' +
          '<div class="mk-acc" style="left:50%;top:50%;width:52px;height:52px;' +
               'background:rgba(63,207,166,.16);border-color:rgba(63,207,166,.45)"></div>' +
          '<div class="mk" style="left:50%;top:50%;font-size:17px">' + p[0] + '</div>' +
        '</div>' +
        '<div class="row between" style="margin-top:11px">' +
          '<span class="tiny">' + p[4] + '</span>' +
          '<div class="row" style="gap:7px">' +
            '<span class="tiny">Báo khi đến</span>' +
            '<span class="sw' + (p[5] ? ' on' : '') + '"></span></div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>' +
'</div>';

/* =========================================================
   9 · CÀI ĐẶT & QUYỀN RIÊNG TƯ
   ========================================================= */
function srow(ico, bg, title, sub, right) {
  return '<div class="lrow">' +
    '<span class="lico" style="background:' + bg + '">' + ico + '</span>' +
    '<div class="grow"><b style="font-size:14px">' + title + '</b>' +
      (sub ? '<p class="tiny" style="margin-top:2px">' + sub + '</p>' : '') + '</div>' +
    right + '</div>';
}

var SCR_SETTINGS =
statusbar() +
'<div class="screen-body pb-tab">' +
  '<div class="scr-head"><h1 class="h1">Cài đặt</h1>' +
    '<button class="icon-btn">❓</button></div>' +

  '<div class="pad stack">' +
    '<div class="card">' +
      '<div class="row">' +
        '<span class="av-ring"><span class="av av-56 av-a">A</span></span>' +
        '<div class="grow"><b style="font-size:16px">Nguyễn An</b>' +
          '<p class="tiny" style="margin-top:2px">an@example.com · Sinh 12/05</p></div>' +
        '<button class="btn btn-ghost btn-sm">Sửa</button>' +
      '</div>' +
      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--ink-100)" class="row">' +
        '<span class="av av-40 av-b">B</span>' +
        '<div class="grow"><b style="font-size:14px">Đã ghép đôi với Bình</b>' +
          '<p class="tiny" style="margin-top:2px">Từ 14/02/2023 · mã LV7K29</p></div>' +
        '<span class="pill pill-rose">💞 Đang ghép</span>' +
      '</div>' +
    '</div>' +

    '<div>' +
      '<div class="sec"><h3 class="h3">🔒 Quyền riêng tư</h3></div>' +
      '<div class="card" style="padding-top:4px;padding-bottom:4px">' +
        srow('👻', 'var(--ink-100)', 'Chế độ ẩn danh',
             'Tạm dừng chia sẻ vị trí. Server sẽ không ghi lại toạ độ.',
             '<span class="sw"></span>') +
        srow('📡', 'var(--mint-100)', 'Chia sẻ vị trí trực tiếp',
             'Chỉ hoạt động khi app đang mở', '<span class="sw on"></span>') +
        srow('🎯', 'var(--sky-100)', 'Làm mờ vị trí',
             'Hiển thị trong bán kính 500m thay vì chính xác', '<span class="sw"></span>') +
        srow('🗑️', 'var(--rose-50)', 'Lưu lịch sử vị trí',
             '7 ngày chi tiết, 90 ngày rút gọn', '<span class="chev">›</span>') +
      '</div>' +
    '</div>' +

    '<div>' +
      '<div class="sec"><h3 class="h3">🔔 Thông báo</h3></div>' +
      '<div class="card" style="padding-top:4px;padding-bottom:4px">' +
        srow('🏡', 'var(--mint-100)', 'Khi người ấy đến / rời địa điểm', '',
             '<span class="sw on"></span>') +
        srow('📸', 'var(--rose-100)', 'Khi có check-in mới', '', '<span class="sw on"></span>') +
        srow('🎊', 'var(--plum-100)', 'Nhắc mốc kỷ niệm', 'Trước 7 ngày và đúng ngày',
             '<span class="sw on"></span>') +
        srow('🪫', 'var(--peach-100)', 'Khi pin người ấy dưới 15%', '', '<span class="sw"></span>') +
      '</div>' +
    '</div>' +

    '<div>' +
      '<div class="sec"><h3 class="h3">📱 Ứng dụng</h3></div>' +
      '<div class="card" style="padding-top:4px;padding-bottom:4px">' +
        srow('⬇️', 'var(--rose-50)', 'Cài lên màn hình chính',
             'iPhone: Safari → Chia sẻ → Thêm vào MH chính', '<span class="chev">›</span>') +
        srow('💬', 'var(--sky-100)', 'Ứng dụng nhắn tin',
             'Nút "Nhắn tin" sẽ mở app này', '<span class="pill pill-grey">Zalo ›</span>') +
        srow('🌓', 'var(--ink-100)', 'Giao diện', 'Theo hệ thống', '<span class="chev">›</span>') +
        srow('💾', 'var(--sky-100)', 'Tải toàn bộ dữ liệu của tôi', '', '<span class="chev">›</span>') +
        srow('💔', 'var(--rose-50)', 'Huỷ ghép đôi', 'Xoá toàn bộ dữ liệu chung',
             '<span class="chev">›</span>') +
      '</div>' +
    '</div>' +

    '<p class="tiny" style="text-align:center;padding:6px 0 10px">Beside v0.1.0 · Phase 0 Mockup</p>' +
  '</div>' +
'</div>';

/* =========================================================
   Đăng ký danh sách màn hình
   ========================================================= */
var SCREENS = [
  { id: 'pair', tab: null, icon: '💞', label: 'Ghép đôi',
    name: 'Ghép đôi (Onboarding)',
    desc: 'Sinh mã 6 ký tự hoặc nhập mã của người ấy. Nêu rõ cam kết riêng tư ngay từ màn đầu.',
    html: SCR_PAIR },

  { id: 'home', tab: 'Nhà', icon: '🏠', label: 'Trang chủ',
    name: 'Trang chủ',
    desc: 'Bộ đếm ngày yêu + trạng thái người ấy (đang di chuyển, khoảng cách, ETA, pin) + lịch hôm nay.',
    html: SCR_HOME },

  { id: 'map', tab: 'Bản đồ', icon: '🗺️', label: 'Bản đồ',
    name: 'Bản đồ thời gian thực',
    desc: 'MapLibre GL + tile OpenFreeMap. Vệt đường đi, vòng độ chính xác, ghim ảnh check-in, geofence.',
    html: SCR_MAP },

  { id: 'checkin', tab: null, icon: '📸', label: 'Check-in',
    name: 'Tạo check-in',
    desc: 'Ảnh + caption + tâm trạng + vị trí. Xoá EXIF trước khi lưu, toạ độ chỉ ghi khi bật ghim.',
    html: SCR_CHECKIN },

  { id: 'feed', tab: 'Kỷ niệm', icon: '💖', label: 'Kỷ niệm',
    name: 'Dòng kỷ niệm',
    desc: 'Timeline chung, lọc theo người / có ghim / yêu thích. Thả cảm xúc nhanh.',
    html: SCR_FEED },

  { id: 'schedule', tab: 'Lịch', icon: '🗓️', label: 'Lịch',
    name: 'Lịch trình chung',
    desc: 'Dải tuần, sự kiện trong ngày (màu theo người), sự kiện riêng tư, timeline kế hoạch sắp tới.',
    html: SCR_SCHEDULE },

  { id: 'love', tab: null, icon: '💕', label: 'Ngày yêu',
    name: 'Đếm ngày yêu & cột mốc',
    desc: 'Số ngày bên nhau, đếm ngược mốc kế tiếp, thống kê hành trình, danh sách cột mốc.',
    html: SCR_LOVE },

  { id: 'places', tab: null, icon: '📍', label: 'Địa điểm',
    name: 'Địa điểm & Geofence',
    desc: 'Địa điểm đã lưu kèm bán kính. Thông báo đến/rời được xử lý ở server (không tốn pin).',
    html: SCR_PLACES },

  { id: 'settings', tab: null, icon: '⚙️', label: 'Cài đặt',
    name: 'Cài đặt & Quyền riêng tư',
    desc: 'Ẩn danh, làm mờ vị trí, hạn lưu lịch sử, thông báo, hướng dẫn cài PWA lên màn hình chính.',
    html: SCR_SETTINGS }
];

/* ---------- Thanh tab dưới cùng (5 khe) ----------
   Nhà · Bản đồ · [Check-in] · Lịch · Kỷ niệm
   "Ngày yêu", "Địa điểm", "Cài đặt" là màn con, vào từ Trang chủ / avatar.  */
var TABS = [
  { id: 'home',     icon: '🏠', label: 'Nhà' },
  { id: 'map',      icon: '🗺️', label: 'Bản đồ' },
  { id: 'checkin',  icon: '＋', label: '', fab: true },
  { id: 'schedule', icon: '🗓️', label: 'Lịch' },
  { id: 'feed',     icon: '💖', label: 'Kỷ niệm' }
];

function tabbarHTML(activeId) {
  return '<nav class="tabbar">' + TABS.map(function (t) {
    if (t.fab) {
      return '<button class="tab" data-goto="' + t.id + '">' +
             '<span class="tab-fab">' + t.icon + '</span></button>';
    }
    return '<button class="tab' + (t.id === activeId ? ' active' : '') + '" ' +
           'data-goto="' + t.id + '"><span class="ti">' + t.icon + '</span>' +
           '<span>' + t.label + '</span></button>';
  }).join('') + '</nav>';
}

/* Màn hình nào hiển thị thanh tab */
var SCREENS_WITH_TAB = ['home', 'map', 'schedule', 'feed', 'love', 'places', 'settings'];

function screenById(id) {
  for (var i = 0; i < SCREENS.length; i++) if (SCREENS[i].id === id) return SCREENS[i];
  return SCREENS[0];
}

/* Dựng nội dung 1 khung điện thoại hoàn chỉnh */
function renderPhone(screen) {
  var showTab = SCREENS_WITH_TAB.indexOf(screen.id) !== -1;
  return '<div class="dynamic-island"></div>' + screen.html +
         (showTab ? tabbarHTML(screen.id) : '');
}
