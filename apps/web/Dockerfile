FROM oven/bun:1

WORKDIR /app

# Install workspace deps (needs both app manifests + the api type for Eden).
COPY package.json bun.lock* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN bun install

COPY . .

EXPOSE 5173
CMD ["sh", "-c", "cd /app/apps/web && bunx vite --host 0.0.0.0 --port 5173"]
