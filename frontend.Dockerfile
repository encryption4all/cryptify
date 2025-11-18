FROM node:24-alpine AS builder

WORKDIR /app

COPY cryptify-front-end/craco.config.js .
COPY cryptify-front-end/tsconfig.json .
COPY cryptify-front-end/package.json .
COPY cryptify-front-end/package-lock.json .
COPY cryptify-front-end/.env .
COPY cryptify-front-end/public ./public
COPY cryptify-front-end/src ./src

COPY conf/nginx.conf .

RUN npm install --legacy-peer-deps
RUN npm run build-stable

FROM nginx:alpine
COPY --from=builder /app/build /var/www/html
COPY --from=builder /app/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]