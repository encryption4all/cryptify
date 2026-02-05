FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY cryptify-front-end/package.json .
COPY cryptify-front-end/package-lock.json .
COPY cryptify-front-end/craco.config.js .
COPY cryptify-front-end/tsconfig.json .
COPY cryptify-front-end/.env .

# Install dependencies
RUN npm install --legacy-peer-deps

# The source will be mounted as a volume for hot reloading
EXPOSE 8080

# Start development server
CMD ["npm", "start"]
