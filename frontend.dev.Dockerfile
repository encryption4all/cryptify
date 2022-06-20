FROM node:17

RUN apt update \
  && apt install -y openssl \
  && apt clean

COPY ./cryptify-front-end /app

WORKDIR /app

RUN npm install

CMD ["npm", "start"]
