# syntax=docker/dockerfile:1
# =========================================================
# Beside API — build từ GỐC monorepo:
#   docker build -f apps/api/Dockerfile .
# =========================================================

FROM node:22-alpine AS base
WORKDIR /repo
# Prisma cần openssl để chọn đúng query engine trên Alpine (musl)
RUN apk add --no-cache openssl
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# ---------- Cài dependency (tách riêng để tận dụng cache) ----------
FROM base AS deps
# npm ci kiểm tra lockfile với TẤT CẢ workspace → phải copy đủ package.json,
# kể cả của web dù image này không build web.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# ---------- Biên dịch ----------
FROM deps AS build
# `prisma generate` chỉ cần biến này TỒN TẠI để đọc được schema; nó không kết nối
# tới DB. URL thật được nạp lúc chạy container từ docker-compose.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @beside/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @beside/api

# ---------- Ảnh chạy thật ----------
FROM base AS runner
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --ignore-scripts: bỏ postinstall của prisma, client đã sinh sẵn ở stage build
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Prisma Client (đã sinh) và các engine nhị phân (đã tải) đều lấy từ stage build.
# Vì stage này cài bằng --ignore-scripts nên @prisma/engines ở đây rỗng —
# nếu không copy sang, CLI sẽ cố TẢI engine lúc chạy và thất bại.
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /repo/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma

# `prisma migrate deploy` ghi tệp tạm vào thư mục engines khi khởi động.
# Không cấp quyền thì container restart vô hạn với lỗi:
#   Can't write to /repo/node_modules/@prisma/engines
RUN chown -R node:node /repo/node_modules/.prisma /repo/node_modules/@prisma

USER node
WORKDIR /repo/apps/api
EXPOSE 3000

# Chạy migration trước rồi mới khởi động — tránh trường hợp code mới gặp DB cũ.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
