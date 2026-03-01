# Dockerfile for NestJS api application (Monorepo)

# 1. Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy the rest of the monorepo
COPY . .

# Install all dependencies
RUN npm install

# Generate prisma client
RUN npm run prisma:generate --workspace=api

# Build the api application
RUN npm run build --workspace=api

# 2. Production stage
FROM node:18-alpine
WORKDIR /app

# Copy the built application from the builder stage
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json

# Change to the api app directory
WORKDIR /app

# Start the application
CMD ["node", "dist/src/main"]
