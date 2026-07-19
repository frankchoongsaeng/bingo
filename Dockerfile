# Friday Night Bingo — single-service container.
#
# The whole app is one Node process: `server.js` serves the built React SPA
# *and* the `/api/bingo` JSON + SSE API on the same port. Running it this way is
# what makes room creation work in production — a POST to `/api/bingo/rooms`
# reaches the Express router instead of a static file server (which would reject
# non-GET methods with a 405).

# ── Build stage: compile the SPA into dist/ ──────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Install all deps (including devDependencies) — the build needs vite/tsc.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime stage: serve SPA + API from one Node process ─────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Only production dependencies are needed to run the server.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server, the game engine, and the compiled SPA.
COPY server.js ./server.js
COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "server.js"]
