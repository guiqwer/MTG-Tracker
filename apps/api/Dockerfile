FROM oven/bun:1

# Prisma engines require OpenSSL at runtime.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install workspace deps first for better layer caching.
COPY package.json bun.lock* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN bun install

# Bring in the rest of the source.
COPY . .

# Generate the Prisma client (local v6 binary via bun run, NOT bunx which fetches latest).
RUN cd apps/api && bun run prisma:generate

EXPOSE 3000
CMD ["sh", "./apps/api/docker-entrypoint.sh"]
