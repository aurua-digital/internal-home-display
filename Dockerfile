# Builds the admin app, display page and API into one small image (arm64 on the Pi, amd64 elsewhere).
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci --no-audit --no-fund
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data WEB_DIST=/app/web PORT=8080 NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
# The API is bundled into one file, so the runtime image needs no node_modules.
COPY --from=build /src/apps/api/dist/server.js ./server.js
COPY --from=build /src/apps/web/dist ./web
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
