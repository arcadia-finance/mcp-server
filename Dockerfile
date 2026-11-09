FROM node:22.23.4-trixie-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY tsconfig.json ./
COPY src/ src/
RUN yarn build
RUN yarn workspaces focus --production

FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:1b90ca047c3a1046ad3527998c747c25b6a88dde91ba8c71b98669d5813aaa21

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/dist/ dist/
COPY skills/ skills/
COPY llms.txt llms-full.txt ./

ENV TRANSPORT=http
ENV PORT=3000
ENV NODE_OPTIONS="--use-openssl-ca"
EXPOSE 3000

CMD ["dist/index.js"]
