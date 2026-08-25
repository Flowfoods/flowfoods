# BARNEY — regras de operação

Motor de cadência e disparo da FlowFoods. Este documento é o que o código faz,
não o que ele deveria fazer: cada regra aponta o arquivo e o teste.

---

## Os números rígidos

Nenhuma configuração sobe estes valores. `/rodolfo/config` só **aperta**.

| Regra | Valor | Onde |
|---|---|---|
| Abordagens/dia | **30** (teto absoluto) | `regras.ts` · `tetos.test.ts` |
| Abordagens/hora | **8** | idem |
| Intervalo mínimo | **120 s** | idem |
| Intervalo padrão | 300–1200 s, sorteado | `sortearIntervaloSegundos` |
| Rampa | sem. 1 = 10/dia · sem. 2 = 20 · depois 30 | `tetoDiarioVigente` |
| Janela | seg–sex, 10h–18h `America/Sao_Paulo` | `janela.ts` |
| Toques | D0 · D+4 · D+10, e para | `agendarCadencia` |
| Canal | só celular (DDD + 9 dígitos com 9) | `telefone.ts` |
| Envios manuais iniciais | **10**, um a um | `podeEnviar` |

A rampa conta a partir do **primeiro envio**, não da criação da instância:
número criado e esquecido por um mês não está aquecido, está parado.

---

## As travas, na ordem em que decidem

`podeEnviar()` — toda saída passa por aqui. Não existe segundo caminho.

1. `DISPARO_DESLIGADO` — `disparoAtivo` nasce `false`. Vence até o manual.
2. `INSTANCIA_FORA_DO_AR` — estado ≠ `open`.
3. `STOP_LOSS_FALHAS` — 3 falhas consecutivas.
4. `STOP_LOSS_ENTREGA` — entrega do dia < 70%, **a partir de 10 envios**
   (ver `DECISOES.md` #4).
5. `EXIGE_ENVIO_MANUAL` — os 10 primeiros do número.
6. `FORA_DA_JANELA` — o manual pula esta, e só esta.
7. `TETO_DIARIO` — considerando a rampa.
8. `TETO_HORARIO`.
9. `INTERVALO_MINIMO`.

Cada recusa devolve motivo próprio, porque `/rodolfo/barney` mostra literalmente
por que a fila parou. "Não enviou" sem causa é o tipo de silêncio que faz
desligar a trava.

**O manual pula a janela e nada mais.** A janela protege o destinatário; teto,
intervalo e stop-loss protegem o número — e o WhatsApp não distingue mensagem
manual de automática.

---

## Cadência

- Três toques: **D0 · D+4 · D+10**. Depois, para. Não há quarto.
- Offset somado preservando a hora do D0, depois deslizado para a janela útil.
  Quarta + 4 = domingo → **segunda, 10h**.
- **Resposta pausa o enrollment antes de qualquer outro processamento**
  (`inbound.ts`). Não depende de IA, de rede nem de orçamento.

---

## Opt-out

- Palavra-chave, **antes de qualquer IA**. Funciona com a Anthropic fora do ar.
- Frases casam em qualquer posição ("me tira da lista por favor").
- Palavras isoladas ("não", "pare", "sair") só valem como a **mensagem
  inteira** — senão "não sei, me manda mais info" viraria saída.
- Chave é o **telefone**, não o lead: apagar o lead e reimportar a planilha
  **não** devolve ninguém para a fila. Testado.
- Enviesado para o falso positivo (`DECISOES.md` #8).

---

## Conflito de interesse — Grupo Bibi Sucos

Suco, açaí e saladaria em **Tijuca, Norte Shopping, Botafogo e Rio Sul** entram
como `CONFLITO` e nunca ficam elegíveis.

Trava de **importação**, não filtro de tela — filtro de tela se desmarca. O
território é procurado em bairro + endereço + nome (um quiosque no Norte Shopping
costuma ter bairro "Cachambi"), e a categoria também no nome ("Mundo do Açaí"
com categoria "Restaurante").

Fora do território, a mesma categoria passa. Dentro dele, outras categorias
passam.

---

## Templates

Fonte da verdade: `ledsflowfoods/references/mensagens.md`. O validador roda ao
salvar **e** de novo antes de enfileirar o corpo já renderizado — o segundo não é
redundante: o template passa, mas um lead com `avaliacoes = 0` renderiza um
gancho que mente.

| Regra | O que barra |
|---|---|
| `R1_NADA_GRATUITO` | "gratuito", "sem custo", "sem compromisso", "contratando ou não"… |
| `R2_PRIMEIRA_PESSOA` | "nós", "nossa equipe", "a gente atende" |
| `R3_ASSINATURA` | falta ou não é a última linha (WhatsApp) |
| `R4_CONTATO_DEPOIS_DO_PEDIDO` | @ e site antes de pedir a conversa |
| `R5_GANCHO_COM_DADO_REAL` | abertura sem nota/avaliações |
| `R7_EMOJIS` | mais de 3 |
| `R8_LINK_ENCURTADO` | bit.ly, tinyurl, cutt.ly… |
| `R9_PLACEHOLDER_ABERTO` | `{{algo}}` sobrando no renderizado |

R7 e R8 vêm de `whatsapp-ban-prevention.md` — o Master Prompt manda a fonte mais
restritiva vencer, e nesses dois pontos ela é a única que fala.

R2 **não** barra "a gente trabalhar junto", que está no template oficial. R4 não
se aplica ao D10, que se despede sem pedir nada. R3 não se aplica ao texto de
Instagram (`AUDITORIA_C3.md` #3).

**Template que falha não entra na fila.**

---

## Dry-run

Percorre dedup, validação, tetos e outbox — e faz **zero** chamadas à Evolution.
O teste afirma isso com mock (`expect(enviarTexto).not.toHaveBeenCalled()`),
inclusive num lote inteiro de 30. É assim que se confere um lote antes de ligar a
chave.

---

## Dedup e idempotência

- Envio: `dedupKey = leadId:toque:data`, com a data em `America/Sao_Paulo` — o
  mesmo fuso do `DailyCounter`, senão às 22h o "mesmo dia" do dedup discordaria
  do "mesmo dia" do teto.
- Webhook: `evolutionMessageId` processado uma vez só.
- A unicidade mora no **Postgres** (`@unique`), não na boa vontade do código:
  worker reiniciado no meio do lote e duplo clique em "Aprovar" batem na
  constraint.

---

## LGPD

Legítimo interesse B2B (Art. 7º, IX). Exige três coisas, e as três estão no
texto: **identificar-se** ("Aqui é o Rodolfo, da FlowFoods"), **dizer de onde
veio o contato** ("Peguei o contato de vocês no Google") e **honrar a saída**
(opt-out permanente + o D10 oferecendo a saída explicitamente).

Tudo em audit log. Exclusão em 1 clique.
