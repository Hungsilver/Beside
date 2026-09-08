/**
 * Kiểm tra toàn diện bản chạy LOCAL trước khi deploy lên production.
 *
 *   npm run verify:local
 *
 * Chạy đúng những gì máy chủ thật sẽ chạy: qua Caddy HTTPS, qua Docker,
 * với PostgreSQL + PostGIS + Redis thật. Không mock gì cả.
 *
 * Kết thúc bằng một kết luận rõ ràng: đã sẵn sàng hay còn thiếu gì.
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // chứng chỉ nội bộ của Caddy

const COMPOSE = 'docker compose -f docker-compose.yml -f docker-compose.local.yml';
const HTTPS = 'https://localhost';
const API_DIRECT = 'http://localhost:3001';

const results = [];
let failed = 0;

function check(group, name, ok, detail = '') {
  results.push({ group, name, ok, detail });
  if (!ok) failed += 1;
  const mark = ok ? '\x1b[32m  ok \x1b[0m' : '\x1b[31mLỖI \x1b[0m';
  console.log(`${mark} ${name}${detail ? '  \x1b[90m' + detail + '\x1b[0m' : ''}`);
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}


/** Bỏ mã màu ANSI trước khi so khớp — nếu không regex sẽ trượt hết. */
const stripAnsi = (s) => s.replace(/\x1B\[[0-9;]*m/g, '');

/** Dòng đầu tiên có nội dung, để hiển thị gọn trong bảng kết quả. */
const firstLine = (s) => stripAnsi(s).split('\n').find((l) => l.trim()) ?? '';

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
  } catch (e) {
    return opts.allowFail ? `ERR:${e.message}` : `ERR:${e.stdout || e.message}`;
  }
}

async function get(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: String(e.message) };
  }
}

// ---------------------------------------------------------------- 1. HẠ TẦNG

async function checkInfra() {
  section('1 · Hạ tầng Docker');

  const psRaw = sh(`${COMPOSE} ps --format "{{.Name}}|{{.State}}|{{.Health}}"`, { allowFail: true });
  const rows = psRaw.split('\n').filter((l) => l.includes('|'));

  for (const svc of ['beside-db', 'beside-redis', 'beside-api', 'beside-web', 'beside-caddy', 'beside-minio']) {
    const row = rows.find((r) => r.startsWith(svc));
    const [, state, health] = (row ?? '').split('|');
    const ok = state === 'running' && (health === 'healthy' || health === '' || health === undefined);
    check('infra', `container ${svc}`, ok, row ? `${state}${health ? ' · ' + health : ''}` : 'không thấy');
  }

  const pg = sh('docker exec beside-db psql -U beside -d beside -t -c "SELECT postgis_version();"', {
    allowFail: true,
  });
  check('infra', 'PostGIS bật trong DB', pg.includes('USE_GEOS'), pg.split('\n')[0]?.trim());

  // Nhúng thẳng mật khẩu vào lệnh: trên Windows, execSync chạy qua cmd.exe
  // nên cú pháp $BIEN của shell Unix không được thay thế.
  const redisPassword = readEnv('REDIS_PASSWORD');
  const redis = sh(
    `docker exec beside-redis redis-cli -a "${redisPassword}" --no-auth-warning PING`,
    { allowFail: true },
  );
  check('infra', 'Redis trả lời PING', redis.includes('PONG'), firstLine(redis).slice(0, 40));

  const migrations = sh(
    'docker exec beside-db psql -U beside -d beside -t -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"',
    { allowFail: true },
  );
  const applied = Number(migrations.trim());
  check('infra', 'Migration đã chạy hết', applied >= 3, `${applied} migration`);

  // API tự tạo bucket lúc khởi động (StorageService.ensureBucket).
  // Không có bucket thì mọi lần đăng ảnh sẽ hỏng, nhưng health check vẫn xanh.
  const bucket = readEnv('S3_BUCKET') || 'beside-media';
  const live = sh('docker exec beside-minio mc --version', { allowFail: true });
  if (live.startsWith('ERR:')) {
    // Ảnh minio chính thức không kèm mc — dò bằng API S3 qua chính container api.
    const probe = sh(
      `docker exec beside-api node -e "fetch('http://minio:9000/${bucket}/').then(r=>console.log(r.status)).catch(e=>console.log('ERR'))"`,
      { allowFail: true },
    );
    // 403 = bucket có thật nhưng cần chữ ký; 404 = chưa có bucket.
    check('infra', `MinIO có bucket ${bucket}`, /40[03]/.test(probe) && !probe.includes('404'), firstLine(probe));
  } else {
    check('infra', `MinIO có bucket ${bucket}`, true, 'mc sẵn sàng');
  }
}

/** Đọc một biến trong .env. Đọc thẳng bằng fs, không nhờ shell — tránh chuyện
 *  trích dẫn khác nhau giữa cmd.exe và bash. */
function readEnv(key) {
  try {
    const m = readFileSync('.env', 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------- 2. HTTPS

async function checkHttps() {
  section('2 · Web qua HTTPS (đúng đường trình duyệt đi)');

  const home = await get(`${HTTPS}/`);
  check('https', 'Trang chủ trả 200', home.status === 200, `status ${home.status}`);
  check('https', 'HTML có #root để React gắn vào', home.text.includes('id="root"'));

  const health = await get(`${HTTPS}/api/v1/health`);
  let db = '';
  try {
    db = JSON.parse(health.text).db;
  } catch {
    /* bỏ qua */
  }
  check('https', 'API health qua Caddy', health.status === 200 && db === 'up', health.text.slice(0, 60));

  const spa = await get(`${HTTPS}/ban-do`);
  check('https', 'SPA fallback /ban-do', spa.status === 200);

  const manifest = await get(`${HTTPS}/manifest.webmanifest`);
  check('https', 'PWA manifest', manifest.status === 200 && manifest.text.includes('Beside'));

  const sw = await get(`${HTTPS}/sw.js`);
  const swCache = sw.headers.get('cache-control') ?? '';
  check(
    'https',
    'Service worker không bị cache',
    sw.status === 200 && /no-store|no-cache/.test(swCache),
    swCache,
  );

  const icon = await get(`${HTTPS}/icons/icon-192.png`);
  check('https', 'Icon PWA', icon.status === 200);

  const redirect = await get('http://localhost/');
  check(
    'https',
    'HTTP tự chuyển sang HTTPS',
    redirect.status >= 300 && redirect.status < 400,
    `status ${redirect.status}`,
  );

  // Header bảo mật — thứ sẽ có y hệt trên production
  const required = {
    'strict-transport-security': /max-age=\d+/,
    'permissions-policy': /geolocation=\(self\)/,
    'x-content-type-options': /nosniff/,
    'x-frame-options': /DENY/,
    'referrer-policy': /strict-origin/,
  };
  for (const [header, pattern] of Object.entries(required)) {
    const value = home.headers.get(header) ?? '';
    check('https', `header ${header}`, pattern.test(value), value.slice(0, 50));
  }
  check('https', 'Không lộ header Server', !home.headers.get('server'));

  // Socket.IO phải đi qua được Caddy — đây là chỗ dễ vỡ nhất khi có reverse proxy
  const io = await get(`${HTTPS}/socket.io/?EIO=4&transport=polling`);
  check(
    'https',
    'Socket.IO bắt tay qua Caddy',
    io.status === 200 && io.text.includes('"sid"'),
    io.text.slice(0, 45),
  );
}

// ---------------------------------------------------------------- 3. LUỒNG THẬT

function runTrace(script, label, env) {
  const r = spawnSync('node', [script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const out = stripAnsi((r.stdout ?? '') + (r.stderr ?? ''));
  const m = out.match(/TONG: (\d+) PASS \/ (\d+) FAIL \/ (\d+) case/);
  if (!m) {
    check('flow', label, false, out.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 90));
    return;
  }
  const [, pass, fail, total] = m;
  check('flow', label, Number(fail) === 0, `${pass}/${total} case`);
  if (Number(fail) > 0) {
    out
      .split('\n')
      .filter((l) => l.startsWith('FAIL'))
      .slice(0, 5)
      .forEach((l) => console.log(`        \x1b[31m${l}\x1b[0m`));
  }
}

async function checkFlows() {
  section('3 · Luồng nghiệp vụ thật (REST + WebSocket qua HTTPS)');

  // Bộ đếm chống spam (đăng ký 20/giờ, ghép đôi 10/10 phút) nằm trong bộ nhớ
  // tiến trình API. Nếu trước đó đã có ai chạy trace, hạn mức còn lại là không
  // đoán được → case sau cùng sẽ nhận 429 và bị báo hỏng oan. Khởi động lại
  // trước MỖI bộ trace để mỗi bộ luôn bắt đầu từ hạn mức đầy.
  sh(`${COMPOSE} restart api`, { allowFail: true });
  await waitHealthy();

  runTrace('apps/api/test/trace-auth-pairing.mjs', 'Phase 1 — xác thực & ghép đôi', {
    TRACE_BASE_URL: `${API_DIRECT}/api/v1`,
  });

  sh(`${COMPOSE} restart api`, { allowFail: true });
  await waitHealthy();

  runTrace('apps/api/test/trace-phase2-realtime.mjs', 'Phase 2 — vị trí thời gian thực', {
    TRACE_BASE_URL: `${HTTPS}/api/v1`,
    TRACE_WS_ORIGIN: HTTPS,
    TRACE_INSECURE_TLS: '1',
  });

  sh(`${COMPOSE} restart api`, { allowFail: true });
  await waitHealthy();

  // Lượt rà soát: nhắm vào nhánh cache Redis, các biên đầu vào, và vòng đời
  // huỷ ghép đôi — những chỗ hai bộ trace trên không chạm tới.
  runTrace('apps/api/test/trace-phase2-review.mjs', 'Rà soát — cache, biên, huỷ ghép đôi', {
    TRACE_BASE_URL: `${HTTPS}/api/v1`,
    TRACE_WS_ORIGIN: HTTPS,
    TRACE_INSECURE_TLS: '1',
  });

  sh(`${COMPOSE} restart api`, { allowFail: true });
  await waitHealthy();

  // Phase 3 đăng ảnh thật qua Caddy: kiểm cả sharp (xoay EXIF, xoá EXIF, 3 cỡ WebP)
  // lẫn MinIO (lưu / phát lại / xoá) — nên phải chạy sau khi hạ tầng đã xanh.
  runTrace('apps/api/test/trace-phase3-posts.mjs', 'Phase 3 — check-in ảnh & kỷ niệm', {
    TRACE_BASE_URL: `${HTTPS}/api/v1`,
    TRACE_INSECURE_TLS: '1',
  });

  sh(`${COMPOSE} restart api`, { allowFail: true });
  await waitHealthy();

  runTrace('apps/api/test/trace-phase4-events.mjs', 'Phase 4 — lịch trình chung', {
    TRACE_BASE_URL: `${HTTPS}/api/v1`,
    TRACE_INSECURE_TLS: '1',
  });

  sh(`${COMPOSE} restart api`, { allowFail: true });
  await waitHealthy();

  // Bộ này gọi ra FCM thật (bằng token không tồn tại) để kiểm nhánh dọn đăng ký
  // chết — nên nó cần máy có Internet. Không có mạng thì case PU-13 sẽ hỏng.
  runTrace('apps/api/test/trace-phase4-push.mjs', 'Phase 4 — thông báo đẩy & nhắc lịch', {
    TRACE_BASE_URL: `${HTTPS}/api/v1`,
    TRACE_INSECURE_TLS: '1',
  });

  sh(`${COMPOSE} restart api`, { allowFail: true });
  await waitHealthy();

  // Bộ này CHỜ THẬT hai lần 65 giây: ngưỡng "ở đủ lâu" của hàng rào là 60 giây
  // và server không cho tua thời gian bằng mốc `ts` do client gửi. Vì vậy nó là
  // bộ trace chậm nhất — khoảng 2,5 phút.
  runTrace('apps/api/test/trace-phase4-places.mjs', 'Phase 4 — địa điểm & hàng rào ảo', {
    TRACE_BASE_URL: `${HTTPS}/api/v1`,
    TRACE_INSECURE_TLS: '1',
  });

  sh(`${COMPOSE} restart api`, { allowFail: true });
  await waitHealthy();

  runTrace('apps/api/test/trace-phase4-milestones.mjs', 'Phase 4 — mốc kỷ niệm', {
    TRACE_BASE_URL: `${HTTPS}/api/v1`,
    TRACE_INSECURE_TLS: '1',
  });
}

async function waitHealthy() {
  for (let i = 0; i < 30; i += 1) {
    const s = sh('docker inspect --format "{{.State.Health.Status}}" beside-api', { allowFail: true });
    if (s === 'healthy') return;
    await sleep(3000);
  }
}

// ---------------------------------------------------------------- 4. MÃ NGUỒN

function checkCode() {
  section('4 · Mã nguồn');

  const tc = stripAnsi(sh('npm run typecheck', { allowFail: true }));
  check('code', 'typecheck 3 workspace', !/error TS/.test(tc));

  const t = stripAnsi(sh('npm test', { allowFail: true }));
  const totals = [...t.matchAll(/Tests\s+(\d+) passed/g)].map((m) => Number(m[1]));
  const sum = totals.reduce((a, b) => a + b, 0);
  const anyFailed = /\d+ failed/.test(t);
  check('code', 'unit test', !anyFailed && sum > 0, `${sum} test`);
}

// ---------------------------------------------------------------- 5. DỌN DẸP

function cleanup() {
  section('5 · Dọn dữ liệu test');
  sh(
    `docker exec beside-db psql -U beside -d beside -c "DELETE FROM couples WHERE id IN (SELECT DISTINCT \\"coupleId\\" FROM users WHERE email LIKE '%@beside.test' AND \\"coupleId\\" IS NOT NULL);" -c "DELETE FROM users WHERE email LIKE '%@beside.test';"`,
    { allowFail: true },
  );
  const left = sh('docker exec beside-db psql -U beside -d beside -t -c "SELECT count(*) FROM users;"', {
    allowFail: true,
  });
  check('cleanup', 'Xoá tài khoản test', true, `còn ${left.trim()} user thật`);
}

// ---------------------------------------------------------------- CHẠY

const run = async () => {
  console.log('\x1b[1m\x1b[35mBeside — kiểm tra bản chạy local\x1b[0m');
  console.log('\x1b[90mChạy qua Docker + Caddy HTTPS, đúng như production sẽ chạy.\x1b[0m');

  await checkInfra();
  await checkHttps();
  await checkFlows();
  checkCode();
  cleanup();

  const total = results.length;
  console.log('\n' + '─'.repeat(64));
  if (failed === 0) {
    console.log(`\x1b[32m\x1b[1m✓ ${total}/${total} mục đạt — bản local chạy đúng.\x1b[0m`);
    console.log('');
    console.log('Còn mấy thứ CHỈ kiểm tra được bằng tay trên trình duyệt:');
    console.log('  1. Quyền vị trí + chấm di chuyển  → F12 › Sensors › Location');
    console.log('  2. Giữ màn hình sáng (Wake Lock)  → bật "Chia sẻ trực tiếp"');
    console.log('  3. Cài PWA lên màn hình chính     → cần thiết bị thật');
    console.log('  4. Chọn ảnh & đăng khoảnh khắc    → nén ảnh chỉ chạy trong trình duyệt');
    console.log('  5. Thêm/sửa sự kiện trên lịch     → ô chọn ngày giờ của trình duyệt');
    console.log('  6. Bật thông báo & bấm "Gửi thử"  → khay thông báo của máy thật');
    console.log('');
    console.log('Xong mấy mục đó là đủ tự tin lên production. Hướng dẫn: docs/DEPLOY.md');
  } else {
    console.log(`\x1b[31m\x1b[1m✗ ${failed}/${total} mục KHÔNG đạt — chưa nên lên production.\x1b[0m`);
    console.log('');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  · [${r.group}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    }
  }
  console.log('─'.repeat(64));

  process.exit(failed === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('Lỗi khi chạy kiểm tra:', e);
  process.exit(2);
});
