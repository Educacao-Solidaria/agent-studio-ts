# Imagem de produção do estúdio (contratos da Fase 5, §2): o Vite gera o build numa etapa com
# Node; a final leva só o dist/ e a config do nginx, sem root (uid 101), na porta 3000.
# Bases fixadas por digest, com a tag ao lado para leitura.

FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
RUN npm install --global pnpm@10.34.7
WORKDIR /repo
# Manifestos antes do código: o install só roda de novo quando as dependências mudam.
# ponytail: um pacote novo em apps/ precisa do package.json dele copiado aqui também.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store
# O app importa os tipos e o contrato SSE (zod) do src/ da raiz.
COPY tsconfig.json ./
COPY src src
COPY apps/web apps/web
RUN pnpm --dir apps/web build

# Variante slim: o nginx sem os módulos dinâmicos (njs, perl, xslt), que o estúdio não usa.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24-slim@sha256:5d8bb9437d74a600ec5dbf90c035451c724dc33eac8d3a71078f6f8612c345f6
# Os dois COPY ficam com dono root: o nginx lê o que serve, mas não reescreve.
COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /srv/studio
# O mesmo uid da imagem base; explícito para o contrato não depender dela.
USER 101
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=1s \
    CMD ["wget", "-q", "-T", "2", "-O", "/dev/null", "http://127.0.0.1:3000/"]
