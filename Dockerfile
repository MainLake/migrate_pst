FROM node:18-alpine

# Install PostgreSQL client tools (pg_dump, pg_restore, psql)
# This makes the application completely autonomous - no need for users to install PostgreSQL
RUN apk add --no-cache postgresql-client

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy scripts directory (needed for postinstall)
COPY scripts ./scripts

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p /app/data /app/backups

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
