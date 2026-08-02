# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend files
COPY src ./src
COPY index.html ./
COPY vite.config.js ./
COPY tsconfig.json ./

# Build frontend
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app

# Copy package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci

# Copy backend files
COPY server ./server
COPY server/setup-db.sql ./
COPY proxy.ts ./

# Stage 3: Production image
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy backend from build stage
COPY --from=backend-build /app/server ./server

# Copy frontend build from build stage
COPY --from=frontend-build /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose ports
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL=${DATABASE_URL:-postgresql://username:password@localhost:5432/chess_db?sslmode=require}
ENV FRONTEND_URL=${FRONTEND_URL:-http://localhost:3001}

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "server/index.js"]
