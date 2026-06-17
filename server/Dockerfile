FROM node:22-alpine
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy source code and zk circuits
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
