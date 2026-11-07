FROM node:26-alpine

WORKDIR /app

RUN npm install -g pnpm@10.33.4

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY src ./src

USER node
EXPOSE 3100

# Configure with BOUNCER_* environment variables, or mount a config file at /app/bouncer.config.yml.
CMD ["node", "src/index.ts"]
