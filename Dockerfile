FROM node:20-alpine

USER root

RUN mkdir -p /tmp/npm-cache /home/node/app \
	&& chmod 1777 /tmp/npm-cache \
	&& chown -R node:node /home/node

WORKDIR /home/node/app

COPY --chown=node:node package*.json ./

USER node

RUN HOME=/tmp npm_config_cache=/tmp/npm-cache \
	npm install --cache /tmp/npm-cache --no-audit --no-fund

COPY --chown=node:node . .

ENV HOME=/home/node

CMD ["npm", "start"]
