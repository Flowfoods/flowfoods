# PENDÊNCIAS — só o Rodolfo resolve

Ordenado por bloqueio. Revisão: 2026-08-25.

---

## ✅ 1. Onde o código vive — RESOLVIDO

O portal já existia: `Flowfoods/flowfoods` → consultoriaflowfoods.com.br.
O Caminho 3 está aqui, na branch `claude/rodolfo-barney-cadence-bc7dcy`.

Sobrou uma ponta: o subtree `flowfoods/` que a primeira rodada criou dentro do
`portal-bibi` ficou redundante. Pode sair num commit à parte — me avise.

---

## 🔴 2. Credenciais no Dokploy

Nada sobe sem as três primeiras.

| Variável | Para quê | Como gerar |
|---|---|---|
| `DATABASE_URL` | Postgres | do serviço no Dokploy |
| `NEXTAUTH_SECRET` | Sessão | `openssl rand -hex 32` |
| `ADMIN_SETUP_TOKEN` | Sua senha + `--push` do ledsflowfoods | `openssl rand -hex 32` |
| `EVOLUTION_API_URL` / `_API_KEY` | Disparo | da Evolution |
| `EVOLUTION_WEBHOOK_SECRET` | Autenticar o webhook | `openssl rand -hex 32` |
| `RODOLFO_WHATSAPP` | Te notificar | E.164 sem "+" |
| `ANTHROPIC_API_KEY` | Classificar e sugerir | console da Anthropic |
| `AI_DAILY_BUDGET_BRL` | Teto de gasto/dia | ex.: `5` |

Só no Dokploy, **nunca em arquivo**. Sem as `EVOLUTION_*` o portal funciona em
dry-run — dá para treinar tudo antes de ter número.

**Trava:** deploy, envio real, IA, F6 inteiro.

---

## ✅ 3. Instagram — RESOLVIDO

Confirmado pelo Rodolfo em 25/08/2026: é **`@rrodolfoac`**.

O site estava com `flowfoods.rj` em dois lugares e ambos foram corrigidos:

- `src/lib/constants.ts` → rodapé e CTA;
- `src/lib/seo-schema.ts` → o `sameAs` do JSON-LD, que é o que o Google usa para
  ligar o negócio ao perfil. Agora lê de `CONTACT_INFO` em vez de repetir o
  valor, para não divergir de novo.

De quebra, o mesmo arquivo apontava para `linkedin.com/in/rodolfo-flowfoods`
(o rodapé e o Master Prompt dizem `rodolfo-cavalcante`) e usava o domínio
`flowfoods.com.br` em `@id` e `url` — sendo que o site é
`consultoriaflowfoods.com.br`. Os três estavam errados no JSON-LD; todos
alinhados agora.

---

## ✅ 4. O número — DECIDIDO: telefone pessoal no início

Sua escolha, e ela tem argumento técnico a favor: número com anos de histórico
resiste melhor a bloqueio que chip novo (`whatsapp-ban-prevention.md`:
pessoal antigo tolera 200/dia, chip novo 50).

O código se ajustou sozinho a isso:

- **notificações desligadas automaticamente** quando o número que prospecta é o
  mesmo que receberia o aviso — mandar mensagem para si mesmo não informa nada e
  gasta atividade do número;
- `/rodolfo/config` mostra **"Modo telefone pessoal"** quando detecta o caso;
- a rampa (10 → 20 → 30/dia) e os 10 envios manuais **continuam valendo**. Não
  são sobre aquecer o número; são sobre não acumular denúncia rápido.

**O que fica na sua conta:** o risco aqui não é ban por número frio, é
**denúncia**. Se este número cair, cai junto o WhatsApp que está no site, no
cartão e nas conversas pessoais. Vale ativar o WhatsApp Business neste mesmo
número (converte sem perder histórico) e completar o perfil — descrição da
FlowFoods, site, catálogo. Quem vê na hora quem está falando denuncia menos.

Se um dia quiser separar: chip novo, `EVOLUTION_NOTIFY_INSTANCE` apontando para
o seu, e as notificações voltam sozinhas.

---

## 🟡 5. Ligar o disparo — só depois dos 10 manuais

`disparoAtivo` nasce `false` e o código impede qualquer envio enquanto estiver
assim (testado, e vale inclusive para o manual).

Ordem: parear o QR → **10 primeiros envios um a um** em "Enviar agora" → só
então ligar em `/rodolfo/config`. Os 10 manuais também são obrigatórios no
código: o automático recusa até o 11º e diz quantos faltam.

---

## 🟡 6. Revisar os templates

O seed sai de `mensagens.md` e passa no validador. Ainda assim vale reler
mensagem por mensagem: o gancho **afirma algo sobre aquela casa**, e se a leitura
estiver errada o dono percebe na primeira linha.

Editar no portal não é sobrescrito por reimportação do seed. A fonte da verdade
continua sendo `mensagens.md`.

---

## 🟢 7. Dois patches para a skill `ledsflowfoods`

Achados por teste. **Corrigidos no portal**; o script segue com eles, então
planilha e portal divergem nesses dois pontos até alguém aplicar.

### 7a. `limpa()` deixa traço órfão no nome

`" Campo Grande"` é testado antes de `" - "`:

```
"Katsuo Culinaria Asiatica - Campo Grande" → "Katsuo Culinaria Asiatica -"
```

O traço entra no gancho, que é a primeira linha que o dono lê.

```python
# scripts/montar_pacote.py, linha 33 — trocar:
    return n.strip().rstrip(".").strip()
# por:
    return n.strip().rstrip(" .,-|").strip()
```

### 7b. Falta o ângulo do Centro

`mensagens.md` manda trocar o ângulo no Centro por giro de almoço, fila e ticket
executivo. `dor()` decide só por categoria — uma hamburgueria no Centro recebe o
argumento de marketplace, que é o errado para quem vive de almoço executivo.

`dor()` precisa receber o bairro e checá-lo antes da categoria. Texto usado no
portal (`render.ts`):

> No Centro o jogo é giro de almoço: fila que anda, ticket executivo e mesa que
> vira. Delivery noturno ali quase nunca é o que paga a conta.

*(A skill está em `/root/.claude/skills/synced/`, fora deste repo — não foi
alterada.)*

---

## 🟢 8. Conferir o que já está no ar

Nada disso é meu, e não toquei em nada — mas o Master Prompt diz "nunca inventar
números, cases ou resultados; sem prova = `TODO_RODOLFO`", e estes estão numa
página pública:

- **"+45% receita em 6 meses"** (Bibi Sucos)
- **"Ticket médio +R$ 80"** e **"Taxa de repetição: 40%"** (Balada Mix)
- **"Tempo de resposta: 5 min (era 45 min)"**

Além disso:
- **Marca:** o site usa Playfair Display e `#b91c1c`; o Master Prompt pede Syne
  800 e `#EA1D2C`. Um dos dois está desatualizado.
- **Tagline:** "Gastronomia que flui. Negócio que cresce." não aparece no
  `metadata` do site.
- **`CONTACT_EMAIL`:** o site mostra `rrodolfoacifood@gmail.com`. O prompt pede
  `contato@consultoriaflowfoods.com.br` — falta criar.
- **Profissionais treinados:** o site diz "100+", que é o conservador combinado.
  Sobe se 1000+ for real e comprovável.
