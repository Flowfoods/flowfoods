# RELATÓRIO — Caminho 3 (Barney)

Repositório: `Flowfoods/flowfoods` · Branch: `claude/rodolfo-barney-cadence-bc7dcy`
Revisão: 2026-08-25

---

## O que está pronto

### Núcleo de regras (`src/lib/barney/`)

TypeScript puro, dependências injetadas — roda inteiro em teste sem banco, sem
Redis e sem rede.

| Arquivo | O que garante |
|---|---|
| `regras.ts` | Os números rígidos, num lugar só |
| `telefone.ts` | E.164, celular × fixo, canal. Chave de dedup e de opt-out |
| `scoring.ts` | `pontuar`/`classificar`/`limpa` portados da skill |
| `janela.ts` | Janela, deslize de fim de semana, config que só aperta |
| `tetos.ts` | As 9 travas de envio, a rampa e os tetos da config |
| `optout.ts` | Saída sem IA no caminho |
| `conflito.ts` | Bloqueio Bibi na importação |
| `template-validator.ts` | 8 regras; template que falha não entra na fila |
| `render.ts` | Gancho, ângulo, saudação e o seed de templates |
| `dedup.ts` | `leadId:toque:data` no fuso de São Paulo |
| `inbound.ts` | Pipeline de entrada com ordem garantida |

### Persistência e integração (`src/lib/rodolfo/`, `src/lib/whatsapp/`)

- `schema.prisma` com 17 modelos + migration inicial (442 linhas, **zero DROPs**)
- `estado.ts` — contadores do dia, rampa, falhas consecutivas, tudo em São Paulo
- `config.ts` — `apertar()` na escrita **e** na leitura
- `outbox.ts` — repositório + fábrica do serviço, com dry-run automático
- `evolution.ts` — transporte HTTP com timeout e checagem de instância
- `inbound-portas.ts` — as portas do pipeline sobre Prisma
- `lote.ts` — proposta, aprovação, cancelamento e disparo unitário
- `importar-lote.ts` — persistência da importação, sem rebaixar status
- `ia.ts` — Haiku 4.5 classifica, Sonnet 5 rascunha, com teto de gasto diário

### Interface (`src/app/rodolfo/`)

Mobile-first, sobre chão preto para não se confundir com o site público.

| Rota | O que faz |
|---|---|
| `/rodolfo` | Painel: por que a fila está parada, e o que fazer |
| `/rodolfo/leads` | Lista, filtros por URL, busca, importação |
| `/rodolfo/leads/[id]` | Lead 360: score explicado, prévia do gancho, timeline, thread, ações |
| `/rodolfo/barney` | Lote do dia, aprovar, dry-run, "Enviar agora", fila |
| `/rodolfo/inbox` | Respostas por intenção, rascunho editável |
| `/rodolfo/visitas` | Fixos e sem-telefone, com copiar → abrir Direct |
| `/rodolfo/metricas` | Funil, cortes, saúde do número, custo de IA, CSV |
| `/rodolfo/config` | Janela, tetos, chave geral + as regras que não se alcança |
| `/rodolfo/login` · `/setup` | Sessão e primeiro acesso |

### API e worker

- `POST /api/leads/import` — token em tempo constante, Zod, alvo do `--push`
- `POST /api/webhooks/evolution` — secret, idempotência, os 3 eventos
- `GET /api/metricas/csv` — exporta a base; exige sessão e grava no audit
- `worker/index.ts` — laço com encerramento limpo em SIGTERM

---

## Evidências

```
184 testes · 9 arquivos · todos verdes
tsc --noEmit  · limpo
next build    · compila, 15 rotas, zero erro de import
migration     · 442 linhas, ZERO DROPs
```

Os 11 testes obrigatórios do Master Prompt, um a um:

| Exigido | Onde |
|---|---|
| Validador de templates | `template-validator.test.ts` — 36 testes |
| Tetos: 31º/dia, 9º/hora, < 120 s, rampa | `tetos.test.ts` |
| Janela e deslize de fim de semana | `janela.test.ts` — 22 testes |
| Opt-out sobrevive a reimportação | `importar.test.ts` |
| Resposta pausa enrollment antes de tudo | `service-inbound.test.ts` (ordem real) |
| Conflito Bibi na importação | `importar.test.ts` · `optout-conflito.test.ts` |
| Idempotência do webhook | `service-inbound.test.ts` |
| Stop-loss: falhas, entrega, instância | `tetos.test.ts` |
| `disparoAtivo=false` impede envio | `tetos.test.ts` · `service-inbound.test.ts` |
| Config não sobe tetos | `config.test.ts` · `janela.test.ts` · `tetos.test.ts` |
| Dry-run com zero chamadas | `service-inbound.test.ts` · `dry-run-escopo.test.ts` |

---

## O que NÃO está pronto

Sem eufemismo:

- **F6 — produção.** Nenhum deploy, nenhuma instância criada, nenhum `pg_dump`.
  Bloqueado por rede: o proxy desta sessão recusa o túnel CONNECT para o domínio
  e para a VPS — verificado por `curl` **e** por Chromium. Não é falta de
  credencial; é ausência de rota.
- **Aplicar o patch do `--push`.** A rota está pronta e testada; o patch para o
  `montar_pacote.py` está em `docs/patch-ledsflowfoods-push.diff`. A skill mora
  fora deste repositório, então não dá para commitar aqui.
- **As cinco últimas etapas do funil** (diagnóstico preenchido → clientes)
  ficam em zero até o ambiente de Diagnóstico (Caminho 2) alimentar os status.
  A tela diz isso; não estima nada.
- **Nenhum envio real foi feito. Nenhuma instância foi criada. Nenhum recurso
  externo foi tocado.**

---

## Segurança, em uma olhada

- Segredos só em env; `.env` no `.gitignore`; nada de credencial no código
- Token e webhook secret comparados em **tempo constante** (`timingSafeEqual`)
- Rate limit no login; mensagem única para senha errada e e-mail inexistente;
  `bcrypt.compare` roda mesmo sem usuário, para o tempo não denunciar
- Server actions conferem sessão por conta própria — middleware protege página,
  não endpoint
- `/rodolfo` com `noindex, nofollow`
- Audit log em toda ação: importação, lote, aprovação, envio, opt-out, config
- Migrations só aditivas

---

## Próximo

1. Credenciais no Dokploy → migration → deploy de `web` e `worker`
2. Instância `flowfoods-prospeccao` + webhook + QR
3. 10 envios manuais → ligar `disparoAtivo`
4. F5 (funil, cortes, CSV) e Lead 360
