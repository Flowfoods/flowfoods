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

As migrations rodam no boot do container:

```bash
npm run db:migrate
```

Só aditivas. Nunca rode `prisma migrate reset` — apagaria os opt-outs, e opt-out
apagado é obrigação de LGPD quebrada.

### 1.3 Sua senha

Abra `https://consultoriaflowfoods.com.br/rodolfo/setup?token=<ADMIN_SETUP_TOKEN>`,
defina a senha. O token para de valer quando a senha existe. A senha não é
gravada em log nem em relatório.

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
