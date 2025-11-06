FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Expose port range for libp2p (we'll use random ports)
EXPOSE 9000-9100

CMD ["node", "src/index.js"]
