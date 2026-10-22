#!/usr/bin/env bash
# Smoke da imagem do estúdio (contratos da Fase 5, §2 e §5) no job `image` do CI.
#   smoke.sh context         o que vai ao build: o .dockerignore deixa de fora .git, .env,
#                            node_modules e dist (planta os falsos no checkout: feito para o CI)
#   smoke.sh image <imagem>  o container sobe sozinho, sem root e com a raiz só leitura, na 3000;
#                            serve o SPA e faz o proxy de mesma origem (backend falso no fim)
# Cada checagem que falha aparece na saída; sai 1 se alguma falhou.
set -euo pipefail
cd "$(dirname "$0")/../../.."

base=http://127.0.0.1:3000
failures=0
check() { # check <descrição> <comando...>
  local name=$1
  shift
  if "$@"; then echo "ok    $name"; else echo "FALHA $name" && failures=$((failures + 1)); fi
}
is() { [ "$1" = "$2" ] || { echo "      esperado [$2], veio [$1]" && return 1; }; }
has() { [[ $1 == *"$2"* ]] || { echo "      sem [$2]" && return 1; }; }
lacks() { [[ $1 != *"$2"* ]] || { echo "      com [$2]" && return 1; }; }
# Prazo em todo pedido: nginx que aceita a conexão e não responde não pode segurar o job.
curl() { command curl -m 10 "$@"; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
headers() { curl -s -D - -o /dev/null "$@" | tr -d '\r'; }
# O nginx do estúdio resolve o backend de novo a cada `valid` (10 s): espera ele aparecer.
eventually() { # eventually <caminho> <corpo esperado> [args do curl...]
  local path=$1 want=$2
  shift 2
  for _ in $(seq 25); do [ "$(curl -s "$@" "$base$path")" = "$want" ] && return; sleep 1; done
  is "$(curl -s "$@" "$base$path")" "$want"
}
healthy() { # o 1º teste sai em 1 s (--start-interval); sem ele, só depois do --interval de 30 s
  for _ in $(seq 40); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' studio)" = healthy ] && return
    sleep 1
  done
  is "$(docker inspect -f '{{.State.Health.Status}}' studio)" healthy
}
# Todo processo do container (o mestre e os workers do nginx) com o uid do contrato.
only_uid() { docker top studio -o pid,uid | awk -v uid="$1" 'NR > 1 { n++; if ($2 != uid) bad = 1 } END { exit (bad || n < 2) }'; }

context() {
  local out
  out=$(mktemp -d)
  mkdir -p node_modules/x apps/web/node_modules/x apps/web/dist
  echo 'SEGREDO=nao-pode-entrar-no-build' | tee .env apps/web/.env.local > /dev/null
  printf 'FROM scratch\nCOPY . /\n' | docker buildx build -q -f - --output "type=local,dest=$out" . > /dev/null
  for path in .git .env apps/web/.env.local node_modules apps/web/node_modules apps/web/dist; do
    check "fora do contexto: $path" test ! -e "$out/$path"
  done
  for path in pnpm-lock.yaml tsconfig.json src/types/sse.ts apps/web/index.html apps/web/docker/nginx.conf; do
    check "no contexto: $path" test -e "$out/$path"
  done
}

image() {
  local img=$1 net=studio-smoke dir size index js
  dir=$(mktemp -d)
  trap 'docker rm -f studio backend > /dev/null 2>&1; docker network rm studio-smoke > /dev/null 2>&1' EXIT
  check "usuário da imagem: 101" is "$(docker image inspect -f '{{.Config.User}}' "$img")" 101
  check "expõe 3000/tcp" has "$(docker image inspect -f '{{json .Config.ExposedPorts}}' "$img")" '"3000/tcp"'
  size=$(docker image inspect -f '{{.Size}}' "$img")
  check "imagem < 30 MB ($((size / 1000)) kB)" test "$size" -lt 30000000

  # Endurecido como o compose pode rodar: raiz só leitura, sem capabilities nem privilégio novo.
  docker network create "$net" > /dev/null
  docker run -d --name studio --network "$net" -p 127.0.0.1:3000:3000 --read-only --tmpfs /tmp \
    --cap-drop ALL --security-opt no-new-privileges "$img" > /dev/null
  for _ in $(seq 30); do
    [ "$(status "$base/")" = 200 ] || [ "$(docker inspect -f '{{.State.Running}}' studio)" = false ] && break
    sleep 1
  done
  # Portão: sem a 3000 de pé nada adiante vale, e o log do nginx diz por quê (config, porta).
  if [ "$(status "$base/")" != 200 ]; then
    echo "FALHA sobe sem backend e responde na 3000"
    docker logs studio
    exit 1
  fi
  echo "ok    sobe sem backend e responde na 3000"
  check "todo processo com uid 101" only_uid 101
  check "healthcheck da imagem: healthy" healthy

  index=$(curl -s "$base/" || true)
  js=$(grep -o '/assets/index-[^"]*\.js' <<< "$index" | head -1 || true)
  check "/ é o index.html do build" has "$index" '<div id="root"></div>'
  check "rota do cliente cai no index.html" is "$(curl -s "$base/fluxos/1")" "$index"
  check "index.html revalida a cada visita" has "$(headers "$base/")" 'Cache-Control: no-cache'
  check "asset com hash: cache de 1 ano" has "$(headers "$base$js")" 'Cache-Control: public, max-age=31536000, immutable'
  check "asset com hash: JavaScript" has "$(headers "$base$js")" 'Content-Type: application/javascript'
  check "asset com hash: gzip" has "$(headers -H 'Accept-Encoding: gzip' "$base$js")" 'Content-Encoding: gzip'
  check "asset que falta: 404, sem cair no SPA" is "$(status "$base/assets/nao-existe-0.js")" 404
  check "asset que falta: sem cache longo" lacks "$(headers "$base/assets/nao-existe-0.js")" immutable
  check "nginx sem versão no Server" has "$(headers "$base/")" 'Server: nginx'$'\n'

  # O build abre no Chrome do runner: o React monta dentro do #root e a tela de erro não aparece.
  local dom
  dom=$(timeout 60 google-chrome --headless --no-sandbox --disable-gpu --user-data-dir="$dir/chrome" \
    --virtual-time-budget=5000 --dump-dom "$base/" 2> /dev/null || true)
  check "o app monta no navegador" has "$dom" '<div id="root"><'
  check "o app monta sem a tela de erro" lacks "$dom" 'role="alert"'

  # Sem backend: o upstream é resolvido no pedido, então cada rota de proxy vira 502.
  for path in /health/gateway /health/rag /health/cache /api/v1/index /v1/models; do
    check "sem backend: $path = 502" is "$(status "$base$path")" 502
  done
  # Teto do RAG (2 MiB): o corpo exato passa do nginx (502 sem backend); 1 byte a mais é 413.
  head -c 2097152 /dev/zero > "$dir/body"
  check "upload de 2 MiB passa do nginx" is "$(status --data-binary @"$dir/body" "$base/api/v1/index")" 502
  printf x >> "$dir/body"
  check "upload acima de 2 MiB: 413" is "$(status --data-binary @"$dir/body" "$base/api/v1/index")" 413

  # Backend falso: a própria imagem com um server que devolve "host método uri" nas portas do
  # contrato, sob os nomes de DNS do compose. Prova o mapa do §5 sem reiniciar o estúdio.
  # shellcheck disable=SC2016 # as variáveis são do nginx, não do shell
  echo 'server { listen 8000; listen 8080; listen 8099; return 200 "$http_host $request_method $request_uri"; }' > "$dir/echo.conf"
  chmod 644 "$dir/echo.conf"
  docker run -d --name backend --network "$net" --network-alias gateway --network-alias rag \
    --network-alias cache --read-only --tmpfs /tmp -v "$dir/echo.conf:/etc/nginx/conf.d/default.conf:ro" "$img" > /dev/null
  check "/health/gateway → gateway:8080/healthz" eventually /health/gateway 'gateway:8080 GET /healthz'
  check "/health/rag → rag:8000/healthz" eventually /health/rag 'rag:8000 GET /healthz'
  check "/health/cache → cache:8099/health" eventually /health/cache 'cache:8099 GET /health'
  check "/api/ → rag:8000/api/, com a query" eventually '/api/v1/search?q=1' 'rag:8000 GET /api/v1/search?q=1'
  check "/v1/ → gateway:8080/v1/" eventually /v1/chat/completions 'gateway:8080 POST /v1/chat/completions' -d '{}'
  check "do cache, só /health passa" is "$(curl -s "$base/health/cache/stats")" "$index"

  docker stop -t 10 studio > /dev/null
  check "docker stop encerra com 0" is "$(docker inspect -f '{{.State.ExitCode}}' studio)" 0
  [ "$failures" = 0 ] || docker logs studio 2>&1 | tail -30
}

case ${1:-} in
  context) context ;;
  image) image "${2:?imagem}" ;;
  *) echo "uso: $0 context | image <imagem>" >&2 && exit 2 ;;
esac
[ "$failures" = 0 ] || { echo "$failures checagem(ns) falharam" && exit 1; }
