# syntax=docker/dockerfile:1
# =========================================================
# Beside Web — build từ GỐC monorepo:
#   docker build -f apps/web/Dockerfile .
# =========================================================

FROM node:22-alpine AS deps
WORKDIR /repo
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

FROM deps AS build
WORKDIR /repo
# Vite nhúng các biến này vào bundle lúc BUILD, không đọc được lúc chạy.
# Đổi domain/API sau này thì phải build lại image web.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_WS_PATH=/socket.io
ARG VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_PATH=$VITE_WS_PATH \
    VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @beside/shared \
 && npm run build -w @beside/web

FROM nginx:1.27-alpine AS runner
COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
