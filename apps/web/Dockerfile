# Dockerfile for Next.js web application (Monorepo)

# 1. Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy the rest of the monorepo
COPY . .

# Install all dependencies
RUN npm install

# Build the web application
RUN npm run build --workspace=@arcto/web

# 2. Production stage
FROM node:18-alpine
WORKDIR /app

# Copy the built application from the builder stage
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install production dependencies for the web workspace
RUN npm install --workspace=web --omit=dev

# Expose the port the app runs on
EXPOSE 3000

# Change to the web app directory
WORKDIR /app/apps/web

# Start the application
CMD ["npm", "start"]