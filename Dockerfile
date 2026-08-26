# Imagem única para o `web` e para o `worker`.
#
# Os dois rodam o mesmo código e só diferem no comando de start, então uma
# imagem só evita build duplicado e garante que web e worker nunca fiquem em
# versões diferentes — que é o tipo de divergência que produz bug impossível de
# reproduzir ("no painel aparece, na fila não").
#
# Multi-stage: as dependências de build (typescript, prisma CLI) não vão para a
# imagem final.

# ---------------------------------------------------------------- dependências
FROM node:22-alpine AS deps
WORKDIR /app

# O engine do Prisma é compilado contra glibc; no Alpine ele precisa destes dois.
# Sem eles o `prisma generate` passa e o primeiro query estoura em runtime.
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
# O schema precisa existir ANTES do npm ci: o `postinstall` roda
# `prisma generate`, que lê o schema.
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `npm run build` já roda `prisma generate` antes do `next build`.
# O DATABASE_URL do build é descartável: o Next não consulta o banco para
# compilar, e todas as rotas do /rodolfo são `force-dynamic`. O valor real
# entra por env no runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXTAUTH_SECRET="build-time-placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --------------------------------------------------------------------- runtime
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/prisma ./prisma
# O worker roda por tsx e precisa do fonte; o `web` ignora.
COPY --from=build /app/worker ./worker
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
# Rodam no start dos containers: exportar-segredos.sh (fonte dos segredos do
# volume) e imprimir-setup.mjs (o link de primeiro acesso no log).
COPY --from=build /app/scripts ./scripts

# Não roda como root. Se um dia alguém achar RCE no app, o processo não é dono
# do container.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs
USER nextjs

EXPOSE 3000
CMD ["npm", "start"]
