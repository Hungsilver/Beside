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
npm run verify:local     # 40 mục, phải xanh hết
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
docker compose ps                 # 6 service: db · redis · api · web · caddy · minio
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

## Triển khai chung máy với dự án khác

Mấy mục trên giả định VPS chỉ có mình Beside. Máy đang chạy thật (`easytech.io.vn`)
**không** như vậy: nó đã có sẵn stack `hungsilver` ở `/opt/hungsilver` giữ cổng
80/443 (Caddy riêng của dự án đó) và 5432 (Postgres của dự án đó). Làm y theo mục 4
sẽ chết ngay ở lệnh `up` đầu tiên với `port is already allocated`.

Ba va chạm, né gọn trong `docker-compose.vps.yml` (có sẵn trong repo):

| Va chạm | Cách né |
|---|---|
| 80/443 do `hungsilver-caddy` giữ | Beside **không chạy Caddy riêng** — service `caddy` bị đẩy vào profile `standalone-tls` nên không khởi động cùng stack |
| Caddy ở stack khác, không chung mạng Docker | `api`/`web` mở cổng trên **IP gateway của mạng bridge mà Caddy đang nối** (`172.18.0.1:3003` và `:3002`) — không phơi ra Internet |
| 5432 do `hungsilver-postgres` giữ | `POSTGRES_PORT=5433` trong `.env`, vẫn chỉ bind loopback |

Đừng tin sẵn con số `172.18.0.1` — hỏi lại máy:

```bash
docker inspect <container-caddy> \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} gw={{$v.Gateway}}{{println}}{{end}}'
```

### Các bước

```bash
# 1. .env như mục 3, chỉ khác một dòng
POSTGRES_PORT=5433

# 2. Dựng kèm lớp phủ
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build

# 3. Dán site block của Beside vào Caddyfile của máy chủ — SAO LƯU TRƯỚC
cp /opt/hungsilver/Caddyfile /opt/hungsilver/Caddyfile.bak-$(date +%F-%H%M%S)
#    nội dung lấy từ: infra/caddy/shared-host.Caddyfile
docker exec <container-caddy> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec <container-caddy> caddy reload   --config /etc/caddy/Caddyfile --adapter caddyfile
```

`caddy reload` **không** khởi động lại container — dự án kia không gián đoạn một
nhịp nào. Hỏng thì chép bản `.bak` đè lại rồi `reload` lần nữa, mất 5 giây.

### TLS đi bằng Cloudflare, không phải Let's Encrypt

DNS của `easytech.io.vn` đang bật proxy Cloudflare (mây cam) nên Caddy **không** xin
được chứng chỉ qua ACME HTTP-01. Máy chủ dùng **Cloudflare Origin Certificate** sẵn có
(phủ `*.easytech.io.vn`, hạn 2041) — đó là lý do khối cấu hình có dòng `tls` trỏ thẳng
vào hai tệp cert thay vì để Caddy tự lo. Cloudflare phải để SSL/TLS mode = **Full (strict)**.

Hệ quả dễ làm người ta hoảng: **`curl -k https://127.0.0.1` ngay trên máy chủ sẽ báo
lỗi SSL** — không phải hỏng, mà vì curl không gửi SNI nên Caddy không biết chọn cert
nào. Thử ở origin thì phải ép SNI:

```bash
curl -k --resolve easytech.io.vn:443:127.0.0.1 https://easytech.io.vn/api/v1/health
```

### Khi nào quay về cấu hình đứng một mình

Khi Beside có VPS riêng: bỏ `-f docker-compose.vps.yml`, trỏ DNS thẳng về IP (mây xám),
Caddy của Beside tự xin Let's Encrypt như mục 4. Không phải sửa một dòng code nào.

---

## Cập nhật phiên bản mới

```bash
git pull
docker compose up -d --build
```

Downtime vài giây. Migration chạy tự động khi container `api` khởi động lại.

> Trên máy **dùng chung với dự án khác** (mục trên) phải kèm lớp phủ, nếu không
> Compose sẽ dựng lại cả service `caddy` và đâm vào cổng 80/443 của dự án kia:
>
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
> ```

## Sao lưu

Phải sao lưu **hai** thứ. Chỉ dump database là mất sạch ảnh check-in.

Có sẵn `scripts/backup-vps.sh` làm cả hai việc trong một lần chạy (giữ 14 bản, tự
dọn bản cũ). Chép lên máy chủ rồi đặt vào cron:

```bash
chmod +x /opt/beside/backup.sh
/opt/beside/backup.sh                                  # chạy thử một lần
(crontab -l 2>/dev/null; echo '20 3 * * * /opt/beside/backup.sh >> /var/log/beside-backup.log 2>&1') | crontab -
```

Phần dưới là hai việc đó tách ra, để hiểu script đang làm gì.

### 1. Database

```bash
# Đặt vào crontab, chạy hằng ngày
docker compose exec -T db pg_dump -U beside beside | gzip > backup-$(date +%F).sql.gz
```

### 2. Ảnh check-in (volume `minio_data`)

Bảng `photos` chỉ lưu **khoá** trỏ vào MinIO, không lưu ảnh. Mất volume này thì
mọi khoảnh khắc thành ô ảnh vỡ, và không có cách nào dựng lại.

```bash
docker run --rm   -v beside_minio_data:/data:ro   -v "$PWD":/backup   alpine tar czf /backup/minio-$(date +%F).tar.gz -C /data .
```

> Tên volume có tiền tố là tên thư mục dự án. Kiểm bằng `docker volume ls`.

Giữ 14 bản gần nhất của **cả hai**.

### Phục hồi

```bash
# Database
gunzip -c backup-2026-09-07.sql.gz | docker compose exec -T db psql -U beside beside

# Ảnh — dừng MinIO trước để không ghi đè lên file đang mở
docker compose stop minio
docker run --rm   -v beside_minio_data:/data   -v "$PWD":/backup   alpine sh -c "rm -rf /data/* && tar xzf /backup/minio-2026-09-07.tar.gz -C /data"
docker compose start minio
```

> **Hai bản sao lưu phải cùng thời điểm.** Phục hồi DB mới với ảnh cũ sẽ cho ra
> những bản ghi trỏ vào tệp không tồn tại. Chạy cả hai lệnh trong cùng một cron job.

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
