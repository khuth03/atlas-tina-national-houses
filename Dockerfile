FROM node:22-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install ALL dependencies (including devDependencies) for build
RUN pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm rebuild better-sqlite3

# Copy source
COPY . .

# Build (vite is now available in node_modules/.bin)
RUN pnpm run build

# Expose port
EXPOSE 3000

# Start
CMD ["node", "dist/index.js"]
