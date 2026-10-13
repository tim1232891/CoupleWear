FROM node:24-bookworm-slim

WORKDIR /app
COPY apps/studio-api/package.json apps/studio-api/package-lock.json ./
RUN npm ci --omit=dev
COPY apps/studio-api/src ./src
COPY assets/cw-style-minimal.svg assets/cw-style-heart.svg assets/cw-style-embrace.svg assets/cw-style-hands.svg /assets/

RUN mkdir -p /data && chown -R node:node /app /data
USER node

ENV NODE_ENV=production PORT=9292 STORAGE_ROOT=/data
EXPOSE 9292
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:9292/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
