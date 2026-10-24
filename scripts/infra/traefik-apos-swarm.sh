#!/usr/bin/env bash
# Roda no HOST da VPS, no boot, depois do Docker (ver traefik-apos-swarm.service).
#
# Por quê: em 23/10/2026 a VPS voltou de um desligamento abrupto e o
# dokploy-traefik (container avulso, restart=always) tentou entrar na rede
# overlay dokploy-network antes do Swarm ficar pronto. Morreu com
# "attaching to network failed ... context deadline exceeded" e não voltou
# sozinho — todos os sites ficaram fora com os apps de pé.
#
# O que faz: espera o Swarm e a rede ficarem prontos (até 5 min) e, se o
# Traefik não estiver rodando, sobe. Nunca remove container, rede ou volume.
set -u
log() { echo "[traefik-apos-swarm] $*"; logger -t traefik-apos-swarm "$*" 2>/dev/null || true; }
C=dokploy-traefik; NET=dokploy-network

for i in $(seq 1 60); do
  if [ "$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null)" = active ] \
     && docker network inspect "$NET" >/dev/null 2>&1; then break; fi
  sleep 5
done
log "swarm: $(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null)"

st=$(docker inspect -f '{{.State.Status}}' "$C" 2>/dev/null || echo ausente)
log "$C: $st"
case "$st" in
  running) exit 0 ;;
  ausente) log "container não existe — recriar pelo procedimento do RUNBOOK (seção 6)"; exit 1 ;;
esac

sleep 10
if docker start "$C" >/dev/null 2>&1; then log "subiu no start direto"; exit 0; fi
log "start falhou — soltando a rede e tentando de novo"
docker network disconnect -f "$NET" "$C" 2>&1 | while read -r l; do log "$l"; done
if docker start "$C" >/dev/null 2>&1 && docker network connect "$NET" "$C"; then
  log "subiu após destravar a rede"; exit 0
fi
log "FALHOU — ver RUNBOOK seção 6"; exit 1
