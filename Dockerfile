FROM node:22.23.4-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY tsconfig.json ./
COPY src/ src/
RUN yarn build

FROM node:22.23.4-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/dist/ dist/
COPY skills/ skills/
COPY llms.txt llms-full.txt ./

ENV TRANSPORT=http
ENV PORT=3000
ENV NODE_OPTIONS="--use-openssl-ca"
EXPOSE 3000

CMD ["node", "dist/index.js"]
