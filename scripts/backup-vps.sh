#!/bin/bash
# Sao lưu Beside: database + ảnh check-in trong MinIO.
# Phải chạy CẢ HAI trong cùng một lần — bảng photos chỉ lưu khoá trỏ vào MinIO,
# phục hồi DB mới với ảnh cũ sẽ cho ra bản ghi trỏ vào tệp không tồn tại.
set -eu
DIR=/var/backups/beside
DATE=$(date +%F)
mkdir -p "$DIR"

docker exec -t beside-db pg_dump -U beside beside | gzip > "$DIR/db-$DATE.sql.gz"

docker run --rm \
  -v beside_minio_data:/data:ro \
  -v "$DIR":/backup \
  alpine tar czf "/backup/minio-$DATE.tar.gz" -C /data .

# Giữ 14 bản gần nhất của cả hai loại
ls -1t "$DIR"/db-*.sql.gz    2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DIR"/minio-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "$(date '+%F %T') OK db=$(du -h "$DIR/db-$DATE.sql.gz" | cut -f1) minio=$(du -h "$DIR/minio-$DATE.tar.gz" | cut -f1)"
