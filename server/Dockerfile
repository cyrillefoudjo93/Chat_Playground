# Multi-stage build for NestJS Backend Service
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm globally in the builder stage
RUN npm install -g pnpm

# Copy package.json and lock file
COPY package.json pnpm-lock.yaml ./

# Install all dependencies including dev dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build the application
RUN pnpm run build

# Second stage: Production
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Install pnpm globally in the production stage
RUN npm install -g pnpm

# Copy package.json and lock file
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/nest-cli.json ./

# Create logs directory and ensure it's writable
RUN mkdir -p ./logs/audit && chmod -R 755 ./logs

# Set node environment to production
ENV NODE_ENV production

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/main"]
