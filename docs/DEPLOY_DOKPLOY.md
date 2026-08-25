# Deploy no Dokploy

Eu não alcanço o Dokploy desta sessão — o proxy de saída recusa o túnel para o
domínio e para a VPS (verificado por `curl` e por Chromium). Então o que dá para
fazer é reduzir o seu trabalho ao mínimo: **um arquivo já pronto e um comando.**

---

## Caminho curto — Docker Compose (recomendado)

Sobe Postgres, `web` e `worker` de uma vez. A migration roda sozinha no start.

### 1. Gere as variáveis

No seu terminal, dentro do repositório:

```bash
./scripts/gerar-env.sh https://consultoriaflowfoods.com.br
```

Ele imprime o bloco inteiro, com os segredos já sorteados. **Copie da tela** —
o script não grava arquivo nenhum de propósito. Guarde o `ADMIN_SETUP_TOKEN`
à mão: você vai usá-lo uma vez, no passo 4.

Deixe `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` **vazias** por enquanto. Sem
elas o portal entra em dry-run: sobe, funciona, e não envia nada. É o jeito
seguro de treinar o fluxo antes de existir número conectado.

### 2. Crie a aplicação

No projeto `flowfoods` → **Create Application** → tipo **Docker Compose**:

| Campo | Valor |
|---|---|
| Repositório | `Flowfoods/flowfoods` |
| Branch | `claude/rodolfo-barney-cadence-bc7dcy` |
| Compose path | `docker-compose.yml` |

Em **Environment**, cole o bloco do passo 1.

> **Aponte para a branch, não para `master`.** O site institucional sai de
> `master` e não foi tocado — assim você testa sem risco nenhum para o que está
> no ar. Configure um domínio de teste (ex.: `staging.consultoriaflowfoods.com.br`)
> apontando para o serviço `web`, porta 3000.

### 3. Deploy

O `web` só inicia depois que o Postgres responde, e roda `prisma migrate deploy`
antes de subir o Next. O `worker` sobe junto e fica dormindo — com
`disparoAtivo=false` (o padrão) ele não envia nada.

### 4. Sua senha

```
https://<seu-dominio>/rodolfo/setup?token=<ADMIN_SETUP_TOKEN>
```

Define a senha; o token para de valer. Depois, `/rodolfo/login`.

### 5. Confira

```bash
./scripts/verificar-deploy.sh https://<seu-dominio>
```

---

## Caminho longo — três serviços na mão

Use se preferir controlar cada peça, ou se o compose falhar. É o mesmo
resultado, com mais cliques.

## 1. Postgres

No projeto `flowfoods` do Dokploy → **Create Service → Database → PostgreSQL 16**.

- Nome: `postgres-flowfoods`
- Database: `flowfoods`
- Usuário e senha: gerados pelo Dokploy

Copie a **connection string interna** (a que usa o nome do serviço como host,
não `localhost`). Ela vira o `DATABASE_URL`.

> Se a RAM livre da VPS ficar abaixo de 1 GB depois de subir o Postgres, use o
> Postgres que já existe e crie só o banco `flowfoods` + um usuário próprio.
> Isso é parada de segurança do plano — não vale apertar a VPS por isso.

---

## 2. Gerar os segredos

Rode **no seu terminal**, um por vez. Não me mande os valores — eles vão direto
para o Dokploy:

```bash
openssl rand -hex 32   # NEXTAUTH_SECRET
openssl rand -hex 32   # ADMIN_SETUP_TOKEN
openssl rand -hex 32   # LEADS_IMPORT_TOKEN
openssl rand -hex 32   # EVOLUTION_WEBHOOK_SECRET
```

---

## 3. As variáveis

Cole em **Environment** dos **dois** apps (`web` e `worker`). As duas primeiras
seções são obrigatórias; o resto pode entrar depois.

```env
# Obrigatórias para subir
DATABASE_URL=postgresql://...        # do passo 1
NEXTAUTH_SECRET=...                  # openssl
NEXTAUTH_URL=https://consultoriaflowfoods.com.br
ADMIN_SETUP_TOKEN=...                # openssl — so para definir sua senha
LEADS_IMPORT_TOKEN=...               # openssl — separado: viaja em script

# WhatsApp — sem elas o portal funciona em DRY-RUN (não envia nada)
EVOLUTION_API_URL=https://sua-evolution/
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=flowfoods-prospeccao
EVOLUTION_WEBHOOK_SECRET=...         # openssl
RODOLFO_WHATSAPP=5521996416060

# IA — opcional. Sem elas o Inbox funciona sem classificação e sem rascunho
ANTHROPIC_API_KEY=...
AI_DAILY_BUDGET_BRL=5
USD_BRL=5.40
```

**Sobre `RODOLFO_WHATSAPP` quando você usa o próprio telefone:** deixe o seu
número mesmo. O sistema detecta que o número que prospecta é o mesmo que
receberia o aviso e **desliga as notificações sozinho** — a resposta do lead já
chega no seu aparelho, mandar um aviso para você mesmo só gastaria atividade do
número. A tela de Config mostra "Modo telefone pessoal" quando isso acontece.

---

## 4. Migration (uma vez, antes do primeiro start)

No Dokploy, em **Advanced → Pre-deploy command** do app `web`:

```
npm run db:migrate
```

Ou rode uma vez no terminal do container:

```bash
npm run db:migrate
```

São **442 linhas, só CREATE** — nenhum DROP. Roda em banco vazio sem risco.

> **Nunca** rode `prisma migrate reset`. Apagaria a tabela `OptOut`, e opt-out
> apagado é obrigação de LGPD quebrada com gente que já pediu para sair.

---

## 5. App `web`

**Create Application** no projeto `flowfoods`:

| Campo | Valor |
|---|---|
| Repositório | `Flowfoods/flowfoods` |
| Branch | `claude/rodolfo-barney-cadence-bc7dcy` (ou `master`) |
| Build | Nixpacks (autodetecta Next.js) |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Porta | `3000` |
| Domínio | `consultoriaflowfoods.com.br` + `www` |

O `npm run build` já roda `prisma generate` antes do `next build` — não precisa
de passo separado.

**Teste depois de subir:**

```bash
curl -s https://consultoriaflowfoods.com.br/api/webhooks/evolution
# {"ok":true,"rota":"webhooks/evolution","aguardando":[...]}
```

Se responder isso, o app subiu e o banco respondeu.

---

## 6. App `worker`

**Create Application**, mesmo repositório e mesma branch:

| Campo | Valor |
|---|---|
| Build command | `npm ci` |
| Start command | `npm run worker` |
| Porta | **nenhuma** |
| Domínio | **nenhum** |

O `postinstall` roda `prisma generate`, então `npm ci` basta.

O worker fica de pé, acorda a cada volta e pergunta se pode enviar. Com
`disparoAtivo=false` (o padrão) ele não envia nada — só dorme e loga. É seguro
subir antes de você estar pronto.

**Log esperado no start:**

```json
{"ts":"...","nivel":"info","msg":"worker iniciado","evolutionConfigurada":true,"tz":"America/Sao_Paulo"}
```

Se `evolutionConfigurada` vier `false`, faltou `EVOLUTION_API_URL`/`_API_KEY`.

**Diagnóstico rápido**, no terminal do container:

```bash
npm run worker:estado
```

Despeja a config em vigor e o estado do número — é o jeito mais rápido de
descobrir por que a fila não anda.

---

## 7. Instância na Evolution

Crie `flowfoods-prospeccao` e configure o webhook:

```
URL:    https://consultoriaflowfoods.com.br/api/webhooks/evolution
Header: x-webhook-secret: <EVOLUTION_WEBHOOK_SECRET>
Eventos: MESSAGES_UPSERT, MESSAGES_UPDATE, CONNECTION_UPDATE
```

Pareie o QR com o telefone. Confira em `/rodolfo/config`: a instância precisa
aparecer como `open`.

---

## 8. Sua senha

```
https://consultoriaflowfoods.com.br/rodolfo/setup?token=<ADMIN_SETUP_TOKEN>
```

Define a senha, o token para de valer. Depois disso, `/rodolfo/login`.

---

## 9. Checklist de corte

**Rode o verificador** — ele cobre sozinho a metade automatizável:

```bash
./scripts/verificar-deploy.sh
# ou, para um ambiente de teste:
./scripts/verificar-deploy.sh https://staging.consultoriaflowfoods.com.br
```

Ele não envia mensagem, não cria instância e não altera nada — só lê. Confere
que o site continua no ar, que o webhook está **fechado** para quem não tem o
segredo, que a importação recusa sem token, que `/rodolfo` exige sessão e que a
área privada está `noindex`. Sai com código 1 se algo reprovar, e a saída pode
ser colada inteira numa conversa para diagnóstico.

O que ele **não** consegue ver, e você precisa conferir no navegador:

- [ ] `/rodolfo/login` aceita a senha que você definiu
- [ ] `/rodolfo` mostra "Disparo desligado" (é o esperado no começo)
- [ ] `/rodolfo/config` mostra a instância `open`
- [ ] Log do worker: `worker iniciado`
- [ ] Importar um lote pequeno em `/rodolfo/leads` e ver os leads na lista
- [ ] `/rodolfo/barney` → Montar lote → **Dry-run** → **ler o texto de uma
      mensagem inteira**, do gancho à assinatura
- [ ] Site em `/` continua igual ao que estava

Só depois: 10 envios manuais → ligar `disparoAtivo`.

---

## Se der errado

| Sintoma | Causa provável |
|---|---|
| Build falha no `npm ci` | `package-lock.json` desatualizado no fork — rode `npm ci` local para confirmar |
| Build falha no Prisma | Falta `libc6-compat`/`openssl` — o Dockerfile já instala; se persistir, me mande o log |
| Erro 500 em toda tela do `/rodolfo` | Migration não rodou, ou `DATABASE_URL` errada |
| `/rodolfo/login` em laço | `NEXTAUTH_SECRET` ou `NEXTAUTH_URL` ausente/errada |
| Setup diz "Token inválido" | `ADMIN_SETUP_TOKEN` diferente do que está na URL |
| Webhook responde 401 | `EVOLUTION_WEBHOOK_SECRET` diferente do header configurado |
| Tudo aparece "SIMULADO" | `EVOLUTION_API_URL`/`_API_KEY` ausentes — é o dry-run |
| Worker reinicia em laço | Olhe o log: quase sempre é `DATABASE_URL` |

Rollback: o Dokploy guarda o deploy anterior. Como as migrations são só
aditivas, voltar a versão do app não quebra o banco.
