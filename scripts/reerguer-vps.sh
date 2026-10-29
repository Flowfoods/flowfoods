#!/usr/bin/env bash
# Reerguer a VPS — roda no runner do GitHub (ação "reerguer-vps" do barney-ops).
#
# Uma etapa por execução, para cada passo ser lido antes do próximo:
#   diagnosticar  só leitura: rede, estado na Hostinger, saúde por SSH, apps no Dokploy
#   reiniciar     restart/start pela API da Hostinger — recusa se a VM estiver
#                 suspensa ou se o SSH/painel ainda responder
#   limpar-cache  docker builder prune + image prune, SÓ se o disco passar de 90%
#   subir         Docker → Dokploy/Traefik → lista de IDs, um por vez, esperando cada um
#   provar        HTTP + certificado + DNS de cada domínio cadastrado no Dokploy
#   leitura-ifood-test  roda no worker a leitura TEST do iFood (INT-1.4); ALVOS = Client ID[,loja=][,dia=][,token-novo]
#
# Regras que o script garante:
#   - nunca imprime token, senha ou chave; da API do Dokploy só saem nome, id,
#     status e domínio (o JSON bruto tem variáveis de ambiente — não vai para o log);
#   - nunca apaga volume: não existe "volume prune" nem "system prune" aqui.
#
# Variáveis (vêm dos secrets do repositório):
#   DOKPLOY_URL, DOKPLOY_API_TOKEN, HOSTINGER_API_TOKEN, VPS_SSH_KEY,
#   VPS_SSH_USER (padrão root), VPS_HOST (padrão 76.13.230.78)
#   ALVOS (etapa subir): "traefik,compose:ID,application:ID,postgres:ID,redis:ID" — na ordem

set -uo pipefail
ETAPA="${1:-diagnosticar}"
VPS_IP="${VPS_HOST:-76.13.230.78}"
VPS_NOME="srv1608769"
SSH_USER="${VPS_SSH_USER:-root}"
HAPI="https://developers.hostinger.com/api/vps/v1"
RESUMO="${GITHUB_STEP_SUMMARY:-/dev/null}"

titulo() { echo; echo "================ $* — $(date -u +%H:%M:%SZ) ================"; }
tem() { [ -n "${!1:-}" ]; }

# ------------------------------------------------------------------ SSH
SSH_OK=0
preparar_ssh() {
  tem VPS_SSH_KEY || return 1
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  printf '%s\n' "$VPS_SSH_KEY" > ~/.ssh/vps && chmod 600 ~/.ssh/vps
  return 0
}
rssh() {
  ssh -i ~/.ssh/vps -o BatchMode=yes -o ConnectTimeout=15 \
      -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=20 \
      "${SSH_USER}@${VPS_IP}" "$@"
}
testar_ssh() {
  SSH_OK=0
  preparar_ssh || { echo "SSH: secret VPS_SSH_KEY ausente — pulei"; return 1; }
  if rssh 'echo ok' >/dev/null 2>&1; then SSH_OK=1; echo "SSH: responde"; else echo "SSH: NÃO responde"; fi
}

# ------------------------------------------------------------- Hostinger
VM_ID=""; VM_ESTADO=""
hostinger_estado() {
  VM_ID=""; VM_ESTADO=""
  if ! tem HOSTINGER_API_TOKEN; then echo "Hostinger: secret HOSTINGER_API_TOKEN ausente — pulei"; return 1; fi
  code=$(curl -sS -o /tmp/vms.json -w '%{http_code}' --max-time 30 \
           -H "Authorization: Bearer ${HOSTINGER_API_TOKEN}" "${HAPI}/virtual-machines" || echo 000)
  if [ "$code" != 200 ]; then echo "Hostinger: GET virtual-machines -> HTTP $code"; return 1; fi
  linha=$(jq -r --arg n "$VPS_NOME" --arg ip "$VPS_IP" '
      [ (if type=="array" then . else (.data // []) end)[]
        | select(((.hostname // "") | contains($n))
                 or ([.ipv4[]?.address, .ipv4[]?.ip?] | index($ip))) ][0]
      | if . == null then "" else "\(.id)\t\(.state)\t\(.hostname)\t\(.plan // "")" end' /tmp/vms.json)
  if [ -z "$linha" ]; then echo "Hostinger: VM ${VPS_NOME} não encontrada na conta deste token"; return 1; fi
  VM_ID=$(cut -f1 <<<"$linha"); VM_ESTADO=$(cut -f2 <<<"$linha")
  echo "Hostinger: id=${VM_ID} estado=${VM_ESTADO} host=$(cut -f3 <<<"$linha") plano=$(cut -f4 <<<"$linha")"
}

# --------------------------------------------------------------- Dokploy
DBASE=""
dokploy() { # $1 método · $2 caminho · $3 corpo opcional → corpo em /tmp/dk.json, imprime o código
  local corpo=()
  [ -n "${3:-}" ] && corpo=(-H 'Content-Type: application/json' -d "$3")
  curl -sk -o /tmp/dk.json -w '%{http_code}' --max-time 60 -X "$1" \
       -H "x-api-key: ${DOKPLOY_API_TOKEN}" "${corpo[@]}" "${DBASE}$2" || echo 000
}
preparar_dokploy() {
  if ! tem DOKPLOY_URL || ! tem DOKPLOY_API_TOKEN; then echo "Dokploy: faltam DOKPLOY_URL/DOKPLOY_API_TOKEN"; return 1; fi
  DBASE=$(printf '%s' "$DOKPLOY_URL" | sed -E 's#^(https?://[^/]+).*#\1#')
}
# Inventário sem segredo: tipo, id, nome, status, domínios. Funciona com o
# formato antigo (projeto → serviços) e o novo (projeto → ambiente → serviços).
inventario() {
  preparar_dokploy || return 1
  code=$(dokploy GET /api/project.all)
  if [ "$code" != 200 ]; then echo "Dokploy: project.all -> HTTP $code"; return 1; fi
  jq -r '
    [ .. | objects | select(has("domainId") | not) |
      if   has("composeId")     and has("composeStatus")     then {t:"compose",     id:.composeId,     s:.composeStatus}
      elif has("applicationId") and has("applicationStatus") then {t:"application", id:.applicationId, s:.applicationStatus}
      elif has("postgresId")    and has("applicationStatus") then {t:"postgres",    id:.postgresId,    s:.applicationStatus}
      elif has("redisId")       and has("applicationStatus") then {t:"redis",       id:.redisId,       s:.applicationStatus}
      elif has("mysqlId")       and has("applicationStatus") then {t:"mysql",       id:.mysqlId,       s:.applicationStatus}
      elif has("mariadbId")     and has("applicationStatus") then {t:"mariadb",     id:.mariadbId,     s:.applicationStatus}
      elif has("mongoId")       and has("applicationStatus") then {t:"mongo",       id:.mongoId,       s:.applicationStatus}
      else empty end
      + {n:(.name // .appName // "?"), d:([.domains[]?.host] | join(" "))} ]
    | unique_by(.id) | sort_by(.t, .n)[]
    | "\(.t)\t\(.id)\t\(.n)\t\(.s)\t\(.d)"' /tmp/dk.json > /tmp/inventario.tsv
  column -t -s $'\t' -N TIPO,ID,NOME,STATUS,DOMINIOS /tmp/inventario.tsv 2>/dev/null || cat /tmp/inventario.tsv
}

# Domínios cadastrados em cada compose/application → /tmp/dominios.tsv
# (host, serviço, https, tipo de certificado). Precisa do inventário antes.
coletar_dominios() {
  : > /tmp/dominios.tsv
  [ -s /tmp/inventario.tsv ] || return 0
  while IFS=$'\t' read -r t id n _ _; do
    case "$t" in compose) q="domain.byComposeId?composeId=$id" ;; application) q="domain.byApplicationId?applicationId=$id" ;; *) continue ;; esac
    [ "$(dokploy GET "/api/$q")" = 200 ] || continue
    jq -r --arg n "$n" '.[]? | "\(.host)\t\($n)\t\(.https)\t\(.certificateType // "")"' /tmp/dk.json >> /tmp/dominios.tsv
  done < /tmp/inventario.tsv
}

# "recusada" = nada escutando (serviço parado); "expirou" = pacote descartado
# (firewall). A diferença decide onde procurar.
porta() {
  local out
  out=$(nc -vz -w 8 "$VPS_IP" "$1" 2>&1)
  case "$out" in
    *succeeded*|*open*) echo "porta $1: ABERTA" ;;
    *refused*)          echo "porta $1: RECUSADA (nada escutando)" ;;
    *timed\ out*|*Operation\ now*|"") echo "porta $1: EXPIROU (pacote descartado — firewall?)" ;;
    *) echo "porta $1: $out" ;;
  esac
}

# ================================================================ etapas
diagnosticar() {
  titulo "1. Rede (do runner)"
  ping -c 3 -W 3 "$VPS_IP" >/dev/null 2>&1 && echo "ping: responde" || echo "ping: sem resposta (pode ser ICMP bloqueado)"
  timeout 8 bash -c "echo > /dev/tcp/${VPS_IP}/22" 2>/dev/null && echo "porta 22: aberta" || echo "porta 22: fechada/sem resposta"
  echo "painel :3000 -> HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://${VPS_NOME}.hstgr.cloud:3000" || true)"
  echo "consultoriaflowfoods.com.br -> HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://consultoriaflowfoods.com.br || true)"

  titulo "2. Hostinger"
  hostinger_estado || true
  case "$VM_ESTADO" in
    suspended|suspending) echo "::error title=VPS SUSPENSA::Estado ${VM_ESTADO}. Não reinicie — ver pagamento/abuso no hPanel." ;;
  esac

  titulo "3. Saúde por SSH (só leitura)"
  testar_ssh || true
  if [ "$SSH_OK" = 1 ]; then
    rssh 'bash -s' <<'REMOTO'
sec() { echo; echo "--- $* ---"; }
sec uptime; uptime
sec "boots recentes"; last -x reboot shutdown 2>/dev/null | head -8
sec "free -h"; free -h
sec "swap"; swapon --show 2>/dev/null || echo "(sem swap)"
sec "df -h"; df -h -x tmpfs -x overlay 2>/dev/null
sec "df -i"; df -i / 2>/dev/null
sec "docker system df"; docker system df 2>&1
sec "OOM no boot atual (dmesg)"; dmesg -T 2>/dev/null | grep -i -E "out of memory|oom-kill|killed process" | tail -30
sec "OOM no boot anterior (journal)"; journalctl -k -b -1 --no-pager 2>/dev/null | grep -i -E "out of memory|oom-kill|killed process" | tail -30
sec "erros do boot anterior"; journalctl -b -1 -p err --no-pager 2>/dev/null | tail -100
sec "fim do boot anterior"; journalctl -b -1 --no-pager 2>/dev/null | tail -40
sec "docker"; systemctl is-active docker; systemctl status docker --no-pager 2>&1 | head -12
sec "containers"; docker ps -a --format "table {{.Names}}\t{{.Status}}" 2>&1 | head -80
sec "swarm services"; docker service ls 2>&1
sec "builds do docker hoje (journal)"; journalctl -u docker --since today --no-pager 2>/dev/null | grep -i -c "build" || true
sec "maiores consumidores de memória agora"; ps -eo pid,rss,comm --sort=-rss | head -12
REMOTO
  fi

  titulo "4. Dokploy (inventário, sem segredos)"
  inventario || true
  [ -s /tmp/inventario.tsv ] || return 0

  titulo "5. Portas 80/443 e DNS (resolvedor público)"
  for p in 22 80 443 3000; do porta "$p"; done

  titulo "6. Containers (via API do Dokploy: nome, estado)"
  code=$(dokploy GET /api/docker.getContainers)
  if [ "$code" = 200 ]; then
    jq -r '.[] | "\(.name // .Names // "?")\t\(.state // .State // "?")\t\(.status // .Status // "")"' /tmp/dk.json \
      | sort | column -t -s $'\t' 2>/dev/null
  else echo "docker.getContainers -> HTTP $code"; fi

  titulo "7. Domínios cadastrados"
  coletar_dominios
  while IFS=$'\t' read -r h n https cert; do
    ip=$(dig +short +time=3 +tries=1 A "$h" @1.1.1.1 | tail -1)
    printf '%-40s %-20s https=%-5s cert=%-12s A=%s\n' "$h" "$n" "$https" "$cert" "${ip:-?}"
  done < /tmp/dominios.tsv

  titulo "8. Deploys das últimas 36 h (todas as apps) — builds simultâneos?"
  : > /tmp/deploys.tsv
  desde=$(date -u -d '36 hours ago' +%Y-%m-%dT%H:%M)
  while IFS=$'\t' read -r t id n _ _; do
    case "$t" in compose|application) ;; *) continue ;; esac
    if [ "$t" = compose ]; then q="deployment.allByCompose?composeId=$id"; else q="deployment.all?applicationId=$id"; fi
    c=$(dokploy GET "/api/$q"); [ "$c" = 200 ] || { echo "  $n: $q -> HTTP $c"; continue; }
    jq -r --arg n "$n" --arg d "$desde" '.[]? | select(.createdAt >= $d)
      | "\(.createdAt)\t\(.finishedAt // "-")\t\(.status)\t\($n)\t\(.title // "" | .[0:70])"' /tmp/dk.json >> /tmp/deploys.tsv
  done < /tmp/inventario.tsv
  sort /tmp/deploys.tsv | column -t -s $'\t' 2>/dev/null || sort /tmp/deploys.tsv
  [ -s /tmp/deploys.tsv ] || { echo "(nenhum — formato da resposta:)"; jq -c 'if type=="array" then (.[0] // {} | keys) else keys end' /tmp/dk.json 2>/dev/null | head -c 400; echo; }

  titulo "9. Traefik (inspect: só estado, portas, rede, reinícios)"
  for c in dokploy-traefik; do
    code=$(dokploy GET "/api/docker.getConfig?containerId=${c}")
    echo "docker.getConfig ${c} -> HTTP ${code}"
    jq -c 'if type=="object" and has("State") then "inspect ok" elif type=="object" then {sem_State: true, chaves: (keys|.[0:10]), message: (.message // null | tostring | .[0:300])} else {tipo: type, inicio: (tostring|.[0:200])} end' /tmp/dk.json 2>/dev/null || head -c 300 /tmp/dk.json
    [ "$code" = 200 ] && jq -c '{State: (.State | {Status, Running, Restarting, ExitCode, Error, StartedAt, FinishedAt, OOMKilled}),
        RestartCount, RestartPolicy: .HostConfig.RestartPolicy.Name, NetworkMode: .HostConfig.NetworkMode,
        PortBindings: .HostConfig.PortBindings, Ports: .NetworkSettings.Ports,
        Redes: (.NetworkSettings.Networks | keys)}' /tmp/dk.json 2>/dev/null
  done
  if [ "$(dokploy GET "/api/docker.getConfig?containerId=dokploy-traefik")" = 200 ]; then
    echo "-- imagem, montagens (só origem→destino), redes com endpoint --"
    jq -c '{Image: .Config.Image, Created, Mounts: [.Mounts[]? | "\(.Source)→\(.Destination)"],
            Redes: (.NetworkSettings.Networks | to_entries | map({rede: .key, NetworkID: (.value.NetworkID // "" | .[0:12]),
                    EndpointID: (.value.EndpointID // "" | .[0:12]), IP: .value.IPAddress}))}' /tmp/dk.json
  fi
  code=$(dokploy GET "/api/docker.getContainersByAppNameMatch?appName=traefik")
  echo "containers '*traefik*' -> HTTP ${code}"
  [ "$code" = 200 ] && jq -r '.[]? | "  \(.name)\t\(.state)\t\(.status)"' /tmp/dk.json
  code=$(dokploy GET "/api/docker.getContainersByAppNameMatch?appName=dokploy")
  echo "containers 'dokploy*' -> HTTP ${code}"
  [ "$code" = 200 ] && jq -r '.[]? | "  \(.name)\t\(.state)\t\(.status)"' /tmp/dk.json

  titulo "10. Dokploy: versão e config do Traefik (só estrutura, sem e-mail/senha)"
  code=$(dokploy GET /api/settings.getDokployVersion); echo "versão -> HTTP $code: $(head -c 80 /tmp/dk.json)"
  code=$(dokploy GET /api/settings.readTraefikConfig); echo "readTraefikConfig -> HTTP $code"
  if [ "$code" = 200 ]; then
    jq -r 'if type=="string" then . else tostring end' /tmp/dk.json 2>/dev/null \
      | grep -E '^[a-zA-Z]|^  [a-zA-Z]|address:|network:|exposedByDefault|swarmMode|endpoint:|watch:|directory:|entryPoint:|certResolver|storage:' \
      | grep -viE 'email|password|token|secret|key|user' | head -60
  fi

  titulo "10b. Rotas da API do Dokploy ligadas ao Traefik (OpenAPI)"
  for rota in /api/settings.getOpenApiDocument /swagger.json /api/openapi.json; do
    code=$(dokploy GET "$rota"); echo "$rota -> HTTP $code"
    if [ "$code" = 200 ] && jq -e .paths /tmp/dk.json >/dev/null 2>&1; then
      jq -r '.paths | to_entries[] | select(.key | test("raefik|cleanup|Cleanup|prune|clean"; "")) |
        .key as $k | .value | to_entries[] |
        "\(.key | ascii_upcase) \($k)  corpo: \((.value.requestBody.content["application/json"].schema.properties // {}) | keys | join(","))"' /tmp/dk.json
      break
    fi
  done

  code=$(dokploy GET /api/user.get); [ "$code" = 200 ] || code=$(dokploy GET /api/admin.one)
  echo "limpeza automática do Docker (enableDockerCleanup) -> HTTP $code: $(jq -r '[.. | objects | .enableDockerCleanup? // empty][0] // "não encontrado"' /tmp/dk.json 2>/dev/null)"

  code=$(dokploy GET /api/settings.readTraefikEnv)
  echo "readTraefikEnv -> HTTP $code; nomes das variáveis (sem valores): $(jq -r 'if type=="string" then . else tostring end' /tmp/dk.json 2>/dev/null | grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' | tr -d '=' | tr '\n' ' ')"
  code=$(dokploy GET /api/docker.getContainersByAppNameMatch?appName=dokploy)
  echo "imagem do serviço dokploy (referência de versão): $(jq -r '.[0].image? // empty' /tmp/dk.json 2>/dev/null)"

  titulo "11. Compose ssh-setup (o que é — só nomes, imagens, montagens)"
  id=$(awk -F'\t' '$3=="ssh-setup"{print $2}' /tmp/inventario.tsv)
  if [ -n "$id" ] && [ "$(dokploy GET "/api/compose.one?composeId=$id")" = 200 ]; then
    jq -r '"criado: \(.createdAt)  fonte: \(.sourceType)  descrição: \(.description // "-")"' /tmp/dk.json
    jq -r '.composeFile // ""' /tmp/dk.json | grep -E '^\s*(services:|[a-z0-9_-]+:\s*$|image:|privileged:|pid:|network_mode:|- /)' \
      | grep -viE 'password|token|secret|key=' | head -30
  fi
}

reiniciar() {
  hostinger_estado || { echo "::error::Sem acesso à API da Hostinger — reinicie pelo hPanel (VPS → Gerenciar → Reiniciar)."; exit 1; }
  case "$VM_ESTADO" in
    suspended|suspending) echo "::error title=VPS SUSPENSA::Não reiniciei. Ver pagamento/abuso no hPanel."; exit 1 ;;
  esac
  testar_ssh || true
  if [ "$SSH_OK" = 1 ]; then echo "::warning::SSH responde — NÃO reiniciei a máquina. Siga para limpar-cache/subir."; exit 0; fi
  if ! tem VPS_SSH_KEY && curl -s -o /dev/null --max-time 15 "http://${VPS_NOME}.hstgr.cloud:3000"; then
    echo "::warning::Painel do Dokploy responde — a máquina está viva. NÃO reiniciei."; exit 0
  fi
  acao=restart; [ "$VM_ESTADO" = stopped ] && acao=start
  echo "Disparando ${acao} (estado atual: ${VM_ESTADO})"
  code=$(curl -sS -o /tmp/r.json -w '%{http_code}' --max-time 60 -X POST \
           -H "Authorization: Bearer ${HOSTINGER_API_TOKEN}" "${HAPI}/virtual-machines/${VM_ID}/${acao}" || echo 000)
  echo "POST ${acao} -> HTTP ${code}"
  case "$code" in 2*) ;; *) echo "::error::Hostinger recusou o ${acao}."; exit 1 ;; esac
  for i in $(seq 1 30); do
    sleep 10
    if timeout 5 bash -c "echo > /dev/tcp/${VPS_IP}/22" 2>/dev/null; then
      echo "Porta 22 voltou após ~$((i*10)) s"; sleep 20; testar_ssh || true; hostinger_estado || true; exit 0
    fi
  done
  hostinger_estado || true
  echo "::error::Após 5 min a porta 22 não voltou."; exit 1
}

limpar_cache() {
  testar_ssh || true
  [ "$SSH_OK" = 1 ] || { echo "::error::Sem SSH, não limpo nada."; exit 1; }
  rssh 'bash -s' <<'REMOTO'
uso=$(df --output=pcent / | tail -1 | tr -dc 0-9)
echo "Disco / em ${uso}%"
if [ "$uso" -lt 90 ]; then echo "Abaixo de 90% — nada a limpar."; exit 0; fi
echo "--- antes ---"; docker system df
docker builder prune -f
docker image prune -f
echo "--- depois ---"; docker system df; df -h /
REMOTO
}

esperar() { # $1 tipo · $2 id → espera sair de "running" (até 20 min)
  local campo="applicationStatus" chave
  [ "$1" = compose ] && campo="composeStatus"
  chave="${1}Id"
  for i in $(seq 1 80); do
    sleep 15
    code=$(dokploy GET "/api/${1}.one?${chave}=${2}")
    st=$(jq -r ".${campo} // \"?\"" /tmp/dk.json 2>/dev/null)
    echo "  [$((i*15))s] ${1} ${2}: ${st} (HTTP ${code})"
    case "$st" in done) return 0 ;; error) return 1 ;; esac
  done
  return 2
}

subir() {
  testar_ssh || true
  if [ "$SSH_OK" = 1 ]; then
    titulo "Docker e Dokploy/Traefik"
    rssh 'bash -s' <<'REMOTO'
systemctl is-active --quiet docker || { echo "docker parado — iniciando"; systemctl start docker; sleep 15; }
echo "docker: $(systemctl is-active docker)"
# Traefik é container avulso (não é serviço do Swarm). No boot ele pode tentar
# entrar na rede overlay dokploy-network antes do Swarm ficar pronto e morrer com
# "attaching to network failed ... context deadline exceeded" — e daí nem
# restart resolve. Solta a rede à força, sobe, e reconecta.
c=dokploy-traefik
st=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo ausente)
echo "$c: $st"
if [ "$st" = exited ] || [ "$st" = created ]; then
  docker start "$c" 2>/dev/null || {
    echo "start direto falhou — destravando a rede"
    docker network disconnect -f dokploy-network "$c" 2>&1
    docker start "$c" && docker network connect dokploy-network "$c" 2>&1
  }
  sleep 5; docker ps -a --filter name="$c" --format "{{.Names}}\t{{.Status}}"
fi
sleep 10
docker service ls --format "table {{.Name}}\t{{.Replicas}}" 2>&1 | grep -E "NAME|dokploy" || true
REMOTO
  fi
  preparar_dokploy || exit 1
  for i in $(seq 1 12); do
    curl -sk -o /dev/null --max-time 10 "${DBASE}" && break
    echo "Painel ainda não responde (${i}/12)"; sleep 15
  done
  [ -n "${ALVOS:-}" ] || { echo "Sem ALVOS — só conferi Docker/Dokploy."; inventario; exit 0; }

  falhas=0
  IFS=',' read -ra lista <<<"$ALVOS"
  for alvo in "${lista[@]}"; do
    tipo="${alvo%%:*}"; id="${alvo#*:}"; tipo="${tipo// /}"; id="${id// /}"
    titulo "${tipo} ${id}"
    if [ "$tipo" = traefik ]; then
      code=$(dokploy POST /api/settings.reloadTraefik '{}')
      echo "POST settings.reloadTraefik -> HTTP ${code}"
      sleep 20
      for p in 80 443; do porta "$p"; done
      case "$code" in 2*) ;; *) falhas=$((falhas+1)) ;; esac
      continue
    fi
    if [ "$tipo" = container ]; then
      code=$(dokploy POST /api/docker.restartContainer "{\"containerId\":\"${id}\"}")
      echo "POST docker.restartContainer ${id} -> HTTP ${code}"; head -c 300 /tmp/dk.json; echo
      sleep 15
      code=$(dokploy GET "/api/docker.getConfig?containerId=${id}")
      jq -c '{Status: .State.Status, Error: .State.Error, StartedAt: .State.StartedAt, Ports: .NetworkSettings.Ports}' /tmp/dk.json 2>/dev/null
      for p in 80 443; do porta "$p"; done
      [ "$(jq -r .State.Running /tmp/dk.json 2>/dev/null)" = true ] || falhas=$((falhas+1))
      continue
    fi
    case "$tipo" in
      compose|application) rota="${tipo}.deploy" ;;
      postgres|redis|mysql|mariadb|mongo) rota="${tipo}.start" ;;
      *) echo "::warning::tipo desconhecido: $tipo"; continue ;;
    esac
    code=$(dokploy POST "/api/${rota}" "{\"${tipo}Id\":\"${id}\"}")
    echo "POST ${rota} -> HTTP ${code}"
    case "$code" in 2*) ;; *) echo "::warning::${tipo} ${id} não disparou"; falhas=$((falhas+1)); continue ;; esac
    if [ "$tipo" = compose ] || [ "$tipo" = application ]; then
      if esperar "$tipo" "$id"; then echo "OK: ${tipo} ${id}"; else echo "::warning::${tipo} ${id} terminou com erro ou passou de 20 min"; falhas=$((falhas+1)); fi
    else
      sleep 20
    fi
  done
  titulo "Inventário depois"
  inventario || true
  [ "$falhas" = 0 ] || exit 1
}

# Marcador de conteúdo esperado por domínio (literal). Sem marcador: só título.
marcador() {
  case "$1" in
    consultoriaflowfoods.com.br|www.consultoriaflowfoods.com.br) echo "Gastronomia que flui" ;;
    *) echo "" ;;
  esac
}

# Um domínio: DNS (resolvedor público), conexão, TLS VALIDADO (curl sem -k),
# HTTP, título e marcador. O motivo da falha vem do código de saída do curl —
# "000" sozinho não diz nada.
provar_um() {
  local d="$1" ip e http mk tit cert emissor vence st
  ip=$(dig +short +time=3 +tries=1 A "$d" @1.1.1.1 | grep -E '^[0-9.]+$' | tail -1)
  http=$(curl -sS -o "/tmp/p/$d.html" -w '%{http_code}' --max-time 15 "https://$d/" 2>"/tmp/p/$d.err"); e=$?
  case "$e" in
    0)  st="" ;;
    6)  st="DNS não resolve" ;;
    7)  st="conexão RECUSADA (nada na 443)" ;;
    28) st="conexão EXPIROU" ;;
    35) st="TLS: negociação falhou" ;;
    60) st="TLS: certificado INVÁLIDO" ;;
    *)  st="curl erro $e" ;;
  esac
  [ "$e" = 0 ] || http="-"
  cert=""
  case "$e" in 0|35|60)
    cert=$(echo | timeout 10 openssl s_client -connect "$d:443" -servername "$d" 2>/dev/null \
             | openssl x509 -noout -issuer -enddate 2>/dev/null) ;;
  esac
  emissor=$(sed -n 's/^issuer=.*O *= *\([^,]*\).*/\1/p' <<<"$cert" | head -1)
  vence=$(sed -n 's/^notAfter=//p' <<<"$cert")
  tit=$(grep -o -i '<title>[^<]*' "/tmp/p/$d.html" 2>/dev/null | head -1 | sed 's/<title>//I' | cut -c1-40)
  mk=$(marcador "$d")
  if [ "$e" = 0 ]; then
    case "$http" in 2*|3*) ;; *) st="HTTP $http" ;; esac
    if [ -z "$st" ] && [ -n "$mk" ] && ! grep -qF "$mk" "/tmp/p/$d.html"; then st="conteúdo inesperado"; fi
    [ -z "$st" ] && st=OK
  fi
  [ "$ip" != "$VPS_IP" ] && st="$st; DNS → ${ip:-nada}"
  printf '| %s | %s | %s | %s | %s | %s | %s |\n' "$d" "${ip:-?}" "${http:--}" \
    "$( [ "$e" = 0 ] && echo válido || { [ -n "$cert" ] && echo inválido || echo 'não lido'; } )" \
    "${emissor:--}" "${vence:--}" "$st${tit:+ · \"$tit\"}" > "/tmp/p/$d.linha"
}

provar() {
  inventario >/dev/null 2>&1 || true
  coletar_dominios
  {
    cut -f1 /tmp/dominios.tsv
    printf '%s\n' consultoriaflowfoods.com.br www.consultoriaflowfoods.com.br
    [ -n "${EXTRAS:-}" ] && tr ',' '\n' <<<"$EXTRAS"
  } | sed -E 's#^https?://##; s#/.*##; /^$/d' | grep -vE '^[0-9.]+$|^app\.seudominio' | sort -u > /tmp/dominios
  rm -rf /tmp/p; mkdir -p /tmp/p
  inicio=$(date -u +%H:%M:%SZ)
  while read -r d; do provar_um "$d" & done < /tmp/dominios
  wait
  cab="| Domínio | DNS → | HTTP | TLS | Emissor | Vence em | Resultado |"
  {
    echo "### Prova site por site — $inicio a $(date -u +%H:%M:%SZ)"; echo; echo "$cab"; echo "|---|---|---|---|---|---|---|"
    while read -r d; do cat "/tmp/p/$d.linha"; done < /tmp/dominios
  } | tee -a "$RESUMO"
  ok=$(grep -c '| OK' /tmp/p/*.linha 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
  echo; echo "OK: $ok de $(wc -l < /tmp/dominios)  (TLS validado; HTTP '-' = sem resposta, não é código do site)"
  # Sentinela: falha se algum domínio real (não sslip/traefik.me) não estiver OK.
  if [ -n "${FALHAR_SE_FORA:-}" ]; then
    fora=$(grep -L '| OK' /tmp/p/*.linha 2>/dev/null | xargs -r -n1 basename | sed 's/\.linha$//' | grep -vE 'sslip\.io|traefik\.me' || true)
    if [ -n "$fora" ]; then echo "::error title=Sites fora::$(echo $fora)"; SENTINELA_FALHOU=1; fi
  fi
  if [ "$(dokploy GET "/api/docker.getConfig?containerId=dokploy-traefik" 2>/dev/null)" = 200 ] && [ -s /tmp/dk.json ]; then
    echo "Traefik: $(jq -c '{Status: .State.Status, StartedAt: .State.StartedAt, RestartCount, Error: .State.Error}' /tmp/dk.json 2>/dev/null)"
  else
    echo "Traefik: container não existe (ou sem leitura)"
  fi
  [ -z "${SENTINELA_FALHOU:-}" ] || exit 1
}

# Espera a 443 abrir (até ALVOS minutos, padrão 20) e roda a prova duas vezes,
# com 5 min entre elas, para ver se o Traefik fica de pé.
aguardar_e_provar() {
  preparar_dokploy || true
  max="${ALVOS:-20}"; case "$max" in ''|*[!0-9]*) max=20 ;; esac
  for i in $(seq 1 "$max"); do
    if nc -z -w 5 "$VPS_IP" 443 2>/dev/null; then
      echo "443 abriu às $(date -u +%H:%M:%SZ)"
      titulo "Rodada 1"; provar
      sleep 300
      titulo "Rodada 2 (+5 min)"; provar
      return 0
    fi
    echo "$(date -u +%H:%M:%SZ) 443 ainda fechada ($i/$max)"; sleep 55
  done
  echo "::warning::443 não abriu em $max min."; provar; exit 1
}

# Recria o dokploy-traefik pelo caminho gerenciado do Dokploy
# (settings.updateTraefikPorts reconstrói o container com traefik.yml, dynamic/
# e acme.json do host). Reenvia as MESMAS portas extras que o Dokploy já tem:
# nenhuma configuração muda. Recusa se o container existir.
recriar_traefik() {
  preparar_dokploy || exit 1
  titulo "Estado antes"
  code=$(dokploy GET "/api/docker.getContainersByAppNameMatch?appName=traefik")
  n=$(jq 'length' /tmp/dk.json 2>/dev/null || echo "?")
  echo "containers *traefik* -> HTTP $code, quantidade: $n"
  if [ "$code" != 200 ] || [ "$n" != 0 ]; then
    echo "::error::Container do Traefik existe (ou leitura falhou) — não recrio. Use o destravamento de rede."; exit 1
  fi
  code=$(dokploy GET /api/settings.getTraefikPorts)
  echo "getTraefikPorts -> HTTP $code: $(head -c 300 /tmp/dk.json)"
  if [ "$code" = 200 ]; then
    portas=$(jq -c 'if type=="array" then . else (.additionalPorts // .ports // []) end' /tmp/dk.json)
  elif [ "${ALVOS:-}" != "${ALVOS#portas=}" ]; then
    # O Dokploy lê as portas do container; sem container, a leitura falha.
    # Só segue com valor passado à mão, tirado de um inspect anterior.
    portas="${ALVOS#portas=}"
    jq -e 'type=="array"' <<<"$portas" >/dev/null || { echo "::error::portas= precisa ser um array JSON"; exit 1; }
    echo "Usando portas extras informadas: $portas"
  else
    echo "::error::Não li as portas atuais — não recrio. Informe alvos=portas=[...] a partir de um inspect anterior."; exit 1
  fi
  code=$(dokploy GET /api/settings.haveTraefikDashboardPortEnabled); echo "dashboard habilitado? HTTP $code: $(head -c 50 /tmp/dk.json)"

  titulo "Recriando (mesmas portas extras: $portas)"
  code=$(dokploy POST /api/settings.updateTraefikPorts "{\"additionalPorts\":${portas}}")
  echo "POST updateTraefikPorts -> HTTP $code: $(head -c 400 /tmp/dk.json)"
  case "$code" in 2*) ;; *) echo "::error::Dokploy recusou recriar o Traefik (HTTP $code). Nada foi criado."; exit 1 ;; esac

  for t in 15 30 60; do
    sleep "$t"
    titulo "Depois (+${t}s)"
    dokploy GET "/api/docker.getConfig?containerId=dokploy-traefik" >/dev/null
    jq -c '{Status: .State.Status, Running: .State.Running, Error: .State.Error, StartedAt: .State.StartedAt, RestartCount,
            Ports: .NetworkSettings.Ports, Redes: (.NetworkSettings.Networks // {} | keys)}' /tmp/dk.json 2>/dev/null || echo "(sem container)"
    for p in 80 443; do porta "$p"; done
  done
}

# Mostra o esquema (campos e obrigatórios) de rotas da API. ALVOS = rotas
# separadas por vírgula, ex. /compose.create,/compose.update
api_schema() {
  preparar_dokploy || exit 1
  dokploy GET /api/settings.getOpenApiDocument >/dev/null
  IFS=',' read -ra rotas <<<"${ALVOS:-}"
  for r in "${rotas[@]}"; do
    jq -c --arg r "$r" '.paths[$r] // {} | to_entries[] | {rota: $r, metodo: .key,
      obrigatorios: (.value.requestBody.content["application/json"].schema.required // []),
      campos: ((.value.requestBody.content["application/json"].schema.properties // {}) | map_values(.type // (.enum|tostring) // "?")),
      query: [.value.parameters[]?.name]}' /tmp/dk.json
  done
}

# Recria o Traefik por um compose de uso único no Dokploy (o Dokploy tem o
# docker.sock do host). Usado quando não há SSH. Executa
# scripts/infra/reerguer-traefik.sh, lê o relatório e remove o compose.
traefik_via_compose() {
  preparar_dokploy || exit 1
  titulo "Guarda"
  dokploy GET "/api/docker.getContainersByAppNameMatch?appName=traefik" >/dev/null
  n=$(jq 'length' /tmp/dk.json 2>/dev/null || echo "?")
  [ "$n" = 0 ] || { echo "::error::Já existe container *traefik* ($n) — não executo."; exit 1; }
  inventario >/dev/null
  ref=$(awk -F'\t' '$3=="ssh-setup"{print $2}' /tmp/inventario.tsv)
  dokploy GET "/api/compose.one?composeId=$ref" >/dev/null
  env_id=$(jq -r '.environmentId // empty' /tmp/dk.json)
  [ -n "$env_id" ] || { echo "::error::Não achei environmentId"; exit 1; }
  echo "ambiente: $env_id"

  script=$(sed 's/\$/$$/g' scripts/infra/reerguer-traefik.sh)
  compose=$(cat <<YML
services:
  reerguer:
    image: docker:27-cli
    restart: "no"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /etc/dokploy/traefik:/tf:ro
      - /etc/dokploy/traefik/reerguer:/out
    entrypoint: ["sh", "-c"]
    command:
      - |
$(sed 's/^/        /' <<<"$script")
YML
)
  titulo "Criando compose temporário"
  corpo=$(jq -n --arg n reerguer-traefik --arg e "$env_id" --arg f "$compose" \
    '{name:$n, appName:"reerguer-traefik", environmentId:$e, composeType:"docker-compose", composeFile:$f, description:"temporário: recriar dokploy-traefik (24/10)"}')
  code=$(dokploy POST /api/compose.create "$corpo"); echo "compose.create -> HTTP $code"
  cid=$(jq -r '.composeId // empty' /tmp/dk.json)
  if [ -z "$cid" ]; then
    inventario >/dev/null; cid=$(awk -F'\t' '$1=="compose" && $3=="reerguer-traefik"{print $2}' /tmp/inventario.tsv | head -1)
  fi
  [ -n "$cid" ] || { echo "::error::compose não criado: $(head -c 300 /tmp/dk.json)"; exit 1; }
  # Garante o arquivo e a fonte raw (o create pode ignorar composeFile)
  code=$(dokploy POST /api/compose.update "$(jq -n --arg c "$cid" --arg f "$compose" '{composeId:$c, composeFile:$f, sourceType:"raw"}')")
  echo "compose.update -> HTTP $code (id $cid)"

  titulo "Deploy"
  code=$(dokploy POST /api/compose.deploy "{\"composeId\":\"$cid\",\"title\":\"recriar dokploy-traefik\"}"); echo "compose.deploy -> HTTP $code"
  esperar compose "$cid" || echo "::warning::deploy do compose não terminou em done"
  sleep 60

  titulo "Resultado"
  dokploy GET "/api/docker.getConfig?containerId=dokploy-traefik" >/dev/null
  jq -c '{Status: .State.Status, Running: .State.Running, Error: .State.Error, StartedAt: .State.StartedAt, RestartCount,
          Ports: (.NetworkSettings.Ports | keys?), Redes: (.NetworkSettings.Networks // {} | keys)}' /tmp/dk.json 2>/dev/null || echo "(sem container)"
  for p in 80 443; do porta "$p"; done
  titulo "Relatório do host"
  for path in /etc/dokploy/traefik/reerguer/reerguer.log reerguer/reerguer.log; do
    code=$(dokploy GET "/api/settings.readTraefikFile?path=$(jq -rn --arg p "$path" '$p|@uri')")
    echo "readTraefikFile $path -> HTTP $code"
    if [ "$code" = 200 ]; then jq -r 'if type=="string" then . else tostring end' /tmp/dk.json | head -80; break; fi
  done

  titulo "Removendo compose temporário (sem volumes)"
  code=$(dokploy POST /api/compose.delete "{\"composeId\":\"$cid\",\"deleteVolumes\":false}"); echo "compose.delete -> HTTP $code"
  dokploy GET "/api/docker.getConfig?containerId=dokploy-traefik" >/dev/null
  [ "$(jq -r '.State.Running // false' /tmp/dk.json 2>/dev/null)" = true ] || exit 1
}

# Leitura TEST do iFood (INT-1.4, decisão 486) no worker do servidor, por um compose de uso único com o docker.sock (o mesmo
# caminho do traefik-via-compose: a sessão do Claude não alcança a VPS). ALVOS = "<Client ID>[,loja=<uuid>][,dia=AAAA-MM-DD]
# [,token-novo]". Antes do comando, mostra só sim/não das variáveis da integração no worker. O comando recusa sozinho (saída 2,
# sem chamar o iFood) com a chave geral desligada ou sem o segredo, e nunca imprime token nem segredo. Do Dokploy só se leem
# appName e environmentId: o JSON do compose traz as variáveis do painel e não vai para o log.
leitura_ifood_test() {
  preparar_dokploy || exit 1
  local uuid='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  local cid="" args="" item itens
  IFS=',' read -ra itens <<<"${ALVOS:-}"
  for item in "${itens[@]}"; do
    item=$(printf '%s' "$item" | tr -d '[:space:]')
    case "$item" in
      "") ;;
      loja=*) [[ "${item#loja=}" =~ $uuid ]] || { echo "::error::loja= precisa ser o UUID da loja"; exit 2; }; args="$args --loja ${item#loja=}" ;;
      dia=*) [[ "${item#dia=}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "::error::dia= precisa ser AAAA-MM-DD"; exit 2; }; args="$args --dia ${item#dia=}" ;;
      token-novo) args="$args --token-novo" ;;
      *) { [[ "$item" =~ $uuid ]] && [ -z "$cid" ]; } || { echo "::error::alvos: Client ID (UUID) e, opcionais, loja=, dia=, token-novo"; exit 2; }; cid="$item" ;;
    esac
  done
  [ -n "$cid" ] || { echo "::error::Informe em alvos o Client ID do app Teste (C)."; exit 2; }
  args="--client-id ${cid}${args}"

  titulo "App do site no Dokploy"
  local web="${COMPOSE_WEB:-JWsPI2ZLgUrh11MS_EwwB}" projeto env_id
  code=$(dokploy GET "/api/compose.one?composeId=${web}")
  projeto=$(jq -r '.appName // empty' /tmp/dk.json 2>/dev/null | tr '[:upper:]' '[:lower:]')
  env_id=$(jq -r '.environmentId // empty' /tmp/dk.json 2>/dev/null)
  : > /tmp/dk.json
  echo "compose.one -> HTTP $code · projeto: ${projeto:-?}"
  [[ "$projeto" =~ ^[a-z0-9_-]+$ ]] && [ -n "$env_id" ] || { echo "::error::Não li appName/environmentId do app do site."; exit 1; }

  # Sobra de uma execução anterior que não terminou: remove (só o compose de uso único, sem volumes).
  inventario >/dev/null || true
  awk -F'\t' '$1=="compose" && $3=="leitura-ifood-test"{print $2}' /tmp/inventario.tsv 2>/dev/null | while read -r velho; do
    code=$(dokploy POST /api/compose.delete "{\"composeId\":\"$velho\",\"deleteVolumes\":false}"); echo "sobra $velho removida -> HTTP $code"
  done

  local marca="${GITHUB_RUN_ID:-local}-$RANDOM"
  local script
  script=$(cat <<'SH'
OUT=/out/leitura-ifood-test.log
{
  echo "marca=$MARCA"
  echo "início: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  c=$(docker ps --filter "label=com.docker.compose.project=$PROJETO" --filter label=com.docker.compose.service=worker --format '{{.Names}}' | head -1)
  if [ -z "$c" ]; then
    echo "Worker não encontrado no projeto $PROJETO. Containers *worker* no host:"
    docker ps --format '{{.Names}}' | grep -i worker || echo "(nenhum)"
    echo "saida=3"
  else
    echo "worker: $c ($(docker inspect -f '{{.State.Status}} desde {{.State.StartedAt}}' "$c"))"
    echo "variáveis da integração no worker (só sim/não):"
    docker exec "$c" sh -c '. ./scripts/exportar-segredos.sh >/dev/null 2>&1
      [ "${INTEGRACAO_IFOOD_ATIVA:-}" = true ] && echo "  INTEGRACAO_IFOOD_ATIVA: true" || echo "  INTEGRACAO_IFOOD_ATIVA: não é true"
      [ -n "${IFOOD_TEST_CLIENT_SECRET:-}" ] && echo "  IFOOD_TEST_CLIENT_SECRET: presente" || echo "  IFOOD_TEST_CLIENT_SECRET: ausente"
      [ -n "${INTEGRACAO_CHAVE_CIFRAGEM:-}" ] && echo "  INTEGRACAO_CHAVE_CIFRAGEM: presente" || echo "  INTEGRACAO_CHAVE_CIFRAGEM: ausente"'
    echo "comando: npm run integracao:ler-test -- $ARGS"
    docker exec "$c" sh -c '. ./scripts/exportar-segredos.sh && npm run --silent integracao:ler-test -- "$@"' leitura $ARGS
    echo "saida=$?"
  fi
} > "$OUT.tmp" 2>&1
mv -f "$OUT.tmp" "$OUT"
SH
)
  script=$(sed 's/\$/$$/g' <<<"$script")
  local compose
  compose=$(cat <<YML
services:
  leitura:
    image: docker:27-cli
    restart: "no"
    environment:
      MARCA: "${marca}"
      PROJETO: "${projeto}"
      ARGS: "${args}"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /etc/dokploy/traefik/reerguer:/out
    entrypoint: ["sh", "-c"]
    command:
      - |
$(sed 's/^/        /' <<<"$script")
YML
)
  titulo "Compose de uso único"
  corpo=$(jq -n --arg e "$env_id" --arg f "$compose" \
    '{name:"leitura-ifood-test", appName:"leitura-ifood-test", environmentId:$e, composeType:"docker-compose", composeFile:$f, description:"temporário: leitura TEST do iFood (INT-1.4)"}')
  code=$(dokploy POST /api/compose.create "$corpo"); echo "compose.create -> HTTP $code"
  local cid_compose
  cid_compose=$(jq -r '.composeId // empty' /tmp/dk.json 2>/dev/null)
  if [ -z "$cid_compose" ]; then
    inventario >/dev/null; cid_compose=$(awk -F'\t' '$1=="compose" && $3=="leitura-ifood-test"{print $2}' /tmp/inventario.tsv | head -1)
  fi
  [ -n "$cid_compose" ] || { echo "::error::compose não criado (HTTP $code)"; exit 1; }
  code=$(dokploy POST /api/compose.update "$(jq -n --arg c "$cid_compose" --arg f "$compose" '{composeId:$c, composeFile:$f, sourceType:"raw"}')")
  echo "compose.update -> HTTP $code (id $cid_compose)"
  code=$(dokploy POST /api/compose.deploy "{\"composeId\":\"$cid_compose\",\"title\":\"leitura TEST do iFood\"}"); echo "compose.deploy -> HTTP $code"
  esperar compose "$cid_compose" || echo "::warning::deploy do compose não terminou em done"

  titulo "Resultado"
  local achou="" saida="" path tentativa
  for tentativa in $(seq 1 24); do
    for path in /etc/dokploy/traefik/reerguer/leitura-ifood-test.log reerguer/leitura-ifood-test.log; do
      code=$(dokploy GET "/api/settings.readTraefikFile?path=$(jq -rn --arg p "$path" '$p|@uri')")
      [ "$code" = 200 ] || continue
      jq -r 'if type=="string" then . else tostring end' /tmp/dk.json > /tmp/leitura.log 2>/dev/null || continue
      if grep -qx "marca=${marca}" /tmp/leitura.log && grep -q '^saida=' /tmp/leitura.log; then achou=1; break 2; fi
    done
    sleep 15
  done
  if [ -n "$achou" ]; then
    # Defesa extra: mascara qualquer coisa com cara de JWT (o comando já não imprime token nem segredo).
    sed -E 's/eyJ[A-Za-z0-9._-]{20,}/[mascarado]/g' /tmp/leitura.log | grep -v '^marca='
    saida=$(sed -n 's/^saida=//p' /tmp/leitura.log | tail -1)
    { echo '### Leitura TEST do iFood'; echo '```'; sed -E 's/eyJ[A-Za-z0-9._-]{20,}/[mascarado]/g' /tmp/leitura.log | grep -v '^marca='; echo '```'; } >> "$RESUMO"
  else
    echo "::error::O relatório da leitura não apareceu em 6 min."
  fi

  titulo "Removendo compose de uso único (sem volumes)"
  code=$(dokploy POST /api/compose.delete "{\"composeId\":\"$cid_compose\",\"deleteVolumes\":false}"); echo "compose.delete -> HTTP $code"
  case "$saida" in
    0) echo "Leitura TEST com HTTP 200 oficial." ;;
    2) echo "::warning::Recusada antes de chamar o iFood (ver o motivo acima)."; exit 2 ;;
    "") exit 1 ;;
    *) exit 1 ;;
  esac
}

case "$ETAPA" in
  diagnosticar) diagnosticar ;;
  reiniciar)    reiniciar ;;
  limpar-cache) limpar_cache ;;
  subir)        subir ;;
  provar)       provar ;;
  recriar-traefik) recriar_traefik ;;
  aguardar-e-provar) aguardar_e_provar ;;
  api-schema)   api_schema ;;
  traefik-via-compose) traefik_via_compose ;;
  leitura-ifood-test) leitura_ifood_test ;;
  *) echo "etapa desconhecida: $ETAPA"; exit 2 ;;
esac
