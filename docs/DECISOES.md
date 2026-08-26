# DECISÕES — Caminho 3

Formato: data · decisão · alternativa · razão.

---

### 1. 2026-08-24 · Subtree isolado em `flowfoods/` dentro do `portal-bibi`

**Alternativas:** (a) construir dentro de `apps/`/`packages/` do Bibi;
(b) criar o repo `Flowfoods/portal-flowfoods` por conta própria; (c) não
escrever código e entregar só a auditoria.

**Razão:** (a) viola a parada de segurança #2 do próprio Master Prompt, que
nomeia o Bibi como território proibido — e mistura a base de leads de
concorrentes do empregador com o repositório do empregador. (b) criar
repositório é ação externa e irreversível, e o harness fixa o push em
`Flowfoods/portal-bibi`, branch `claude/rodolfo-barney-cadence-bc7dcy`. (c)
reduzir a entrega é decisão do Rodolfo, não minha.

O subtree fica fora do `pnpm-workspace.yaml` (`apps/*`, `packages/*`), então não
entra em build, lint, typecheck nem deploy do Bibi. Quando o repo próprio
existir, é um `git mv`. Ver `AUDITORIA_C3.md` #1.

---

### 2. 2026-08-24 · Luxon mantido, `America/Sao_Paulo` explícito em todo lugar

**Alternativa:** `Intl.DateTimeFormat` nativo, sem dependência.

**Razão:** o Master Prompt fixa Luxon na stack, e o subtree tem
`node_modules` próprio — o custo é zero para o Bibi. Toda data passa por
`setZone(TIMEZONE)`, inclusive a chave de dedup: às 22h de Brasília já é o dia
seguinte em UTC, e um dedup em UTC discordaria do `DailyCounter` justamente no
fim do expediente. Há teste para isso.

---

### 3. 2026-08-24 · Núcleo de domínio puro, com dependências injetadas

**Alternativa:** escrever direto contra Prisma, Redis e a Evolution.

**Razão:** o ambiente não tem nenhuma credencial (`AUDITORIA_C3.md` #2). Com
portas injetadas (`RepositorioOutbox`, `TransporteEvolution`, `PortasInbound`), o
motor inteiro roda em teste sem infra — e é o que permitiu entregar e **provar**
as regras invioláveis com o ambiente vazio. É também o que faz o dry-run poder
afirmar zero chamadas de rede em vez de prometer.

---

### 4. 2026-08-24 · Amostra mínima de 10 envios antes da taxa de entrega pausar o dia

**Alternativa:** aplicar o piso de 70% desde o 1º envio, ao pé da letra.

**Razão:** literal, a primeira mensagem que demora a confirmar entrega deixa o
dia em 0% e pausa tudo às 10h01, todo dia. O stop-loss viraria ruído e o Rodolfo
o desligaria — que é o pior desfecho possível para uma trava de segurança. As
outras duas causas (3 falhas consecutivas, instância fora do ar) continuam sem
amostra mínima, porque essas são inequívocas. Constante em
`regras.ts` (`STOP_LOSS.amostraMinimaEntrega`), com teste dos dois lados.

---

### 5. 2026-08-24 · Assinatura exigida no WhatsApp, dispensada no Instagram

**Alternativa:** exigir de todo texto, como diz a regra 3 de `mensagens.md`.

**Razão:** o próprio `mensagens.md` traz o template de Direct sem assinatura, e o
gate de F2 exige que todo o seed passe. O Instagram não é canal do Barney — a
plataforma bloqueia mensagem pré-preenchida, o fluxo é copiar/colar. Ver
`AUDITORIA_C3.md` #3.

---

### 6. 2026-08-24 · Duas correções contra o `montar_pacote.py`

**Alternativa:** porte 100% fiel, replicando os defeitos para portal e planilha
nunca discordarem.

**Razão:** os dois defeitos aparecem no texto que o dono do restaurante lê —
ângulo errado no Centro (#4) e traço órfão no nome (#5). Fidelidade a um defeito
visível ao cliente não vale a consistência. As duas divergências estão anotadas
no código, na auditoria e como patch pendente para o script, para a planilha
voltar a bater.

---

### 7. 2026-08-24 · Envio manual pula a janela, mas nunca o stop-loss nem os tetos

**Alternativa:** "Enviar agora" ignora todas as travas.

**Razão:** a janela protege o **destinatário** de receber fora de hora — o
Rodolfo é adulto e escolhe a hora dele. Teto, intervalo e stop-loss protegem o
**número**, e o WhatsApp não distingue mensagem manual de automática. A chave
geral (`disparoAtivo`) também vence o manual: chave geral que tem exceção não é
chave geral. Três testes cobrem isso.

---

### 8. 2026-08-24 · Opt-out enviesado para o falso positivo

**Alternativa:** casamento estrito, só quando a intenção for inequívoca.

**Razão:** falso positivo custa **um lead**; falso negativo custa denúncia no
WhatsApp, número queimado (2–3 semanas para aquecer outro) e exposição de LGPD.
Assimetria óbvia. Mitigação contra o excesso: palavra isolada ("não", "pare")
só conta quando é a mensagem inteira — senão "não sei, me manda mais info" viraria
saída. Testado nos dois sentidos.

---

### 9. 2026-08-24 · Opt-out e conflito checados antes de qualquer IA

**Alternativa:** classificar a intenção e deixar o modelo decidir a saída.

**Razão:** honrar a saída é obrigação legal e não pode depender de a Anthropic
estar no ar, de `ANTHROPIC_API_KEY` existir ou do orçamento diário. Por isso é
palavra-chave, determinística e testada. O modelo entra depois, para o que ele é
bom: classificar nuance e sugerir rascunho.

---

### 10. 2026-08-24 · Pausa do enrollment antes de tudo que pode falhar

**Alternativa:** processar tudo numa transação e pausar no fim.

**Razão:** o pior desfecho aceitável é "respondeu e ninguém classificou". O
inaceitável é o D+4 sair para quem já respondeu — queima o lead e queima o
número. Então a pausa não pode depender de nada falível. O retorno de
`processarResposta` expõe `passos` justamente para o teste **provar** a ordem, em
vez de confiar na leitura do código.

---

## Segunda rodada — no repositório do portal (2026-08-25)

### 11. 2026-08-25 · Worker em laço único, sem BullMQ e sem Redis

**Alternativa:** BullMQ + Redis, como o Master Prompt pede.

**Razão:** o teto é 30 mensagens por dia com no mínimo 120 s entre elas — um job
a cada 5 minutos, no pico. Fila distribuída nesse volume adiciona Redis,
serialização e modos de falha novos sem resolver problema nenhum. O contrato do
próprio prompt já condiciona o Redis dedicado a sobrar RAM na VPS (parada de
segurança #6), e a interface para o Dokploy é idêntica: um app `worker` de pé.
Se o volume mudar de ordem de grandeza, trocar o laço por BullMQ é local —
`dispararProximo` continua sendo a unidade de trabalho.

---

### 12. 2026-08-25 · Prisma 6, não 7

**Alternativa:** Prisma 7 com `prisma.config.ts` e driver adapter.

**Razão:** a 7 removeu `url = env("DATABASE_URL")` do schema e exige adapter +
arquivo de config. O contrato de env do Master Prompt é `DATABASE_URL`, e as
migrations rodam no boot do container (`prisma migrate deploy`) — caminho batido
na 6. Menos peça nova numa área que ainda não tem banco de verdade.

---

### 13. 2026-08-25 · O `/rodolfo` usa a marca do REPOSITÓRIO, não a do prompt

**Alternativa:** aplicar Syne e `#EA1D2C` como o Master Prompt manda.

**Razão:** o site no ar usa Playfair Display e `#b91c1c`. Uma área interna com
outra fonte e outro vermelho seria uma segunda marca dentro da mesma casa, e a
divergência é do site contra o prompt — não algo que o `/rodolfo` deva arbitrar.
Registrado como achado #4 e pendência 8. A assinatura das mensagens segue exata,
porque essa é regra de copy e tem teste.

---

### 14. 2026-08-25 · `apertar()` roda na leitura, não só na escrita

**Alternativa:** validar só no formulário de `/rodolfo/config`.

**Razão:** `Setting` é uma tabela como outra qualquer. Validar apenas na escrita
deixaria um `UPDATE` no Postgres passar por cima de todos os tetos. Apertando na
leitura, o valor efetivo é sempre o mais restritivo entre banco, rampa e
constante — venha de onde vier. Teste em `config.test.ts`.

---

### 15. 2026-08-25 · Dry-run automático quando a Evolution não está configurada

**Alternativa:** estourar exceção a cada tentativa de envio sem credencial.

**Razão:** o ambiente hoje não tem `EVOLUTION_API_URL`. Com dry-run automático,
o Rodolfo monta lote, roda a fila inteira e **lê cada mensagem renderizada**
antes de existir número conectado — que é exatamente o ensaio que o prompt pede
antes de ligar a chave. A tela e as ações dizem "SIMULADO" em toda resposta, para
não haver dúvida sobre o que aconteceu.

---

### 16. 2026-08-25 · A resposta manual do Inbox não passa pelo validador de template

**Alternativa:** aplicar as 8 regras também no texto que o Rodolfo escreve.

**Razão:** as regras de template existem contra disparo em série — mensagem
idêntica, promessa de gratuidade colada em 30 casas, prova social antes do
pedido. Uma resposta que ele leu e escreveu para uma pessoa específica não tem
esse risco, e um validador que recusasse "sem compromisso" numa conversa em
andamento seria atrito sem ganho. Os TETOS continuam valendo: a resposta passa
pelo `WhatsAppService` e conta contra o número como qualquer outra saída.

---

### 17. 2026-08-25 · Modo telefone pessoal: notificação suprimida sozinha

**Contexto:** o Rodolfo decidiu começar prospectando pelo próprio telefone. O
Master Prompt manda número dedicado ("nunca o pessoal"), mas a decisão é dele e
tem base técnica: `whatsapp-ban-prevention.md` classifica número pessoal antigo
como *mais* tolerante (200/dia) que chip novo (50/dia).

**Alternativa:** manter a notificação sempre, ou exigir uma env var extra para
desligá-la.

**Razão:** com um número só, `notificar()` mandaria mensagem do Rodolfo para o
Rodolfo. Não informa nada — a resposta do lead já chegou no aparelho dele — e
ainda gasta atividade do número, que é justamente o recurso escasso. Detectar é
melhor que configurar: o worker lê o `ownerJid` da instância e guarda em
`InstanceState.numeroProprio`; se bate com `RODOLFO_WHATSAPP` e não há
`EVOLUTION_NOTIFY_INSTANCE` separada, a notificação é suprimida.

Na dúvida (número desconhecido, Evolution fora do ar) **notifica** — perder um
aviso é pior que mandar um redundante.

O que NÃO mudou: a rampa e os 10 envios manuais continuam valendo. Eles não são
sobre aquecer o número, são sobre não acumular denúncia rápido — e denúncia é o
risco real aqui, não ban por número frio.

---

### 18. 2026-08-25 · `seo-schema.ts` passa a ler de `CONTACT_INFO`

**Alternativa:** corrigir só o Instagram, que era o que o Rodolfo confirmou.

**Razão:** ao abrir o arquivo para trocar o `@`, apareceram mais três valores
divergentes na mesma estrutura — LinkedIn (`rodolfo-flowfoods` contra
`rodolfo-cavalcante` do rodapé e do Master Prompt) e o domínio (`flowfoods.com.br`
em `@id` e `url`, contra `consultoriaflowfoods.com.br`, que é onde o site roda).

Todos são a mesma classe de defeito: dado de contato duplicado em dois arquivos,
divergindo com o tempo. Num JSON-LD isso é caro — `sameAs` e `url` são o que o
Google usa para casar a entidade com os perfis e o domínio. Corrigir um e deixar
os outros sabendo que estavam errados seria pior. Agora há uma fonte só.
