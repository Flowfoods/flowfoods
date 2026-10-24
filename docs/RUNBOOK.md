# RUNBOOK — Barney

O que fazer, na ordem, e o que fazer quando algo trava.

---

## 1. Primeira vez (uma vez só)

### 1.1 Variáveis no Dokploy

Copie de `.env.example`. As três que **têm** que existir para o portal subir:

```
DATABASE_URL       postgres do projeto flowfoods
NEXTAUTH_SECRET    openssl rand -hex 32
ADMIN_SETUP_TOKEN  openssl rand -hex 32
```

Sem `EVOLUTION_*` o portal sobe e funciona — em **dry-run**. É proposital: dá
para treinar o fluxo inteiro antes de ter número.

### 1.2 Banco

As migrations rodam no serviço `migrar` do docker-compose, antes de qualquer
outro processo: `web` e `worker` só sobem se ele terminar bem (Ponto 20 do
plano). À mão, no mesmo banco:

```bash
npm run db:migrate
npm run erp:conferir-migracao   # 0 = ok · 1 = pendência em dado antigo · 2 = erro ao conferir
```

**Se o deploy não subir o site** (Dokploy: "service migrar didn't complete
successfully"): o site fica FORA até resolver — num deploy com código novo o
Compose para o `web` e o `worker` antes de rodar o `migrar`. Abra o log do
`migrar`: a migration que falhou e o motivo estão ali. Para destravar:

1. Anote o nome da migration que falhou (ex.: `20261110000000_erp_etiquetas`).
2. Corrija a causa (o dado que viola a regra, a permissão que faltou…) — nunca
   apague tabela nem rode `reset`.
3. Marque a tentativa que falhou como desfeita, no terminal de um container com
   o banco: `npx prisma migrate resolve --rolled-back <nome>`. Sem esse passo,
   QUALQUER `migrate deploy` para com o erro P3009 — inclusive o redeploy e o
   rollback do Dokploy (o `migrar` da versão antiga encontra o mesmo registro).
4. Redeploye.

**Se o log do `migrar` disser "ATENÇÃO: não consegui conferir as
migrations":** o site subiu; rode `npm run erp:conferir-migracao` à mão
(código 124 = a conferência passou de 120 s).

**Se o log do `migrar` disser "ATENÇÃO: a conferência pós-migration listou
pendências":** o site subiu normalmente. As linhas acima da frase dizem o que
ficou pendente (CHECK `NOT VALID` por linha antiga que viola a regra, índice
que faltou). Nada foi apagado nem corrigido sozinho (Ponto 15). Corrija as
linhas apontadas com a equipe e rode o `ALTER TABLE … VALIDATE CONSTRAINT …`
que a própria mensagem indica.

Só aditivas. Nunca rode `prisma migrate reset` — apagaria os opt-outs, e opt-out
apagado é obrigação de LGPD quebrada.

### 1.3 Sua senha

Abra `https://consultoriaflowfoods.com.br/rodolfo/setup?token=<ADMIN_SETUP_TOKEN>`,
defina a senha. O token para de valer quando a senha existe. A senha não é
gravada em log nem em relatório.

**Esqueceu a senha?** Troque o `ADMIN_SETUP_TOKEN` no painel (serviço `web` →
Environment), Redeploy, e abra o link "TOKEN NOVO" que o log do `web` imprime.
O setup aceita um token que nunca foi usado e troca a senha do admin que já
existe. Cinco erros de login em 15 minutos bloqueiam o e-mail até o próximo
redeploy.

### 1.4 O número

Duas rotas. A decisão é sua; o sistema funciona nas duas.

#### Rota A — seu telefone atual (o que você escolheu para começar)

Vantagem real, não consolo: um número com anos de histórico e conversa de gente
de verdade **resiste melhor a bloqueio** que um chip novo. A tabela do anti-ban
diz isso — número pessoal antigo tolera 200/dia; chip novo, 50.

O que muda:

- **As notificações se desligam sozinhas.** O sistema percebe que o número que
  prospecta é o mesmo que receberia o aviso e não manda nada — a resposta do
  lead já chega no seu aparelho. `/rodolfo/config` mostra "Modo telefone
  pessoal" quando isso acontece.
- **A rampa continua valendo.** 10/dia na primeira semana, 20 na segunda, 30
  depois. Não é sobre aquecer o número, é sobre não acumular denúncia rápido.
- **O que você está apostando:** o risco não é ban por número frio, é
  **denúncia**. Abordagem fria gera denúncia, e denúncia neste número derruba o
  WhatsApp que está no seu site, no seu cartão e nas suas conversas pessoais.
  Se cair, você perde o canal comercial junto com o pessoal.

Se for por aqui, vale ativar o WhatsApp Business neste número mesmo (dá para
converter sem perder histórico) e completar o perfil: descrição da FlowFoods,
site, catálogo. Isso reduz denúncia porque o dono do restaurante vê na hora quem
está falando.

#### Rota B — chip dedicado

Chip novo, WhatsApp Business, perfil completo, **aquecido 2–3 semanas**
conversando normalmente antes do primeiro disparo. É calendário, não software:
começar hoje encurta a espera lá na frente.

Vantagem: se queimar, queima só o número de prospecção. Você configura
`EVOLUTION_NOTIFY_INSTANCE` e recebe os avisos no seu telefone.

#### Em qualquer uma das rotas

Crie a instância `flowfoods-prospeccao` na Evolution, pareie o QR e aponte o
webhook para:

```
POST https://consultoriaflowfoods.com.br/api/webhooks/evolution
header: x-webhook-secret: <EVOLUTION_WEBHOOK_SECRET>
eventos: MESSAGES_UPSERT, MESSAGES_UPDATE, CONNECTION_UPDATE
```

Confira em `/rodolfo/config`: a instância precisa aparecer como `open`.

---

## 2. O dia a dia

### 2.1 Importar leads

Rode o `ledsflowfoods`, pegue o pacote e:

- **pelo portal:** `/rodolfo/leads` → "Importar lote" → cole o JSON;
- **pelo terminal:** `POST /api/leads/import` com `x-import-token`.

A importação já bloqueia sozinha: conflito com o Bibi (suco/açaí/saladaria em
Tijuca, Norte Shopping, Botafogo, Rio Sul), opt-out antigo e quem não tem
celular. Fixo não some — vai para a lista de visita/Instagram.

### 2.2 Os 10 primeiros envios: na mão

Enquanto o número não tiver 10 envios, o automático **recusa** e diz quantos
faltam. Em `/rodolfo/barney`, use **"Enviar agora (1)"**, um por vez, com uns
minutos entre eles. É o aquecimento que decide se o número sobrevive.

### 2.3 Ligar o disparo

Só depois dos 10. `/rodolfo/config` → **Disparo ativo**. Antes disso a chave
geral recusa tudo, inclusive envio manual.

### 2.4 A rotina

1. `/rodolfo/barney` → **Montar lote de hoje**
2. **Dry-run** → confira o texto de algumas mensagens em "Saíram hoje"
   (aparecem como SIMULADA)
3. **Aprovar lote**
4. O worker drena sozinho, respeitando janela, teto e intervalo
5. `/rodolfo/inbox` → quem respondeu, com rascunho sugerido

Leia o gancho antes de aprovar. Ele **afirma algo sobre aquela casa**; se a
leitura estiver errada, o dono percebe na primeira linha e a mensagem trabalha
contra você.

### 2.5 Responder

Sempre você. O portal sugere, você lê, edita e envia. Nunca existe botão que
manda o rascunho sem passar pelo campo.

---

## 3. Quando trava

**A primeira coisa é sempre `/rodolfo` (Hoje).** O motivo da parada está escrito
lá em cima, em português, com o que fazer.

| O que aparece | O que é | O que fazer |
|---|---|---|
| `Disparo desligado` | Chave geral off | Ligar em Config — depois dos 10 manuais |
| `Faltam N envios manuais` | Número ainda frio | "Enviar agora", um a um |
| `Fora da janela` | Fora de seg–sex 10h–18h | Nada. Volta sozinho |
| `Teto do dia atingido` | Cumpriu a cota | Nada. Volta amanhã |
| `Instância em "close"` | WhatsApp desconectou | Reparear o QR |
| `3 falhas consecutivas` | **Stop-loss** | Ver abaixo |
| `Entrega do dia em X%` | **Stop-loss** | Ver abaixo |

### Stop-loss — não force

Três causas param tudo: 3 falhas seguidas, entrega abaixo de 70% (a partir de 10
envios) ou instância fora do ar.

**Entrega caindo é o sinal mais sério.** Mensagem que sai e não é entregue
costuma ser bloqueio silencioso — o WhatsApp aceita o envio e não entrega. Nesse
caso:

1. **pare o dia.** Cancelar o lote em `/rodolfo/barney`;
2. não reconecte em laço — piora;
3. no dia seguinte, volte com metade do volume (Config → Máximo por dia);
4. se repetir, o número está queimado. Chip novo, rampa do zero.

### Pausar tudo em 1 clique

`/rodolfo/config` → desmarque **Disparo ativo** → Salvar. Vale para automático
e manual, na hora.

---

## 4. Perguntas que vão aparecer

**"Mandei aprovar e não saiu nada."**
Provavelmente fora da janela ou o número ainda está nos 10 manuais. O painel diz.

**"Apareceu SIMULADO."**
`EVOLUTION_API_URL`/`EVOLUTION_API_KEY` não estão no Dokploy. Nada foi para a
rede. Configure e refaça.

**"O lead respondeu e o D+4 saiu mesmo assim."**
Não deveria: a cadência é pausada antes de qualquer outro processamento, e há
teste para a ordem. Se acontecer, é bug — olhe `LeadEvent` do lead e o
`AuditLog` por `enrollment_pausado_por_resposta`.

**"Pedi para sair e continuei recebendo."**
Também não deveria. O opt-out é por telefone e sobrevive à reimportação. Confira
a tabela `OptOut`.

**"Quero abordar um restaurante da Tijuca."**
Se for suco, açaí ou saladaria, o sistema bloqueia — conflito com o Grupo Bibi
Sucos. Outras categorias no mesmo bairro passam normal.

---

## 5. O que NUNCA fazer

- `prisma migrate reset` em produção — apaga opt-outs
- Subir teto no código para "acelerar" — os limites existem contra o WhatsApp,
  e um número queimado leva 2–3 semanas para ser substituído
- Pular a rampa porque "esse número é antigo" — a rampa não é sobre aquecimento,
  é sobre não acumular denúncia rápido. Número antigo com 30 abordagens frias no
  primeiro dia cai igual
- Responder lead por automação
- Reconectar instância em laço depois de bloqueio
- Mandar mensagem fora de seg–sex 10h–18h

---

## 6. VPS caiu — como reerguer

Ferramenta: GitHub → Actions → **barney-ops** → Run workflow → ação
`reerguer-vps`, uma `etapa` por vez, lendo o log antes da próxima
(`scripts/reerguer-vps.sh`). Roda no runner do GitHub porque a sessão do Claude
não alcança a VPS. Não imprime segredo e não tem nenhum comando que apague
volume.

| Etapa | O que faz | Precisa de |
|---|---|---|
| `diagnosticar` | portas 22/80/443/3000, estado na Hostinger, saúde por SSH (memória, disco, OOM, log do boot anterior), containers, domínios, deploys das últimas 36 h, inspect do Traefik | Dokploy; SSH e Hostinger opcionais |
| `reiniciar` | restart/start da VM pela API da Hostinger. **Recusa** se a VM estiver suspensa ou se SSH/painel ainda responderem | `HOSTINGER_API_TOKEN` |
| `limpar-cache` | `docker builder prune -f` + `docker image prune -f`, só com disco ≥ 90% | `VPS_SSH_KEY` |
| `subir` | Docker → Traefik → `alvos` na ordem, um por vez, esperando cada deploy terminar | Dokploy (+ SSH para o Traefik) |
| `provar` | por domínio: DNS, HTTP, certificado (nome, emissor, validade) — tabela no resumo do job | nada |

`alvos` aceita: `traefik` (settings.reloadTraefik), `container:<nome>`,
`compose:<id>`, `application:<id>`, `postgres:<id>`, `redis:<id>`.

Secrets (Settings → Secrets and variables → Actions): `DOKPLOY_URL`,
`DOKPLOY_API_TOKEN` (já existem), `VPS_SSH_KEY` (chave privada com acesso root),
`HOSTINGER_API_TOKEN` (hPanel → Conta → API). `VPS_SSH_USER` opcional.

### Ordem

1. A máquina responde? Painel `:3000` ou porta 22 respondendo = **não reinicie a
   VM**, o problema está dentro dela.
2. Docker → Traefik e Dokploy → bancos → Evolution/n8n → apps web → agentes.
3. App com build: um por vez. App que não sobe em 2 tentativas: pendente com o
   motivo, segue a fila.

### Sintoma conhecido: todos os sites fora, painel no ar

Containers dos apps `Up`, mas 80/443 sem resposta e `dokploy-traefik` em
`Exited (255)` com o erro:

    failed to set up container networking: attaching to network failed ... context deadline exceeded

O Traefik é um container avulso ligado à rede overlay `dokploy-network`. No boot
ele tenta entrar na rede antes do Swarm ficar pronto, falha, e daí nem
`docker restart` nem o "Reload Traefik" do painel resolvem (os dois falharam em
23/10). Destrava no host (terminal do hPanel ou SSH):

    docker network disconnect -f dokploy-network dokploy-traefik
    docker start dokploy-traefik
    docker network connect dokploy-network dokploy-traefik
    docker ps --filter name=dokploy-traefik

Se o `connect` repetir o erro: `systemctl restart docker` (reinicia todos os
containers, ~2 min fora, nenhum dado se perde) e `docker start dokploy-traefik`.

Proibido em qualquer caso: `docker volume prune`, `docker system prune --volumes`,
apagar volume, banco ou pasta de upload.

### Incidente de 23/10/2026

- ~19:00 UTC (16:00 RJ): a VPS parou de responder por completo (até a API do
  Dokploy dava timeout). Todos os containers saíram com código 255 — desligamento
  abrupto, não parada limpa. `dokploy-traefik` registrou fim às 19:00:54.
- ~19:15 UTC: a máquina voltou (containers "Up 4 hours" às 23:15). Apps,
  bancos, n8n, Evolution e Dokploy subiram sozinhos; o Traefik não (sintoma
  acima), então todos os domínios ficaram fora.
- Build triplo do `flowfoods-web` (migrar/web/worker com `build:`): **não foi a
  causa**. O último deploy terminou às 13:39 UTC, 5h20 antes da queda, sem deploy
  rodando às 19:00.
- Causa raiz da queda: **hipótese** — coincide com o incidente da Hostinger
  "Emergency Power Maintenance in BR-CAM Datacenter" (18:38–22:36 UTC; rede e
  depois perda parcial de energia). Não comprovado: falta confirmar no hPanel
  que a VPS fica no BR-CAM e ler `journalctl -b -1` no host.
- 23:16 e 23:20 UTC: `settings.reloadTraefik` (200, sem efeito) e
  `docker.restartContainer` (500, mesmo erro de rede). Fim dos 2 ciclos pela API.
- Entre 23:23 e 23:57 UTC: **alguém ou alguma rotina removeu todos os containers
  parados**, inclusive o `dokploy-traefik` e os `migrar-1`/`segredos-1` do
  flowfoods-web. Não foi esta ferramenta. Volumes não são afetados por esse tipo
  de limpeza; bancos seguiram `Up`.
- 00:03 UTC (24/10): `settings.updateTraefikPorts` (recriação gerenciada pelo
  Dokploy) recusou com 400 `The argument 'file' cannot be empty` — o Dokploy
  copia imagem e montagens do container existente; sem ele, não recria. Nada foi
  criado. `getTraefikPorts` e `readTraefikEnv` também dão 500 sem o container.

### Traefik sumiu (container removido) — recriar no host

Só quando `docker ps -a --filter name=dokploy-traefik` voltar vazio. Configuração
lida do Dokploy em 23/10: entryPoints `:80`/`:443`, ACME por HTTP no `web`,
`acme.json` em `/etc/dokploy/traefik/dynamic/`, provider docker na rede
`dokploy-network`. Portas antes da queda: 80/tcp, 443/tcp, 443/udp, sem extras.

1. Leitura (não muda nada):

       docker images --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}' | grep -i traefik
       ls -la /etc/dokploy/traefik/traefik.yml /etc/dokploy/traefik/dynamic/acme.json
       docker info --format 'swarm={{.Swarm.LocalNodeState}} manager={{.Swarm.ControlAvailable}}'
       journalctl -u docker --since "2026-10-23 18:30" --no-pager | grep -iE "attach|deadline" | tail -20

2. Recriar com a imagem que o passo 1 mostrou (troque `IMAGEM`):

       docker run -d --name dokploy-traefik --restart always \
         -v /etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml \
         -v /etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic \
         -v /var/run/docker.sock:/var/run/docker.sock \
         -p 80:80/tcp -p 443:443/tcp -p 443:443/udp \
         IMAGEM
       docker network connect dokploy-network dokploy-traefik
       docker ps --filter name=dokploy-traefik

   Sobe na bridge primeiro e só depois entra na overlay: se a entrada na rede
   travar de novo, o Traefik fica de pé (responde 404/502) em vez de morrer.
   Desfazer: `docker rm -f dokploy-traefik` volta ao estado de antes.

3. Se o `network connect` repetir `context deadline exceeded`, o problema é o
   Swarm/rede do Docker, não o Traefik. Próximo passo é `systemctl restart
   docker` — derruba por ~2 min todos os apps, bancos, n8n e Evolution; pedir
   autorização antes.
