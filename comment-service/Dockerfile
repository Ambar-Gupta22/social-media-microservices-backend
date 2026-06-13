# use the official node.js 18 image with alpine linux as the base image
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy root workspace files
COPY package*.json ./

# Copy shared package
COPY packages/shared ./packages/shared

# Copy this specific service
COPY comment-service ./comment-service

# Install dependencies (this will use workspaces and install everything)
RUN npm ci --only=production

# Set working directory to the service
WORKDIR /usr/src/app/comment-service

EXPOSE 3003

CMD ["node", "src/server.js"]
