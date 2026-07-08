# --- build stage: compile the SPA with Vite ---
FROM oven/bun:1 AS build

WORKDIR /app

# Install workspace deps (needs both app manifests + the api type for Eden).
COPY package.json bun.lock* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN bun install

COPY . .

# The API is reached same-origin through the nginx proxy (see nginx.conf), so the
# client is built to call the relative "/api" path. Resolved to an absolute URL at
# runtime in src/lib/eden.ts.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN cd apps/web && bun run build

# --- runtime stage: serve the static build + reverse-proxy the API ---
FROM nginx:alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
