# ==========================================
# Stage 1: Install Dependencies
# ==========================================
# Use lightweight Node 22 Alpine image and name this stage "deps"
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only package manifests first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Clean install dependencies strictly from package-lock.json
RUN npm ci


# ==========================================
# Stage 2: Build the Application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Disable Next.js anonymous telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Rewrites in next.config are compiled at build time,
# so the backend URL must be passed as a build argument here.
ARG BACKEND_INTERNAL_URL=http://backend:8000
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL

# Reuse installed node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the application source code
COPY . .

# Build the Next.js app (requires `output: 'standalone'` in next.config)
RUN npm run build


# ==========================================
# Stage 3: Production Runner
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment variables and bind to all interfaces (0.0.0.0)
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Create a non-root user and group for security
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001

# Copy public assets
COPY --from=builder /app/public ./public

# Copy the standalone server and traced node_modules, owned by the non-root user
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static chunks (not included automatically in .next/standalone)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to the non-root user before running the app
USER nextjs

# Document the port the app listens on
EXPOSE 3000

# Start the Next.js standalone server
CMD ["node", "server.js"]