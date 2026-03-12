FROM node:22-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY tsconfig.json ./
COPY src/ src/
RUN yarn build

FROM node:22-slim

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/dist/ dist/
COPY skills/ skills/

ENV TRANSPORT=http
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
