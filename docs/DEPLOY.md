# Triển khai Beside lên VPS

Toàn bộ hệ thống chạy bằng `docker compose`. Không cần cài Node/Postgres trên VPS.

- **Yêu cầu tối thiểu:** 2 vCPU · 4 GB RAM · 40 GB SSD · Ubuntu 22.04+
- **Bắt buộc:** một domain đã trỏ về IP VPS (hiện dùng `easytech.io.vn`).
  Không có domain thì **không chạy được** — Geolocation API của trình duyệt
  chỉ hoạt động trên HTTPS.

---

## 0. Kiểm tra bản local trước

Đừng deploy khi chưa chạy cái này trên máy dev:

```bash
npm run docker:up
npm run verify:local     # 28 mục, phải xanh hết
```

Nó chạy đúng những gì máy chủ sẽ chạy — Docker, Caddy HTTPS, PostGIS, Redis —
nên gần như mọi lỗi hạ tầng sẽ lộ ra ở đây thay vì lộ ra lúc đang deploy.

## 1. Chuẩn bị DNS

Tạo bản ghi A trỏ về IP VPS, rồi kiểm tra đã lan truyền chưa:

```bash
dig +short easytech.io.vn      # phải ra đúng IP VPS
```

> Nếu dùng Cloudflare: **tắt proxy (mây xám)** khi Caddy xin chứng chỉ lần đầu.
> Bật lại sau cũng được, nhưng phải để SSL mode = Full (strict).

## 2. Cài Docker trên VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # đăng xuất/đăng nhập lại cho có hiệu lực
docker compose version             # xác nhận có plugin compose
```

## 3. Lấy mã nguồn & tạo `.env`

```bash
git clone <repo> beside && cd beside
cp .env.production.example .env      # KHÔNG dùng .env.example (đó là file của máy dev)
```

> ⚠️ **Đừng copy `.env` từ máy dev lên đây.** API có rào chắn: nếu phát hiện secret
> trông như giá trị để tạm hoặc secret của máy dev, nó sẽ **từ chối khởi động** và in ra
> đúng biến nào sai. Đó là chủ ý — thà chết lúc boot còn hơn chạy với token ai cũng đoán được.

Sinh secret ngẫu nhiên (chạy 2 lần, lấy 2 giá trị **khác nhau**):

```bash
openssl rand -base64 48
```

Sửa `.env`:

```ini
APP_DOMAIN=easytech.io.vn
APP_ORIGIN=https://easytech.io.vn
COOKIE_DOMAIN=easytech.io.vn
ACME_EMAIL=email-that-cua-ban@...     # Let's Encrypt gửi cảnh báo hết hạn về đây

POSTGRES_PASSWORD=<chuỗi ngẫu nhiên>
REDIS_PASSWORD=<chuỗi ngẫu nhiên>
JWT_ACCESS_SECRET=<openssl rand lần 1>
JWT_REFRESH_SECRET=<openssl rand lần 2>

MINIO_ROOT_PASSWORD=<chuỗi ngẫu nhiên>

NODE_ENV=production
POSTGRES_PORT=5432                    # trên VPS không có Postgres nào khác nên để 5432
```

### Khoá VAPID cho thông báo đẩy

Thông báo đẩy (nhắc lịch, báo khi người ấy check-in) cần một **cặp khoá VAPID**
riêng của server. Sinh trực tiếp trên VPS:

```bash
docker compose run --rm --entrypoint node api -e "console.log(require('web-push').generateVAPIDKeys())"
```

Chép hai giá trị vào `.env`:

```ini
VAPID_PUBLIC_KEY=<publicKey vừa sinh>
VAPID_PRIVATE_KEY=<privateKey vừa sinh>
VAPID_SUBJECT=mailto:email-that-cua-ban@...
```

Ba điều cần nhớ:

- **Sinh khoá RIÊNG cho production**, đừng dùng lại khoá của máy dev.
- **Đổi khoá = mọi thiết bị đã bật thông báo phải bật lại.** Khoá công khai được
  gắn vào đăng ký của trình duyệt; đổi khoá thì các đăng ký cũ thành vô dụng.
- **Để trống cả hai = tắt hẳn thông báo đẩy**, app vẫn chạy bình thường và màn
  Cài đặt sẽ nói "máy chủ chưa bật thông báo đẩy". Khai báo **một nửa** thì API
  từ chối khởi động — nửa vời là cấu hình sai, không phải là tắt.

> **API sẽ từ chối khởi động** nếu:
> - `JWT_ACCESS_SECRET` trùng `JWT_REFRESH_SECRET`, hoặc ngắn hơn 32 ký tự
> - `APP_ORIGIN` không phải `https://`
> - secret hoặc mật khẩu DB **trông như giá trị để tạm / secret của máy dev**
> - `COOKIE_DOMAIN` không khớp host của `APP_ORIGIN`
> - `CORS_EXTRA_ORIGINS` có origin `http://` hoặc `localhost`
>
> Thông báo lỗi nói rõ biến nào sai. Thà chết lúc boot còn hơn chạy được rồi mới
> lộ ra lúc 2 giờ sáng.

## 4. Khởi động

```bash
docker compose up -d --build
docker compose ps                 # cả 5 service phải "Up"/"healthy"
docker compose logs -f caddy      # xem Caddy xin chứng chỉ
```

Container `api` **tự chạy `prisma migrate deploy`** trước khi khởi động, nên
không phải chạy migration thủ công.

Kiểm tra:

```bash
curl https://easytech.io.vn/api/v1/health
# {"status":"ok","db":"up","uptimeSec":...}
```

Rồi mở `https://easytech.io.vn` trên điện thoại → đăng ký → ghép đôi.

## 5. Cài lên màn hình chính (PWA)

| | |
|---|---|
| **iPhone** | Mở bằng **Safari** (Chrome trên iOS không cài PWA được) → nút Chia sẻ → *Thêm vào MH chính* |
| **Android** | Chrome sẽ tự hiện thanh “Cài đặt ứng dụng”, hoặc menu ⋮ → *Cài đặt ứng dụng* |

---

## Cập nhật phiên bản mới

```bash
git pull
docker compose up -d --build
```

Downtime vài giây. Migration chạy tự động khi container `api` khởi động lại.

## Sao lưu

```bash
# Đặt vào crontab, chạy hằng ngày
docker compose exec -T db pg_dump -U beside beside | gzip > backup-$(date +%F).sql.gz
```

Giữ 14 bản gần nhất. Từ Phase 3 nhớ sao lưu thêm volume `minio_data` (ảnh check-in).

Phục hồi:

```bash
gunzip -c backup-2026-09-07.sql.gz | docker compose exec -T db psql -U beside beside
```

## Đổi sang domain mới (khi mua domain `beside`)

1. Trỏ bản ghi A của domain mới về IP VPS.
2. Sửa 3 dòng trong `.env`: `APP_DOMAIN`, `APP_ORIGIN`, `COOKIE_DOMAIN`.
3. `docker compose up -d --build web caddy`

Caddy tự xin chứng chỉ mới. **Không phải sửa một dòng code nào** — mọi URL trong
code đều là đường dẫn tương đối hoặc đọc từ biến môi trường.

> Phải build lại `web` vì Vite nhúng biến `VITE_*` vào bundle lúc build.

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Caddy không xin được chứng chỉ | DNS chưa trỏ đúng, hoặc cổng 80/443 bị firewall chặn | `dig +short <domain>`; mở cổng: `sudo ufw allow 80,443/tcp` |
| `api` restart liên tục | `.env` sai (secret ngắn, hai secret trùng nhau, `APP_ORIGIN` không https) | `docker compose logs api` — thông báo lỗi nói rõ biến nào sai |
| Trình duyệt không hỏi quyền vị trí | Đang vào bằng `http://` hoặc bằng IP | Bắt buộc dùng `https://<domain>` |
| `ports are not available` | Máy đã có dịch vụ chiếm cổng đó | Đổi `POSTGRES_PORT` / `REDIS_PORT` trong `.env` |
| Cài PWA xong nhưng không cập nhật | Service worker giữ bản cũ | Đã cấu hình `Cache-Control: no-store` cho `sw.js`; nếu vẫn kẹt thì gỡ khỏi màn hình chính rồi cài lại |
| Đăng nhập xong bị đá ra ngay | `COOKIE_DOMAIN` không khớp domain đang truy cập | Sửa `.env` cho khớp, rồi `docker compose up -d api` |

## Ghi chú bảo mật

- Cổng `5432` (Postgres) và `6379` (Redis) chỉ bind `127.0.0.1`, **không** phơi ra Internet.
- Chỉ mở cổng 80 và 443 trên firewall.
- File `.env` chứa toàn bộ secret — `chmod 600 .env`, và đã nằm trong `.gitignore`.
- Dữ liệu vị trí rất nhạy cảm: `robots.txt` chặn mọi công cụ tìm kiếm, và
  lịch sử vị trí tự xoá theo chính sách ở `ARCHITECTURE.md §6`.
