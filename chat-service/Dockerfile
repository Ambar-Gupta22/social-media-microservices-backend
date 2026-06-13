# use the official node.js 18 image with alpine linux as the base image
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy root workspace files
COPY package*.json ./

# Copy shared package
COPY packages/shared ./packages/shared

# Copy this specific service
COPY chat-service ./chat-service

# Install dependencies (this will use workspaces and install everything)
RUN npm ci --only=production

# Set working directory to the service
WORKDIR /usr/src/app/chat-service

EXPOSE 3007

CMD ["node", "src/server.js"]
