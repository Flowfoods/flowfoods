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

---

### 19. 2026-08-26 · O Barney vai para a `master` — porque é onde o deploy mora

**Alternativa:** manter o Caminho 3 na branch e pedir para o Dokploy apontar
para ela.

**Razão:** enquanto eu desenvolvia, as outras frentes deram à `master` um CI
próprio ("Portão e deploy": lint, portão de conteúdo, tsc, testes, build →
webhook do Dokploy) e provaram, lendo a produção pelo runner do GitHub, que o
ar ainda serve o build de julho — falta a primeira subida pelo painel. Ou
seja: o único caminho de deploy que existe passa pela `master`. Branch parada
não deploya.

Como foi feito, na ordem que protege o site:

1. `origin/master` entrou NA branch primeiro; conflitos resolvidos e portão
   inteiro rodado ali (330 testes = 184 do Barney + 146 do Diagnóstico).
2. Arquivos do SITE ficaram com a versão da `master` (`constants.ts`,
   `seo-schema.ts`) — a F1 fez as mesmas correções que eu, melhor.
3. zod unificado na v4: o motor do Diagnóstico tinha UM zod-3-ismo
   (`errorMap`), adaptado em uma linha; os `z.record` deles já eram de dois
   argumentos, válidos nas duas versões. Os 146 testes deles validam que nada
   mudou de comportamento.
4. Vitest num config só (`vitest.config.mts`), com os dois `include` e fuso
   `America/Sao_Paulo`.
5. Só então `master ← branch` (merge `8b0b9aa`) e push.

**A trava que fez isso ser seguro:** o middleware ganhou o gate de banco —
sem `DATABASE_URL` no processo, todo `/rodolfo/*` responde **503 "em
configuração"** (testado em runtime nos dois modos). O app da produção não
tem banco hoje; quando este merge subir, o site continua idêntico e a área
privada degrada com honestidade em vez de estourar 500. Ligar o banco no
painel desliga o gate sozinho, sem redeploy de código.

---

### 20. 2026-09-25 · Portal do cliente dentro do site, não num app separado

**Alternativa:** o pacote original (`index.html` e `admin.html` estáticos,
webhooks no n8n, schema `portal` à parte e Basic Auth no proxy).

**Razão:** o site já tinha Postgres, login do `/rodolfo`, integração com a
Evolution e deploy preparado. Dentro dele, é uma publicação em vez de três,
sem senha extra e com teste automatizado. O Rodolfo escolheu este caminho em
25/09. O conteúdo veio do `questionario-valentins.json` do Drive: o pacote
`.tar.gz` em duas partes chegou corrompido, com o md5 errado.

O aviso do Enviar não reusa o `notificar` do Barney, que se cala quando a
instância é o próprio número do Rodolfo. Aqui o aviso é a única notícia de
que o formulário chegou, então vai sempre.

---

### 21. 2026-09-25 · Site institucional refeito na identidade FlowFoods

**Alternativa:** manter o site de maio (Playfair, chão escuro, três pacotes,
marquee de fotos) e só acrescentar o botão de login.

**Razão:** o Rodolfo pediu visual mais moderno e conteúdo atualizado, e o
briefing de setembro fixou a identidade (creme #F5F0EB, preto, vermelho
#EA1D2C como único acento, Gelasio e Libre Franklin) e o conteúdo (seis
frentes, ciclo de quatro passos, formato com 2 visitas/mês e reunião mensal,
o que fica fora do escopo). O site passou a ser a mesma coisa que o material
da consultoria. O "Entrar" para o `/rodolfo` fica no cabeçalho e no rodapé,
discreto. Preço não vai para o site: é definido depois do diagnóstico.

Ficaram de fora, de propósito: os três pacotes (Diagnóstico, Consultoria,
Parceria), que não batiam com o ciclo contínuo; o modal de contato, que só
abria o WhatsApp; as fotos 1, 4 e 6, que são prints do Instagram com etiqueta
de carrossel. Dois pontos do briefing não entraram por conflitarem com
decisões anteriores: o handle `@flowfoods.rj` (confirmado como `@rrodolfoac`
em 25/08 e vetado pelo portão de conteúdo) e o rótulo "360°" (vetado pelo
portão como posicionamento antigo); o site usa "do diagnóstico à execução" e
"muito além do delivery".

**Adendo 25/09:** a seção "Formato" (2 visitas/mês, reunião mensal, mínimo
de 3 meses, investimento, o que fica fora do escopo) saiu do site a pedido do
Rodolfo: são termos particulares de cada consultoria e ficam na proposta. No
lugar entrou "O que a casa recebe": diagnóstico, plano de 90 dias, relatório
mensal e materiais de operação, mais como o trabalho se combina, sem número.


---

### 22. 2026-09-25 · Redefinir a senha do `/rodolfo` trocando o token de setup

**Alternativa:** manter o setup de uso único absoluto (como era) e redefinir
senha à mão no banco; ou um "esqueci a senha" por e-mail.

**Razão:** o Rodolfo ficou sem entrar no painel e não tem terminal nem e-mail
transacional. O que ele tem é o painel do Dokploy. Então o setup passou a
gravar o hash do token usado no audit (`admin_senha_definida`) e a aceitar
qualquer token que nunca foi usado: trocar o `ADMIN_SETUP_TOKEN` no painel e
fazer o redeploy reabre o setup, e o log do `web` volta a imprimir o link. O
token antigo continua morto (registro sem hash, de antes desta regra, também
conta como usado). A redefinição troca a senha do admin que já existe; nunca
nasce um segundo admin. O `docs/RUNBOOK.md` tem o passo a passo.

---

### 23. 2026-09-25 · Áudio gravado na hora e estado por cartão no Portal

**Alternativa:** manter o "Anexar áudio" abrindo a biblioteca de arquivos do
celular; e manter só a barra fixa no pé da tela como retorno de "salvo".

**Razão:** o Rodolfo testou e viu duas dores. Gravar no app de notas de voz,
salvar em Arquivos e depois anexar é um caminho que o dono de restaurante não
faz. E a barra de status fica longe do cartão onde ele está digitando: ele
não sabe se a resposta pegou. Então cada pergunta ganhou um gravador pelo
microfone (MediaRecorder, com prévia para ouvir antes de enviar, teto de 10
min), e cada cartão mostra o próprio "Salvando…" / "Salvo" / "Não salvou".
O "Anexar arquivo" continua como caminho reserva, sem filtro de tipo. No
painel, áudio toca inline (`Content-Type` de áudio e `inline`; o resto segue
`octet-stream` e anexo, pelo mesmo motivo de sempre). Chrome e Android gravam
WebM/Opus; iPhone grava MP4/AAC. O nome do arquivo diz item, dia e hora.


---

### 24. 2026-10-15 · ERP 0.1: tenant garantido também pelo banco (FK composta)

**Alternativa:** FK simples (`insumoId → Insumo.id`) e confiar só no portão
`doParceiro` para impedir referência entre parceiros.

**Razão:** o portão amarra o `parceiroId` da linha, mas não confere o dono do
id apontado: uma ficha de B poderia citar o insumo de A e o `include` vazaria
o nome. Com FK composta `(parceiroId, xId) → (parceiroId, id)` o banco recusa,
inclusive por SQL cru. Custo: um `@@unique([parceiroId, id])` por tabela
referenciada e FKs nunca `SetNull` (anularia o `parceiroId`). O teste-guarda
reprova FK de tenant que não seja composta.

---

### 25. 2026-10-15 · ERP 0.1: unidades inteiras e nada de `BigInt`

**Alternativa:** `Decimal` para dinheiro; custo unitário gravado em
micro-unidades; `BigInt` para acumulados.

**Razão:** quantidade em milésimos, dinheiro em centavos, percentual em
pontos-base (1% = 100), fator em milésimos (FC 1,18 = 1180), validade em
minutos. Custo unitário não é gravado: guarda-se quantidade e valor total e o
custo médio é derivado, sem perda de precisão para item de centavo fracionado
(palito, sachê). Nenhum acumulado é gravado (DRE, CMV, total do mês são
somas na hora), então `Int` (até R$ 21 mi por linha) basta; `BigInt` só
traria atrito no JS sem caso real.

---

### 26. 2026-10-15 · ERP 0.1: pré-preparo é Insumo; subficha é item da ficha

**Alternativa:** tabela própria de pré-preparo, ou ficha de produto separada
de ficha de preparo.

**Razão:** o estoque só conhece `Insumo`. Um pré-preparo que vai para a
câmara vira `Insumo` tipo PRE_PREPARO produzido pela sua `FichaTecnica`
(`insumoProduzidoId`); a produção dá entrada nele e baixa os insumos. Item de
ficha aponta insumo OU subficha (CHECK `num_nonnulls = 1`), o que cobre
molho feito na hora e combo. Ciclo entre fichas fica para a regra da 1.3.
`ProdutoVenda` é separado da ficha porque preço, canal e embalagem são da
venda, não da receita.

---

### 27. 2026-10-15 · ERP 0.1: livro-razão de estoque, saldo como cache

**Alternativa:** só uma tabela de saldo atualizada no lugar; ou só
movimentos, somando na hora.

**Razão:** `MovimentoEstoque` é a verdade (só INSERT, trigger recusa UPDATE;
saldo antes/depois e snapshot do insumo em cada linha: todo ajuste mostra de
quanto para quanto). `SaldoEstoque` é cache por loja × insumo, gravado na
mesma transação (`cliente.transacao`) com `versao` para trava otimista. Lista
do dia (3.2) não tem tabela: é ordem PLANEJADA × saldo, derivada.

---

### 28. 2026-10-15 · ERP 0.1: faturamento idempotente por chave, não por dia

**Alternativa:** uma linha única por loja × canal × dia.

**Razão:** integração pode mandar por pedido, por dia ou reenviar o mesmo
relatório; planilha pode ser reimportada. Cada lançamento leva
`chaveIdempotencia` única no parceiro (manual usa chave determinística, então
redigitar é correção, registrada em `HistoricoAlteracao`). O dia é a soma.

---

### 29. 2026-10-15 · ERP 0.1 (revisão): tenant travado em runtime e no banco

**Alternativa:** manter só o teste de grep contra `prisma.<modelo>` e confiar
na FK composta para impedir referência cruzada.

**Razão:** os fiscais provaram dois furos. (1) `connect` numa relação
composta grava `parceiroId` junto com a FK: um `update` de B "conectando" a
ficha de A movia a linha para A e lia a receita. Agora o portão recusa
qualquer campo de relação no dado (lista lida do esquema, `Prisma.dmmf`) e um
trigger em toda tabela de tenant recusa UPDATE do `parceiroId`, o que também
neutraliza o ON UPDATE CASCADE. (2) grep não pega alias nem `tx` de
`$transaction`. Agora o `prisma` do portal é travado em runtime para os
modelos de tenant e o portão usa um PrismaClient base privado. Custo: um
segundo pool de conexões (lazy, só abre quando o ERP é usado). O SQL cru do
portal continua possível e segue vigiado só pelo teste-guarda.

---

### 30. 2026-10-15 · ERP 0.1 (revisão): farol por linha do DRE com sentido

**Alternativa:** farol só de margem líquida por canal (versão reprovada).

**Razão:** o contrato (2.4) pede farol por canal em todas as linhas com meta.
`FarolFaixa` aponta `DreLinha` (FK composta) e canal (nulo = rede); a faixa é
o desvio vs meta em pontos-base, já com o `sentido` da linha (receita: maior
é melhor; CMV e despesa: menor). Meta e despesa ganharam canal opcional (nulo =
rede/rateio). Uniques com canal nulo usam `NULLS NOT DISTINCT` no SQL
(Postgres 15+; o Prisma não descreve e o diff não reverte).

---

### 31. 2026-10-15 · ERP 0.2: RLS com papel `erp_tenant` (SET LOCAL ROLE), instalada só quando dá

**Alternativa:** (a) não fazer RLS e seguir só com portão + teste-guarda;
(b) app conectando com um usuário Postgres não-superusuário dedicado ao ERP.

**Razão:** relatório de DRE/CMV vai precisar de SQL cru, e SQL cru é onde se
esquece o `WHERE "parceiroId"`. (b) fecharia também o `$queryRaw` do portal,
mas exige credencial nova e mudança no docker-compose/Dokploy. Ficou o padrão
oficial (prisma-client-extensions/row-level-security) adaptado ao superusuário:
papel NOLOGIN `erp_tenant` (sem BYPASSRLS, GRANT só nas 29 tabelas de tenant;
livro-razão e histórico só SELECT/INSERT), `ENABLE` + `FORCE ROW LEVEL
SECURITY` e política `"parceiroId" = NULLIF(current_setting('app.parceiro_id',
true), '')`. O portão abre TODA transação com `set_config('app.parceiro_id',
id, true), set_config('role', 'erp_tenant', true)`.

**Deploy seguro nos dois cenários** (o deploy roda `migrate deploy` sozinho e
`docs/DEPLOY_DOKPLOY.md` admite usuário não-superusuário): a migration só
instala a RLS se quem roda é dono das 29 tabelas E o papel existe (ou dá para
criá-lo: SUPERUSER/CREATEROLE) E consegue assumi-lo (`pg_has_role ... 'SET'`,
ou concede a si mesmo). Senão, `RAISE NOTICE` e segue sem RLS. O portão confere
em runtime, uma vez por cliente (cache), se o papel existe, se o usuário pode
assumi-lo e se ele tem GRANT/RLS forçada; se não, opera sem o `SET ROLE` e
avisa UMA vez no log — o isolamento do portão (filtro, FK composta, triggers,
status) continua. Testado em banco scratch com dono não-superusuário: com o
papel concedido (RLS instalada, 38/38 testes) e sem (RLS pulada, 32 + 6 pulados).

**`cliente.sql`** é o caminho do relatório em SQL cru, dentro do contexto; o
texto (fora dos parâmetros) não pode ter `set_config`, `SET` como comando,
`SET LOCAL/SESSION`, `RESET`, `ROLE`, `COMMIT`, `ROLLBACK`, `BEGIN`,
`START TRANSACTION`, `SAVEPOINT`. Leitura avulsa abre read-only.

**Custo:** cada operação avulsa vira uma transação curta (contexto, operação);
e a RLS protege contra esquecimento, não contra quem tem acesso ao código. O
`$queryRaw` do portal segue superusuário e vigiado pelo teste-guarda; fechar de
vez = alternativa (b), quando houver janela de infra. Com dono
não-superusuário e RLS instalada, o FORCE já tira dado de tenant do portal.

---

### 32. 2026-10-15 · ERP 0.2: escrita só em parceiro ATIVO, conferido DENTRO da transação

**Alternativa:** conferir o status só na server action (Passo zero), ou só no
`exigirParceiro`.

**Razão:** worker ou webhook futuro vai chamar `doParceiro(id)` direto, e uma
suspensão pode acontecer entre a conferência e a escrita. Agora toda escrita do
portão (modelo, `transacao`, `cliente.sql` com INSERT/UPDATE/DELETE...) chama
`erp_exigir_parceiro_ativo(id)` na mesma transação: função da migration
(SECURITY DEFINER, lê só o status daquele id) com `SELECT ... FOR SHARE`, que
recusa se não for ATIVO. A suspensão concorrente espera a escrita em curso
terminar; a seguinte já é recusada (teste com banco). Exceções do nível 1
(renomear, mudar status) usam `gravarParceiroFlow`, que não passa pela
conferência — suspender grava histórico de um parceiro que acabou de ficar
SUSPENSO, e o nome pode ser corrigido em suspenso (decisão do Maestro).
Por cima, `exigirParceiro` entrega cliente `somenteLeitura` para parceiro não
ATIVO: recusa no portão antes do banco e abre a transação read-only. RASCUNHO
(aguardando liberação) também não recebe escrita.

---

### 33. 2026-10-15 · ERP 0.2: histórico do ParceiroFlow mora no próprio parceiro, na mesma transação

**Alternativa:** tabela de auditoria separada para o nível 1, ou gravar o
histórico depois, fora da transação.

**Razão:** `HistoricoAlteracao` já é por parceiro e só aceita INSERT; o que
mudou no cadastro de um parceiro é dele. `gravarParceiroFlow` (no portão)
grava o ParceiroFlow como usuário do app e, na MESMA transação, entra no
contexto do parceiro e insere o histórico sob RLS: ou ficam os dois, ou
nenhum. Slug é editável só na criação (é endereço de link e relatório);
mudanças de nome e status são condicionais ao valor lido (sem atropelo entre
abas). Suspender exige motivo, que vai para `HistoricoAlteracao.motivo`.
Cadastro de loja, marca e insumo também passa a gravar o "depois".

---

### 34. 2026-10-15 · ERP 0.3: pessoa do parceiro é `UsuarioErp`, não o `User` do /rodolfo; vínculo por parceiro

**Alternativa:** estender o `User` com papel e `parceiroId`; ou um usuário por
parceiro (e-mail único por parceiro).

**Razão:** o `User` é o login do nível 1 e o next-auth do /rodolfo autentica
contra ele; misturar abriria o /rodolfo para a pessoa do parceiro ao primeiro
erro de papel. Modelo novo, outra sessão, outro cookie: a pessoa nunca alcança
o /rodolfo por construção. Consultor e sócio de rede entram em mais de um
parceiro com o mesmo e-mail, senha e rosto: identidade única (`UsuarioErp`) e
vínculo por parceiro (`AcessoParceiro`, com status próprio — desativar em B não
mexe em A). Quem tem mais de um escolhe o parceiro depois de entrar; o
parceiro escolhido fica gravado na sessão e é a única fonte do parceiro em
`/erp`. Perfis e setores ficam para a 0.4 (vão no vínculo).

---

### 35. 2026-10-15 · ERP 0.3: credenciais fora do tenant, travadas num módulo só

**Alternativa:** pôr vínculo, link e sessão (que têm `parceiroId`) no
`MODELOS_DE_TENANT` com RLS.

**Razão:** no login ainda não se sabe o parceiro: a RLS forçada esconderia o
vínculo do próprio login (com dono não-superusuário) e não protegeria nada que
a validação não proteja. Ficaram fora, com travas equivalentes: o `prisma` do
portal recusa os 7 modelos e as 3 relações em runtime; só
`src/lib/erp/credenciais.ts` toca neles (teste-guarda, que também restringe
`base.ts` e `fecharComHistorico`); o papel `erp_tenant` não tem GRANT (a
migration revoga, condicional como na 0.2) e o teste de RLS confere; e toda
mudança de acesso grava antes/depois no `HistoricoAlteracao` DO parceiro na
mesma transação (`fecharComHistorico`, último passo da transação).

---

### 36. 2026-10-15 · ERP 0.3: sessão própria no banco, não um segundo next-auth

**Alternativa:** segundo provider/instância do next-auth com outro cookie; ou
papel dentro do JWT do mesmo next-auth.

**Razão:** o contrato exige que acesso desativado caia na próxima requisição.
JWT só cai quando vence; seria preciso consultar o banco a cada requisição de
qualquer jeito. Sessão no banco faz isso direto: o cookie leva um token
aleatório (só o SHA-256 no banco), e `validarSessao` confere token, validade,
encerramento e vínculo ATIVO numa ida só por requisição. Sair e trocar a senha
encerram de verdade. O limite de tentativas também vai para o banco (não para
memória como no /rodolfo): vale com várias réplicas do `web` e já é a
auditoria de login ok/falhou.

**Revisão (Guardião):** contar → bcrypt → gravar deixava 60 chutes simultâneos
passarem do limite. Agora contar e reservar é uma transação só, sob
`pg_advisory_xact_lock` do e-mail e do IP (sempre nessa ordem: sem deadlock):
a tentativa entra como falha antes do bcrypt e é corrigida no fim. Alternativa
descartada: `SERIALIZABLE` com nova tentativa — mais código e erro de
serialização visível sob ataque. O desafio do rosto ganhou teto de abertos
por IP pelo mesmo motivo (inundar a tabela).

---

### 37. 2026-10-15 · ERP 0.3: "rosto" é passkey com verificação obrigatória; ativar pede senha recente

**Alternativa:** reconhecimento facial no servidor (foto/vídeo + modelo); ou
passkey sem exigir verificação do usuário.

**Razão:** rosto é dado biométrico sensível na LGPD; capturar, mandar ou guardar
imagem não tem justificativa quando o celular já faz isso melhor. WebAuthn com
`userVerification: 'required'` deixa o Face ID / reconhecimento facial /
digital do aparelho conferir a pessoa; o servidor guarda só a chave pública e
confere assinatura, desafio (banco, 5 min, uso único), origem, domínio e
contador. Chave residente: a pessoa entra sem digitar e-mail. Ativar um
aparelho exige sessão aberta COM SENHA há até 30 min: um cookie roubado não
pendura um aparelho novo na conta. Versão `@simplewebauthn` 13.3 (a 14 saiu em
setembro; ficamos na linha estável conhecida).

---

### 38. 2026-10-15 · ERP 0.3: parceiro suspenso ou aguardando — entra e só lê

**Alternativa:** bloquear o login enquanto o parceiro não está ATIVO.

**Razão:** é a regra que o portão já tem (decisão 32): parceiro não ATIVO recebe
cliente somente leitura, recusado no portão e no banco. Deixar entrar permite
ao Rodolfo preparar o acesso antes de liberar o parceiro e não apaga o
histórico de quem está suspenso; a tela avisa o porquê. Bloquear o acesso de
uma pessoa é outra ação (desativar o vínculo), com efeito imediato.


---

### 39. 2026-10-15 · ERP 0.4: catálogo e perfis base em código; perfil próprio é fotografia; tudo no vínculo, fora do tenant; setor não concede

**Alternativas:** (a) perfis base como linhas no banco, semeadas por parceiro;
(b) perfil próprio guardado como diferença do base (herda permissão nova);
(c) permissões e perfis em tabelas de tenant (RLS); (d) setor como papel que
concede permissões.

**Razão:** (a) catálogo e perfis base mudam junto com o código (módulo novo traz
permissão nova): em código, versionados (`VERSAO_DO_CATALOGO`), sem migration
de dado por parceiro. (b) herdar sozinho é dar acesso que ninguém escolheu:
perfil próprio guarda a lista completa (menor privilégio) e a versão do
catálogo em que foi salvo. (c) o alcance é resolvido em `validarSessao`, a cada
requisição, antes do contexto do parceiro e na mesma ida ao banco do vínculo;
e qualquer relação Prisma entre credencial e tenant abriria `include` sem o
portão (o teste-guarda reprova). Ficou tudo do lado das credenciais
(`AcessoParceiro` + `PerfilAcesso`), travado em `credenciais.ts`, sem GRANT
para `erp_tenant`, com histórico no tenant do parceiro. (d) "cozinha" não diz
o que a pessoa pode (o cozinheiro-chefe e o auxiliar são da cozinha): setor
filtra e sugere o perfil próprio pensado para ele; quem concede é o perfil.

---

### 40. 2026-10-15 · ERP 0.4: lojas no vínculo (rede inteira OU lista), 3 níveis, checagem única no servidor

**Alternativas:** tabela de junção pessoa × loja com FK para `Loja`; nível
explícito (enum) na pessoa; checagem só na tela.

**Razão:** "rede inteira" precisa valer para loja aberta amanhã — é um
booleano, não a lista de hoje. Sócio de uma unidade e gerente de loja são o
mesmo caso (lista de lojas) com perfis diferentes. O nível sai do vínculo
(FLOWFOODS para o /rodolfo, REDE com rede inteira, LOJA com lista), sem campo
para ficar incoerente. `lojaIds` sem FK porque credencial não aponta para
tenant; em troca, a lista é validada contra as lojas do parceiro (lidas pelo
portão) na gravação e toda consulta de loja passa pelo portão (`filtroDeLojas`),
então um id estranho não acha nada. CHECK: rede inteira XOR lista não vazia;
um perfil só; FK composta para o perfil do mesmo parceiro. Permissão "por
loja" é checada com `lojaId`; `lojas.gerir` e `historico.ver` exigem a rede
inteira (mexem na estrutura ou mostram toda a rede). Uma função decide
(`exigirPermissao`, com `pode`/`recusaDaAcao`/`exigirPermissaoNaPagina` sobre
a mesma regra) e o teste-guarda reprova página ou action do `/erp` sem ela.
Vínculos da 0.3 viraram Gerente com rede inteira: continuam podendo o que
podiam (cadastrar insumo) sem ganhar a equipe.

---

### 41. 2026-10-15 · ERP 0.4: sem escalada por cobertura, último administrador sob trava, link de senha restrito

**Alternativas:** conferir só "o ator tem `acessos.gerir`"; contar
administradores fora de transação; manter o link de senha liberado a qualquer
administrador do parceiro (ou só redefinir e avisar a pessoa).

**Razão:** com "cuidar da equipe" sozinho, um gerente com esse extra se faria
dono, ou tiraria o dono. Regra única: o ator precisa **cobrir** a pessoa —
todas as permissões dela e as lojas dela — antes (não mexe em quem está acima)
e depois (não sobe ninguém acima de si). Perfil próprio só por quem tem a rede
inteira e todas as permissões do perfil. Último administrador = ativo +
cuidar da equipe + rede inteira; nenhuma mudança (nem do nível 1) deixa o
parceiro com zero, se tinha algum. A contagem antes/depois roda na transação
da mudança, sob `pg_advisory_xact_lock` do parceiro: dois administradores
tirando um ao outro ao mesmo tempo, um só consegue (teste). Link de senha: a
senha é da pessoa e vale em TODOS os parceiros dela; um administrador de A que
gerasse o link de quem também está em B tomaria a conta e entraria em B. Por
isso só o nível 1 gera, ou o administrador de um parceiro onde a pessoa está
sozinha (sem vínculo em outro, ativo ou não). "Só redefinir e avisar" não
serve: ainda não há canal de aviso (0.5). E-mail travado pelo limite: o nível
1 libera (grava uma "tentativa ok" marcada; o limite por IP segue).

**Revisão (Guardião, volta 1):** a regra só valia na geração do link. Sequência
provada: o dono de A gera link para quem só está em A; o nível 1 põe essa
pessoa em B; o link de A seguia valendo e entregava B. Agora: (1) o link
guarda quem gerou (`doNivel1`) e o de parceiro é reconferido no uso, dentro da
transação, sob `pg_advisory_xact_lock` da pessoa (a mesma trava de criar
vínculo e gerar link); (2) vínculo novo revoga links pendentes da pessoa; (3)
senha criada por link de parceiro fica marcada com o parceiro e não atravessa:
ao ganhar outro parceiro ela é apagada, as sessões caem e o nível 1 manda
link novo (custo: a pessoa cria senha de novo uma vez). Só o nível 1 vincula
e-mail de outro parceiro; para a pessoa do parceiro a recusa é neutra (não
revela que o e-mail existe). As funções de equipe releem o ator no banco.

**Revisão (Guardião, volta 2):** apagar só a senha não bastava: quem conhecia a
senha do link podia ter ativado o rosto (passkey) e entrar por ele em B. Agora,
na mesma transação em que a senha "do parceiro" é apagada, saem também todos
os rostos da pessoa e os desafios WebAuthn pendentes dela, além das sessões e
dos links já tratados; o histórico de B registra quantos rostos saíram.
Inventário das credenciais da pessoa: senha, sessões, links, rostos, desafios
— todas tratadas; tentativas de entrada não deixam entrar.

**Revisão (Fiscal QA + Guardião, volta 3):** dois furos com o mesmo princípio.
(a) Redefinir a senha pelo link encerrava as sessões mas deixava os rostos:
o dono de A definia a senha da pessoa (só em A) e ativava o rosto no aparelho
dele; a pessoa pedia ajuda, o nível 1 mandava link novo, ela refazia a senha
(marca do parceiro volta a nula); o nível 1 a punha em B como Dona; nada era
apagado e o atacante entrava pelo rosto em B. (b) Corrida: um login que leu a
senha antes da limpeza gravava a sessão depois dela; `escolherParceiro(B)` dava
Dono em B (o mesmo valia para ativar rosto e entrar pelo rosto). **Princípio:
recuperar/redefinir a senha pelo link revoga TODOS os outros meios de entrar
da pessoa.** Uma função só, `revogarMeiosDeEntrada(tx, usuarioId, motivo)`,
usada pelos dois caminhos que mudam a senha (definir/redefinir pelo link;
senha "de outro parceiro" apagada ao ganhar vínculo): encerra as sessões,
revoga os links pendentes, apaga rostos e desafios, apaga a senha quando é o
caso e sobe `UsuarioErp.versaoCredencial`, sob a trava da pessoa; o histórico
de CADA parceiro dela registra quantos rostos saíram. Contra a corrida, a
versão é lida antes do bcrypt/da assinatura e a gravação é condicional, sob a
mesma trava: `abrirSessao` (senha e rosto) só grava se a versão não mudou (e o
contador do rosto sobe ali dentro); `concluirRegistroDeRosto` só pendura o
aparelho se a sessão ainda está aberta e da versão atual; e a sessão guarda a
versão em que nasceu (`validarSessao` recusa a velha — segunda trava).
"Seu acesso" avisa que os aparelhos foram removidos e que dá para ativar de
novo (`rostosRemovidosEm`, limpo ao ativar). Varredura dos outros pontos:
vínculo ganho sem senha "de parceiro" só revoga links (as credenciais que
restam nasceram da senha atual, que é da pessoa ou do nível 1); desativar
encerra as sessões e links DAQUELE parceiro e mantém senha e rosto (valem nos
outros; reativar devolve), e o vínculo desativado continua contando para a
regra do link; mudar perfil/lojas, liberar tentativas e remover um rosto não
mudam a senha nem vínculo. Custo: quem redefine a senha ativa o rosto de novo.
Alternativa descartada: apagar rostos também a cada vínculo novo (derrubaria
quem não tem nada de errado).

### 42. 2026-10-16 · ERP 1.1: um shell só, com o Barney antigo dentro, e um design system só

**Alternativas:** (a) dois shells (um do /rodolfo, outro do /erp) com o mesmo
visual; (b) manter o Barney antigo com o menu horizontal e só o ERP novo no
shell; (c) shell único com os dados entregues pelo layout de cada área.

**Razão:** (c). Regra Nº 2 do contrato: revisar o velho e reconstruir na
arquitetura nova, sem empilhar. Havia três kits visuais paralelos e duas abas
copiadas (deriva X1); agora há `src/components/erp/{shell,ui,telas}` e
nenhuma rota importa de outra. As sessões continuam duas (decisões 34/36): o
shell é o mesmo componente, cada layout resolve a SUA sessão e passa dados
prontos (menu filtrado por `pode`, visão conferida, server actions que
reconferem). Login e setup do nível 1 ficam num grupo de rota próprio
`(acesso)` — o shell exige sessão, e envolver o login seria um laço.

### 43. 2026-10-16 · ERP 1.1: tema por cookie lido no servidor, escopado no wrapper

**Alternativas:** (a) `next-themes`/script no `<head>` do layout raiz; (b)
classe no `<html>` lida no layout raiz; (c) cookie `ff_tema` lido pelos
layouts do shell, `data-tema` no wrapper `.ff-app`, "do aparelho" por
`prefers-color-scheme` no CSS.

**Razão:** (c). (a) e (b) tornam o layout raiz dinâmico (o site institucional
perderia o estático) ou exigem script antes da pintura. Em (c) não há flash
(o servidor já pinta o tema), não há JS para pintar e o `/` segue ○ no build
(teste em `tests/erp-shell.test.ts`). Tokens em canais RGB para o Tailwind
aplicar opacidade; fora do `.ff-app` os tokens caem no valor escuro, então
peça do DS usada no /entrar (Marca, Ponto) mantém o visual de antes.

### 44. 2026-10-16 · ERP 1.1: visão "Rede Completa ↔ loja" é filtro, nunca permissão

**Alternativas:** (a) a visão escolhida vira o alcance da requisição; (b)
cookie com o id da loja, aceito como veio; (c) cookie
`<parceiroId>:<rede|lojaId>` conferido a cada requisição contra
`listarLojasDoAlcance` (0.4), com recusa na action.

**Razão:** (c). (a) faria um cookie conceder ou tirar permissão — a checagem
única é `exigirPermissao` (decisão 40). (b) aceitaria loja forjada ou de
outro parceiro. Em (c) o valor fora do alcance cai na primeira opção
permitida e a action não grava nada; N3 não tem "Rede Completa".

### 45. 2026-10-16 · ERP 1.1: kit Kairu Dark "pulso" na geometria, FlowFoods na cor e no tipo

**Alternativas:** (a) o kit inteiro (menta, Inter, vidro); (b) só a
identidade FlowFoods, sem kit; (c) geometria e comportamento do kit + cor e
tipo FlowFoods + tabelas do Corporativo.

**Razão:** (c). O contrato pede o kit puxado de verdade (código lido via MCP:
`design-kit.css`, `DesignKit.tsx`) e a identidade FlowFoods (CLAUDE.md).
Ficam do kit: menu de altura total com indicador de 2 px, cards 14 px,
botões 7 px, foco 3 px/4 px, 160/220 ms, gaveta < 900 px, sheet < 600 px,
`<dialog>` nativo. Não vêm: vidro/blur, gradiente, glow, Inter/Sora, menta.
Botão principal em #C41522 (branco ≈ 6:1); #EA1D2C fica para acento
(indicador, filete, foco). Cor de módulo só no quadrado do ícone. Rótulo em
caixa alta só no hub e nos grupos do menu. Contrato completo em
`.interface-design/system.md`.

### 46. 2026-10-16 · ERP 1.1: embalagem digitada como se compra; custo com frete e um arredondamento; "Sem preço" ≠ R$ 0,00

**Alternativas:** (a) pedir tudo na unidade base (5,000 kg; 0,750 kg); (b)
unidade de compra própria (caixa, fardo) com fator; (c) "quanto vem" em kg ou
g (L ou ml), convertido no servidor para milésimos.

**Razão:** (c). Ninguém compra "0,750 kg": a embalagem diz 750 g. A
conversão é só aqui (`lerQuantidadeNa`), sem float, e 1 g é o menor passo
(meio grama recusado). Unidade de uso na ficha (colher, porção) é 1.2.
Custo de referência = (preço + frete) × 1000 ÷ conteúdo, somando ANTES de
dividir: arredondar preço e frete separados erra 1 centavo
(`tests/erp-insumos.test.ts`). Frete é por embalagem, no insumo e em cada
outra embalagem. Preço desconhecido grava 0 e o custo vira null: a tela diz
"Sem preço" (Notion Core: custo incompleto não é custo baixo), filtra e ordena
no fim; 0 digitado sem marcar é recusado. Custo pela última compra continua
travado para a 1.5.

### 47. 2026-10-16 · ERP 1.1: variante é outra embalagem de compra, na mesma unidade; a unidade do insumo trava

**Alternativas:** (a) variante como "sabor/tamanho" com unidade própria; (b)
outra embalagem de compra do mesmo insumo, conteúdo na unidade dele.

**Razão:** (b). Comparar custo entre caixa, fardo e outra marca só faz
sentido na mesma unidade; a tela diz qual sai mais barata. Na tela o nome é
"Embalagem" (variante é palavra de sistema). Por isso a unidade do insumo só
muda sem outra embalagem e sem uso: os milésimos gravados passariam a
significar outra coisa. A conferência roda com a linha do insumo travada
(UPDATE) e a embalagem nova trava o insumo em FOR SHARE: uma não entra no
meio da outra. "Tornar padrão" e fornecedor por embalagem ficam para depois.

### 48. 2026-10-16 · ERP 1.1: edição concorrente recusada, nunca sobrescrita

**Alternativas:** (a) último a salvar vence; (b) trava pessimista ao abrir o
formulário; (c) gravação condicional à versão lida.

**Razão:** (c). Insumo: `updateMany where { id, atualizadoEm: lido }` — 0
linhas = "alguém alterou, recarregue", nada gravado. Embalagem não tem
`atualizadoEm` (e a 1.1 não faz migration por isso): a tela leva uma
impressão dos valores lidos e o `updateMany` repete esses valores no `where`.
(a) perde trabalho em silêncio; (b) deixa insumo preso por aba esquecida.
Desativar/reativar é condicional à situação lida.

### 49. 2026-10-16 · ERP 1.1: histórico com retrato legível (custo fotografado, ordem da tela, alvo da linha)

**Alternativas:** (a) gravar só os campos crus e recalcular na leitura; (b)
gravar o retrato do que a tela mostrou.

**Razão:** (b). O histórico guarda, além dos campos que mudaram, o custo por
unidade daquele momento (o mesmo número da tela) e o contexto (nome, unidade,
insumo da embalagem) para a linha dizer de quem é ("Cebola · Caixa 10 kg").
Na criação, campo vazio não aparece; a leitura segue a ordem da tela porque o
jsonb do Postgres não guarda a ordem das chaves. Só se acrescentou a
`ENTIDADE`/`CAMPO`: o histórico antigo continua lido igual.

### 50. 2026-10-16 · ERP 1.1: novo, editar e embalagem em tela própria; filtros na URL

**Alternativas:** (a) painel lateral (diálogo) por cima da lista; (b) tela
própria para cada formulário.

**Razão:** (b). Funciona sem JS, vira tela cheia no celular de graça, o
botão voltar do navegador faz o que se espera e a URL de editar pode ser
mandada para alguém. A lista guarda busca, filtros, ordem e página na URL, e
o detalhe volta para ela (`?de=`, só filtros conhecidos passam). Sucesso leva
ao detalhe com uma frase fixa do que mudou (`?feito=`, a URL só escolhe a
frase). Ordenar por custo é em memória, com o mesmo cálculo da tela
(custo derivado, nunca gravado).

### 51. 2026-10-16 · ERP 1.1 (fiscais do shell): destino depois do login só dentro da área; login e /entrar no tema do app

**Alternativas:** (a) confiar no `callbackUrl` do next-auth; (b) aceitar só
mesma origem e caminho da área.

**Razão:** (b). `window.location.assign(callbackUrl)` executava
`javascript:` e levava a outro site. `destinoSeguro` resolve a URL contra a
origem e exige o caminho `/rodolfo/...` (no /entrar, `/erp` ou
`/entrar/escolher`); o resto vira o padrão. No mesmo passe, `/rodolfo/login`
e `/entrar` passaram a usar os tokens do ERP e o tema do cookie `ff_tema` (o
`/` continua estático), e o estado da Evolution aparece em palavra
(Conectado/Conectando/Desconectado), não "close".

### 52. 2026-10-16 · ERP 1.1 (revisão do Guardião): custo de referência exato, como fração inteira

**Problema:** o custo por unidade era arredondado ao centavo na origem. R$ 4,00
por 1000 guardanapos virava "R$ 0,00/un" na lista e `0` no histórico, e duas
embalagens (R$ 4,00/1000 un e R$ 15,00/5000 un) "saíam pelo mesmo custo". Na
ficha técnica (1.3) isso zeraria o custo de todo item barato.

**Alternativas:** (a) milésimos de centavo por unidade base (inteiro, mas
ainda arredonda; e embalagem de 2.000 un a R$ 0,01 já some); (b) float (proibido
pela decisão 25); (c) guardar a fração exata (preço + frete) ÷ conteúdo,
reduzida, e arredondar só no uso.

**Razão:** (c). `custoDaEmbalagem` devolve `{ centavos, milesimos }` (inteiros,
divididos pelo MDC); `custoDaQuantidade` multiplica pela quantidade e
arredonda UMA vez (é o que a ficha usa); `compararCustos` compara por
multiplicação cruzada; produtos grandes vão em BigInt por dentro (nunca no
banco: decisão 25 continua). A tela mostra duas casas a partir de 1 centavo e,
abaixo disso, as casas necessárias para dois algarismos ("R$ 0,004/un",
"R$ 0,0035/un"), mais o milheiro na conta de itens em un — é como guardanapo,
copo e sachê se compram. O histórico grava a fração exata
(`custoPorUnidade`); as linhas antigas com `custoPorUnidadeCentavos`
continuam legíveis. Revisa a parte de arredondamento da decisão 46.

### 53. 2026-10-16 · ERP 1.2: ficha é a receita; custo da ficha é fração exata, nunca gravado

**Alternativas:** (a) ficha = produto de venda (com preço junto); (b) custo
gravado na ficha e recalculado quando o insumo muda; (c) ficha = receita
(prato ou pré-preparo), custo derivado na hora, em fração exata.

**Razão:** (c). Preço, canal e embalagem são da venda (`ProdutoVenda`,
1.9/1.10; decisão 26). Custo gravado envelhece quando a farinha sobe (Notion
Core: "o custo é um número velho numa planilha"). A soma é Σ custo ×
quantidade × fator em BigInt e arredonda uma vez, na tela: 180 g de blend +
pão + 2 guardanapos dá R$ 4,92 exato, não 4,93 da soma de linhas arredondadas
(cada linha da tela mostra o seu arredondado; a nota da tabela diz isso).
Insumo "Sem preço" deixa o custo INCOMPLETO, dito com o nome do insumo — nunca
R$ 0,00 escondido. `custoDaQuantidade` passou a recusar acima de 2^53.

### 54. 2026-10-16 · ERP 1.2: foto no disco do parceiro, conferida pelos bytes, servida pelo portão

**Alternativas:** (a) foto no banco (bytea); (b) pasta pública em `/public`
ou CDN; (c) disco em volume nomeado, isolado por parceiro, servido por rota
que lê a ficha pelo portão.

**Razão:** (c), o mesmo padrão do Portal (`portal-uploads`), num volume
próprio (`erp-arquivos`). (a) incha o banco e o backup; (b) deixa a foto de
um parceiro acessível a quem tiver o link. O nome é sorteado no servidor (32
hex; CHECK no banco), o tipo vem dos bytes (JPEG/PNG/WebP; SVG pode levar
script), 8 MB no máximo, `nosniff` + CSP fechada na resposta. O id do
parceiro do caminho vem da sessão/portão, nunca da URL. Foto nova vai ao disco
antes da transação e sai se ela falhar; a velha só sai depois do commit (um
arquivo órfão é melhor que uma ficha sem foto). Uma foto por ficha: colunas
na própria `FichaTecnica` (sem tabela nova, sem mexer em RLS). O navegador
reduz a foto (1600 px, JPEG) antes de enviar; o servidor confere de novo.

### 55. 2026-10-16 · ERP 1.2: importar fichas por CSV, com prévia, idempotente pelo nome, numa transação

**Alternativas:** (a) XLSX com lib nova; (b) importar direto, sem prévia;
(c) CSV (modelo para baixar), prévia que não grava e confirmação numa
transação, chave = nome da ficha.

**Razão:** (c). Não há lib de XLSX no repo e o Excel salva CSV (lido em
UTF-8 ou Windows-1252, `;` ou `,`). A prévia usa o MESMO leitor do formulário
(`lerFormFicha`), então formulário e planilha não discordam; erro volta com
a linha do arquivo. Ficha com linha ruim fica de fora, as outras entram;
insumo não encontrado é sinalizado com atalho para cadastrar (não se cria
insumo pela planilha de ficha: preço e embalagem precisam de alguém). Pelo
nome: reimportar não duplica nem gera histórico; o que mudou atualiza só
aquela ficha (condicional à versão, como a edição). Campos de texto vazios na
planilha não apagam o que a ficha tem (planilha de itens não é lugar de
apagar descrição).

### 56. 2026-10-16 · ERP 1.2: peças de cadastro generalizadas em `telas/cadastro`

**Alternativas:** (a) copiar estado, erros, situação e paginação dos insumos
para as fichas; (b) importar de `telas/insumos/*` nas fichas; (c) mover para
`telas/cadastro/*` e `ui/paginacao.tsx` e as duas telas usarem.

**Razão:** (c), Regra Nº 2. (a) é a deriva X1 de novo; (b) amarraria a ficha
ao insumo. `EstadoInsumo` virou `EstadoCadastro`, `FormSituacao` ganhou o
gênero ("a ficha desativada"), `ResumoDeErros` recebe os rótulos de quem usa.

### 57. 2026-10-16 · ERP 1.3: pré-preparo é ficha; custo em cascata exato, lido por nível, nunca gravado

**Alternativas:** (a) custo do pré-preparo gravado no insumo produzido e
recalculado "em cascata" quando um insumo muda (gatilho ou fila); (b) item
aponta o insumo produzido e o custo vem dele; (c) item aponta a ficha
(`subfichaId`) e o custo do pré-preparo é a conta da ficha dele ÷ rendimento,
calculada na hora, em fração exata, lida por nível.

**Razão:** (c). (a) volta ao "número velho numa planilha" (decisão 53) e
exige ordem topológica de escrita a cada preço; (b) misturaria a face de
estoque (o insumo produzido) com a receita. Fator de correção é bruto ÷
líquido por item (a quantidade digitada é a limpa; paga-se a bruta), o
rendimento da ficha já carrega a perda/ganho da cocção — um fator só por item,
nenhum "fator de cocção" separado. A leitura vai por nível (`id in`), no
máximo 5, com memória: o custo de 50 fichas sai em 8 consultas. Incompleto
sobe pela cascata dizendo o insumo que falta. A tela recusa mostrar acima de
2^53 centavos ("acima do limite") e a gravação recusa ficha que passaria
disso; o banco ganhou CHECK de fator ≤ 10.

### 58. 2026-10-16 · ERP 1.3: círculo e profundidade conferidos sob trava do grafo do parceiro

**Alternativas:** (a) trigger no banco com CTE recursiva; (b) conferir no
servidor sem trava; (c) conferir no servidor com `pg_advisory_xact_lock` por
parceiro tomado antes de ler as ligações.

**Razão:** (c). (b) deixa passar duas edições simultâneas (A passa a usar B
enquanto B passa a usar A: cada uma lê o grafo sem a outra) — o teste com
banco prova que, sem a trava, o círculo entra. (a) também precisaria de trava
(READ COMMITTED) e mensagem em SQL. Com (c) as gravações de ficha de um
parceiro entram uma de cada vez (são curtas), a conferência é pura
(`conferirGrafo`) e a frase diz o caminho ("“Base de cebola” usa “Molho
cheddar”, que usa “Base de cebola”"). Profundidade máxima: 5 fichas numa
cadeia, contando quem usa (acima) e o que é usado (abaixo). Pré-preparo em
uso não vira prato nem troca a família da unidade do rendimento.

### 59. 2026-10-16 · ERP 1.3: o pré-preparo mantém o insumo que produz, na mesma transação

**Alternativas:** (a) a pessoa cadastra o insumo do pré-preparo à mão; (b)
o insumo é criado só quando houver produção (3.1); (c) a ficha cria e mantém
o insumo (nome, unidade, situação) ao gravar.

**Razão:** (c). O contrato pede o pré-preparo na lista de insumos com o
custo da ficha, e o esquema da 0.1 já previa `insumoProduzidoId` 1:1. O
insumo produzido não tem embalagem nem preço próprio (o custo vem da ficha),
não se edita pela tela de insumos e não entra no seletor da receita (vale o
pré-preparo). Nome em uso por outro insumo é recusado com sugestão; insumo
de pré-preparo solto e sem preço com o mesmo nome é adotado. Ficha que deixa
de ser pré-preparo solta o insumo e o desativa (histórico preservado).

### 60. 2026-10-16 · ERP 1.3 (herança da 1.2): foto limpa nos bytes e enviada por rota que confere a sessão antes do corpo

**Alternativas:** (a) `sharp` (reencoda e tira metadados); (b) remover os
segmentos de metadados nos bytes, sem reencodar; (c) confiar no navegador
(o canvas já tira o EXIF).

**Razão:** (b). (a) traz binário nativo (libvips para musl no Alpine), versão
fixa a manter e reencode com perda; (c) não vale contra quem manda o arquivo
cru. A limpeza guarda só o que desenha a imagem (lista do que FICA, não do
que sai), mantém a orientação num APP1 mínimo e recusa arquivo malformado.
O envio saiu da server action (que lia até 9 MB antes de qualquer conferência,
com limite global) para uma rota própria que confere sessão, permissão,
bloqueio e origem antes de ler, exige Content-Length e lê com teto; a foto
espera em `pendentes/` e a action só move o nome sorteado. As server actions
voltaram ao limite padrão de 1 MB (planilha até 256 KB). Importação limitada
a 300 fichas por arquivo, com o estouro de tempo traduzido.
