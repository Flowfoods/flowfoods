# Roda DENTRO do container de uso único do compose "reerguer-traefik"
# (imagem docker:cli, com o docker.sock do host). Os caminhos do docker run
# são do HOST. Recria o dokploy-traefik igual ao do Dokploy, sobe na bridge e
# depois entra na overlay. Nunca remove nada. Relatório em /out/reerguer.log
# (= /etc/dokploy/traefik/reerguer/reerguer.log no host).
set -u
exec > /out/reerguer.log 2>&1
echo "== inicio $(date -u +%FT%TZ)"
echo "== host: uptime(s)=$(cut -d' ' -f1 /proc/uptime)"; head -3 /proc/meminfo
docker info --format 'docker={{.ServerVersion}} swarm={{.Swarm.LocalNodeState}} manager={{.Swarm.ControlAvailable}} erro_swarm={{.Swarm.Error}}'
echo "== imagens traefik"; docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}' | grep -i '^traefik' || echo nenhuma
echo "== rede"; docker network inspect dokploy-network --format 'driver={{.Driver}} attachable={{.Attachable}} scope={{.Scope}}' 2>&1
echo "== config"; ls -la /tf/traefik.yml /tf/dynamic/acme.json 2>&1
echo "== antes"; docker ps -a --filter name=dokploy-traefik --format '{{.Names}} {{.Status}}'
IMG=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -m1 '^traefik:')
if [ -z "$IMG" ]; then echo "PAREI: sem imagem traefik local"; exit 1; fi
if [ ! -f /tf/traefik.yml ]; then echo "PAREI: sem /etc/dokploy/traefik/traefik.yml"; exit 1; fi
if [ -n "$(docker ps -aq -f name=^dokploy-traefik$)" ]; then echo "PAREI: dokploy-traefik já existe"; exit 1; fi
echo "== criando com $IMG"
docker run -d --name dokploy-traefik --restart always \
  -v /etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml \
  -v /etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 80:80/tcp -p 443:443/tcp -p 443:443/udp "$IMG"
echo "run rc=$?"
sleep 3
echo "== network connect $(date -u +%T)"
timeout 90 docker network connect dokploy-network dokploy-traefik; echo "connect rc=$?"
sleep 8
echo "== depois"; docker ps -a --filter name=dokploy-traefik --format '{{.Names}} {{.Status}} {{.Ports}}'
docker inspect -f 'redes={{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}} restarts={{.RestartCount}} erro={{.State.Error}}' dokploy-traefik
echo "== logs traefik"; docker logs --tail 40 dokploy-traefik 2>&1 | grep -viE 'token|password|secret'
echo "== fim $(date -u +%FT%TZ)"
