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

provar() {
  inventario >/dev/null 2>&1 || true
  coletar_dominios
  {
    cut -f1 /tmp/dominios.tsv
    printf '%s\n' consultoriaflowfoods.com.br www.consultoriaflowfoods.com.br
    [ -n "${EXTRAS:-}" ] && tr ',' '\n' <<<"$EXTRAS"
  } | sed -E 's#^https?://##; s#/.*##; /^$/d' | sort -u > /tmp/dominios
  linha_tab="| Domínio | DNS → | HTTP | Certificado | Emissor | Vence em | Status |"
  { echo "### Prova site por site"; echo; echo "$linha_tab"; echo "|---|---|---|---|---|---|---|"; } >> "$RESUMO"
  echo "$linha_tab"
  while read -r d; do
    ip=$(dig +short +time=3 +tries=1 A "$d" @1.1.1.1 | tail -1)
    http=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$d" || true)
    cert=$(echo | timeout 15 openssl s_client -connect "$d:443" -servername "$d" 2>/dev/null \
             | openssl x509 -noout -subject -issuer -enddate -ext subjectAltName 2>/dev/null)
    emissor=$(sed -n 's/^issuer=.*O *= *\([^,]*\).*/\1/p' <<<"$cert" | head -1)
    vence=$(sed -n 's/^notAfter=//p' <<<"$cert")
    if grep -q "DNS:${d}\b" <<<"$cert" || grep -q "DNS:\*\.${d#*.}\b" <<<"$cert"; then nome=ok; else nome=ERRADO; fi
    [ -z "$cert" ] && nome="sem cert"
    prob=()
    [ "$ip" != "$VPS_IP" ] && prob+=("DNS fora da VPS")
    case "$http" in 2*|3*|401|403) ;; *) prob+=("fora do ar") ;; esac
    [ "$nome" != ok ] && prob+=("certificado")
    if [ ${#prob[@]} = 0 ]; then st=OK; else st=$(IFS=/; echo "${prob[*]}"); fi
    l="| $d | ${ip:-?} | ${http:-000} | $nome | ${emissor:-?} | ${vence:-?} | $st |"
    echo "$l"; echo "$l" >> "$RESUMO"
  done < /tmp/dominios
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

case "$ETAPA" in
  diagnosticar) diagnosticar ;;
  reiniciar)    reiniciar ;;
  limpar-cache) limpar_cache ;;
  subir)        subir ;;
  provar)       provar ;;
  recriar-traefik) recriar_traefik ;;
  *) echo "etapa desconhecida: $ETAPA"; exit 2 ;;
esac
