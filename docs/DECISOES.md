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

### 61. 2026-10-17 · ERP 1.4: validade por conservação — o mesmo modelo no insumo e na ficha; aceita = tem validade

**Alternativas:** (a) tabela nova `ValidadeConservacao` (item × conservação);
(b) as 4 colunas em minutos + a principal, que o Insumo já tinha desde a 0.1,
repetidas na `FichaTecnica`; (c) guardar só no insumo produzido do pré-preparo.

**Razão:** (b). (a) pedia tabela nova de tenant (portão, RLS, GRANT) para 4
linhas fixas; (c) deixava o prato sem lugar e a ficha dependente do insumo.
Com (b), "o item aceita uma conservação" é ter validade nela (não existe
"aceita, sem saber quanto dura"), a principal é uma das aceitas, e o banco
garante isso por CHECK (com `COALESCE`: um CHECK que dá NULL passa). Na ficha
é opcional (principal nula = "Validade não informada", com aviso em atenção no
pré-preparo — a etiqueta da 3.4 vai precisar); no insumo a principal sempre
existe (coluna NOT NULL: é onde se guarda) e as validades são opcionais. Para
o insumo COMPRADO a validade é a de depois de aberto/manipulado; a do
fabricante vem do lote (3.4) — o gancho de pós-abertura cabe nas colunas que
já existem, sem coluna nova. Dias ou horas inteiros na tela, minutos no banco,
teto 730 dias. Os CHECKs novos do Insumo entram `NOT VALID` (não reprovam a
migration por linha antiga gravada por fora; valem para toda escrita nova).

### 62. 2026-10-17 · ERP 1.4: o insumo produzido herda a validade da ficha na mesma transação

**Alternativas:** (a) editar a conservação do insumo produzido na tela de
insumos; (b) a ficha do pré-preparo é a fonte e o insumo acompanha.

**Razão:** (b), como nome, unidade e situação na 1.3 (decisão 59): uma fonte
só, sem duas telas discordando. `sincronizarInsumoProduzido` copia principal e
validades e grava o antes/depois no histórico do insumo; recusada a gravação
da ficha (nome em uso, conflito), nada muda nos dois (teste com banco). Ficha
sem validade deixa as validades do insumo nulas e a principal como estava; a
lista mostra "validade não informada" no lugar de um "Seco" que ninguém disse.

### 63. 2026-10-17 · ERP 1.4: planilha sem as colunas novas não mexe na validade; formulário sempre diz

**Alternativas:** (a) coluna ausente = apagar a validade; (b) ausente ou vazia
= manter a da ficha; com alguma preenchida = substituir o conjunto.

**Razão:** (b), como descrição e modo de preparo na 1.2: planilha antiga
reimportada continua "igual". O formulário manda um marcador do bloco
(`validadeNoFormulario`), então "nada marcado" ali é uma escolha (limpa); envio
sem o marcador mantém a validade. Colunas: `conservacao` e
`validade_seco|pista_fria|refrigerado|congelado` ("3 dias", "3", "6 h"; só
número = dias). Conservação principal sem validade é erro na linha.

### 64. 2026-10-18 · ERP 1.5: a nota de entrada não movimenta estoque antes da abertura (1.6)

**Alternativas:** (a) gravar a nota já como `ENTRADA_COMPRA` no livro-razão
(não perde histórico); (b) só registrar a nota e deixar o movimento para quando
o estoque da loja abrir.

**Razão:** (b). Antes da abertura não existe saldo: só entradas, nenhum
consumo, então o `SaldoEstoque` seria um número errado na tela. A abertura
(1.6) é a 1ª contagem, que já inclui o que foi comprado: com (a) ela teria de
descontar as entradas anteriores (e `ABERTURA` só aceita sinal +), e cancelar
ou editar uma nota hoje exigiria estorno num razão imutável sem uso nenhum. O
histórico não se perde: a nota e os itens são o documento, com snapshot, e
`MovimentoEstoque.notaItemId` deixa a 1.6 ligar o movimento à nota. Regra para
a 1.6: nota lançada numa loja já aberta gera o movimento na mesma transação;
as anteriores já estão na contagem. `LANCADA` passa a significar "conferida,
vale para o custo".

### 65. 2026-10-18 · ERP 1.5: custo pelo último preço de compra, derivado na leitura; desempate pela data da nota

**Alternativas:** (a) gravar o preço da nota no insumo (embalagem padrão) ao
lançar; (b) guardar um "custo atual" em coluna e recalcular ao cancelar; (c)
derivar na leitura: a nota lançada mais recente de cada insumo, numa consulta.

**Razão:** (c), como o custo da ficha (decisões 53 e 57). (a) reescreveria o
cadastro da pessoa e exigiria restaurar o preço anterior ao cancelar; (b) é
número velho que precisa de gatilho. Com (c), cancelar a última volta ao preço
anterior sem código nenhum, e a cascata acompanha porque `custoDoInsumo` é a
única porta (ela prefere `ultimaCompra`; sem compra, o preço cadastrado). A
última é a de maior **data da nota** (a que a pessoa digita, que é quando a
mercadoria foi comprada); mesma data, a lançada por último; depois o id. Data
de digitação não serve: lançar uma nota velha esquecida não pode "baratear" o
custo de hoje. Mesmo insumo em duas linhas da nota: a soma ÷ a soma. Uma
consulta `DISTINCT ON` por leitura, debaixo da RLS (`cliente.sql`). Decisão
travada em 15/10: último preço, não médio nem PEPS (é o do prompt Kairu e é o
custo de reposição).

### 66. 2026-10-18 · ERP 1.5: item pelo valor total da linha; frete da nota rateado pelo valor; total conferido no servidor

**Alternativas:** (a) preço unitário por embalagem; (b) valor total do item,
como na nota; frete (c) por item, digitado, ou (d) da nota, rateado.

**Razão:** (b) e (d). A nota impressa sempre traz o total da linha com 2 casas;
o unitário vem arredondado (às vezes com 4 casas) e é o "erro que apaga a
diferença de preço" (Notion Core): o custo sai de total ÷ quantidade, exato.
O frete vem uma vez no rodapé; ratear pelo valor (maior resto, a soma bate ao
centavo) é como a contabilidade faz e evita a pessoa dividir à mão. O total
digitado é conferido no servidor (Σ itens + frete): pega item esquecido ou
vírgula errada antes de virar custo. Embalagem: a padrão, outra cadastrada ou
"a granel" (por kg/L/un) para o que vem pesado.

### 67. 2026-10-18 · ERP 1.5: a mesma nota não entra duas vezes (índice parcial); nota por loja; importação manual = lançar

**Alternativas:** (a) chave de acesso da NF-e (já única desde a 0.1); (b)
fornecedor + número + série, único entre as não canceladas.

**Razão:** (b). Feira, atacarejo e recibo não têm chave de 44 dígitos;
fornecedor + número + série tem sempre. Número só de dígitos perde zeros à
esquerda ("000123" = "123"). A conferência antes da gravação dá a frase com o
link (ou "em outra loja", sem dizer qual, para quem não vê aquela loja); o
índice único parcial garante na corrida (clique duplo, duas pessoas). A
cancelada sai da chave: a nota digitada errado é cancelada e lançada certa. A
nota é da loja (alcance da 0.4: `compras.ver`/`compras.lancar` com `lojaId`,
conferidos também dentro da regra, com a loja de antes e a de depois);
fornecedor é cadastro da rede. CSV de notas e XML de NF-e ficaram como
pendência: lançar é a importação manual que sempre existe.

### 68. 2026-10-19 · ERP 1.6: a nota entra no estoque da loja aberta, na mesma transação; o razão aponta a nota e estorna com o mesmo tipo

**Alternativas:** nota × abertura — (a) toda nota de data igual ou posterior à
abertura movimenta; (b) só a nota LANÇADA depois de concluir a abertura e com
data a partir do dia da abertura. Ligação — (c) movimento aponta o item da
nota (`notaItemId`, da 0.1); (d) aponta a nota (`notaId`, novo). Estorno — (e)
`AJUSTE` negativo; (f) o mesmo tipo com sinal contrário e `estornoDeId`.

**Razão:** (b): a contagem é o retrato do que está na loja quando conclui;
nota lançada antes disso (durante a contagem, ou de data anterior digitada
depois) é mercadoria que já estava na prateleira e foi contada — movimentar
de novo dobraria o saldo. A tela diz isso na nota ("lançada antes da
abertura… a contagem já incluiu") e a conferência avisa das notas de hoje
("o que veio nelas tem de estar na contagem"). A nota trava a abertura da
loja (`FOR SHARE`) antes de marcar `lancadaEm`; concluir trava com `FOR
UPDATE`: as duas se esperam e a ordem decide. (d): editar troca os itens por
inteiro (1.5) e o item ligado ao razão não poderia sair (FK); a nota nunca se
apaga (cancela), e o movimento guarda o item no próprio snapshot. (f): Σ
`ENTRADA_COMPRA` continua sendo a compra líquida (CMV da 2.3); o CHECK do
sinal passou a inverter para o estorno, `estornoDeId` é único (nada se estorna
duas vezes) e um trigger confere o espelho exato (loja, insumo, tipo,
documento, −quantidade, −valor). Editar estorna tudo o que valia e entra o novo
só se o efeito no estoque mudou (mudar só o número da nota não mexe no razão).
Entrada = valor do item + frete rateado; `ocorridoEm` = quando entrou no
sistema (a data da nota fica na nota).

### 69. 2026-10-19 · ERP 1.6: abertura por loja derivada da contagem; concorrência por versão e trava; concluir é idempotente e não se desfaz

**Alternativas:** (a) coluna "estoque aberto em" na Loja; (b) derivar da
`Contagem` tipo ABERTURA (nenhuma / ABERTA / FECHADA). Reabrir: (c) permitir;
(d) não, correção é contagem (1.7).

**Razão:** (b), sem número duplicado para discordar; um índice único PARCIAL
deixa uma abertura não descartada por loja (dois "Abrir estoque" juntos dão a
mesma contagem). Salvar um número faz `UPDATE Contagem SET versao + 1 WHERE
ABERTA` (trava e confere) e muda o item só na versão lida: outra pessoa salvou
antes = conflito com o número e o nome dela, e a pessoa escolhe; o mesmo
número de novo (rede caiu depois de gravar) = ok. Concluir pega `FOR UPDATE`,
confere a versão que a pessoa conferiu (mudou = "confira de novo") e grava um
`ABERTURA` por item com chave única (`abertura:<item>`): concluir duas vezes
devolve a abertura feita. (d): o razão é imutável; reabrir apagaria
movimentos. Descartar só vale para a contagem EM ANDAMENTO (nada foi para o
razão), com motivo. Permissões do catálogo 0.4, sem permissão nova: contar =
`estoque.contar` (operador conta), abrir/concluir/descartar =
`estoque.ajustar` (gerente e dona), ver = `estoque.ver`, sempre com a loja.

### 70. 2026-10-19 · ERP 1.6: conta-se em embalagens fechadas + solto; vazio é "não contado"; valor inicial pelo custo de referência, fotografado

**Alternativas:** forma de contar — (a) só a unidade base; (b) embalagens da
padrão + solto (kg/g, L/ml, un); (c) qualquer embalagem/variante. Não contado
— (d) vira zero sozinho; (e) bloqueia; (f) entra com zero só com confirmação
explícita. Valor — (g) gravar o custo no saldo; (h) snapshot no movimento de
abertura e, na tela, o valor pelo custo de referência de hoje.

**Razão:** (b) é o mínimo útil na câmara fria ("3 caixas + 2,4 kg"); variantes
ficam para a 1.7. A lista e o fator da embalagem são congelados ao começar
(Notion: mudança no cadastro não altera o passado); o digitado
(`embalagensMilesimos`, `soltoMilesimos`, escala) fica separado do
normalizado (`contadoMilesimos`). (f): Notion — "nenhum item não contado zera
silenciosamente"; o item fica `null` (verdade: ninguém contou) e o histórico
diz quantos entraram com zero e quem confirmou. Zero contado ("Não tem") é
contagem. (h): o movimento de ABERTURA guarda o valor da época (um
arredondamento por item; o total da contagem é a soma, bate com o razão); o
`SaldoEstoque` soma quantidade e valor do razão; a tela mostra o valor pelo
custo de referência de hoje (derivado, como todo custo do ERP). Sem preço ou
pré-preparo com custo incompleto = valor pendente, nunca "R$ 0,00" como fato
(no razão entra 0 e a tela conta à parte).

---

### 71. 2026-10-16 · Exceção registrada à regra "migrations só aditivas": troca do CHECK de sinal do livro de estoque (1.6)

**Alternativa:** manter o CHECK da 0.1 e representar o estorno como um tipo novo de movimento.

**Razão:** o estorno precisa do mesmo tipo do original (para o CMV e o livro contarem certo) com o sinal invertido. A migration `20261019000000_erp_estoque_abertura` faz DROP + ADD do CHECK na mesma transação: para movimento sem `estornoDeId` a regra é idêntica à da 0.1; o estorno é conferido por gatilho como espelho exato do original (mesma loja, insumo, tipo e documento, sinal trocado, nunca estorno de estorno) e índice único impede estorno duplo. O ADD valida as linhas existentes: se houvesse dado fora da regra, a migration falharia inteira. Provado pelos fiscais com dados da 1.5 (superuser e não-superuser, `migrate diff` vazio). **Não é precedente:** qualquer outra troca de regra existente passa pelo mesmo crivo (prova com dados reais + registro aqui).

### 72. 2026-10-20 · ERP 1.7: o ciclo é um pedaço por vez, pelo lugar; a frequência vem da curva ABC da loja

**Alternativas:** subconjunto — (a) sorteio diário; (b) por grupo/setor; (c) pelo lugar (conservação) com os vencidos pela frequência; frequência — (d) fixa por insumo; (e) por classe ABC do valor do saldo na loja.

**Razão:** (c) + (e): conta-se onde se está (câmara, freezer, prateleira) e o que mais pesa em valor volta mais vezes (A 7, B 15, C 30 dias por padrão, mudável na loja). Nunca contado = vencido. O gerente ainda marca à mão; "Recontar" no saldo abre com um insumo só — é como se corrige número errado da abertura (a 1.6 não reabre). Um insumo fica numa contagem aberta só (trava da loja ao planejar): duas contagens aplicando diferença sobre o mesmo item dobrariam o ajuste.

### 73. 2026-10-20 · ERP 1.7: o ajuste é contado − esperado do momento da contagem, somado ao saldo de agora

**Alternativas:** (a) saldo = contado (o que o Notion proíbe: apaga a nota que entrou depois); (b) diferença contra o saldo na hora de aplicar; (c) diferença contra o livro fotografado a cada número salvo.

**Razão:** (c): o esperado (`saldoSistemaMilesimos`) é o livro no instante em que a pessoa contou; a nota que entra depois continua no estoque (fica = atual + diferença), e a conferência mostra "depois de contar" para o gerente decidir se a mercadoria já estava na prateleira. Vale também para a corrida nota × contagem: qualquer ordem dá o saldo certo, porque a diferença não depende do saldo na hora de aplicar. `CONTAGEM` ± com `contagemItemId` (CHECK novo) e chave por item; valor pelo custo de referência de agora; não contado fica como está; item reaplicado depois por outra contagem fica de fora.

### 74. 2026-10-20 · ERP 1.7: "fecha sozinha" quando tudo bate dentro da tolerância; passou do prazo, fecha sem aplicar

**Alternativas:** (a) sempre o gerente aplica; (b) aplica sozinha quando o último item é contado e tudo bate dentro de uma tolerância por item definida pela loja; prazo — (c) cron que fecha; (d) estado derivado + gravado na próxima escrita.

**Razão:** (b): é o "contagem que fecha sozinha" (Notion) sem dar ao operador o poder de ajustar — quem decide é a regra que a dona deixou (tolerância em R$ por item, padrão R$ 5,00; 0 = só exato). Nunca fecha sozinha com item sem preço com diferença nem com movimento depois de contado (pede olho humano). (d): sem infraestrutura nova; cron atrasado não existe; contagem velha não se aplica como se fosse de agora (prazo = fim do dia seguinte, Rio). O "fechou sem aplicar" fica gravado na primeira escrita depois do prazo (salvar, aplicar, planejar, fechar), e a tela já o mostra antes.

### 75. 2026-10-20 · ERP 1.7: piso obrigatório = cobertura do período por valor E por insumos; fechamento por loja; números na loja, só a dona muda

**Alternativas:** piso — (a) contagem completa no fim do período; (b) cobertura mínima de contagens aplicadas no período; medida — (c) só itens; (d) valor e itens; onde configurar — (e) no parceiro; (f) na loja, pelo gerente; (g) na loja, só com "cadastrar lojas".

**Razão:** (b)+(d): é o inventário cíclico — o livro é confiável se o que pesa foi verificado no período; o fechamento conta o que falta ("para o piso": os de maior valor primeiro) e só aplica com as duas medidas no piso (padrão 80 % do valor, 50 % dos insumos; faixa 50–100 % e 0–100 %). A cobertura do fechamento conta os números dele pelo saldo de depois do ajuste (a mesma antes e depois de aplicar). (g): o gerente é quem fecha; se pudesse baixar o piso, ele não seria obrigatório. O fechamento é por loja (índice parcial loja × período), abre nos 3 últimos dias do período, sem cíclica aberta, e fotografa o estoque final (base do CMV real, 2.3). O período vem do `ParceiroFlow` (semanal: dia 1–7 = segunda…domingo); `PeriodoApuracao` é criado ao começar e o status dele segue do DRE (2.2). Migration aditiva: nenhuma regra existente trocada (a decisão 71 não se repete).

### 76. 2026-10-20 · ERP 1.7 (revisão do Guardião): o número vale para o instante em que foi digitado

**Alternativas:** (a) o esperado é o livro na hora em que o servidor recebe o número (1ª versão: o rascunho reenviado horas depois, com uma nota no meio, era comparado com o livro que já incluía a nota — a diferença apagava a nota e, dentro da tolerância, fechava sozinha); (b) o cliente manda a hora absoluta; (c) o cliente manda a IDADE do número (agora − quando digitou, no relógio do próprio aparelho) e o servidor prende o instante entre o início da contagem e agora.

**Razão:** (c): relógio errado do celular não conta (a idade é diferença no mesmo relógio); o instante nunca fica no futuro nem antes de a contagem existir (rascunho de 2 dias vale para o início dela). O esperado é o livro naquele instante — saldo de agora − Σ movimentos com `ocorridoEm` depois dele, numa consulta (um retrato) — e `contadoEm` é esse instante: o que entrou depois aparece em "depois de contar" e impede o "fecha sozinha" mesmo dentro da tolerância. A idade é dado do cliente, não confiável: o pior que um aparelho consegue é dizer que contou mais tarde (o mesmo que recontar de verdade). Junto: rascunho por contagem E pessoa (aparelho compartilhado), fotografia da contagem fechada imutável por gatilho (migration aditiva) e regras da loja só com as regras lidas (a trava de edição simultânea não desliga).

### 77. 2026-10-21 · ERP 1.8: requisição = pedido de saída do estoque da loja para um setor; a baixa é na ENTREGA, item a item, e não se repete

**Alternativas:** baixa — (a) ao pedir; (b) ao entregar. Parcial — (c) entrega única e o resto cortado; (d) várias entregas, o resto pendente até sair ou ser encerrado. Duplicidade — (e) confiar no botão; (f) versão lida + `FOR UPDATE` + chave por item × versão.

**Razão:** (b): pedir não tira nada da prateleira; quem entrega é quem sabe o que saiu. A baixa é um `REQUISICAO` (−) por item, valor pelo custo de referência de agora (como abertura e contagem), `requisicaoItemId` (CHECK novo: a requisição aponta o item), razão e saldo na mesma transação. (d): restaurante entrega o que tem e completa depois; "Atendida em parte" fica no quadro até sair o resto ou alguém encerrar (o corte fica à vista no detalhe e no histórico). Passar do pedido até o dobro é normal (a peça de queijo); acima, dedo errado. (f): duas abas, clique duplo ou rede que caiu: a segunda recebe "já atendida" ou "alguém entregou" — nunca baixa dupla. Estados com `PARCIAL` (ADD VALUE, migration aditiva); cancelar só a pedida (nada saiu), com motivo. Precisa do estoque aberto (a entrega trava a abertura, como a nota). Setor = os da 0.4 (CHECK), número por loja sob trava.

### 78. 2026-10-21 · ERP 1.8: saldo insuficiente não para a cozinha — entrega com confirmação, o negativo é o alarme

**Alternativas:** (a) recusar a entrega acima do saldo; (b) permitir em silêncio; (c) permitir com confirmação explícita de quem entrega e mostrar o negativo como alarme.

**Razão:** (c). Se o produto está na mão do estoquista, o livro é que está errado (nota sem lançar, contagem velha); travar a cozinha por saldo de sistema é pior que entregar e acusar (Notion "Da Ficha ao Fornecedor": "estoque negativo permitido de propósito"). A tela de entregar mostra "no livro fica −500 g" em vermelho com a palavra; o servidor só aceita com "entregar mesmo assim" marcado; o histórico registra; Divergências lista "abaixo de zero agora" até a próxima contagem. Sem o produto, entrega-se parcial.

### 79. 2026-10-21 · ERP 1.8: devolução por estorno + a baixa do líquido; nenhum tipo novo, nenhum CHECK trocado

**Alternativas:** (a) tipo novo `DEVOLUCAO` (+); (b) `AJUSTE` positivo; (c) estornar as baixas ativas do item e baixar de novo o líquido.

**Razão:** (c). (a) exigiria trocar o CHECK do sinal (a decisão 71 não se repete); (b) misturaria devolução com ajuste e tiraria o consumo da conta da requisição. Com (c), o estorno é espelho exato (o trigger confere), Σ `REQUISICAO` do item é o que de fato ficou com o setor (o consumo requisitado líquido que o cruzamento e o CMV usam), e o valor do líquido é proporcional ao das baixas da época (um arredondamento). `devolvidoMilesimos` fica à vista; quem recebe de volta é o estoque (`requisicao.atender`).

### 80. 2026-10-21 · ERP 1.8: cruzamento requisição × contagem por trechos entre contagens aplicadas; sumiço em R$; vigiar o pequeno e repetido; só leitura

**Alternativas:** (a) somar os `CONTAGEM` negativos do período; (b) por insumo, trechos entre duas contagens aplicadas consecutivas: consumo apurado (inicial + entradas − final) × requisitado × outras saídas lançadas. Pequenas diferenças — (c) ignorar o que ficou dentro da tolerância; (d) contar quantas vezes se repetiu e somar. Gravar — (e) lançar perda; (f) só relatório.

**Razão:** (b): é a conta que o dono entende ("tinha 3 kg, chegou 0, contou 1,9; consumiu 1,1 kg; a cozinha pediu 600 g; sumiram 500 g") e dá o mesmo número que o "esperado − contado" da 1.7, sem depender de quando o ajuste foi aplicado. A abertura vale da conclusão (o livro começa ali); as outras contagens, de quando o item foi contado; estornos entram com o sinal deles. A janela pega os trechos que TERMINAM nela (padrão: o período do parceiro). R$ pelo custo de referência de hoje (como a conferência). (d): o "fecha sozinha" aplica sem olho humano tudo o que cabe na tolerância; 2+ trechos assim no período viram "pequeno e repetido", com a soma (herança da 1.7). Por setor: o que pediu e o sumiço nos insumos que ele pede — onde olhar, não culpa (o sumiço não tem dono). (f): divergência não é perda comprovada (Notion "Estoque unificado"); o acerto do saldo já foi a contagem. Ver = `estoque.ajustar` (quem confere contagem).

### 81. 2026-10-22 · ERP 1.9: a precificação mora na ficha de prato; por baixo, o produto de venda da casa com as embalagens por canal

**Alternativas:** (a) tabela nova de embalagem por ficha; (b) colunas na `FichaTecnica`; (c) usar o `ProdutoVenda` da 0.1 (aponta a ficha) com `ProdutoEmbalagem` (produto × canal × insumo), criando o produto "da casa" (sem marca, nome = o da ficha) na primeira gravação.

**Razão:** (c), Regra Nº 2: o esquema da 0.1 já separou a venda da receita (decisão 26) e já tinha a camada de embalagem por canal com CHECK (nunca na loja) e FK composta. Sem tabela nova, portão e RLS ficam iguais. O nome do produto acompanha a ficha (mesma transação de `gravarFicha`), então o único `(parceiro, marca nula, nome)` também serializa dois "primeiros" produtos. Embalagem é insumo tipo Embalagem do estoque, por porção, SEM fator (rendimento ~100 %), pelo custo de referência (último preço, decisão 65): a nota mais cara muda o custo sem gravar nada. Gravar trava a ficha e confere a impressão da lista lida (como a variante da 1.1). Ver = `precos.ver`; editar embalagens = `fichas.editar` + `precos.ver` (o que vai no saco é operação); o operador não vê.

### 82. 2026-10-22 · ERP 1.9: taxa do iFood = comissão + pagamento online, por parceiro, sobre o preço; nada pré-preenchido

**Alternativas:** (a) uma porcentagem só; (b) comissão + pagamento online separados (como o contrato do iFood e o Notion "Lucro por pedido" mostram); (c) planos pré-cadastrados (Básico/Entrega) com os números do iFood.

**Razão:** (b). Separadas, a pessoa confere cada uma com o contrato; somadas, fica opaco. (c) inventaria número que muda por contrato e por época — a tela diz onde achar e nada vem preenchido: sem configurar, o iFood fica "Não configurada" e o canal, incompleto (ausência de dado é achado). Hipóteses registradas: as duas incidem sobre o preço do prato; mensalidade, taxa de entrega e taxa fixa por pedido não entram no custo do PRATO (são do mês e do pedido). Migration aditiva: `taxaPagamentoBp` + CHECK da soma < 100 %. Só quem muda preços (`precos.editar`, a dona) configura; editar é condicional ao `atualizadoEm`.

### 83. 2026-10-22 · ERP 1.9: a taxa sobre o preço aparece como porcentagem até a 1.10 — nunca um preço inventado

**Alternativas:** (a) supor um preço (ex.: custo × 3) para mostrar a taxa em R$; (b) esconder a taxa até a 1.10; (c) mostrar a camada como "26,2% do preço", com "a cada R$ 10,00: R$ 2,62", e o total como "custo sem a taxa + 26,2% do preço"; a conta com preço pronta e testada.

**Razão:** (c). (a) seria um número sem origem na tela de custo; (b) esconderia o canal mais caro. Com (c) o dono vê o peso da taxa sem preço, e a 1.10 só passa `precoCentavos` a `camadasDoCanal` (taxa em fração exata, um arredondamento na tela) — preço sugerido = custo sem taxa ÷ (1 − taxa − margem) cabe sem mudar as camadas.

### 84. 2026-10-22 · ERP 1.9 (herança a da 1.8): o negativo da entrega é conferido com os saldos travados

**Alternativas:** (a) ler o saldo sem trava e confiar na trava da requisição; (b) travar os saldos (`FOR UPDATE`, na ordem de `gravarMovimentos`, linha que falta criada em zero) antes de conferir.

**Razão:** (b). A trava da requisição só serializa a MESMA requisição; duas requisições do mesmo insumo entregues juntas liam o mesmo saldo e as duas passavam sem a confirmação. Com os saldos travados, a segunda espera e confere o saldo que a primeira deixou. Mesma ordem de trava do razão: sem deadlock com contagem e nota.

### 85. 2026-10-23 · ERP 1.10: margem bruta = preço − insumos − embalagens; líquida = bruta − taxa do canal; % sobre o preço

**Alternativas:** (a) bruta = preço − CMV dos insumos (embalagem fora); (b) bruta = preço − insumos − embalagens, líquida = bruta − taxa do canal; (c) líquida já descontando despesas fixas rateadas.

**Razão:** (b). Embalagem é custo do prato no canal (decisão 81); a taxa é o que o canal leva do preço. "Líquida" aqui é o que sobra do PRATO para pagar a casa e o lucro — dito assim na tela —, não o lucro do restaurante: despesa fixa, mensalidade e entrega são do DRE e do lucro por pedido (c misturaria rateio sem dado). Loja e delivery próprio não cobram sobre o preço: líquida = bruta. % sempre sobre o preço (como o dono lê CMV).

### 86. 2026-10-23 · ERP 1.10: margem-alvo da líquida, por canal do parceiro; sugerido = custo ÷ (1 − taxa − alvo), para cima ao centavo

**Alternativas:** alvo — (a) da bruta (estilo "CMV 30 %"); (b) da líquida; origem — (c) `DreMeta`; (d) `CanalConfig.margemAlvoPadraoBp` por parceiro × canal, com ou sem (e) override por prato. Arredondamento — (f) metade para cima; (g) para cima; (h) regra de cardápio gravada.

**Razão:** (b)+(d) sem (e)+(g). Com a taxa sobre o preço, só o alvo da líquida dá a fórmula do contrato (P = C ÷ (1 − t − m)) e o mesmo alvo vale em canais com e sem taxa; o alvo da bruta faria o iFood "bater a meta" perdendo dinheiro. `DreMeta` é meta de linha do DRE com vigência (outra pergunta, 2.x). O override por prato é o próprio preço; o campo `ProdutoCanal.margemAlvoBp` fica para quando houver o caso. Para cima ao centavo: o sugerido é o MENOR preço em centavos que atinge o alvo (metade para cima podia ficar um centavo abaixo). "De cardápio" (próxima ,90) é só um botão que preenche o campo — nenhuma regra inventada. iFood: alvo só com a taxa configurada, e taxa + alvo < 100 % conferido ao salvar qualquer um dos dois (a mesma linha, a mesma versão).

### 87. 2026-10-23 · ERP 1.10: preço próprio sobrescreve; vazio vale o sugerido; com custo incompleto o preço entra e as margens esperam

**Alternativas:** (a) exigir preço em todo canal; (b) vazio = o sugerido (acompanha o custo); (c) recusar preço com custo incompleto.

**Razão:** (b), e não (c): o preço é do cardápio, não depende de saber o custo; recusar travaria a dona por um insumo sem nota. O que não pode é número falso: com custo incompleto, sugerido e margens viram "Incompleto/Incompleta" com o porquê. Preço > 0 e ≤ R$ 100.000,00 por porção.

### 88. 2026-10-23 · ERP 1.10: o servidor recalcula tudo; a prévia é a mesma função, e o formulário só manda o texto do preço

**Alternativas:** (a) o navegador manda preço, sugerido e margens e o servidor confere; (b) o navegador manda só o texto do preço; o servidor trava a ficha, confere os preços lidos, lê o custo de agora e recalcula.

**Razão:** (b). Não há o que conferir se nada calculado vem do navegador — campo forjado nem é lido (teste). A prévia ao vivo chama a MESMA `precoDoCanal` com as entradas que o servidor serializou (BigInt em texto, ida e volta testada), então a tela e o salvo batem (prova visual). Duas abas: impressão dos preços lidos sob a trava da ficha (a mesma das embalagens); a segunda recebe "alguém mudou os preços".

### 89. 2026-10-23 · ERP 1.10: snapshot no histórico da ficha — preço, margem líquida antes/depois e o custo do canal na hora

**Alternativas:** (a) tabela nova de preços com o custo fotografado; (b) o retrato em texto no `HistoricoAlteracao` da ficha, na mesma transação.

**Razão:** (b): sem migration, no lugar onde o dono já olha ("Últimas alterações"), só o canal que mudou. O custo "na hora" é o lido DEPOIS da trava, na transação do preço; a nota que entra junto não espera o preço, e o histórico fica coerente (custo e margem do mesmo instante — teste de corrida). Se o custo mudou desde que a tela abriu, a frase avisa. Número para o DRE, se precisar, é herança (tabela própria na 2.x).

### 90. 2026-10-23 · ERP 1.10 (veto do Guardião): o histórico obedece "ver preços" — o leitor declara, o servidor tira

**Alternativas:** (a) mover o retrato do preço para uma entidade própria e filtrá-la como `NotaEntrada`; (b) `listarHistorico` com `verPrecos` OBRIGATÓRIO: sem ele, some a entidade `CanalConfig` e saem da ficha os campos de precificação (preço, margem, custo na hora, embalagens por canal; taxa e alvo vão com a entidade); linha que só tinha isso some.

**Razão:** (b). (a) cobriria só o preço e deixaria as embalagens e qualquer campo futuro na ficha; (b) é uma regra só, num lugar só, e o tipo obriga todo leitor (os 12 de hoje e os próximos) a decidir — esquecer não compila. O corte é no servidor, antes de virar texto da tela: o payload não leva. `obterFicha` nega por padrão. Os campos de precificação são uma lista (`CAMPOS_DE_PRECIFICACAO`) ao lado dos rótulos do histórico: campo novo de preço entra nela.



### 91. 2026-10-16 · ERP 0.5: o pedido de acesso mora FORA do tenant; o Parceiro Flow só nasce na ativação, já ATIVO e com dono

**Alternativas:** (a) criar o `ParceiroFlow` em RASCUNHO no envio da landing (a letra do contrato); (b) pedido em tabela própria (`PedidoParceiro`) fora do tenant, e o parceiro nasce quando o Rodolfo ativa; (c) reaproveitar o `Lead` do Barney.

**Razão:** (b). Spam nunca vira tenant: o `ParceiroFlow` não se apaga (o histórico tem FK Restrict), aparece na lista, na busca e no seletor do shell, e o slug (fixo depois de criado, decisão 33) seria escolhido por um desconhecido. Com (a) seria preciso slug editável em RASCUNHO, status RECUSADO no enum, um caminho para apagar spam e filtros em três lugares; e o RASCUNHO não recebe escrita (decisão 32), então não teria uso. (c) não serve: a unicidade do telefone do Lead devolveria um erro diferente (enumeração) e o lead entraria na cadência automática. O papel `erp_tenant` não lê o pedido (migration revoga; teste confere "permission denied"), o `prisma` do portal recusa os modelos e só `pedidos.ts` e a ativação em `credenciais.ts` os tocam. Na tela, o pedido aberto é "Aguardando liberação". **Desvio da letra do contrato, mesmo objetivo: registrar na seção 8 do Notion para o Rodolfo validar.**

### 92. 2026-10-16 · ERP 0.5: parceiro em RASCUNHO não entra; suspenso entra e lê (revoga a decisão 38 só para RASCUNHO)

**Alternativas:** (a) manter a 38 (rascunho entra e só lê); (b) rascunho não entra: login, sessão, escolha de parceiro e convite o ignoram, e criar acesso/link recusa nele.

**Razão:** (b). Com a ativação, quem deve ter acesso é parceiro ATIVO; um rascunho que "já entra" abre porta para quem ainda não foi liberado. A sessão já aberta morre na próxima requisição (`validarSessao` filtra o vínculo). Suspenso segue como na 38: entra e só lê (ele já foi cliente). Sem acesso à produção para contar quem ficaria de fora, a lista de parceiros do nível 1 avisa na linha de cada RASCUNHO com pessoas ativas: "ative para liberar o acesso". Ativar é a transição RASCUNHO → ATIVO que já existe.

### 93. 2026-10-16 · ERP 0.5: ativação atômica (parceiro + dono + convite + pedido + histórico) numa função de `credenciais.ts`, com trava e gravação condicional

**Alternativas:** (a) chamar `criarParceiro` e `criarAcesso` em sequência; (b) uma transação só que extrai o miolo de `criarAcesso` (`criarAcessoNaTransacao`) e cria o parceiro dentro dela.

**Razão:** (b): em (a) uma falha entre as duas deixaria parceiro sem dono, ou dono sem link. Trava `erp-pedido:<id>` + `updateMany` condicional à etapa e à versão lida: duas ativações (ou ativar × recusar) deixam um vencedor, e o outro recebe a frase com quem decidiu; nenhum segundo parceiro, dono ou link nasce (teste de corrida). O histórico do parceiro é o ÚLTIMO passo (depois dele a transação roda no papel do tenant, sem acesso a pedido nem a credencial, `tenant.ts`). O dono é o perfil Dono com a rede inteira. Só o nível 1 ativa. **Revisão (veto do Guardião, decisão 99): a ativação só cria pessoa nova; e-mail que já existe é recusado.**

### 94. 2026-10-16 · ERP 0.5: anti-abuso do formulário — trava e limite por IP, teto global, armadilha e resposta única, sem CAPTCHA de terceiros

**Alternativas:** (a) CAPTCHA de terceiros; (b) só armadilha; (c) limite por IP (3/h, 10/dia) + teto global (100 cartões/dia) em tabela própria, sob `pg_advisory_xact_lock`, + armadilha + resposta idêntica.

**Razão:** (c), a técnica da 0.3 (contar e anotar numa transação sob trava: 20 envios paralelos do mesmo IP dão exatamente 3). Tabela própria: pedido que falha não pode travar o login de quem divide o IP. CAPTCHA de terceiros mandaria dado do visitante para fora e exige conta e chave; o volume de hoje não justifica. A resposta é a mesma para pedido novo, reenvio (mesmo e-mail ou WhatsApp com pedido aberto: entra no mesmo cartão, que NÃO é reescrito) e armadilha, e o formulário nunca lê `UsuarioErp`: não dá para descobrir quem é cliente. Um teto de ruído por IP (40 linhas/hora) impede a tabela de crescer sem fim.

### 95. 2026-10-16 · ERP 0.5: convite sem SMTP — o link aparece uma vez, com "Copiar" e "Abrir no WhatsApp"; o token nunca é gravado

**Alternativas:** (a) enviar e-mail (não há SMTP); (b) enviar pela Evolution API (instância sem conexão); (c) mostrar o link uma vez, com wa.me para o número do pedido.

**Razão:** (c). Fecha a herança "o envio do link entra em `criarAcesso`" sem servidor de envio. O token vive só na resposta da ativação (estado da tela); não vai para o banco (só o SHA-256), o AuditLog, o histórico nem a URL (teste procura o token em 7 tabelas). Perdeu: "Gerar link novo" na Equipe, que já existe.

### 96. 2026-10-16 · ERP 0.5: LGPD — consentimento versionado e guarda de 180 dias do recusado; a rotina de expurgo fica como pendência

**Alternativas:** (a) guardar tudo sem prazo; (b) apagar o recusado sozinho aos 180 dias; (c) registrar o prazo e dar o botão "Excluir dados pessoais"; rotina automática depois.

**Razão:** (c). Caixa obrigatória com o texto decidido ("Autorizo a FlowFoods a usar estes dados só para falar comigo sobre a consultoria e o sistema.", versão `v1`, data gravada). O recusado fica guardado por 180 dias (o detalhe diz até quando); "Excluir dados pessoais" anonimiza o pedido recusado (nome, contato, cidade) e mantém o cartão e o histórico sem dado pessoal. O worker que apaga sozinho fica para a rotina de retenção (herança da 0.3).

### 97. 2026-10-16 · ERP 0.5: atraso do pedido — Novo > 2 dias, Em conversa > 7 dias sem movimento; filete de 2 px, não borda colorida

**Alternativas:** (a) prazo único; (b) por etapa; contagem — (c) 24 h corridas; (d) dias de calendário no Rio.

**Razão:** (b)+(d): Novo precisa de resposta rápida; conversa em andamento pode esperar uma semana. Dia de calendário no Rio (23:00 de ontem e 01:00 de hoje são dias diferentes). "Movimento" é mudar de etapa: o lead mandar de novo é sinal de interesse, não ação do Rodolfo, e não esconde o atraso. O sinal é o filete vermelho de 2 px à esquerda + "Xd de atraso" (a cor nunca é o único sinal); a identidade proíbe card com borda colorida, então é o filete pedido, como na 1.8 (que usa 3 px).

### 98. 2026-10-16 · ERP 0.5 (Regra Nº 2): um caminho só para criar parceiro — o formulário "Novo parceiro" sai; o pedido manual e a ativação o substituem

**Alternativas:** (a) manter o formulário e acrescentar o quadro ao lado; (b) o formulário sai: "Aguardando liberação" é o quadro, "Cadastrar pedido manual" é a entrada de quem não veio do site, e a ativação é a mesma.

**Razão:** (b). Dois caminhos criariam parceiros sem dono e sem link, e deixariam "Aguardando liberação" com dois significados. `criarParceiro` fica como função interna do seed e dos testes. O rótulo de RASCUNHO vira "Rascunho" (legado). O quadro é próprio (não uma generalização do da 1.8): o teste-guarda proíbe as telas compartilhadas de importar pedido.


### 99. 2026-10-17 · ERP 0.5 (veto do Guardião): a ativação do pedido só cria pessoa NOVA; e-mail que já existe em `UsuarioErp` é recusado

**Alternativas:** (a) reaproveitar a regra da 0.4 (e-mail existente só ganha o vínculo; senha de link de parceiro é revogada; link do nível 1); (b) recusar, com frase neutra, qualquer e-mail que já exista (com senha, convite pendente, acesso desativado), sem tocar em credencial nenhuma.

**Razão:** (b). Em (a), quem manda o e-mail de outra pessoa no formulário público e o próprio WhatsApp faz a ativação apagar a senha e os rostos dela e mandar o link do nível 1 (`wa.me`) para o atacante, que cria a senha e ganha uma sessão com o parceiro dele E o da vítima; o convite pendente sem senha caía do mesmo jeito. O dado do público não pode chegar a `criarAcesso`/`gerarNovoLink` com poder de revogar credencial. A frase: "Este e-mail já tem acesso ao ERP. Use outro e-mail para o dono; depois, em Equipe do parceiro, dê acesso a essa pessoa." (a Equipe, que é do nível 1 digitando, segue com a regra da 0.4). A conferência é dentro da transação e a corrida com a Equipe criando o mesmo e-mail cai no único do e-mail. Teste de regressão que vai até a sessão do atacante, em quatro variantes, e falha sem a correção. O formulário de ativação mostra a frase uma vez, no campo, e desabilita o botão enquanto o e-mail está em conflito.

### 100. 2026-10-17 · ERP 0.5: o motivo da recusa mora só no pedido; "Excluir dados pessoais" o troca por "[apagado]"

**Alternativas:** (a) copiar o motivo para o evento RECUSOU (só-inclusão: não dá para apagar); (b) o evento não leva o motivo; o pedido o guarda e a exclusão o anonimiza; (c) afrouxar o gatilho do evento.

**Razão:** (b). O motivo é texto livre e pode citar a pessoa; um registro que não se altera não pode guardá-lo. O histórico mostra "Recusado", quem e quando; o motivo aparece no painel do pedido e some na exclusão (a CHECK pede 3+ letras: "[apagado]"). O gatilho só-inclusão fica como está.

### 101. 2026-10-17 · UX.9: navegação por áreas — área = módulo, aba = item do menu (1:1), ações em `acoes[]`

**Alternativas:** (a) manter um item de menu por tela e só mudar o hub; (b) criar uma estrutura de abas separada do menu; (c) a mesma estrutura de `modulos.ts` serve o hub (área), o menu e as abas (aba), e as ações ("Novo insumo", "Lançar nota"...) saem do menu e vão para `acoes` da área.

**Razão:** (c). Uma fonte só: menu, abas, hub e ⌘K nunca divergem, e o hub deixa de mostrar 16 cards (5 deles ações) para mostrar 4 áreas. A ação fica no cabeçalho da aba (os botões "Novo" já existiam) e no ⌘K. Só configuração mudou; as telas são as mesmas.

### 102. 2026-10-17 · UX.9: nenhuma URL antiga muda e não há rota de "visão geral de área"; a entrada da área é a primeira aba permitida; única rota nova `/estoque/contagens`

**Alternativas:** (a) criar `/erp/cadastros`, `/erp/compras-e-fornecedores`... como visão geral; (b) redirecionar as URLs antigas; (c) o card do hub é a visão geral e leva à primeira aba permitida.

**Razão:** (c). `/erp/compras` e `/erp/estoque` já são telas e a visão geral as quebraria; `/erp/cadastros` ficaria ambígua com o Cadastro do parceiro do nível 1; um resumo pediria consultas e indicadores novos ("sem inventar indicadores"). Favoritos, `?de=`, `?feito=`, `?sem-acesso=1` e o histórico seguem iguais. A única rota nova é `/estoque/contagens` (escolhe a loja; uma só vai direto ao período), no `/erp` e no espelho do nível 1, porque as contagens só tinham entrada dentro da loja.

### 103. 2026-10-17 · UX.9: Precificação = aba sobre `/fichas/canais` (precos.ver); preço e margem por ficha ficam na lista e no detalhe

**Alternativas:** (a) uma lista de preços nova; (b) uma aba na mesma rota `/fichas` filtrada (inviável: `itemAtivo` lê só o caminho, sem a query); (c) a aba é a tela dos canais (taxa do iFood, embalagens, margem-alvo) e ganha o link "Margem de cada prato" para `/fichas?tipo=PRATO`.

**Razão:** (c). Preço e margem por ficha já estão nas colunas da lista, filtrados no servidor por "ver preços" (1.10); nenhuma lista nova, nenhuma permissão nova. O título da tela passa a ser o da aba ("Precificação").

### 104. 2026-10-17 · UX.9: abas como links de rota (`<nav>` + `aria-current`), em `src/components/erp/ui/abas.tsx`, montadas pelo shell

**Alternativas:** (a) `role=tablist` com painéis; (b) cada tela renderiza as próprias abas; (c) o shell renderiza, acima do conteúdo, as abas da área do item ativo (`abasDaArea`), como links.

**Razão:** (c). Cada aba é uma rota (voltar, link e prefetch funcionam), então `tablist` seria mentira semântica. Gerar no shell evita tocar 25 telas e garante que toda rota profunda mostre onde está. Visual de abas (sublinhado de 2 px, como o menu), distinto das pílulas de filtro. O teste de 1.1 que proíbe `src/app/erp/abas.tsx` continua valendo.

### 105. 2026-10-17 · UX.9: trilha `Início › Área › Aba › extra`, com a área como link; as telas de ação declaram a própria trilha

**Alternativas:** (a) deixar a área sem link; (b) mostrar também a área no nível 1; (c) área com link para a entrada dela; nível 1 como estava.

**Razão:** (c). A área sem link era um beco; no nível 1 as abas já dizem a área, então a trilha continua `Parceiros Flow › Aba` (menos níveis no tablet). As telas que eram itens do menu (Novo insumo, Nova ficha, Importar, Lançar nota, Novo fornecedor) agora dizem o próprio nome, e o "Fornecedores" repetido saiu; o teste proíbe a repetição.

### 106. 2026-10-17 · UX.9: rótulos — "Lançar nota" continua; "Fichas e produtos" é só rótulo; "Visão geral" é o `/estoque`; o hub e o seletor dizem "Áreas"

**Alternativas:** (a) "Nova compra" e "Produtos" como entidade; (b) manter os rótulos antigos nas abas.

**Razão:** "Lançar nota" é o termo das telas e do histórico da 1.5. "Produto" não existe como entidade nova (a ficha continua sendo a receita; `ProdutoVenda` é preço por canal): é rótulo da aba. O hub vira "Áreas da Rede" e o seletor "Área"; o nome longo de área quebra em duas linhas no menu em vez de cortar.

### 107. 2026-10-17 · UX.9: ação no ⌘K só com a área visível E a permissão da ação; achar nunca mostra dinheiro

**Alternativas:** (a) listar todas as ações e deixar o servidor recusar; (b) filtrar só pela permissão da ação; (c) a área precisa ter alguma aba permitida e a ação precisa da própria permissão.

**Razão:** (c). Quem só tem "lançar nota" sem "ver compras" não vê a área, então não vê a ação (perfil custom). O servidor segue recusando a tela e a action. Os resultados de busca de insumo e ficha não selecionam custo, preço nem margem (teste estático).

### 108. 2026-10-17 · UX.9: nível 1 — um grupo por área dentro de "Parceiros Flow"; Cadastro do parceiro fica em Rede e Equipe

**Alternativas:** (a) manter todas as telas num grupo só; (b) um módulo do nível 1 por área.

**Razão:** (a) deixaria o menu do nível 1 sem a estrutura que o parceiro vê; (b) misturaria as áreas do parceiro com Comercial e Clientes. Um grupo por área dá o mesmo vocabulário do parceiro, as abas saem de `item.area` e as ações vão para o ⌘K do nível 1.

### 109. 2026-10-17 · UX.9 (aprovação): título da tela = nome da aba; card de área com as abas como links irmãos; seletor com resumo curto

**Alternativas:** (a) renomear as abas para os títulos antigos ("Notas de compra", "Estoque por loja"); (b) alinhar os títulos às abas do contrato ("Compras", "Visão geral"); para o card — (c) manter as abas em texto; (d) cada aba um link próprio, com o título como link esticado.

**Razão:** (b) porque as abas são palavras do contrato do dono; "Estoque por loja" passa ao subtítulo da Visão geral. (d) porque o atalho "Contagens" no card poupa um clique: o título é o link principal e estica sobre o card (o card inteiro continua clicável) e as abas são links irmãos acima da camada esticada, sem link dentro de link e com foco por Tab. O seletor de área (estreito) ganha um `resumo` próprio de até 20 caracteres, para não cortar a frase. "Margem de cada prato" só aparece com "ver fichas".

### 110. 2026-10-17 · ERP 0.6: o texto da ajuda mora no código, versionado junto com a tela (`ajuda-textos.ts`), e um teste reprova ajuda desatualizada

**Alternativas:** (a) texto no banco, editável pela tela; (b) texto no Notion; (c) texto em código, uma entrada por tela, com versão por entrada e um `ajuda.lock.json` que guarda o hash do texto.

**Razão:** (c). A ajuda só vale se muda quando a tela muda: no mesmo diff, revisada com ela. Banco e Notion deixariam o texto andar sozinho, sem revisão e sem versão. O teste `tests/erp-ajuda.test.ts` reprova rota do ERP sem entrada, entrada órfã, permissão que não existe, jargão, "!", emoji, HTML e texto alterado sem subir a versão; `npm run ajuda:lock` regrava o lock e se recusa a gravar texto novo com a versão velha. É o "ajuda sempre atualizada" do contrato, em forma de gate. A regra entra no modelo de subfase: "Ajuda: chaves novas/alteradas".

### 111. 2026-10-17 · ERP 0.6: a chave da ajuda é a ROTA (padrão do Next); uma entrada pode cobrir várias rotas; sem variante por estado da tela

**Alternativas:** (a) chave por área ou por módulo; (b) chave por rota, com `variante` para a tela que muda de conteúdo (contagem cíclica × fechamento); (c) chave por rota, uma aula só por tela, com o caso especial escrito num bloco.

**Razão:** (c). A seção 9 manteve todas as URLs, então a rota é a identidade estável e a área só agrupa (o teste confere que a `area` da entrada é a área onde a tela acende no menu). Uma variante exigiria a página avisar o shell (`TrilhaDaPagina` só chega depois da hidratação: a caixa piscaria). Na contagem, um bloco diz "no fechamento do período, conte o que falta...". Novo e editar dividem a entrada. A única rota nova da seção 9, `/estoque/contagens`, tem a dela no `/erp` e no espelho do nível 1.

### 112. 2026-10-17 · ERP 0.6: a preferência é da PESSOA (global), numa tabela própria FORA do tenant, lida junto com a sessão

**Alternativas:** (a) por pessoa × parceiro, dentro do tenant; (b) cookie no aparelho; (c) tabela `PreferenciaErp` por `UsuarioErp`, sem `parceiroId`, como as outras credenciais.

**Razão:** (c). Aprender o sistema é da pessoa: quem está em dois parceiros escolhe uma vez, e a escolha vale em qualquer aparelho (cookie não vale). Vem na MESMA ida ao banco de `validarSessao` (sem consulta extra, sem flash) e fica fora da RLS: nenhuma tabela de tenant muda, `erp_tenant` não tem GRANT (a migration revoga no padrão condicional da 0.3), o `prisma` do portal recusa e só `credenciais.ts` grava. Apagar a pessoa apaga a preferência (CASCADE). `fechadas` guarda `chave@versão`, no máximo 300 (CHECK com função imutável, o mais velho sai), e `escolhidaEm` nulo = ainda não respondeu. Migration aditiva `20261024000000_erp_preferencia_ajuda`, `migrate diff` vazio.

### 113. 2026-10-17 · ERP 0.6: a aula é filtrada pela PERMISSÃO efetiva, não por setor nem por perfil; o filtro é conforto, e o servidor só entrega o que a pessoa pode ler

**Alternativas:** (a) texto por perfil (dono, gerente, operador); (b) por setor; (c) bloco com `para: [permissões]` (qualquer uma).

**Razão:** (c). Perfil próprio existe e setor não concede nada (decisão 39): o que a pessoa faz é o que ela pode. O operador nem recebe o bloco sobre preço, na caixa e na gaveta (o layout entrega ao shell o registro já filtrado). Mas o texto é documentação do produto, sem dado de nenhum parceiro: o filtro não é segurança, e a permissão de verdade continua sendo decidida pela página e pela action. Todo registro precisa de ao menos um bloco para todos.

### 114. 2026-10-17 · ERP 0.6: a caixa é desenhada pelo shell a partir da rota, no HTML do servidor; funciona sem JavaScript

**Alternativas:** (a) cada página pede a sua caixa (80 edições); (b) o shell, cliente com SSR, resolve a rota (`usePathname`) e a preferência vem do layout.

**Razão:** (b). Zero edição nas páginas, nenhuma tela esquece. A caixa é a mesma conta no servidor e no navegador (`caixaDaTela`), então quem fechou ou desligou recebe o HTML SEM a caixa: sem flash e sem diferença de hidratação (provado com CPU 6× e rede lenta). Os botões são `<form action>` de server action: sem JavaScript a caixa vem e "não mostrar de novo" recarrega sem ela; com JavaScript some na hora (otimista, descartada se a preferência do servidor mudar). O botão "Ver tudo", que precisa de JavaScript, nasce escondido.

### 115. 2026-10-17 · ERP 0.6: a pergunta da 1ª vez mora dentro da primeira caixa, sem modal; sem resposta, as dicas ficam ligadas

**Alternativas:** (a) modal na 1ª entrada; (b) pergunta na caixa, "Manter as dicas" ou "Desligar".

**Razão:** (b). Quem conta estoque de luva não pode ser travado por uma janela. A pergunta aparece na caixa de qualquer tela até ser respondida; responder (ou religar em "Seu acesso") grava `escolhidaEm`. Desligar tira só as caixas: o "?" no topo continua sempre à mão, e instrução de campo (microtexto ligado por `aria-describedby`) nunca some.

### 116. 2026-10-17 · ERP 0.6: texto novo sobe a versão e a caixa volta com "Mudou"; "fechar" só aceita `chave@versão` que existe no registro agora

**Alternativas:** (a) fechar guarda só a chave; (b) fechar guarda `chave@versão` e a action aceita qualquer texto; (c) idem, com lista branca contra o registro e teto.

**Razão:** (c). Fechar a versão 1 não cala a versão 2: quem tinha fechado vê a caixa de novo, com a etiqueta Mudou (só quem teve uma versão antiga fechada; quem nunca viu não ganha etiqueta). Chave forjada, de versão que não existe ou gigante é recusada sem gravar. A gravação é uma instrução só (`ON CONFLICT`, trava a linha): duas abas fechando caixas ao mesmo tempo não perdem nenhuma, fechar de novo não duplica, a versão antiga da mesma caixa sai e o teto de 300 tira a mais velha.

### 117. 2026-10-17 · ERP 0.6: a `Dica` morre; um caminho só para explicar (`LinkDeAjuda` abre a gaveta na seção certa)

**Alternativas:** (a) manter a `Dica` ao lado do framework; (b) migrar os textos soltos de aula para o registro e apagar a `Dica`.

**Razão:** (b), Regra Nº 2. "Como a conta é feita" (3 parágrafos) virou a seção `conta` da ficha, só para quem tem `precos.ver`; "Como abre o estoque de uma loja" virou a seção `abertura` do estoque; o texto solto das telas de contar (`explicacao`) virou a aula de `abertura` e `contagens/[id]`. No lugar ficam `LinkDeAjuda` (só abre a gaveta). Ficam como estão, por não serem aula: dicas de campo (`aria-describedby`), `<details>` que mostram dado e subtítulos de painel. "O servidor refaz a conta ao salvar" virou "A conta é refeita na hora de salvar".

### 118. 2026-10-17 · ERP 0.6: o nível 1 dentro do parceiro só tem o "?"; as telas do Barney não têm ajuda

**Alternativas:** (a) o Rodolfo também com caixas e preferência; (b) só o botão "?", lendo o mesmo registro com todas as permissões.

**Razão:** (b). O nível 1 não é uma `UsuarioErp`: não tem onde gravar preferência, e a caixa de aula é para quem usa o ERP todo dia. A gaveta dele não fala de preferência. Telas do Barney (Hoje, Leads, a lista de parceiros, o quadro de onboarding) não casam com nenhuma entrada, então não têm "?".

### 119. 2026-10-17 · ERP 0.6: as ações da preferência são da própria pessoa e nunca recebem quem ela é

**Alternativas:** (a) a action recebe o id da pessoa; (b) o id vem só da sessão validada dentro de `credenciais.ts`.

**Razão:** (b). `acaoAjudaFechar`, `acaoAjudaDicas` e `acaoAjudaReabrir` só leem o texto da caixa ou a escolha; o `usuarioId` sai da sessão do cookie `ff_erp`, revalidada a cada gravação (sessão encerrada não grava). Campo `usuarioId` forjado no formulário é ignorado (teste com banco). O nível 1 (JWT do next-auth) não tem esse cookie: nada grava. Não pedem permissão (é preferência da pessoa) e valem até em parceiro suspenso, porque não tocam dado do tenant.

### 120. 2026-10-17 · ERP 0.6: o "?" fica no topo entre a busca e o sino; a gaveta entra pela direita (desktop) ou vira folha embaixo (< 600 px)

**Alternativas:** (a) popover colado no botão; (b) página de ajuda; (c) `Dialogo` nativo com `lado="direita"`.

**Razão:** (c), estendendo o `Dialogo` (não criando outro): fundo inerte, Esc fecha, foco vai ao título ao abrir e volta a quem abriu (o "?" quando o atalho `?` abriu). O atalho `?` não dispara dentro de campo nem com outra janela aberta. O botão tem alvo de 44 px também no celular (o seletor de visão cede espaço na barra estreita). A gaveta traz a aula, as seções, "Outras telas de {área}" (as abas que a pessoa já pode abrir) e a saída "Fale com a FlowFoods".

### 121. 2026-10-17 · ERP 0.6 (aprovação): a caixa das telas de contar nasce recolhida

**Alternativas:** (a) caixa aberta em toda tela; (b) caixa recolhida (uma linha que abre) onde a lista precisa ficar à vista no celular.

**Razão:** (b) para `abertura` e `contagens/[id]`. Medido a 390 × 844: aberta, a caixa tem 313 px e leva o 1º campo de contagem a 931 px (fora da tela); recolhida tem 46 px e o campo fica em 665 px. É um `<details>` (funciona sem JavaScript), só muda o desenho: fechar, "Mudou", versão e a pergunta da 1ª vez (que a deixa aberta) valem igual. Marca `recolhida: true` na entrada.

### 122. 2026-10-17 · ERP 0.6 (aprovação): `/entrar` passa de `no-referrer` para `same-origin`

**Alternativas:** (a) manter `no-referrer` e aceitar o login sem JavaScript quebrado; (b) `same-origin`.

**Razão:** (b). A intenção da 0.3 (commit 9ac5b61) era o token do link de primeiro acesso, que vai no endereço, não vazar por Referer: com `same-origin` nenhum site de fora recebe o endereço (provado interceptando o WhatsApp). Com `no-referrer` o navegador mandava `Origin: null` no POST e o Next recusava a server action (500 sem JavaScript). Provado: login e senha errada sem JavaScript funcionam.


### 123. 2026-10-17 · ERP 2.1: o grão do faturamento é loja × canal × dia civil do Rio, sem marca

**Alternativas:** (a) loja × marca × canal × dia (a coluna `marcaId` já existe); (b) loja × canal × dia, `marcaId` nulo por ora.

**Razão:** (b). Não há vínculo loja × marca no esquema: misturar linhas com e sem marca no mesmo grão somaria em dobro. A marca entra com a integração por loja do iFood, sob a regra "um grão é lançado sem marca OU por marca, nunca os dois". O dia é o civil do Rio (`@db.Date`, `hojeNoRio`), nunca derivado de UTC: o caixa que fecha à meia-noite não muda de dia.

### 124. 2026-10-17 · ERP 2.1: o número é a venda de produtos dos pedidos concluídos, líquida do desconto da casa ("o pedido não é a venda")

**Alternativas:** (a) total do pedido como o canal reporta (com taxa de entrega, gorjeta, cancelados); (b) venda dos produtos, de pedidos concluídos, já sem desconto/cupom pago pela casa.

**Razão:** (b). É o que vira receita do DRE (2.2); taxa de entrega cobrada do cliente, 10 %/gorjeta e pedido cancelado não são venda. No iFood: total dos itens menos o incentivo que a loja bancou; a comissão é dedução da 2.2 (via `CanalConfig`). `pedidos` = pedidos concluídos; `clientes` = atendimentos (salão: pessoas; delivery e iFood: em branco vale os pedidos), não clientes únicos. Desconto não vira campo agora; se entrar, bruto = valor + descontos (aditivo, o significado de `valor` não muda). Ticket médio é Σ valor ÷ Σ pedidos do recorte, derivado: nunca gravado, nunca média de médias.

### 125. 2026-10-17 · ERP 2.1: uma fonte por grão: o humano (digitado ou planilha) divide UMA linha, e a integração vence na leitura

**Alternativas:** (a) somar digitado + planilha + integração; (b) a mesma chave determinística para digitado e planilha (reimportar é correção) e, havendo linha de integração no grão, vale só a soma dela, com a digitada à vista como conferência.

**Razão:** (b). Chave humana `manual:<loja>:-:<canal>:<dia>` (índice único parcial no SQL como cinto); a integração usa outro espaço de chave (`<fonte>:<tipo>:<idExterno>`, o CHECK separa os dois). Somar duplicaria venda quando o digitado e a integração descrevem o mesmo dia. A leitura é UMA, `faturamentoDosGraos`; a 2.2 só lê por ela. Teste com linha de integração plantada prova a precedência e a conferência.

### 126. 2026-10-17 · ERP 2.1: vazio não é zero; "Não vendeu" grava 0/0/0; `Loja.canaisDeVenda` diz o que cobrar

**Alternativas:** (a) canal em branco = zero; (b) em branco = sem lançamento (falta), zero só se a pessoa disser; (c) idem, com os canais que a loja vende configuráveis.

**Razão:** (c). Falta = canal que a loja vende, sem lançamento, de quando ela começou a lançar (1º lançamento) até ontem; hoje fica "em aberto". Unidade 100 % delivery desliga a Loja em `canaisDeVenda` (CHECK: pelo menos um canal), editável em Lojas e marcas por quem tem `lojas.gerir`, com antes/depois no histórico; desligar não apaga o que já foi lançado. A falta conta canal-dia (cada canal em cada dia).

### 127. 2026-10-17 · ERP 2.1: corrigir é no lugar, condicional ao `atualizadoEm`; remover exige motivo

**Alternativas:** (a) estorno e lançamento novo (como o livro-razão do estoque); (b) UPDATE condicional à versão lida de cada canal, antes/depois no histórico; remover = DELETE com motivo.

**Razão:** (b). Faturamento é a fotografia do dia, não movimento. Duas abas: a segunda recebe "Fulano lançou o iFood deste dia agora: R$ X · N pedidos" e nada é sobrescrito; salvar tudo ou nada. Regravar o mesmo número (duplo clique, 10 gravações paralelas iguais) é "igual": uma linha, um histórico. Números diferentes na corrida: 1 vence, N−1 recebem o conflito (`INSERT … ON CONFLICT DO NOTHING`, não a exceção, para a transação não abortar). Remover (3 a 200 letras de motivo) guarda o lançamento inteiro no histórico e o dia volta a "sem lançamento"; linha de integração não se remove à mão.

### 128. 2026-10-17 · ERP 2.1: a planilha é CSV com modelo, prévia sem gravar, erro por linha e proteção contra fórmula

**Alternativas:** (a) importar direto; (b) prévia (nova, vai mudar com antes → depois, igual, com erro) e confirmação que leva a impressão da prévia.

**Razão:** (b). `;` recomendado (a vírgula é o decimal do Brasil); loja pelo nome (sem caixa nem acento), canal por loja | delivery | ifood; limites de 256 KB, 5.000 linhas, 20 colunas, 200 letras por campo, 30 s. Célula que começa com `= + - @`, tab ou CR nunca casa loja ou canal e é recusada no número; o eco é cortado em 40 letras, sem controle nem bidi, e renderizado como texto. A importação refaz a prévia DENTRO da transação, sob a trava, e se a impressão não bate recusa tudo ("mudou desde a prévia"). Linha repetida no arquivo = erro nas duas; loja inexistente, de outro parceiro ou fora do acesso recebem a MESMA frase. Planilha e digitação compartilham a chave: dia lançado à mão e depois importado é a mesma linha (origem passa a IMPORTACAO), sem soma.

### 129. 2026-10-17 · ERP 2.1: o contrato da integração fica desenhado, sem implementação

**Alternativas:** (a) implementar o iFood agora; (b) só o formato e a leitura.

**Razão:** (b). `<fonte>:<tipo>:<idExterno>` (`pedido` ou `dia`), `origem = INTEGRACAO`, `origemRef = idExterno`, upsert por chave (reenviar atualiza, nunca soma), pedido só entra CONCLUÍDO e cancelado depois é a mesma chave zerada. O worker grava por `doParceiro` (o portão confere parceiro ATIVO), pega a mesma trava e respeita período fechado. O mapeamento loja do iFood → `Loja` é da fase da integração. Nada disso grava na 2.1: só `chaveDeIntegracao`, o tipo `EntradaDeIntegracao` e a leitura que já faz a integração vencer.

### 130. 2026-10-17 · ERP 2.1: permissões sem catálogo novo; gravar exige ver e lançar na loja de CADA linha

**Alternativas:** (a) permissão nova (`faturamento.importar`); (b) as que o catálogo já tinha: `faturamento.ver` e `faturamento.lancar`, ambas por loja.

**Razão:** (b); `VERSAO_DO_CATALOGO` fica 1 e o módulo deixa de ser `emBreve`. Telas pedem `faturamento.ver` com a loja; gravar, remover e importar pedem ver e lançar, e a planilha confere a loja de cada linha. Dono e Gerente têm; Operador não (o caixa que fecha o dia ganha as duas como extra no ajuste por pessoa). Loja fora do alcance, de outro parceiro e inexistente são 404 iguais. Quem não tem `faturamento.ver` não recebe nada de faturamento: nem na área, nem no ⌘K, nem no histórico (decisão 133).

### 131. 2026-10-17 · ERP 2.1: migration aditiva, robusta a linha antiga, segura para superusuário e dono não-superusuário

**Alternativas:** (a) CHECKs que podem reprovar a migration por dado antigo; (b) NOT VALID + tentativa de VALIDATE que avisa e segue.

**Razão:** (b). `20261025000000_erp_faturamento`: `FaturamentoLancamento.atualizadoPorNome`, `Loja.canaisDeVenda`, oito CHECKs (tetos de R$ 1 mi, 100 mil pedidos/clientes, valor > 0 exige pedido, data ≥ 2020, espaço de chave, integração com `origemRef`, tamanhos, loja com pelo menos um canal) e o índice único parcial do grão humano. Cada CHECK entra NOT VALID e é validado em seguida; linha antiga que viole deixa o CHECK NOT VALID e um WARNING com o nome (vale para escrita nova). O índice único do grão é criado dentro de `BEGIN … EXCEPTION WHEN unique_violation`: duplicidade humana antiga não cria o índice e avisa. **Veto do Guardião (1ª reprovação):** a primeira versão checava duplicidade com `SELECT … HAVING count(*) > 1`; com dono não-superusuário e FORCE RLS esse SELECT enxerga 0 linhas (a RLS vale para a consulta, não para a construção do índice nem para o VALIDATE, que leem a tabela inteira), "passava" e o `CREATE UNIQUE INDEX` quebrava com 23505, prendendo o deploy (P3018). Agora nenhum passo da migration depende de SELECT sob RLS, e o teste planta duplicada antes da migration como superusuário, dono com RLS forçada e dono sem RLS (rodado contra a migration antiga, os dois cenários do dono com RLS falham). Como o WARNING não aparece no log do deploy automático, `npm run erp:conferir-migracao` lista, depois do deploy, os CHECKs que ficaram NOT VALID e o índice ausente (sai com código 1 se houver pendência). Provado com dado antigo plantado (contagem preservada, `tests/erp-faturamento-migracao.db.test.ts`) e em banco novo como superusuário, dono não-superusuário com RLS e sem RLS; `migrate diff` vazio. Nenhuma tabela nova: portão, RLS e GRANT iguais.

### 132. 2026-10-17 · ERP 2.1: o período FECHADO recusa escrita de faturamento, pela trava compartilhada que a 2.2 usará

**Alternativas:** (a) conferir o período sem trava; (b) trava `pg_advisory_xact_lock_shared('erp-faturamento:'||parceiroId)` em toda escrita, e o fechamento da 2.2 pega a MESMA chave exclusiva.

**Razão:** (b). Sem trava há janela: o fechamento lê o faturamento enquanto alguém ainda grava no período. Com a trava, ou a escrita termina antes e entra no fechamento, ou espera e é recusada ("O período X já foi fechado no DRE"). A 2.1 não cria nem fecha período: só lê `PeriodoApuracao` e expõe `travarParaFechar` (testado: lançar espera o fechamento em curso e depois é recusado).

### 133. 2026-10-17 · ERP 2.1: o histórico só entrega faturamento a quem passa `verFaturamento: true`; ausente é fechado

**Alternativas:** (a) parâmetro obrigatório como o `verPrecos` da 1.10 (editar ~50 chamadas); (b) opcional, e ausente = não vê.

**Razão:** (b) é mais forte que (a): quem esquece de decidir não vaza. As linhas de `FaturamentoLancamento` saem na consulta (lição da decisão 90: o filtro é no servidor, o payload não leva a linha); o filtro "Faturamento" da tela some para quem não pode. Teste monta a página do Histórico de um perfil com `historico.ver` sem `faturamento.ver` e confere HTML e payload; o mesmo teste tem o controle positivo (quem tem as duas vê).

### 134. 2026-10-17 · ERP 2.1: "Faturamento e DRE" é uma área com uma aba ("Faturamento") e duas ações

**Alternativas:** (a) abas "Lançamentos" e "Importar"; (b) aba única e as ações "Lançar o dia" e "Importar faturamento" no cabeçalho e no ⌘K.

**Razão:** (b), a regra da seção 9 (área → abas → ações): lançar e importar são ações, não seções. Uma aba sozinha não vira barra de abas; o menu e o hub levam a ela. As ações são só de quem tem `faturamento.lancar`; "Importar faturamento" (e não "Importar planilha") para não repetir o rótulo da ação das fichas no ⌘K. Com uma loja só no acesso, "Lançar o dia" vai direto ao dia de hoje (o gerente no celular não escolhe nada).


### 135. 2026-10-17 · ERP 2.2a: a 2.2 se divide em 2.2a (DRE ao vivo) e 2.2b; o plano de contas padrão vive em código

**Alternativas:** (a) entregar a 2.2 inteira (metas, comparação, fechamento); (b) 2.2a = o DRE que já funciona no meio do mês; 2.2b = metas, ano passado, fechar e reabrir período.

**Razão:** (b), aprovada pelo Maestro: o dono precisa ver o resultado do mês antes de precisar de meta ou de fechamento, e a fotografia do fechamento só faz sentido sobre um DRE já provado. O plano padrão fica em código (`PLANO_PADRAO`) com `codigo` estável por linha; o parceiro o grava na primeira escrita (idempotente, sob trava) e, até lá, a leitura é virtual (sem gravar). Assim uma mudança do padrão não vira migration de dado e o parceiro novo nunca vê DRE vazio.

### 136. 2026-10-17 · ERP 2.2a: linha do plano se renomeia e se oculta, nunca se apaga; o grupo não muda; só quem tem a rede inteira edita

**Alternativas:** (a) apagar linha sem uso; (b) renomear, ocultar e criar, sem apagar nem mover de grupo; (c) deixar o gerente de uma loja editar.

**Razão:** (b). Apagar quebra histórico e a futura fotografia; mover de grupo muda resultados já vistos. Oculta sai do formulário e continua no DRE dos períodos em que tem valor. Plano e regra do período valem para a casa toda, então `metas.editar` passou a ter `exigeRede` (o gerente de uma loja não edita nem vê o botão). A chave da linha é o `codigo` ou `id:<id>`, nunca o nome (renomear não perde nada).

### 137. 2026-10-17 · ERP 2.2a: despesa é por competência e a apropriação é por arredondamento acumulado, exata ao centavo

**Alternativas:** (a) dividir o valor pelos dias e arredondar cada dia; (b) arredondar o acumulado, `round(V·k/D)`, e tirar a diferença; (c) guardar uma linha por dia.

**Razão:** (b). A soma das fatias fecha o valor ao centavo, o erro de qualquer fatia é menor que 1 centavo e não depende de como os outros períodos cortam o mesmo valor (semana, quinzena, mês). (a) perde ou sobra centavos; (c) infla o banco e torna a edição frágil. A competência é um dia, um mês ou um intervalo de até 366 dias; o valor guardado é o da despesa inteira, a apropriação é conta (BigInt), não coluna. Exemplo da prova: R$ 6.000,00 em outubro, até ontem (16 de 31 dias) = R$ 3.096,77.

### 138. 2026-10-17 · ERP 2.2a: loja ou rede, sem rateio; duplo envio, duas abas e período fechado têm resposta própria

**Alternativas:** (a) ratear a despesa da rede entre as lojas; (b) a despesa é de UMA loja ou da rede, e o DRE mostra o resultado da loja antes das despesas da rede.

**Razão:** (b). Rateio é opinião (por faturamento? por área?) e esconde o que a loja realmente rende; a tabela "Por loja" fecha com a linha "Rede, com as despesas da rede". Lançar leva um `envio` aleatório (duplo clique = uma despesa, "já lançada"); editar, remover, pagar e desfazer são condicionais a `atualizadoEm` (a segunda aba recebe o conflito e nada é sobrescrito); remover exige motivo; despesa em período FECHADO é recusada pela trava compartilhada da 2.1, olhando o intervalo inteiro da competência.

### 139. 2026-10-17 · ERP 2.2a: recorrência é uma cadeia de despesas, e "Lançar as do mês passado" é idempotente e confere o valor

**Alternativas:** (a) uma despesa recorrente que se projeta sozinha nos meses; (b) cada mês é uma despesa própria encadeada (`repeteDeId`), criada quando a pessoa confirma.

**Razão:** (b). O aluguel muda, o salário reajusta e a luz varia: projetar sozinho põe número que ninguém conferiu no DRE. A tela mostra o valor do mês passado só como ponto de partida e cria apenas as que faltam (índice único `parceiroId + repeteDeId`: repetir não duplica); o gerente de uma loja só enxerga e lança as da loja dele. "Repete todo mês" vale só para mês inteiro; "Não repete mais" interrompe a cadeia. O DRE avisa "Falta lançar" quando uma recorrente do mês passado ainda não tem a deste mês.

### 140. 2026-10-17 · ERP 2.2a: contas a pagar mínimas, sem caixa nem conciliação

**Alternativas:** (a) módulo financeiro completo; (b) `vencimento` e `pagaEm` opcionais na despesa, filtro "A pagar" e três números (vencidas, vencem em 7 dias, total).

**Razão:** (b). O dono precisa saber o que vence, não conciliar banco. Pagar não muda o DRE (o DRE é competência) e se desfaz. Conciliação, fornecedor e forma de pagamento ficam fora até alguém pedir.

### 141. 2026-10-17 · ERP 2.2a: o período tem UMA regra por parceiro, versionada, e o DRE e a contagem de estoque leem pelo mesmo módulo

**Alternativas:** (a) deixar `ParceiroFlow.periodoTipo` para o estoque e criar outra regra para o DRE; (b) tabela `RegraDoPeriodo` (mensal, quinzenal, semanal e o dia em que começa, por `vigenteDesde`), lida só por `periodos.ts`.

**Razão:** (b). O CMV só fecha se o DRE e o estoque usam as mesmas datas. A migration copia a regra antiga para a primeira linha (antes de ligar a RLS), a 1.7 passa a ler por `periodoDe`/`periodoAnteriorDe`/`registrarPeriodo`, e as colunas antigas ficam sem uso (limpeza própria depois). `PERSONALIZADO` sai da tela e de regra nova; vira só legado. A tabela é só inclusão (gatilho) e o `parceiroId` é imutável.

### 142. 2026-10-17 · ERP 2.2a: regra nova nunca é retroativa e o banco recusa períodos que se sobrepõem

**Alternativas:** (a) a regra nova vale já e recalcula o passado; (b) vale a partir do dia seguinte ao fim do período de agora, com o primeiro período novo cortado no começo.

**Razão:** (b). Nenhum período passado ou em curso muda de data nem de número; uma regra futura ainda pendente pode ser trocada ou cancelada. Um gatilho (`PeriodoApuracao_sem_sobreposicao`) impede dois períodos que se sobrepõem, mesmo com duas abas ou uma contagem registrando o período ao mesmo tempo (`registrarPeriodo` pega `travarPeriodos`). Período já registrado pela contagem mantém as datas dele. Na prova: regra quinzenal salva em 17/10 vale em 01/11; outubro continua igual.

### 143. 2026-10-17 · ERP 2.2a: o DRE é uma estrutura única, percentuais sobre a receita bruta, zero é "—"

**Alternativas:** (a) DRE só com o que tem valor; (b) estrutura fixa (receita por canal, deduções, CMV, variáveis, pessoal, ocupação, utilidades, administrativas, marketing, outras, financeiras) com as linhas sem valor visíveis; (c) percentual sobre a receita líquida.

**Razão:** (b) com % da receita bruta (em pontos-base, inteiro): é o que o dono de restaurante lê e permite comparar lojas. A estrutura estável mostra o que NÃO foi lançado (ausência de dado é achado). Zero vira "—", nunca "R$ 0,00" nem "0,0 %"; sem faturamento, a receita também é "—". Linha calculada (receita líquida, margem, resultados) é do sistema.

### 144. 2026-10-17 · ERP 2.2a: a taxa do iFood é ESTIMADA pela configuração da loja, um arredondamento por loja

**Alternativas:** (a) esperar o repasse real do iFood; (b) faturamento do iFood × (comissão + pagamento online) do `CanalConfig`, arredondado uma vez por loja; a rede é a soma.

**Razão:** (b), dito na tela ("estimada pela taxa configurada"). O repasse real chega depois e muda; sem estimativa o DRE do mês corrente mente para cima. Um arredondamento por loja faz a rede ser exatamente a soma das lojas. Sem a taxa configurada, a linha diz "falta configurar a taxa" e o resultado diz "sem contar a taxa do iFood". Limite conhecido: usa a taxa de HOJE até existir a fotografia do fechamento (2.2b).

### 145. 2026-10-17 · ERP 2.2a: o CMV aparece como "Em breve", sem número, e tudo que depende dele diz "sem contar o CMV" (sem citar fase interna na tela)

**Alternativas:** (a) usar uma porcentagem fixa de CMV; (b) a linha existe, sem número, e margem e resultados se declaram "sem contar o CMV".

**Razão:** (b). Número inventado vira decisão errada; sem número é hipótese dita como hipótese. A linha `cmv` já está no plano e em `montarDre`: quando a 2.3 trouxer o custo, os avisos saem sozinhos.

### 146. 2026-10-17 · ERP 2.2a: período em curso é parcial, dia a dia até ontem, sem projeção; rede e loja são visões do mesmo cálculo

**Alternativas:** (a) projetar o mês pelo ritmo; (b) só o que já aconteceu, até ontem ("dia 17 de 31"), com a despesa entrando dia a dia.

**Razão:** (b). Hoje ainda está aberto e projeção é promessa de resultado. Faturamento faltando aparece como "Incompleto: N lançamentos", e a receita só conta o que foi lançado. A rede e a loja usam a mesma `montarDre`; a loja nunca recebe despesa da rede. Período encerrado mostra o período inteiro.

### 147. 2026-10-17 · ERP 2.2a: permissões sem catálogo novo; o gerente de uma loja nunca recebe a rede; o Histórico fecha por padrão

**Alternativas:** (a) permissões novas (`despesas.ver`, `plano.editar`); (b) `dre.ver`, `despesas.lancar` (por loja) e `metas.editar` (rede inteira).

**Razão:** (b); `VERSAO_DO_CATALOGO` fica 1. Ver despesa = `dre.ver` OU `despesas.lancar`. A URL (`?rede=1`, `?loja=`) só ESCOLHE dentro do alcance, nunca concede. O Histórico ganha `verDre` (ausente = fechado, como o `verFaturamento`): despesa, plano e regra saem da consulta, do filtro e do HTML de quem não tem `dre.ver`; o ⌘K só mostra o que a pessoa abre. Em aberto para o Rodolfo: o gerente de uma loja vê os salários da loja dele? (hoje sim).

### 148. 2026-10-17 · ERP 2.2a: navegação, ajuda e migration aditiva e verificável

**Alternativas:** (a) abas soltas e migration com CHECKs que reprovam por dado antigo; (b) grupo "Resultado" na área Faturamento e DRE, ação "Lançar despesa" e migration `20261026000000_erp_dre_despesas` NOT VALID + VALIDATE tolerante.

**Razão:** (b). Despesas, DRE, Períodos e Plano de contas formam o grupo "Resultado" ao lado de "Faturamento"; a ação "Lançar despesa" entra no cabeçalho e no ⌘K. Toda rota nova tem ajuda (seis chaves novas; `faturamento-dia` e `periodo` subiram de versão). A migration só adiciona (colunas, tabela, valores de enum, CHECKs, gatilhos), copia a regra antiga antes de ligar a RLS, nunca lê tabela de tenant sob RLS e foi provada nos 3 perfis do banco (superusuário, dono com RLS, dono sem RLS) com dado antigo; o passo pós-deploy é `npm run erp:conferir-migracao`. `limparTexto` saiu de `pedido-campos` para `texto-limpo.ts` (puro) porque o formulário roda no navegador e `node:crypto` quebrava o build.

### 149. 2026-10-17 · ERP 2.2b: meta é um percentual da receita bruta por linha, com vigência; "sem meta" também é uma linha

**Alternativas:** (a) uma meta por parceiro que vale para sempre e apaga a anterior; (b) meta em pontos-base de 0 a 100,00 % por linha do DRE, com `vigenteDesde`; vazio grava "sem meta" como linha vigente.

**Razão:** (b). O período fechado e o histórico precisam saber QUAL meta valia, então cada gravação nasce valendo do começo do período em curso e a efetiva de um período é a última com `vigenteDesde` menor ou igual ao começo dele. Apagar a meta é decisão (a casa deixou de acompanhar a linha), por isso vira uma linha `semMeta` com histórico, não um DELETE. A receita não tem meta (é a base do percentual). Salvar é tudo ou nada sob uma trava própria, e o que não mudou não grava. Meta por canal, por loja e em reais ficam para a 2.4.

### 150. 2026-10-17 · ERP 2.2b: realizado × meta em pontos percentuais, a palavra vem do `sentido` e não tem cor

**Alternativas:** (a) farol verde/amarelo/vermelho; (b) coluna Meta, Meta em R$ e Desvio em pp, com "melhor que a meta", "pior que a meta" ou "na meta" (diferença menor que 5 pontos-base), pela direção que a linha diz ser boa.

**Razão:** (b). Pessoal acima da meta é ruim e resultado acima da meta é bom; quem diz isso é o `sentido` da linha, não a cor. Faixas e farol dependem de um acordo com o dono que ainda não existe (2.4). Linha sem meta fica sem comparação, não ganha uma meta inventada; a meta também mede o DRE de cada loja, em % da receita da loja.

### 151. 2026-10-17 · ERP 2.2b: ano passado só para a receita, nas mesmas datas, com a cobertura dita

**Alternativas:** (a) comparar tudo com o ano passado; (b) só a receita (bruta e por canal), nas mesmas datas menos um ano (29/02 vira 28/02), dizendo "N de M dias".

**Razão:** (b). Despesa, plano e taxa mudaram de um ano para o outro e a comparação enganaria; a receita é o dado que existe nos dois lados. Sem lançamento no ano passado vira uma frase ("sem lançamento"), não uma coluna de traços, e a variação não é calculada contra um período incompleto sem avisar.

### 152. 2026-10-17 · ERP 2.2b: condições duras travam; ressalvas se confirmam uma a uma com justificativa de 10 a 300 letras

**Alternativas:** (a) fechar sempre e avisar; (b) travar tudo; (c) o que deixaria o número errado para sempre trava, o que é omissão consciente se confirma.

**Razão:** (c). Duras: período não terminou, faturamento faltando, iFood vendido sem taxa configurada, contagem de fechamento do estoque em andamento, rede sem nenhum lançamento. Ressalvas: recorrente não lançada, estoque não aplicado, loja sem nenhum lançamento. A confirmação é marcar cada ressalva e escrever UMA justificativa; o servidor reconfere as condições dentro da transação (impressão das condições) e o DRE fechado diz "Fechado com ressalvas" para sempre. Em aberto para o Rodolfo: "loja nunca lançou" como ressalva (e não bloqueio) é o certo?

### 153. 2026-10-17 · ERP 2.2b: o fechamento grava uma fotografia imutável, pela mesma leitura do DRE ao vivo

**Alternativas:** (a) fechar só muda o status e o DRE recalcula; (b) guardar o resultado pronto; (c) guardar a ENTRADA e o resultado em BigInt, lidos por `entradaDoDre` (a mesma do ao vivo), imutáveis no banco.

**Razão:** (c). Recalcular um período fechado com plano, taxa ou meta de hoje muda o passado; um resultado sem a entrada não prova de onde veio. Gatilhos recusam UPDATE e DELETE, a linha só se inclui na transação da fotografia, um índice parcial garante uma vigente por período e um gatilho adiado impede período FECHADO sem fotografia vigente (nem SQL na mão cria um). O DRE fechado lê só a fotografia, filtrada pelo alcance de quem lê. Período FECHADO de antes da 2.2b, sem fotografia, é lido ao vivo até alguém reabrir e fechar de novo.

### 154. 2026-10-17 · ERP 2.2b: só o nível 1 reabre, com motivo, e a versão anterior nunca se perde

**Alternativas:** (a) o dono reabre; (b) qualquer pessoa com `metas.editar`; (c) só a FlowFoods (`alcance.nivel === 'FLOWFOODS'`), com motivo de 3 a 200 letras.

**Razão:** (c). Fechamento é o ponto de controle do consultor; se o dono reabre sozinho, o período fechado deixa de ser prova. A action de reabrir só existe no espelho do nível 1. Reabrir marca a fotografia como substituída (nunca apaga), guarda antes e depois no Histórico, e fechar de novo gera a versão seguinte. O dono vê a frase "só a FlowFoods reabre". Em aberto para o Rodolfo: se o dono passar a poder reabrir, é uma permissão nova.

### 155. 2026-10-17 · ERP 2.2b: nota de compra e fechamento de estoque obedecem o período fechado; uma ordem de travas só

**Alternativas:** (a) deixar nota e estoque fora do fechamento; (b) as duas escritas pegam a trava compartilhada e recusam período fechado.

**Razão:** (b). Lançar, editar e cancelar nota, e iniciar e concluir a contagem de fechamento, pegam `travarParaEscrever` PRIMEIRO. Ordem fixa: chave do período → loja/aberturas → períodos; ninguém pega na ordem contrária, então não há deadlock, e fechar espera as escritas em curso. Cada teste de corrida falha se a trava for removida.

### 156. 2026-10-17 · ERP 2.2b: a despesa recorrente sobrevive a um mês pulado

**Alternativas:** (a) a cadeia some quando um mês não é lançado; (b) olhar o último elo da cadeia numa janela de 12 meses e desduplicar pela origem.

**Razão:** (b). Era um defeito da 2.2a: quem esquecia um mês perdia a recorrente para sempre e o fechamento não avisava. Agora a recorrente que falta aparece em "Falta lançar" e vira ressalva do fechamento até ser lançada ou parar de repetir.

### 157. 2026-10-17 · ERP 2.2b: navegação, ajuda, histórico e migration aditiva e verificável

**Alternativas:** (a) página de fechar solta e migration com CHECKs que reprovam por dado antigo; (b) "Plano e metas" e a página do período no grupo "Resultado", ajuda por tela e migration `20261027000000_erp_dre_fechamento` segura nos três perfis de banco.

**Razão:** (b). `dre-periodo` nasce com ajuda; `dre`, `dre-plano`, `dre-periodos`, `periodo`, `compra` e `compra-nova` sobem de versão. O Histórico ganha FECHOU, REABRIU e a meta atrás de `verDre`. A migration é aditiva, com CHECKs `NOT VALID` + `VALIDATE` que avisa e segue, gatilhos de imutabilidade, RLS condicional e nenhum passo que dependa de SELECT sob RLS; `erp:conferir-migracao` verifica os CHECKs e os gatilhos, e `migrate diff` fica vazio.

### 158. 2026-10-17 · ERP 2.2b (revisão de UX): toda recusa por período fechado diz o que fazer, e a tela avisa antes

**Alternativas:** (a) frases soltas em cada tela ("já foi fechado"); (b) um aviso único com a saída, a alternativa de quem lança e o link para Períodos, que aparece antes de preencher quando a tela já sabe.

**Razão:** (b). Recusar sem dizer o caminho deixa a pessoa parada. O aviso diz o período, o que não dá, "peça à FlowFoods para reabrir o período" (só a FlowFoods reabre, decisão 154) e a alternativa de quem lança: na nota, a data de hoje se a compra entrou agora; na despesa, a competência no período em aberto. A frase que o servidor devolve também carrega a saída. Quem não abre Períodos vê o aviso sem o link. O servidor continua decidindo; a tela só adianta o que já sabe (datas dos períodos fechados).

### 159. 2026-10-17 · ERP 2.2b (revisão do Guardião): a fotografia só nasce com o período aberto, e fechar e reabrir esperam as escritas

**Alternativas:** (a) confiar nos dois gatilhos adiados; (b) mais um gatilho `BEFORE INSERT`: período ABERTO, versão = última + 1, nasce vigente; e `BEFORE TRUNCATE`.

**Razão:** (b). Com só os gatilhos adiados, marcar a vigente como substituída e inserir uma "v999" vigente deixava o período FECHADO, sem REABRIU, lendo uma fotografia falsa. Como a migration ainda não foi para a master, ela foi editada (e o checksum atualizado no `ff_dev`). Fechar e reabrir pegam a trava exclusiva; o teste determinístico segura a trava compartilhada, vê o fechamento esperar e confere que a despesa gravada durante a espera está na fotografia (cai se a trava for removida). A conclusão de contagem pega a trava compartilhada como primeira instrução. Um gatilho adiado fecha o outro lado: período ABERTO com fotografia vigente não existe (o UPDATE solto FECHADO → ABERTO é recusado no commit; reabrir pelo sistema segue passando).

### 160. 2026-10-17 · ERP 2.3: o CMV de compra é a soma das notas lançadas, pela data da nota

**Alternativas:** (a) pela data em que a nota foi digitada; (b) pela data da nota (`entradaEm`), só notas LANÇADAS (cancelada e rascunho fora), com frete rateado, no recorte do DRE (até ontem no período em curso).

**Razão:** (b). É a mesma data que trava o período (155) e que ordena o último preço (65): período fechado não muda de compra. Vale sem estoque aberto (é o CMV de quem ainda não conta) e a rede é a soma das lojas do alcance. Embalagem entra (é custo do prato). Limpeza e descartável da operação não deviam ser nota: a ajuda diz "lance como despesa"; sem tipo novo nesta fase.

### 161. 2026-10-17 · ERP 2.3: o CMV real é estoque inicial + compras − estoque final, só com o período encerrado e os dois estoques

**Alternativas:** (a) real parcial no meio do período; (b) só com `fim < hoje`, estoque inicial e final apurados, compras = o que o livro registrou das notas do período (`ENTRADA_COMPRA` pela data da nota, estornos com sinal).

**Razão:** (b). Período em curso nunca tem real, mesmo com o fechamento aplicado no dia 29. As compras do real vêm do livro, não das notas: igual à compra em todo período depois do da abertura; difere só quando uma nota lançada antes de concluir a abertura já está na contagem (não conta duas vezes).

### 162. 2026-10-17 · ERP 2.3: o estoque final é o retrato do fechamento corrigido pelos movimentos, por dia de competência (responde a pergunta aberta da 1.7)

**Alternativas:** (a) o retrato como está (inclui o que entrou depois do fim, ou deixa de fora o que saiu antes do fechamento); (b) retrato + movimentos depois do retrato com competência até o fim do período − movimentos até o retrato com competência depois do fim, fora os ajustes do próprio fechamento.

**Razão:** (b). Competência do movimento = data da nota (compra e o estorno dela) ou dia do Rio em que entrou no livro (o resto). Ajuste de cíclica, requisição ou devolução aplicado depois do fim cai no período em que foi aplicado, nunca reabre o anterior; o ajuste do fechamento é de P mesmo aplicado em P+1. Nota de data de P lançada depois do retrato soma na compra e no estoque final (o livro assume que chegou depois da contagem, decisão 73): o real não muda, a diferença muda. Derivado de dado imutável, somado no banco numa consulta só. Sem premissa sobre a data da nota: ela pode ser trocada de mês depois do retrato (com o DRE ainda aberto), e o movimento fica com o instante de quando entrou no livro mas conta para o mês da data de agora. Por isso a consulta do corte tem duas listas (movimentos de instante recente, e movimentos de nota com data depois do fim, de qualquer instante), unidas sem contar duas vezes; testado nos dois sentidos, com e sem mudança de valor (estorno), contra o consumo de verdade.

### 163. 2026-10-17 · ERP 2.3: o estoque inicial é sempre o estoque final do período anterior, pela mesma regra

**Alternativas:** (a) reavaliar o estoque inicial a cada leitura; (b) EF(P−1) derivado, nunca reavaliado, um caminho só; a abertura concluída no primeiro dia do período vale como inicial dele.

**Razão:** (b). É o que faz o real de períodos seguidos encadear ao centavo (a soma dos reais é o inicial do primeiro + compras − final do último; teste para N períodos). Sem o fechamento anterior aplicado, "não apurado" com a frase. Abertura no meio do período: o período não tem real ("o estoque abriu em dd/mm; o real começa em …").

### 164. 2026-10-17 · ERP 2.3: valoração pelo último preço do instante do retrato; sem preço vale zero e vira aviso

**Alternativas:** (a) reavaliar o estoque inicial pelo preço de hoje; (b) final pelo custo de referência do instante do retrato (o que a 1.7 já fotografa, coerente com 65 e 70), movimentos do corte pelo valor do livro, inicial nunca reavaliado; `Contagem.itensSemPreco` gravada ao aplicar abertura e fechamento.

**Razão:** (b). Nota nova muda o custo de hoje, não o passado. Limitação dita na ajuda: com preço subindo, o estoque valorizado puxa o real para baixo. Insumo sem preço entra com zero e a tela diz quantos ("estoque sem o valor de N insumos sem preço"); nulo (contagem de antes da 2.3) é "não registrado". Saldo negativo segue fora do retrato (limitação anotada). A coluna é a única mudança de esquema: gravada no mesmo UPDATE que fecha a contagem, CHECK ≥ 0.

### 165. 2026-10-17 · ERP 2.3: em cada loja entra o real, senão a compra, senão nulo; a rede soma o que vale em cada loja

**Alternativas:** (a) zero quando não há nota; (b) nulo com a frase ("sem nota de compra no período"), nunca R$ 0,00.

**Razão:** (b). Uma casa que não lança nota teria resultado inflado; margem e resultados seguem "sem contar o CMV". A rede soma o que vale em cada loja (rede = Σ lojas, decisão 146) e o selo diz as fontes ("misto: real em …; pelas compras em …; sem o CMV de …"), cabendo nas 120 letras que o banco aceita (perde o motivo, depois os nomes). Loja parada (sem venda, nota nem real) não pesa nem avisa. Sob a linha `cmv` ficam duas de detalhe, `cmv:compra` e `cmv:real`, de tipo `linha` e fora do plano de contas (`garantirPlano` adota linha da casa pelo nome e quebraria); não têm meta.

### 166. 2026-10-17 · ERP 2.3: o painel "compra × real" fica dentro do DRE e diz o que a diferença significa

**Alternativas:** (a) rota nova de CMV; (b) painel na página do DRE, por loja, com a soma das lojas comparadas, só no período encerrado.

**Razão:** (b). Diferença = real − compra = (inicial − final) + (entradas do livro − notas lançadas), em R$ e em pontos da receita. Estoque que sobe: "comprou mais do que consumiu, é dinheiro parado na prateleira"; que desce: "consumiu do que já tinha"; notas que já estavam na contagem de abertura aparecem à parte. Lojas que ficaram só pelas compras dizem o motivo.

### 167. 2026-10-17 · ERP 2.3: fechar grava a fotografia na versão da conta 2, com o CMV; a v1 nunca é recalculada

**Alternativas:** (a) recalcular o CMV das fotografias v1; (b) v2 grava as linhas `cmv`, `cmv:compra`, `cmv:real` da rede e de cada loja e `entrada.cmv` (compra, real, inicial, final, compras do real, instante do retrato, ids do fechamento e da abertura, motivo, sem preço); a v1 mostra "não apurado neste fechamento (fechado antes do CMV)".

**Razão:** (b). Fechado lê só a fotografia (153); para ter CMV, o nível 1 reabre e fecha de novo (154), e a v1 fica nas versões. A leitura do painel numa fotografia extrai do JSON só as lojas do alcance de quem lê. O Histórico do fechamento ganha "cmv: R$ X (real|compras|misto)" atrás de `verDre`. Nenhuma ressalva nova: a de estoque (2.2b) já cobre o que ainda dá para consertar.

### 168. 2026-10-17 · ERP 2.3: a meta da linha CMV compara com o que vale (real ou compras)

**Alternativas:** (a) meta separada para compra e real; (b) uma meta só, na linha `cmv` (já existia desde a 2.2b), comparada com o valor que vale e com o selo da fonte.

**Razão:** (b). A meta é do custo da casa, não da fonte. As duas linhas de detalhe não aceitam meta (`aceitaMeta`) e nem aparecem no formulário de metas. Sem valor (nulo), a linha diz "sem valor apurado", nunca compara com zero.

### 169. 2026-10-17 · ERP 2.3: sem permissão nova; vazamento fechado

**Alternativas:** (a) permissão própria do CMV; (b) `dre.ver` (já é "Ver DRE e CMV"), com o servidor entregando só o alcance.

**Razão:** (b). Sem `dre.ver` nada de CMV; gerente de uma loja só recebe a loja dele (a leitura filtra pelo alcance, também na fotografia, e a base da conta nunca vai para a tela); operador não vê nada. "Ver as notas" só com `compras.ver` e "Ver o estoque" só com `estoque.ver`. CMV não aparece nas telas de estoque. Ajuda: `dre` v3→v4, `dre-plano` v2→v3, `dre-periodo` v1→v2, `periodo` v3→v4, `compra-nova` v2→v3; migration `20261028000000_erp_cmv` aditiva, segura nos três perfis do banco, com o CHECK no `erp:conferir-migracao`; `VERSAO_DO_ERP` "fase 2.3".

### 170. 2026-10-17 · ERP 2.3: transferência entre lojas não existe, e isso é um risco conhecido

**Alternativas:** (a) criar transferência agora; (b) fora desta fase, anotado.

**Razão:** (b). O real da REDE fecha certo; loja a loja distorce (quem manda perde, quem recebe "sobra"). Risco para o Valentin's, onde o endereço só delivery pode abastecer-se do salão. Também fora: CMV teórico (ficha × venda), CMV por canal ou marca, PEPS/médio, desconto e bonificação, tipo "limpeza", perda à mão.

### 171. 2026-10-17 · ERP 2.3 (revisão da UX): o CMV é SUBTRAÍDO da receita líquida; o aviso diz quais lojas ficaram sem CMV

**Alternativas:** (a) mostrar o CMV e deixar a margem e os resultados como na 2.2 (o espaço do CMV era "Em breve"); (b) margem de contribuição = receita líquida − CMV − variáveis, e os resultados herdam; o CMV é o que vale em cada loja (real ou compra), e loja sem CMV não entra na conta.

**Razão:** (b). Era um defeito da primeira entrega da 2.3: o CMV aparecia com valor e a margem continuava igual a antes. A conta mora em `montarDre` (por isso o ao vivo, a fotografia, os cartões do topo, o Histórico e o "Por loja" andam juntos). O aviso passou de "sem contar o CMV" para "sem contar o CMV de Centro" quando só algumas lojas ficam de fora, e segue "o CMV" quando nenhuma tem. Números do cenário (outubro, Casa Alfa): VP receita R$ 120.000,00 − CMV R$ 23.950,00 = margem e resultado R$ 96.050,00; rede R$ 160.000,00 − R$ 27.950,00 = margem R$ 132.050,00 e, com o contador do grupo (R$ 1.000,00), resultado R$ 131.050,00; Centro sem CMV fica em R$ 10.000,00 "sem contar o CMV". Junto: selo da linha CMV por situação (real, parcial, só compras, misto, ausente), painel compra × real em cartões abaixo de 1280 px (a explicação de cada loja em linha própria na tabela larga), "e agora?" no painel, e a contagem de fechamento aplicada mostra o estoque final fotografado no lugar da cobertura contra o piso.

### 172. 2026-10-17 · ERP 2.4: "por canal em todas as linhas com meta" foi lido como "por canal só onde o número nasce no canal"

**Alternativas:** (a) a letra do plano: um farol de cada linha com meta em cada canal (loja, delivery próprio, iFood), o que exige ratear CMV e despesa pela receita; (b) farol por canal só nas linhas que nascem no canal (a receita de cada canal, contra o ano passado) e farol no total nas demais.

**Razão:** (b), desvio consciente da letra do plano, a registrar na seção 8 do Notion. O CMV é a compra da loja e a despesa é da loja (decisão 138); rateá-las pela receita dá ao iFood o MESMO CMV % do salão por construção, três faróis iguais parecem três diagnósticos e são um só, e a margem do iFood sairia pior só pela taxa, escondendo embalagem e motoboy. O dono decidiria (subir preço, sair do iFood) em cima de conta inventada. Regra da casa: sem número é hipótese, e cor é afirmação. As Taxas do iFood têm farol no total (variam com o mix) e nenhum por canal: o % do canal é a taxa configurada, constante, e o farol seria teatro. CMV por canal de verdade só com venda por prato × ficha por canal (CMV teórico, fora, decisão 170). `FarolFaixa` e `DreMeta.canal` seguem sem uso.

### 173. 2026-10-17 · ERP 2.4: cinco faixas fixas no código, em pontos absolutos, com duas escalas

**Alternativas:** (a) limites configuráveis por parceiro (a tabela `FarolFaixa`); (b) limites relativos à meta (10 % acima da meta); (c) `FAIXAS_DO_FAROL` v1, em código, iguais para todo parceiro, em pontos percentuais da receita absolutos.

**Razão:** (c). Uma régua só, para a consultoria comparar clientes e cada casa com ela mesma ao longo do tempo; zero formulário de 5 × N limites; nada a vazar nem a corromper. Pontos absolutos porque 1 ponto da receita é o mesmo dinheiro em qualquer linha, e o dono entende "1 ponto". Com `s` o desvio já com o sentido (positivo = melhor), lido de cima para baixo: custo, margem e resultado: azul s ≥ +3,0 pp, verde ≥ −0,5, amarelo ≥ −1,5, laranja ≥ −3,0, vermelho abaixo; receita (crescimento sobre o ano passado): azul ≥ +5,0 pp, verde ≥ −1,0, amarelo ≥ −3,0, laranja ≥ −6,0, vermelho abaixo. A palavra da faixa SUBSTITUI a da 2.2b (um vocabulário só): bem melhor que a meta · na meta · um pouco pior · pior que a meta · muito pior que a meta; o "na meta" de menos de 5 pontos-base aposentou. O azul numa linha em que menos é melhor traz "confira se está tudo lançado". As constantes são `FAIXAS_DO_FAROL` v1, congeladas (teste de retrato); mudar um limite é a v2, e a fotografia guarda a versão com que foi lida. `FarolFaixa` fica sem uso; sobrescrita por parceiro, um dia, é aditiva.

### 174. 2026-10-17 · ERP 2.4: CMV e despesa têm farol no total, nunca por canal e nunca rateados

**Alternativas:** (a) ratear pela receita do canal e dizer que é hipótese; (b) farol só no total (rede ou loja), e a coluna do canal diz uma vez que compra e despesa são da loja.

**Razão:** (b), pelas razões da decisão 172. O painel de canais traz a frase única "Compra e despesa são da loja, não do canal" e nenhuma cor de custo. Resolve a pergunta que a 2.3 deixou aberta (herança: "a 2.4 decide se o farol do CMV fica só na visão sem canal ou rateia").

### 175. 2026-10-17 · ERP 2.4: a meta da receita é de crescimento sobre o ano passado, de 0 a 100 %, sem migration

**Alternativas:** (a) meta de receita em R$; (b) meta por canal em `DreMeta.canal`; (c) UMA meta de crescimento por linha de receita (bruta e os três canais), no `DreMeta` de sempre com `canal` nulo; (d) meta negativa.

**Razão:** (c). O CHECK de 0 a 10.000 pontos-base já existe, então nenhuma migration: a mesma coluna guarda "percentual da receita" nas linhas de custo e "crescimento" nas de receita (`tipoDaMeta(chave)`). 0 é "igualar o ano passado". O realizado é a variação do canal (pontos-base, divisão exata, `dividirExato`) só com cobertura completa dos dois lados; sentido maior é melhor. Responde a dor do cliente ativo (queda contra o ano passado). Meta em R$ vira "o ano passado × (1 + meta)", derivada. Negativa, em R$ e por loja ficam fora. A receita passou a aceitar meta (a 2.2b a recusava): `aceitaMeta` agora só recusa as duas linhas de detalhe do CMV; as frases de recusa dizem "crescimento".

### 176. 2026-10-17 · ERP 2.4: sem cor quando o dado não fecha; o motivo vem escrito

**Alternativas:** (a) colorir sempre e avisar ao lado; (b) glifo vazio e o motivo, nunca uma cor.

**Razão:** (b). Cor é uma afirmação. Sem cor: comparação inexistente (sem faturamento, sem valor, sem lançamento, ano passado incompleto ou zero, canal que não vendia); falta lançamento de faturamento no escopo (receita baixa infla todo percentual: NENHUMA linha do escopo tem cor, a da rede e a da loja em falta); "sem contar o CMV de Centro" (margem e resultados); despesa que repete todo mês ainda sem lançar (a linha, o subtotal do grupo e os resultados abaixo, nunca o que não depende dela: o falso azul); fechado antes do farol, receita "não apurada". O desvio continua em texto. O CMV "pelas compras · parcial" ou "misto" TEM cor, com o selo da fonte ao lado, MAS o CMV da rede (e o de qualquer escopo de mais de uma loja) fica sem cor quando falta o CMV de alguma loja que vendeu ("Compras, incompleto", "Real, incompleto": "sem o CMV de Delivery"), porque a conta divide o CMV de uma loja pela receita de todas e sai baixo (veto do Guardião: a Penha em +1,5 pp aparecia "na meta" na rede). A cobertura do ano passado é POR LOJA: a receita bruta só tem variação se cada loja ativa do escopo tem lançamento em todos os dias, e a receita de um canal só se cada loja que vende o canal tem todos os dias dele; o motivo traz o nome de quem falta ("ano passado incompleto: Delivery 29 de 30"). Somar as lojas deixava a rede "completa" porque outra loja lançou o dia. Consequência aceita: uma loja ativa nova, sem o ano passado, deixa a receita da rede sem cor até completar um ano (a frase traz o nome dela); comparar só as lojas que já existiam fica para o Rodolfo decidir. Também sem cor: loja que fechou sem nenhum lançamento (ressalva confirmada). A regra mora em `farol-dre-campos.ts` (pura): é a mesma no ao vivo e no fechado.

### 177. 2026-10-17 · ERP 2.4: a cor nunca sozinha; tokens `--ff-farol-*` com contraste medido; cor só no indicador

**Alternativas:** (a) fundo de linha ou borda de card colorido; (b) cor no texto e num glifo, sempre com régua e palavra.

**Razão:** (b). Glifo "régua de 5 casas": cinco quadrados de 10 px, a casa da faixa cheia (azul à esquerda, vermelho à direita), então a POSIÇÃO diz a faixa em escala de cinza; palavra da faixa; desvio ("−1,2 pp"); `aria-label` do glifo com palavra, desvio e "faixa N de 5". Tokens novos dessaturados, medidos nos três blocos de tema sobre `painel`, `fundo` e a linha de resultado (`forte`): ≥ 4,5:1 em todos. Claro: azul #2F5D8A, verde #166534, amarelo #6F6300, laranja #B04400, vermelho #C41522 (o amarelo é oliva e o laranja é queimado: a análise tinha #7A5C00 e #A84B0C, dois marrons que se confundiam). Escuro: azul #8DB4DC, verde #5DBB84 (menos vivo que o #4ADE80 da análise), amarelo #E2C55A, laranja #F0913A e vermelho #F5424D (o #F2323F da análise dava 4,24:1 sobre a linha de resultado; o ajuste é o único desvio da tabela da análise). O `erro` do tema escuro subiu do mesmo #F2323F para #F5424D pelo mesmo motivo: o selo "Sem CMV" sobre a linha de grupo dava 4,42:1 no axe numa tela fechada antiga. Exceção semântica de dado: a cor só aparece em `text-farol-*` e no glifo; nunca `border-`, `bg-`, `ring-`, gradiente ou botão (teste-guarda por grep em `src/`); o vermelho da marca segue único acento decorativo. Sem gradiente, emoji ou ícone de biblioteca.

### 178. 2026-10-17 · ERP 2.4: coluna "Farol" na tabela e um painel modular no topo do DRE, sem rota nova e fora do hub

**Alternativas:** (a) tela nova de faróis; (b) alerta, sino, WhatsApp; (c) coluna na tabela (a pessoa lê a linha e o farol juntos) e um painel no topo da página do DRE.

**Razão:** (c). O painel segue o kit Bento da Kairu (lido pelo MCP, `library:design-mosaico-bento`): blocos modulares que se reorganizam, cada bloco com um propósito, meta também por escrito, o que está incluído dito ("2 lojas incluídas"), dado ausente nunca vira zero. A paleta tonal sálvia/amarelo/coral do kit NÃO entra (a marca e o vermelho único acento mandam; o sistema não usa card com borda colorida): fica a estrutura, na superfície e no tipo da FlowFoods. Um bloco "Faróis do período" (cinco faixas, quantas linhas em cada, as laranja e vermelhas como âncora para a linha da tabela, e as sem cor com o motivo) e um bloco por canal que o escopo vende (receita, % da receita, pedidos, ticket, ano passado, variação, meta de crescimento e farol). Celular: uma coluna, e sob o nome da linha a régua, a palavra e o desvio. "Meta em R$" passou a aparecer a partir de 1280 px (antes de 1024) para a coluna do farol caber. Não entra no hub, no ⌘K, em alerta nem em WhatsApp. Nenhuma rota nova.

### 179. 2026-10-17 · ERP 2.4: a fotografia v3 guarda o ano passado e a versão das faixas; o fechado lê tudo só dela

**Alternativas:** (a) o fechado calcula o farol ao vivo; (b) a v3 grava `entrada.anoPassado` (por loja: o nome, se era exigida, os canais que vendia, os dias com lançamento e, por canal, o total e os dias; a cobertura é lida POR LOJA, igual ao vivo) e `entrada.farol = { versao: 1 }`; a meta de crescimento vai no `metaBp` das linhas de receita; os pedidos vão em `entrada.receitas`.

**Razão:** (b). Editar o faturamento de setembro de 2025 (período antigo ainda aberto) depois de fechar setembro de 2026 não pode mudar o fechado: a leitura extrai do JSON só as lojas do alcance (como o CMV da 2.3), então o gerente nunca recebe o ano passado das outras lojas. O fechado lê as faixas pela versão gravada (`entrada.farol.versao`; versão que o código não conhece não vira cor). Fechado v1/v2: o farol de custo sai das linhas gravadas, com as faixas v1 (mesmo número, só leitura); a receita diz "não apurado neste fechamento (fechado antes do farol)" e nunca se recalcula; o painel "Receita contra o ano passado" da 2.2b segue lendo ao vivo nesses (herança). Reabrir (só o nível 1) e fechar de novo gera a v3. A ressalva de despesa recorrente passou a levar `linhaId` e `grupo` (a v3 sabe quais linhas ficam sem cor; na v2 sem o dado, vale para toda despesa e todo resultado). `gravarFotografia` mantém o padrão 2 para os apoios de teste; o fechamento de verdade grava 3.

### 180. 2026-10-17 · ERP 2.4: nenhuma permissão nova, nenhuma migration, e o texto da ajuda do farol só vai a quem tem `dre.ver`

**Alternativas:** (a) permissão própria do farol; (b) `dre.ver`, com o servidor entregando só o alcance e a ajuda do farol marcada `para: ['dre.ver']`.

**Razão:** (b). Sem `dre.ver` nada de farol: nem na tela, no menu, no ⌘K, no HTML, no Histórico, nem no texto da ajuda que o layout entrega (blocos `para`; teste). Gerente de uma loja só recebe o escopo dele (painel de faróis e de canais, contagem e ano passado), também por `?rede=1` e `?loja=<outra>`. Esquema: nada muda (`DreMeta` já guarda a meta, `entrada` é Json, `versaoDaConta` já aceita 3, `FarolFaixa` fica vazia); `migrate diff` vazio. Ajuda: `dre` v5 → v6 ("O farol: 5 faixas"), `dre-plano` v3 → v4 (meta de crescimento), `dre-periodo` v2 → v3 (a fotografia guarda o ano passado e as faixas); `VERSAO_DO_ERP` fase 2.4.

### 181. 2026-10-17 · ERP 2.4 (herança do fiscal pós-deploy da 2.3): a página do período e as versões antigas dizem "não apurado neste fechamento"

**Alternativas:** (a) deixar o resumo da fotografia v1 dizer "sem contar o CMV" e a linha do CMV da versão antiga mostrar "—"; (b) onde a fotografia é de antes do CMV, o resumo diz "CMV: não apurado neste fechamento (fechado antes do CMV)" e "Ver o DRE desta versão" mostra a mesma frase na linha do CMV.

**Razão:** (b). "Sem contar o CMV" afirma que o CMV existia e foi deixado de fora; na v1 ele não existia. Um traço não explica nada. Coberto por teste sem banco e pela jornada (julho v1 e junho v1 substituída por v2).

> Numeração: as decisões 172 a 189 ficam reservadas à 2.4 (faróis), retirada da branch no commit 650c43b e pendente (código em d1686ce); a 3.1 segue de 190 para não colidir se a 2.4 voltar.

### 190. 2026-10-17 · ERP 3.1: a produção cria a própria requisição dos insumos, na mesma transação; `PRODUCAO_CONSUMO` fica reservado

**Alternativas:** (a) a produção baixa os insumos direto no livro com o tipo `PRODUCAO_CONSUMO`; (b) a produção cria a requisição (setor Cozinha) junto com o lote, e a saída é a `REQUISICAO` da 1.8, entregue pelo estoque.

**Razão:** (b). Quem guarda o estoque entrega e dá baixa, como em qualquer pedido da cozinha; um caminho só de baixa (a requisição) e uma auditoria só. O lote e a requisição nascem na mesma transação (`criarRequisicaoNaTx`), com `requisicaoId` único na ordem (uma requisição, um lote). A requisição do lote não se cancela pela requisição (cancela-se o lote). `PRODUCAO_CONSUMO` segue no enum, sem uso, para uma fase que queira baixar sem requisição.

### 191. 2026-10-17 · ERP 3.1: planejar: código do lote `AAMMDD-NN`, idempotência pela chave do envio, sem data retroativa

**Alternativas:** (a) código sequencial global; (b) `AAMMDD-NN` por loja e dia, tirado sob trava do dia, nunca reaproveitado; data de hoje a 14 dias; chave de idempotência do envio.

**Razão:** (b). O código diz o dia e dá o número sem buraco, e o lote cancelado mantém o dele. Duplo clique ou reenvio devolve o mesmo lote (`@@unique([parceiroId, chaveIdempotencia])`). Produção retroativa fica fora: mexer no passado pede o período aberto e um motivo, e é decisão de negócio (pendência para o Rodolfo).

### 192. 2026-10-17 · ERP 3.1: concluir exige a requisição ATENDIDA

**Alternativas:** (a) concluir com o que já saiu; (b) concluir só quando a requisição está atendida (entregue ou encerrada).

**Razão:** (b). O custo do lote é o que saiu de fato: concluir com a requisição aberta fecharia um custo que ainda muda. A tela diz o que falta ("Faltam sair 885 g de Cebola branca pela requisição #N: entregue ou encerre o resto."). Sobra de insumo volta pela devolução da requisição, antes de concluir.

### 193. 2026-10-17 · ERP 3.1: rendimento: fora de ±10% pede motivo; produzido 0 é lote perdido

**Alternativas:** (a) aceitar qualquer quantidade; (b) faixa de ±10% do planejado (estrito: exatamente 10% passa), com motivo obrigatório fora dela; zero é lote perdido (motivo obrigatório, sem entrada).

**Razão:** (b). O rendimento real é o dado mais útil da cozinha e a diferença sem explicação some. Teto de 2x o planejado (digitação). A faixa é única para todas as fichas: se um pré-preparo precisar de faixa própria, é campo novo na ficha (pendência para o Rodolfo). No lote perdido o custo dos insumos fica registrado como perda e nada entra no estoque.

### 194. 2026-10-17 · ERP 3.1: custo do lote = baixas reais ÷ quantidade, em fração exata, nunca gravado

**Alternativas:** (a) gravar o custo por unidade na ordem; (b) gravar só o total em centavos que saiu e calcular o custo por unidade na tela, em fração.

**Razão:** (b). Um centavo por kg arredondado e gravado distorce o valor da entrada; a fração exata não. O total é a soma das baixas da requisição (R$ 117,81); 4,6 kg dão R$ 25,61/kg, ao lado dos R$ 23,56/kg que a ficha prevê hoje, com rendimento de 92% e a diferença de 400 g custando R$ 9,42. Insumo que saiu sem preço deixa o custo incompleto (`insumosSemPreco`, com a frase). Só quem tem `insumos.ver` recebe valor: o servidor monta a tela sem ele.

### 195. 2026-10-17 · ERP 3.1: o lote entra no insumo produzido da mesma loja, sem sub-estoque de produção

**Alternativas:** (a) estoque de produção separado do da loja; (b) `PRODUCAO_ENTRADA` no insumo que a ficha produz, na loja da ordem, com `ordemProducaoId`.

**Razão:** (b). O molho pronto é insumo como qualquer outro (a próxima ficha o consome pela requisição). O banco confere por gatilho (`MovimentoEstoque_producao_confere`): entrada só no insumo produzido da ficha e na loja da ordem, até com SQL cru; o CHECK `producao_entrada_tem_ordem` exige a ordem. Concluir duas vezes (duas abas) põe uma entrada só.

### 196. 2026-10-17 · ERP 3.1: a validade é escolhida na conclusão e guardada como retrato

**Alternativas:** (a) a validade segue a ficha; (b) o cozinheiro escolhe a conservação (refrigerado ou congelado) ao concluir e a validade (`validadeEm`) e a conservação ficam gravadas na ordem.

**Razão:** (b). O lote vence quando foi guardado, não quando a ficha diz hoje: mudar a ficha depois não muda o lote. A tela diz quando vence em cada conservação ("vence 20/10 às 10:00" no refrigerado de 3 dias, 16/11 no congelado de 30). Sem conservação na ficha o lote conclui sem validade, e a tela avisa.

### 197. 2026-10-17 · ERP 3.1: cancelar só com saída líquida zero; estornar exige `estoque.ajustar`

**Alternativas:** (a) cancelar a qualquer hora, devolvendo o que saiu; (b) cancelar só quando nada saiu ou tudo voltou pela devolução; estornar o lote concluído por quem ajusta o saldo.

**Razão:** (b). Cancelar com insumo na rua esconderia a perda. Cancela a requisição junto, com motivo. O estorno do lote concluído é o espelho exato da entrada (gatilho do livro da 1.6), pede motivo e deixa a ordem CANCELADA guardando a conclusão ("Estornada"); estoque insuficiente exige confirmação explícita. Ordem concluída ou cancelada não muda por SQL cru (`OrdemProducao_concluida_imutavel`).

### 198. 2026-10-17 · ERP 3.1: a trava do período vale na conclusão, no estorno e também em atender e devolver da requisição

**Alternativas:** (a) só a conclusão respeita o período fechado; (b) toda escrita no livro que a produção provoca respeita o período, inclusive atender e devolver (uma lacuna da 1.8).

**Razão:** (b). Entregar insumo num período fechado do DRE mudaria o CMV já fotografado. Atender e devolver ganharam `conferirPeriodoAberto`; a recusa diz o período e a saída ("peça à FlowFoods para reabrir o período"). Provado com testes mutantes: tirar a conferência de qualquer das quatro operações derruba o teste.

### 199. 2026-10-17 · ERP 3.1: ordem fixa das travas: período → abertura da loja → requisição → ordem → saldos

**Alternativas:** (a) cada operação trava na ordem que lhe convém; (b) uma ordem única, a mesma em todo caminho (a trava do período é compartilhada, a de fechar é exclusiva).

**Razão:** (b). Concluir e entregar disputam a mesma requisição e os mesmos saldos; sem ordem fixa há deadlock. Provado segurando `travarParaFechar` e vendo concluir, atender, devolver e estornar esperarem (cerca de 900 ms) e seguirem ao soltar.

### 200. 2026-10-17 · ERP 3.1: os quadros ganham um esqueleto comum; atraso = borda esquerda vermelha + "Xd de atraso"

**Alternativas:** (a) copiar o quadro da 1.8 para a produção; (b) `telas/quadro/quadro.tsx` (`GradeDoQuadro`, `ColunaDoQuadro`, `CartaoDoQuadro`) e os três quadros (0.5, 1.8, 3.1) usam o mesmo.

**Razão:** (b). Regra Nº 2: um componente só. O quadro da 0.5 segue com filete de 2 px e o da 1.8 e o da produção com 3 px (provado na tela). A cor nunca é o único sinal: o atraso diz "2d de atraso". O cartão cancelado ficou sem opacidade (o texto perdia contraste no axe) e usa o fundo da página.

### 201. 2026-10-17 · ERP 3.1: área Produção ativa, sem permissão nova; o custo do lote só com `insumos.ver`; migration aditiva

**Alternativas:** (a) permissões novas de produção e custo; (b) `producao.ver` e `producao.registrar` (já no catálogo) bastam, o custo segue `insumos.ver`, e o grupo `etiquetas` nasce em breve.

**Razão:** (b). O operador da cozinha produz e não recebe valor. O Histórico fala "Lote" (Planejou, Iniciou, Concluiu, Cancelou, Estornou) e tira os campos de custo de quem não vê custos. A migration `20261029000000_erp_producao` é aditiva e tolerante a dado antigo: CHECKs `NOT VALID` + `VALIDATE` em bloco que avisa, índices únicos em bloco que apanha `unique_violation`, nenhum passo depende de SELECT sob RLS (superusuário, dono com FORCE RLS e dono sem RLS provados com dado antigo). `erp:conferir-migracao` lista o que ficar pendente.

### 202. 2026-10-21 · Revisão visual: referência principal Kairu Editorial; Dark v2 descartado como base; Corporativo nas tabelas

**Alternativas:** (a) seguir o Kairu Dark como base, como dizia o plano; (b) trocar a base para o Kairu Editorial (o mais perto da identidade FlowFoods) e manter o Corporativo nas tabelas densas.

**Razão:** (b). Lido pelo MCP da Kairu em 21/10 (material real, não só o nome): o Dark agora é a versão 2.0.0, com vidro (blur), luz violeta, gradientes e raio 24 — conflita com a identidade FlowFoods (gradiente proibido) e com o fiscal anti-"cara de IA". O Editorial pede o que a FlowFoods já é: título serifado, tons naturais, separadores delicados, sidebar creme de 208–240 px, números de tabela sem serifa, unidade ao lado do número, nada de texto introdutório empurrando o trabalho. A cor do Editorial (verde floresta) não entra: o kit manda preservar a marca do projeto, e o acento segue o vermelho FlowFoods. As prévias em imagem dos kits não abriram nesta sessão (rede bloqueada, proxy 403): a escolha usou o texto, o DESIGN.md e o código do kit.

### 203. 2026-10-21 · A caixa "Como funciona" mora abaixo do título da tela, não acima

**Alternativas:** (a) caixa no topo do `<main>` (antes do título); (b) caixa dentro do `PageHeader`, entre o título e a busca/filtros.

**Razão:** (b). Na 1ª visita a caixa (com a pergunta das dicas) ocupava a primeira dobra inteira e o título da tela aparecia depois dela. O título vem primeiro, a aula depois. O shell continua montando a caixa (conhece a rota e a preferência); o `PageHeader` a desenha por um contexto (`ContextoDaCaixa`). As 151 telas usam o `PageHeader`; a varredura de 70 telas (dona) e 25 (operador) confirmou caixa presente e abaixo do h1 em todas. O título em serifa dentro da caixa saiu (repetia o h1 logo acima): fica o rótulo "Como funciona" e o nome da tela para o leitor de tela.

### 204. 2026-10-21 · Tablet é toque: alvos de 44 px por `pointer: coarse`, não pela largura

**Alternativas:** (a) tamanhos só pela largura (44 px abaixo de 600 px; 40/42/36 acima); (b) a largura decide o desenho e o tipo de ponteiro decide o tamanho do alvo.

**Razão:** (b). Um tablet deitado (1180 px) recebia o botão de 40 px e o link do filtro de 36 px, feitos para mouse. Uma regra só em `tokens.css` devolve 44 px a tudo que encolhe a partir de 600/900 px quando o ponteiro é o dedo; link de texto na tabela e na trilha ganha área de toque invisível de 44 px sem mudar a altura da linha.

### 205. 2026-10-21 · Hub em 2 colunas também no celular (Ref.1 vence o kit)

**Alternativas:** (a) 1 coluna abaixo de 600 px (kit); (b) 2 colunas, como pede a Ref.1 do plano ("4 no desktop, caindo pra 2 no celular").

**Razão:** (b). No celular o card fica compacto (ícone, nome, descrição em até 3 linhas) e os links das abas somem: o card abre a área, e as abas estão no topo dela. A tela inicial do celular caiu de 2.369 px para 1.519 px de altura.

### 206. 2026-10-21 · Menu sem grupo de um item só; vermelho de erro mais claro no escuro

**Razão:** "INSUMOS › Insumos" repetia o item no cabeçalho do grupo: grupo com um item vira o item direto. O vermelho de erro no tema escuro (#F2323F) dava 4,42:1 sobre a linha destacada da tabela (selo "Sem CMV" no DRE), abaixo de AA; passou a #F5525A (≥ 4,99:1 em todas as superfícies escuras). A marca ("Foods") não muda.

### 207. 2026-10-21 · ERP 2.4 volta: na receita BRUTA, cada canal que a loja precisa cobrir conta dia a dia (fim do "falso azul")

**Alternativas:** (a) o dia da loja conta como coberto se ela lançou algum canal; (b) o dia só conta se cada canal que ela precisa cobrir foi lançado.

**Razão:** (b). Com (a), a loja que lançou o salão e esqueceu o iFood de um dia somava um ano passado menor e a receita bruta da rede pintava de azul ("bem melhor") quando o certo era pior — e isso ficaria congelado na fotografia do período fechado (2ª reprovação do Guardião, 17/10). Precisa cobrir: o canal que a loja vende hoje e que existia no ano passado (alguma loja lançou), e o canal que ela mesma lançou. Canal que nenhuma loja lançou "não vendia" e não trava (a mesma regra que a linha do canal já usava). O motivo diz a loja e o canal ("Vila da Penha (iFood) 19 de 20"). A fotografia guarda os dias por canal desde a v3: o fechado aplica a mesma regra sem migration. Rodolfo liberou a rodada de correção em 21/10 ("siga sempre de maneira autônoma").

### 208. 2026-10-21 · ERP 2.5: orçamento de compra = meta do CMV × receita prevista − já comprado; aviso, nunca bloqueio

**Alternativas:** (a) bloquear a nota que estoura; (b) orçamento sobre a receita realizada até ontem; (c) orçamento do período inteiro sobre a receita PREVISTA, com o "já comprado" do período inteiro (notas lançadas pela data da nota, valor + frete rateado, a mesma soma do CMV de compra da 2.3, agora até o fim do período: a nota de hoje já conta), e só aviso.

**Razão:** (c). A pergunta do comprador é "quanto ainda cabe neste período"; sobre a realizada, todo começo de mês dá negativo (a casa abastece antes de vender). Bloquear trava a cozinha por causa de uma conta prevista; a regra da casa é "nada aplicado sem estar combinado", então a tela avisa (prévia "Conferir o impacto" e detalhe da nota) e quem decide é a pessoa. Só o período EM CURSO tem orçamento; nota com data em outro período diz isso. Loja desativada fica fora (não compra). A soma das compras é UMA: `comprasPorLoja` saiu de `cmvDasLojas` (`cmv.ts`) e serve o DRE e o orçamento; a prévia da edição tira a versão gravada da própria nota (`semNotaId`) para não contar duas vezes. Sem migration, sem permissão nova (`compras.ver`/`compras.lancar` para ver; `dre.ver` para a conta).

### 209. 2026-10-21 · ERP 2.5: receita prevista = vendido nos dias completos + cada dia que falta pela média do mesmo dia da semana nas últimas 4 semanas (hipótese)

**Alternativas:** (a) ritmo até ontem × dias do período (linear); (b) o mesmo período do ano passado × variação; (c) por loja: o vendido nos dias do período com faturamento COMPLETO (cada canal que a loja vende lançado, a regra da 207) + cada dia que falta (hoje até o fim) e cada dia sem lançamento completo pela média do mesmo dia da semana nos dias completos das últimas 4 semanas (28 dias antes de hoje, atravessando o período anterior); com menos de 14 dias completos na janela, sem número. (Corrigido na 1ª rodada, decisão 214: dia da semana sem amostra conta como zero, não pela média geral; dia antes do primeiro lançamento da loja fica fora.)

**Razão:** (c). A decisão 145 recusou projetar no DRE porque "ritmo × dias restantes ignora fim de semana e dia de pagamento". O orçamento é previsão por natureza, então a projeção entra SÓ aqui, e trata o fim de semana: num outubro com 5 sábados a linear erra (R$ 40.300,00 contra R$ 41.000,00 no teste). A janela de 4 semanas dá número desde o 1º dia do período (é quando a casa faz a compra grande), o que (a) e um mínimo de dias do próprio período não dariam. (b) exige um ano de lançamentos (cliente novo não tem) e ainda erra o dia da semana. Dia sem lançamento nunca vale zero (receita a menos = orçamento a menos: "orçamento sobre receita incompleta mente igual", herança da 2.4): entra pela média e a tela diz quantos. Hipóteses para o Rodolfo validar com o Valentin's: o dia de pagamento e a sazonalidade do mês (feriado, fim de ano) NÃO entram; 4 semanas e o mínimo de 14 dias são escolha, não medida.

### 210. 2026-10-21 · ERP 2.5: quem não vê o DRE recebe só o "cabe", sem a conta (o arredondamento foi refeito na decisão 213)

**Alternativas:** (a) o comprador vê a conta inteira; (b) o comprador vê só o "cabe" exato; (c) o comprador vê o "cabe" arredondado e nada mais; (d) o comprador vê só uma faixa (cabe/passou), sem número.

**Razão:** (c). Ver o orçamento é de quem vê ou lança nota (`compras.ver` ou `compras.lancar`, na loja); a conta inteira (receita prevista, vendido, meta, teto, já comprado, CMV até ontem e o farol do ritmo) só com `dre.ver` NA loja (e, na linha da rede, com a rede inteira). Quem tem só `faturamento.ver` também não recebe a conta (a meta é do DRE). O servidor monta a vista (`orcamento.ts`): a página nunca recebe o que a pessoa não vê, nem no HTML nem no payload (teste de banco e de página). **Corrigido na 1ª rodada (veto do Guardião, decisão 213):** a primeira versão arredondava o SALDO a R$ 100 e afirmava que a prévia não achava o centavo; estava errado (15 prévias de edição davam a faixa de R$ 8,29, e lançar e cancelar 14 notas dava o centavo exato), e a frase "a receita prevista, não a realizada" também (no fim do período a prevista é quase toda realizada). Agora quem arredonda é o TETO, em degraus por faixa.

### 211. 2026-10-21 · ERP 2.5: cobertura por loja e o farol do ritmo das compras

**Alternativas:** (a) somar a rede e depois conferir; (b) a rede só tem número quando cada loja ativa tem; o farol é o da 2.4 sobre o CMV pelas compras até ontem.

**Razão:** (b), herança da 2.4 ("somar primeiro esconde o buraco de uma loja atrás da outra"). Uma loja sem número deixa a rede sem número com o nome dela ("sem o orçamento de Centro"); as outras seguem com o delas. O farol (`faixaDoDesvio`, escala de custo, menos é melhor) é o "ritmo das compras": CMV pelas compras até ontem sobre a receita até ontem contra a meta, a mesma conta da linha do CMV no DRE do período em curso. Sem cor (a regra de `farolDoDre`): algum dia do período sem lançamento completo em alguma loja do escopo, ou uma loja que vendeu sem nota até ontem (CMV zero não é "bem melhor"). O número do orçamento existe nesses casos (os dias entram pela média); a cor, não. Hipótese para o Rodolfo: a compra grande do começo do mês acende o farol mesmo cabendo no orçamento; a ajuda diz isso ("o farol fala do ritmo, o orçamento fala do período").

### 212. 2026-10-21 · ERP 2.5: o orçamento mora na área Compras (aba nova), na prévia da nota e no detalhe da nota; nada no DRE

**Alternativas:** (a) painel dentro do DRE; (b) aba "Orçamento" em Compras (`/compras/orcamento` e o espelho do nível 1), a linha "Orçamento de compra" na prévia "Conferir o impacto" e o aviso no detalhe da nota lançada do período em curso.

**Razão:** (b), pelo fluxo do comprador: ele está em Compras e decide na hora de lançar a nota; o DRE é a tela da reunião e já tem a linha do CMV com o farol. O detalhe da nota avisa como ficou ("passou R$ 700,00 do orçamento de compra… A nota está lançada: o orçamento avisa, não bloqueia"), com link para a aba. Nada de hub novo, ⌘K, sino ou WhatsApp. Ajuda: `compras-orcamento` nova (os blocos da conta e do ritmo são `para: ['dre.ver']`; o do arredondado, para todos), `compra-nova` v3 → v4 e `compra` v2 → v3; lock regravado (53 entradas). `VERSAO_DO_ERP` continua "fase 3.1": o rodapé mostra a fase mais alta no ar, e a 2.5 é anterior a ela.

### 213. 2026-10-21 · ERP 2.5 (1ª rodada, veto do Guardião; degraus decididos pelo Maestro): arredonda-se o TETO, nunca o saldo, em degraus fixos por faixa

**Problema:** o "cabe" arredondado a R$ 100 vazava. O saldo é teto − compras, e as compras o comprador conhece e muda: comparando prévias de edição (cada uma tira um valor gravado diferente) ou lançando e cancelando notas de valores escolhidos, ele achava a fronteira do arredondamento e, dela, o centavo do saldo, do teto e da receita prevista (ataques reproduzidos pelo Guardião: faixa de R$ 8,29 com 15 prévias; centavo exato com 14 lançamentos e cancelamentos).

**Alternativas:** (a) arredondar o saldo em degraus maiores; (b) arredondar o TETO (o único termo que depende da receita) e mostrar teto arredondado − compras; (c) só status, sem número ("cabe com folga / cabe pouco / passou").

**Razão:** (b), com os degraus do Maestro. Quem não tem `dre.ver` recebe o teto arredondado PARA BAIXO (nunca maior que o real), em degraus fixos por faixa do teto: abaixo de R$ 10.000,00, R$ 500,00; de R$ 10.000,00 a menos de R$ 50.000,00, R$ 1.000,00; de R$ 50.000,00 para cima, R$ 5.000,00 (`degrauDoTeto`, `tetoArredondado`). O "cabe" dele = teto arredondado − já comprado; a prévia = teto arredondado − (já comprado − valor gravado da nota em edição) − a nota; o detalhe, idem. Compras e prévias só deslocam um número que já não tem o centavo do teto (teste puro e os dois ataques refeitos no banco: todo caminho devolve R$ 12.000,00 para um teto real de R$ 12.300,00). A rede de quem não vê a receita é a SOMA dos tetos arredondados das lojas, então bate com o "Por loja" (resolve o achado M6: rede 6.500 ≠ 2.300 + 4.100). A tela diz uma vez, no subtítulo do painel, "Pelo teto arredondado para baixo, sem a receita", e a prévia diz que parte dele.

**Hipótese para o Rodolfo (números do Guardião, corrigidos na rodada extra):** o teto continua sendo meta × receita prevista. Com meta de 30 %, quem vê só o limite seguro sabe a receita prevista com erro de ±1 % a ±5 % (teto a partir de R$ 6 mil; ±1,4 % numa loja de R$ 120 mil por mês), e no fim do período a prevista é praticamente a realizada. A escolha do Rodolfo: os degraus, OU a alternativa (c), só "cabe com folga / cabe pouco / passou", sem número (muda só a vista resumida).

**Risco aceito (Guardião, decisão do Maestro):** quem vê o faturamento mas não vê o DRE consegue descobrir a meta do CMV em cerca de 14 dias, comparando a receita que vê com o limite seguro. Aceito: a meta não é dado sensível como a receita; se o Rodolfo não quiser nem isso, a alternativa só status resolve também.

### 214. 2026-10-21 · ERP 2.5 (1ª rodada): dia antes do primeiro lançamento da loja não existe; dia da semana sem amostra conta zero

**Problema:** (1) a loja que abriu no meio do período (05/10) tinha os dias 01 a 04 projetados pela média (receita fantasma de quem ainda não vendia) e contados como "sem lançamento"; (2) o dia da semana sem nenhuma amostra nas 4 semanas (a loja que não abre segunda) entrava pela média geral, inventando receita.

**Razão:** (1) Coerente com `canaisEmFalta` (antes do 1º lançamento não é falta): esses dias não entram no vendido, na projeção, em `diasSemLancamento` nem na frase "faturamento de N dias ainda não foi lançado"; a conta por extenso diz "N dias antes do primeiro lançamento da loja ficaram fora". (2) Decisão do Maestro: projeta ZERO (o lado prudente), com a frase do motivo ("segunda sem venda lançada nas últimas 4 semanas: conta como zero"). Testes: a loja de 05/10 (puro e banco: 4 dias fora, 16 completos, R$ 35.000,00 previstos) e o sábado sem amostra.

### 215. 2026-10-21 · ERP 2.5 (1ª rodada): a loja que vendeu e não tem nota no período nunca aparece como "já comprado R$ 0,00" calado

**Razão:** "cabe o teto inteiro" numa loja que vendeu e não lançou nenhuma nota é quase sempre nota esquecida. Condição: vendeu no período (algum dia com venda lançada) e nenhuma nota com data no período. A tela mostra "sem nota de compra" no lugar de R$ 0,00 no "já comprado" e o aviso "vendeu no período e não tem nota de compra: o que cabe é o teto inteiro, confira se falta lançar nota", também para o comprador (vista resumida: `semNota`) e na linha da rede; a prévia da primeira nota diz que o "antes" é o teto inteiro. O farol do ritmo segue sem cor nesse caso (decisão 211).

### 216. 2026-10-21 · ERP 2.5 (1ª rodada, revisão de UX): a rede diz quem passou, e o "Por loja" fica na primeira dobra

**Razão:** cada nota é de uma loja só; o número da rede somava a sobra de uma loja ao estouro da outra e escondia quem passou. Agora, logo abaixo do número da rede, em `erro`: "<Loja> já passou R$ X: a sobra de outra loja não cobre" (pelo número que a pessoa vê: exato com `dre.ver`, pelo teto arredondado sem). Desenho: o número e o "Por loja" no MESMO painel, lado a lado a partir de 1280 px, e a caixa "Como funciona" recolhida (abre sozinha só com a pergunta da 1ª vez), para a loja que passou ficar na primeira dobra em 1440 × 900; a conta por extenso e o ritmo vão para o painel "Como a conta chega aqui", só de quem vê a receita, com a linha "O farol olha o ritmo das compras até ontem; o número de cima olha o período inteiro". Tabela Corporativo de uma linha por loja (44 px: "R$ 15.603,00" ou "passou R$ 3.216,00" em `erro`); para quem não vê a receita, lista de largura limitada; no celular o nome da loja em linha própria. Na conta, "= passou R$ X" em vez de "−R$". A prévia põe o orçamento logo abaixo de "Itens + frete = …"; "Vale combinar com quem define as metas" só para quem não define; o detalhe de uma nota antiga diz "Hoje, …" (ela não causou sozinha o estouro). Sem meta, quem vê a receita vê a receita prevista e o link para Plano e metas; sem faturamento, o link "Lançar o faturamento" para quem lança. O rodapé que repetia a ajuda saiu. Toque: link dentro de aviso (`[role=status] a`) e o link marcado `ff-toque` ganham 44 px no `pointer: coarse` (`tokens.css`). `textoDoPercentual` e `textoDosPontos` (`dre-campos.ts`) passaram a usar espaço que não quebra ("+7,6 pp" não se parte; vale para o DRE inteiro, testes ajustados). Ajuda `compras-orcamento` v1 → v2 (recolhida; a sobra que não cobre; teto arredondado; os dias fora e o zero).

### 217. 2026-10-21 · ERP 2.5 (rodada extra, revisão de UX): para quem não vê o DRE o número é o "limite seguro", nunca "orçamento"

**Problema (UX, bloqueante):** com o teto arredondado para baixo, a tela do comprador afirmava estouro que não existe (a dona via "cabe R$ 303,00"; o comprador, "Vila da Penha já passou R$ 300,00", no detalhe e na prévia), e falava em "teto", palavra que ele nunca vê definida. Também: rolagem lateral (174 a 334 px) com uma loja sem número (o motivo longo na coluna Teto e o farol sem cor com `whitespace-nowrap`).

**Razão:** só texto e apresentação, sem tocar na conta, nas permissões nem no isolamento. Na vista resumida a palavra é "limite seguro": "cabe R$ X no limite seguro" / "acima do limite seguro em R$ X", tom de ATENÇÃO (nunca erro), e o subtítulo "Valor aproximado, sempre para menos: a conta exata pode ter mais folga e fica com quem vê o DRE." (só quando há número). O mesmo na tela, na prévia ("Com esta nota, fica acima do limite seguro em R$ X"), no aviso do detalhe e na linha da rede ("<Loja> está acima do limite seguro em R$ X"); "orçamento", "passou" e "teto" não aparecem para essa pessoa nos textos do número (teste): o bloco da prévia se chama "Limite seguro de compra", o link do detalhe "Ver o limite seguro" e o "Por loja" diz "o limite também" (o nome da tela, "Orçamento de compra", fica). **Escolha dos centavos:** os valores dessa vista são EXIBIDOS em degraus de R$ 100 para o lado de menos folga (cabe: para baixo; acima: para cima; "cabe menos de R$ 100,00"), em vez de "aprox.": coerente com "sempre para menos" e sem centavos que pareçam exatos (`aproximado`, `fraseDoLimite`; é só exibição, a conta segue a da decisão 213). A ajuda explica em uma frase: "quem não vê o DRE vê o limite seguro, um valor aproximado e sempre para menos" (`compras-orcamento` v3). Tabela: a célula de quem não tem número diz só "sem número", o motivo vai uma vez sob o nome da loja, em 12 px, quebrando linha; o farol sem cor não tem mais `whitespace-nowrap`; o cabeçalho "Receita prevista" virou "Prevista" (o nome inteiro no `title` e para o leitor de tela). Na rede, a loja sem faturamento é nomeada e o link "Lançar o faturamento" segue (os motivos das lojas também acendem a saída); "Como a conta chega aqui" com a rede sem número diz por quê, em vez de um espaço em branco; o aviso "sem número" do detalhe começa pelo nome da loja; a prévia vem para a vista depois de "Conferir o impacto" (`scrollIntoView`, sem animação com `prefers-reduced-motion`). Revisão do Guardião (menor): dia incompleto num dia da semana sem nenhuma amostra completa vale o que foi lançado nele (piso), e a frase passou a "sábado sem dia completo nas últimas 4 semanas: conta só o que já foi lançado" (a anterior, "sem venda lançada", era falsa quando um canal foi lançado).

### 218. 2026-10-21 · ERP 3.2: a lista do dia tem tabela própria (uma por loja e dia); a "lista derivada das ordens" da 0.1 fica superada

**Alternativas:** (a) a lista do dia é derivada das ordens PLANEJADAS da data × saldo, sem tabela (o comentário da 0.1 em `OrdemProducao`); (b) tabelas `ListaProducao` (loja × dia, única) e `ListaProducaoItem` (pré-preparo, quanto, retrato do nome e da unidade, e o lote que a linha virou).

**Razão:** (b). Com (a), montar a lista seria planejar lotes: cada linha já mandaria uma requisição ao estoque e mudar uma quantidade seria cancelar e planejar de novo. O gerente precisa de um rascunho do dia que cruze com o estoque ANTES de virar lote ("o que falta comprar para a produção de amanhã"). A linha guarda o lote (`ordemProducaoId` único): um lote por linha, e o lote não sabe da lista (a 3.1 não muda). Migration aditiva, com `parceiroId`, FKs compostas, CHECKs de nascença, RLS + FORCE + política, gatilhos e o conferidor pós-deploy; o comentário do esquema foi reescrito.

### 219. 2026-10-21 · ERP 3.2: permissão nova `producao.planejar` ("Definir a lista do dia"), fora do operador

**Alternativas:** (a) usar `producao.registrar` para montar a lista; (b) usar uma permissão sem relação (`estoque.ajustar`, `requisicao.atender`); (c) permissão nova `producao.planejar`, por loja.

**Razão:** (c), inevitável: `producao.registrar` é do operador (a cozinha planeja e conclui lotes na 3.1), e o plano diz "gerente/permitido define o que produzir"; com (a) o operador montaria a lista; (b) daria a lista a quem ajusta saldo ou entrega requisição, sem ligação com produzir. Dono e gerente recebem pelo perfil base (que deriva do catálogo); o operador não. `VERSAO_DO_CATALOGO` subiu para 2.

**Correção (rodada 1 dos fiscais, decisão do Maestro):** perfil próprio salvo na v1 com TODAS as permissões da v1 (o "copiado do Dono", o sócio administrador) ganha `producao.planejar`. Sem isso, a permissão nova do Gerente e do Dono base deixava o sócio sem cobri-los (`cobre`): ele não editava, não desativava nem gerava link para eles, e não podia se dar a permissão. Não é escalada (já tinha tudo). A migration `20261030010000_erp_catalogo_v2` grava no banco (só dado; `PerfilAcesso` fica fora do tenant, sem RLS; rodar de novo não muda nada). A regra também está em código (`permissoesNoCatalogoAtual`, pela versão gravada no perfil), para o perfil que o app antigo salvar durante o deploy. Os demais perfis próprios não ganham nada sozinhos: a Equipe avisa "Perfil do catálogo antigo: revise se ele deve definir a lista do dia (o que a loja produz)"; salvar o perfil leva para a v2 (o que foi marcado vale). Perfil salvo na v2 sem a permissão fica sem (foi escolha de quem salvou). Ver a lista continua `producao.ver` (o rótulo da 0.4 já dizia "Ver a produção e a lista do dia"): a cozinha lê. Gerar os lotes também é `producao.planejar` (decisão do gerente); a 3.3 pode abrir "pegar da lista" a quem registra produção.


**Registro (revisão final do Guardião):** a promoção do perfil v1 completo pela migration de dado não gera linha no Histórico do perfil (a migration roda sem o contexto de um parceiro). O motivo e a data ficam aqui: em 21/10/2026, todo perfil próprio que tinha TODAS as permissões do catálogo v1 passou a "Definir a lista do dia".
### 220. 2026-10-21 · ERP 3.2: vai usar = a receita BRUTA arredondada como a requisição do lote; comprar = max(0, vai usar − tem), na unidade do insumo

**Alternativas:** (a) custo/quantidade da ficha em fração exata, arredondada só no total; (b) a mesma conta da requisição (`quantidadesDaFicha`: líquido × fator × quanto ÷ rendimento, um arredondamento por insumo e linha).

**Razão:** (b). O "vai usar" tem de ser o que a requisição do lote vai pedir: quando a linha vira lote, nada muda na tela (provado no banco: a conta antes e depois de gerar é igual). Tudo na unidade base do insumo (kg/g, L/ml, un), com a unidade ao lado; caixa não se converte sem fator: a embalagem padrão aparece só como apoio quando o conteúdo é declarado e diferente de 1 kg/1 L/1 un ("≈ 2 embalagens de 900 ml"). Comprar com a palavra ("falta 500 ml" em vermelho; "dá" em verde): a cor nunca é o único sinal.

### 221. 2026-10-21 · ERP 3.2: pré-preparo dentro da receita: primeiro o que tem, depois o que a lista produz; o que falta entra em cascata

**Alternativas:** (a) sem cascata (o pré-preparo da receita conta como insumo, como na requisição da 1.8); (b) cascata cega até o fundo, ignorando o estoque do pré-preparo; (c) cascata com estoque: o pré-preparo usado vem do saldo dele e do que a própria lista produz; só o que ainda falta entra pela receita dele (ordem topológica das fichas, até o fundo).

**Razão:** (c). (a) esconde a cebola que falta para fazer a base que o molho usa; (b) manda comprar cebola para uma base que já está pronta na câmara. A tela mostra o pré-preparo à parte ("vai usar · tem · na lista · falta produzir") e o botão "Pôr na lista" o transforma em linha (aí a conta passa a vir da linha, com o mesmo total). Círculo forçado no banco não entra em laço (aviso). Hipótese para o Rodolfo: "Pôr na lista" sugere exatamente o que falta, sem lote mínimo nem embalagem fechada (a política de lote do Kairu é do robô do cronograma, fora desta subfase).

### 222. 2026-10-21 · ERP 3.2: sem segunda baixa: a linha que virou lote conta só o que falta sair pela requisição dele

**Alternativas:** (a) a linha conta a receita inteira até o lote ser concluído; (b) a linha em lote conta o que ainda falta SAIR pela requisição (pedido − saído líquido, com a requisição aberta ou em parte); concluído não conta.

**Razão:** (b). O que já saiu está no saldo; com (a) o mesmo cheddar contaria no "tem" (a menos) e no "vai usar" (a mais), e o comprar dobraria. Provado no banco: entregar a requisição do molho baixa uma vez e o "comprar" de todos os insumos fica igual. O insumo que o lote tirou e deixou abaixo de zero continua na conta (vai usar 0, comprar = o buraco), senão o "comprar" sumiria na entrega. Os lotes do mesmo dia planejados fora da lista (Nova produção) aparecem na tela e entram na conta pela mesma regra: a lista do dia mostra a produção do dia inteira.

### 223. 2026-10-21 · ERP 3.2: saldo negativo é alarme e entra na conta; loja sem saldo apurado = frase, nunca "tem 0"

**Alternativas:** (a) travar ou zerar o negativo; (b) negativo como está: comprar = vai usar − (−X), com "abaixo de zero" escrito; (c) sem abertura de estoque, mostrar 0.

**Razão:** (b), como pede o Kairu ("o negativo é o alarme"): o livro abaixo de zero fica à vista no "tem", no resumo ("1 abaixo de zero no livro") e na compra. Hipótese para o Rodolfo: se o negativo for quase sempre nota esquecida, o comprador compra a mais; a alternativa é contar o negativo como zero e só avisar (muda uma linha de `contaDaLista`). (c) foi recusada: loja sem abertura (ou em contagem de abertura) mostra a frase do motivo, sem cascata nem comprar; a lista se monta igual, e gerar os lotes espera o estoque abrir (a requisição baixa do estoque).

### 224. 2026-10-21 · ERP 3.2: idempotência pela versão lida e pelo conteúdo; a linha com lote vivo não muda; ordem das travas período → lista → 3.1

**Alternativas:** (a) chave do envio por formulário (como a Nova produção); (b) versão lida da lista + "o mesmo conteúdo já gravado = já feito" + índice único (loja, dia) + `FOR UPDATE` da lista em toda escrita.

**Razão:** (b). A lista é um documento editável (não um "criar"): duas abas com conteúdos diferentes precisam de conflito com frase, e o duplo clique do mesmo conteúdo precisa voltar "já feito". Criar = `createMany` com `skipDuplicates` e ler `FOR UPDATE` (duas transações juntas criam uma lista). Gerar os lotes: tudo ou nada, a linha travada que já tem lote não vira outro (duas abas: um lote por linha). A linha com lote planejado, em produção ou concluído não muda nem sai (regra e gatilho `ListaProducaoItem_lote_confere`, até por SQL cru); cancelar o lote devolve a linha. Ordem das travas: período (compartilhada) → lista → as da 3.1 dentro de `planejarProducaoNaTx` (e, na correção da rodada 1, cancelar e estornar o lote também travam a lista ANTES do lote: decisão 228). O DIA da lista em período fechado do DRE recusa salvar, pôr e gerar (teste mutante: salvar espera o fechamento ~900 ms). Mutantes conferidos: tirar a trava do período, a versão ou o `FOR UPDATE` derruba os testes.

### 225. 2026-10-21 · ERP 3.2: aba "Lista do dia" é a primeira da área Produção; celular primeiro

**Alternativas:** (a) "Lotes" continua a entrada da área e a lista vira a segunda aba; (b) a lista é a primeira aba (o card da área abre nela).

**Razão:** (b). O dia da cozinha começa pela lista (o que produzir e o que falta), e a 3.3 ("funcionário pega da lista") faz dela a tela central; "Lotes" segue ao lado. Tela: o dia (Ontem · Hoje · Amanhã + outro dia), "O que produzir" (as que viraram lote com a etapa e o link; as abertas no formulário de celular: seletor em largura cheia, quantidade de 48 px com `inputmode=decimal` e a unidade ao lado), "Pré-preparos que entram nas receitas", "Matéria-prima" (tabela Corporativo a partir de 768 px, cartões abaixo; números sem quebra), "Para quem compra" e o histórico. Lado a lado a partir de 1280 px. Provado em 390, 820, 1180 e 1440, claro e escuro, dona, gerente e operador: zero rolagem lateral, zero violação do axe.

### 226. 2026-10-21 · ERP 3.2: a lista não faz pedido; custo estimado só para quem vê custos E define a lista ou compra; orçamento pela vista da 2.5

**Alternativas:** (a) gerar pedido de compra; (b) mostrar o que falta, o custo estimado (para quem vê custos) e o orçamento de compra, com o link para lançar a nota.

**Razão:** (b): pedido automático está fora do plano. Custo = falta × último preço pago (fração exata; insumo sem preço fica de fora e a tela diz qual), montado no servidor só para quem tem `insumos.ver` E (`producao.planejar` OU ver/lançar nota na loja). **Correção (rodada 1, decisão do Maestro):** a primeira versão dava o custo a todo `insumos.ver`, e o operador padrão tem `insumos.ver`: a cozinha via R$ na lista. Agora a cozinha lê só quantidades, e o painel "Para quem compra" só aparece para quem define a lista ou compra. O bloco da ajuda sobre a compra estimada vai só para quem compra (versão 2 da entrada). O orçamento entra por `orcamentoNaNota` (a regra única da 2.5) com a compra estimada somada: quem vê o DRE lê "cabe/passa"; quem não vê lê o limite seguro (decisões 210, 213, 217); quem não vê custos não leva o valor nem para a conta (parte de zero, só o "cabe"). Nenhum número novo depende da receita.

### 227. 2026-10-21 · ERP 3.2: histórico da lista sem R$, ajuda nova, Histórico geral e versão

**Razão:** entidade "Lista do dia" no histórico: Montada (CRIOU), Mudou (ALTEROU, o que entrou, saiu e mudou de quantidade, pela mesma leitura dos itens da ficha), Apagada (EXCLUIU), Lotes gerados (GEROU_LOTES, com os códigos); nenhum valor. O lote diz "da lista". O filtro "Produção" do Histórico geral inclui a lista, e quem não vê produção não recebe nada dela. Ajuda nova: `producao-lista` e `producao-lista-loja` (aula sem R$; blocos por permissão; lock com 55 entradas). `VERSAO_DO_ERP` = "Barney ERP · fase 3.2".

### 228. 2026-10-21 · ERP 3.2 (rodada de correção 1): a linha que volta do lote cancelado nunca some nem vira lote sem ser vista

**Achado (Guardião, I1):** cancelar um lote da lista (3.1) devolvia a linha sem mudar a versão da lista. A aba aberta antes salvava e apagava a linha devolvida (o salvar apaga as linhas em aberto que o formulário não traz), e o "Gerar" dela recriava o lote que alguém tinha acabado de cancelar.

**Alternativas:** (a) só o formulário mandar as linhas em aberto que mostrou; (b) só subir a versão da lista ao cancelar; (c) as duas.

**Razão:** (c). (a) é o pedido do Maestro e protege a tela: o salvar manda `vistas` (as linhas em aberto que a tela mostrou), e linha em aberto que a pessoa não viu é conflito com a frase "Molho cheddar voltou para a lista agora há pouco (o lote X foi cancelado). Confira a lista de novo; nada foi gravado.". O gerar manda `linha` e gera SÓ essas: linha pedida que não está mais na lista é conflito; sem nenhuma, "Nenhum pré-preparo em aberto para virar lote."; sem o campo (uso por código), todas. (b) protege quem chama sem a lista do que viu (o teste do Guardião, outra tela): cancelar e estornar o lote travam a lista ANTES do lote (`travarListaDoLote`, a ordem período → lista → abertura → lote, a mesma do gerar) e sobem a versão no fim; o vínculo linha × lote vivo não muda (gatilho), então a lista lida é a do lote. Sem deadlock: provado com cancelar e salvar ao mesmo tempo. Mutantes: tirar a subida de versão do cancelar ou do estornar, a conferência das vistas ou o filtro das linhas pedidas derruba os testes.

### 229. 2026-10-21 · ERP 3.2 (rodada de correção 1): a lista apagada fica no banco; a versão por loja e dia nunca recomeça

**Achado (Guardião, M1):** salvar a lista vazia apagava a linha da lista; a lista montada de novo nascia na versão 1, e a aba velha (que tinha lido a versão 1 da lista apagada) sobrescrevia a lista nova de outra pessoa.

**Alternativas:** (a) mandar o id da lista junto com a versão; (b) não apagar a linha da lista: apagar = tirar todas as linhas, e a versão segue subindo.

**Razão:** (b). Com a linha da lista guardada, o id de uma loja e dia nunca muda, e (a) não acrescentaria nada: a versão é monótona por loja e dia, e a aba velha sempre tem uma versão menor. O teste do Guardião (sem id) também passa. Lista sem linhas = "Sem lista neste dia." na tela; quem não viu lista (versão vazia) ou viu esta mesma versão vazia monta de novo ("Montada" no histórico, com a versão seguindo); a versão de antes de apagar é conflito ("apagada…"). O histórico da lista apagada continua à vista na própria tela do dia (antes sumia com a linha). O "Gerar" numa lista sem linhas diz "foi apagada".

### 230. 2026-10-21 · ERP 3.2 (rodada de correção 1): B1 e os achados de UX

**B1 (Guardião, bloqueante):** lote do dia planejado FORA da lista (Nova produção) com pré-preparo dentro (o molho especial leva a base) não entrava na cascata: a conta só carregava as fichas das linhas, a base que sai pela requisição do lote ficava "sem ficha", a tela dizia "A ficha dele está desativada" (falso) e sumia o "Pôr na lista". Correção: as fichas e os insumos da conta são lidos até fechar: as fichas das linhas e dos lotes de fora; o que cada ficha usa; a ficha que produz cada pré-preparo que aparece, na receita ou ainda saindo pela requisição de um lote. Provado: o molho especial 4 kg de fora dá a mesma matéria-prima de quando é linha, e o molho da casa (três níveis) também. As receitas só usam pré-preparo por subficha (a escolha de insumos da ficha exclui quem tem ficha que produz), então a ordem topológica pelas subfichas basta.

**UX:** "Pôr na lista" espera, com o motivo ("Salve a lista antes…"), enquanto há mudança por salvar em "O que produzir": ele grava e a tela volta do servidor, apagando o que foi digitado. Depois de salvar, gerar ou pôr na lista, o aviso vem para a vista e recebe o foco (a tela volta na mesma rolagem; sem animação com `prefers-reduced-motion`). Com tudo já em lote, o formulário não abre linha vazia: só "Mais um pré-preparo", com "Salvar" secundário. Menores: a quantidade de quem lê a lista na cor do texto e em negrito; as frases "use vírgula: 2,5 kg" e "maior que zero" (só na lista, `unidades.ts` não mudou); o subtítulo diz "nesta tela" (vale no celular); "Gerar os N lotes" conta as linhas preenchidas enquanto há mudança; no singular, "com a requisição dos insumos" (sem "cada um"); dia fora do prazo com a frase uma vez só (no aviso) e sem "Monte a lista"; a partir de 640 px, pré-preparo, quantidade (estreita), unidade e "Tirar" na mesma fileira; o resumo "N insumos faltam · M abaixo de zero" é um atalho para a matéria-prima logo abaixo do Gerar (até 1280 px, onde a matéria-prima fica embaixo).

### 231. 2026-10-21 · ERP 3.3: "o funcionário" é a pessoa do login; no tablet compartilhado cada um entra com o próprio acesso; o `Colaborador` fica para quem não tem login

**Alternativas:** (a) um `Colaborador` escolhido numa lista no tablet da cozinha (sem login próprio); (b) a pessoa do login (`UsuarioErp`, com o vínculo `AcessoParceiro` e as permissões da 0.4), gravada no lote como `responsavelUsuarioId` (texto, sem FK: a credencial mora fora do tenant) e `responsavelNomeSnapshot`.

**Razão:** (b), pelo que já existe: o `Colaborador` da 0.1 nunca ganhou tela nem uso (nenhuma linha de código o lê), e a 3.1 já grava a pessoa do login em `responsavelUsuarioId` na conclusão. Com (a), quem toca no tablet escolheria qualquer nome — o indicador por pessoa viraria o indicador de quem estava com o tablet, e a permissão (quem pode concluir, quem solta) não teria dono. No tablet compartilhado cada um entra com o próprio acesso (senha ou rosto da 0.3: um aparelho guarda o rosto de várias pessoas); a tela da cozinha diz "Você está como Caio" e tem "Não é você? Trocar de pessoa" (sai e volta ao login). O nível 1 (FlowFoods) não é da cozinha: não pega lote e nunca fica como "quem fez". O `Colaborador` (e `OrdemProducao.responsavelId`, FK para ele) fica reservado para quem trabalha sem login — o freelancer da fase tardia (lido no Notion e no Kairu, `library:controle-freelancers`): quando ele chegar, "quem fez" passa a ser pessoa do login OU colaborador, sem mudar o que a 3.3 gravou. **Hipótese para o Rodolfo:** a cozinha do Valentin's aceita cada um entrar com o próprio acesso no tablet? Se o tablet ficar logado com uma pessoa só, o histórico mente.

### 232. 2026-10-21 · ERP 3.3: pegar é começar; a linha da lista de hoje vira lote na hora em que alguém pega

**Alternativas:** (a) "pegar" como estado novo do lote, antes de começar; (b) pegar = a transição Planejada → Em produção da 3.1, agora com quem pegou e desde quando (`responsavelDesde`, a única coluna nova); o lote Em produção sem ninguém (soltou, ou começou antes da 3.3) também se pega.

**Razão:** (b). Não há segunda produção: é a mesma ordem, a mesma transição e o mesmo histórico (`iniciarProducao` passou a ser `pegarProducao`, com o nome antigo como apelido). A linha da lista de HOJE que ainda não virou lote também se pega: na mesma transação ela vira o lote dela pela regra do "Gerar" (`planejarProducaoNaTx`, com a requisição dos insumos; nada sai do estoque) e o lote já sai com quem pegou (`pegarNaTx`). Isso abre "pegar da lista" a quem registra produção, como a decisão 219 deixou em aberto: a gerência continua decidindo o que entra na lista; a cozinha só transforma em lote o que já está nela. A tela manda a linha que mostrou com a ficha e a quantidade: se a gerência mudou a linha nesse meio-tempo, é conflito ("A gerência mudou Molho cheddar na lista agora há pouco"). Só a lista de hoje: dia que passou é consulta e o de amanhã não é tarefa de hoje.

### 233. 2026-10-21 · ERP 3.3: dois não pegam o mesmo lote; o duplo toque é "já feito"; pegar não mexe no livro nem no DRE

**Razão:** pegar trava a requisição e a ordem (a ordem fixa da 3.1) e lê o dono: a mesma pessoa de novo devolve "já feito"; outra pessoa recebe "Este lote está com Caio (pegou às 09:12). Se for para você fazer, peça para a gerência passar o lote para você."; a versão lida segura a tela velha. Pegar uma linha da lista trava período (compartilhada) → a lista (`FOR UPDATE`) → as da 3.1: duas pessoas na mesma linha dão um lote só (provado em paralelo; tirar o `FOR UPDATE` da lista derruba o teste). Pegar, soltar e passar não tocam no livro do estoque nem no DRE (é quem faz, não o que saiu): valem com o período fechado, como "começar" valia na 3.1; a linha da lista não vira lote em dia de período fechado (é escrita da lista e cria a requisição), e concluir continua recusado. Teste mutante: segurar `travarParaFechar` e ver o pegar da lista esperar e ser recusado.

### 234. 2026-10-21 · ERP 3.3: soltar é de quem pegou ou da gerência; passar para outra pessoa é só da gerência, sempre com motivo

**Razão:** quem pegou e não vai terminar (fim do turno) solta o próprio lote com o motivo; a gerência (`producao.planejar`) solta o de qualquer pessoa. O lote continua Em produção (o começo é fato), sem ninguém, e volta para "Para pegar". Passar é só da gerência, só para o lote Em produção (o planejado ninguém pegou: quem vai fazer pega pela tela), e só para pessoa ATIVA com "registrar produção" naquela loja — a lista vem das credenciais no servidor (`pessoasQueProduzem`), nunca do formulário. A hora de quem recebe começa agora. Histórico do lote: "Pegou" / "Soltou" / "Passou", com "quem faz: Caio → Duda" e o motivo. Pré-escalar um lote planejado para alguém ("a Duda faz o molho amanhã") fica fora: é escala de tarefas, não "pegar".

### 235. 2026-10-21 · ERP 3.3: o lote com outra pessoa só ela ou a gerência conclui ou cancela; quem pegou fica como "quem fez"

**Alternativas:** (a) qualquer um que registra produção conclui qualquer lote (a 3.1); (b) só quem pegou, ou a gerência.

**Razão:** (b). Com (a), o colega fecharia a tarefa do outro e o histórico por pessoa perderia o sentido. A gerência conclui por quem pegou (a pessoa saiu e o lote ficou pronto): quem pegou continua "quem fez" e a gerência fica como "quem concluiu" (o histórico mostra "quem fez: Duda" na conclusão). Lote que ninguém pegou: quem conclui é quem fez (o caminho da 3.1); o nível 1 conclui sem virar "quem fez". O banco não deixa concluir antes de pegar (`OrdemProducao_responsavel_antes_do_fim`) — por isso o teste da 3.1 que conclui com o relógio fixo em 17/10 passou a pegar às 09:00 do mesmo dia (não mudou o que ele prova). O lote concluído ou cancelado não troca de dono (o gatilho da 3.1 compara a linha inteira).

### 236. 2026-10-21 · ERP 3.3: nenhuma permissão nova; histórico para quem vê produção, indicadores para quem define a lista; a cozinha entra pelas Tarefas

**Alternativas:** (a) permissão nova "ver indicadores da equipe" (catálogo v3); (b) as existentes: Tarefas = `producao.registrar`; Histórico = `producao.ver`; Indicadores = `producao.planejar`.

**Razão:** (b). `producao.planejar` já é a permissão da gerência na produção (dono e gerente pelo perfil base; o operador não; um chefe ganha por pessoa) e quem decide o que a cozinha faz é quem conversa com ela sobre o resultado. O histórico mostra quem fez cada lote, o que o quadro da 3.1 já mostrava a toda a cozinha ("concluída por Caio"). Sem catálogo novo, nenhum perfil precisa ser revisto (a herança N1 da 3.2 segue: a versão do catálogo continua passada em todo lugar). A área Produção ganhou três abas (Tarefas, Histórico, Indicadores) e a entrada dela passou a depender do perfil: quem registra produção e não define a lista (a cozinha) entra pelas Tarefas; a gerência continua entrando pela Lista do dia (decisão 225). **Hipótese para o Rodolfo:** a cozinha deve mesmo ver no histórico o que cada colega fez, ou só o próprio?

### 237. 2026-10-21 · ERP 3.3: os indicadores por pessoa são hipótese a validar: retrato com período e amostra, sem nota, sem ranking e sem R$

**Razão:** por pessoa, no período e na loja: lotes concluídos (com produção, sem estornados); quanto produziu de cada ficha (soma do que saiu, soma do planejado e o rendimento delas — o lote grande pesa mais); rendimento médio contra o planejado pela ficha (cada lote pesa igual; os perdidos ficam à parte, com a frase); fora de ±10% (a faixa da 3.1); tempo médio — da hora em que a pessoa pegou, ou em que os insumos acabaram de sair se foi depois (a espera pelo estoque não conta contra a cozinha), até a conclusão; perdidos; cancelados enquanto estavam com ela (o motivo e quem cancelou estão no histórico); estornados. Sempre com a amostra: menos de 5 lotes = "amostra pequena, ainda não diz muito". Ordem alfabética, nenhuma cor por pessoa, nenhuma nota inventada e nenhum R$ (o custo do lote fica no histórico e no lote, para quem vê custos). Sem dado é frase: sem concluído, "sem lote concluído"; sem hora de pegar (lote da 3.1 ou concluído direto), "sem lote pego pelo ERP". **Hipóteses para o Rodolfo validar com o Valentin's:** a régua de 5 lotes; tempo de pegar a concluir (inclui o preparo da bancada, não o fogo); "cancelado com a pessoa" pode punir quem não teve culpa (a gerência que mudou o cardápio) — vale mostrar só os cancelados por ela?

**Ajuste (polimento da 3.3, 21/10/2026, pedido do fiscal de UX):** "Cancelou" conta só o que a PRÓPRIA pessoa cancelou (o nome gravado no cancelamento é o dela). O que a gerência (ou a FlowFoods) cancelou enquanto o lote estava com ela aparece à parte, na frase "N lotes cancelados pela gerência enquanto estavam com a pessoa: não contam para ela". No histórico, o cancelado não tem "quem fez": diz "estava com X" e quem cancelou ("cancelou: Gil Gerente (gerência)" ou "a própria pessoa"). Encerrado sem pessoa da equipe (concluído pela FlowFoods) também fica fora das pessoas, com a nota (decisão 241). A comparação é pelo nome gravado: duas pessoas de mesmo nome na mesma loja confundiriam a conta (hipótese aceita; o histórico do lote tem o autor).

### 238. 2026-10-21 · ERP 3.3: o histórico da produção são os lotes ENCERRADOS do período, pelo dia em que encerraram

**Razão:** concluídos (e perdidos) pelo dia da conclusão; estornados pelo dia em que foram produzidos (a conclusão), com a palavra "Estornado"; cancelados pelo dia do cancelamento. O que está pendente mora nas Tarefas e no quadro de Lotes. Período: Hoje · 7 dias (padrão) · 30 dias, ou de/até (um dia só = o filtro de dia); até 92 dias de uma vez, o fim nunca no futuro, datas trocadas se invertem, sempre com o aviso. Filtros de pessoa e ficha com as opções que aparecem no período. Cada lote: o quê, quanto (produzido de planejado), rendimento ("fora de ±10%" escrito), quem fez e quem concluiu, quando pegou e quando terminou, o tempo e o motivo; o custo do lote só para quem tem `insumos.ver` (o contrato do lote da 3.1: o servidor não manda). Sem lote é a frase, nunca zero.

### 239. 2026-10-21 · ERP 3.3: migration aditiva: uma coluna, quatro CHECKs e dois índices; o resto já existia

**Razão:** `20261031000000_erp_producao_equipe`: `OrdemProducao.responsavelDesde` (nova) e os CHECKs `responsavel_com_pessoa` (dono com pessoa e nome), `responsavel_so_em_producao` (o planejado não tem dono), `responsavel_antes_do_fim` e `responsavel_nome_curto`, em `NOT VALID` + `VALIDATE` em bloco que avisa; índices `(parceiroId, lojaId, concluidaEm)` e `(parceiroId, lojaId, canceladaEm)` para o histórico. `responsavelUsuarioId` (3.1) e `responsavelNomeSnapshot` (0.1) já existiam e o gatilho `OrdemProducao_concluida_imutavel` (3.1) já cobre a coluna nova. Nenhuma tabela nova (portão, RLS e GRANT iguais); nenhum passo lê tabela de tenant. Provada com dado antigo nos três perfis do banco; `erp:conferir-migracao` acusa CHECK ou índice que faltar.

### 240. 2026-10-21 · ERP 3.3: a tela da cozinha tem botões de 56 px e uma ação por cartão; concluir volta para ela

**Razão:** o Kairu ("Da Ficha ao Fornecedor": tela da cozinha com fonte grande, poucos botões, toque generoso, de luva) e o `pass:producao-lotes-e-consumo` (status e ação principal cabendo em 390 × 844). Cartão = o pré-preparo (18 px) e quanto (Gelasio 26), o lote, o atraso (filete vermelho de 3 px + "Xd de atraso", o padrão dos quadros), a situação dos insumos em palavra. "Pegar" é o botão secundário grande (56 px, `classeDeBotaoDaCozinha`); "Concluir" é o primário vermelho, só no cartão "Com você" (é a ação principal daquele cartão; exceção registrada à regra "um primário por tela": numa tela de tarefas, cada cartão tem a sua) e fica desabilitado com o motivo enquanto os insumos não saem. Concluir é a tela da 3.1 (`?de=tarefas` volta para as Tarefas). A gerência solta e passa pelos mesmos cartões. Histórico e Indicadores são telas de escritório: tabela Corporativo a partir de 1280 px e cartões abaixo. `VERSAO_DO_ERP` = "Barney ERP · fase 3.3". Ajuda: seis entradas novas e `producao-lista-loja` v3, `producao-quadro` v2, `producao-lote` v2 e `producao-concluir` v2 (lock com 61 entradas).

### 241. 2026-10-21 · ERP 3.3 (polimento): o nível 1 nunca vira pessoa na leitura; quem recebeu da gerência "recebeu"; passar relê o acesso na gravação

**Razão:** três achados dos fiscais sobre a honestidade dos dados, sem mexer em trava, permissão ou isolamento. (1) Guardião M1: o lote que o nível 1 concluiu na 3.1 tem o login DELE em `responsavelUsuarioId` (a 3.1 gravava quem concluía) e aparecia como pessoa nos Indicadores e no filtro do Histórico. O gatilho do lote concluído não deixa corrigir a linha (e não deve), então a correção é NA LEITURA: `idsDaEquipe` (credenciais) devolve os logins com vínculo com o parceiro, em qualquer situação — quem saiu da equipe continua sendo quem fez —, e `lotesEncerrados` só chama de pessoa quem está nela; o resto é "FlowFoods" no histórico e `daFlowFoods` nos indicadores, fora das pessoas, com a nota. (2) Fiscal de UX: o lote que a gerência passou dizia "pegou 18:14"; quem recebeu não pegou. `passadosPor` lê o histórico do lote (o último "pegou"/"passou"): se foi "passou", o cartão das Tarefas, o quadro e o lote dizem "recebeu 18:14 (passado por Gil Gerente)". A hora continua sendo a do começo do tempo da pessoa. (3) Guardião M2: a lista de quem pode receber era lida antes da transação; agora `passarProducao` recebe também `aindaPode` e o chama DENTRO da gravação, com o lote travado (depois de conferir a versão), relendo das credenciais se a escolhida continua ATIVA, da loja e com "registrar produção" (`aindaProduzNaLoja`). Se não, recusa no campo "Para quem" e nada é gravado. A releitura é por outra conexão (as credenciais vivem fora do tenant): a janela entre ler e gravar cai para a da própria gravação, não some — a mudança de equipe não espera a trava do lote. Fica dito como risco pequeno e aceito. Testes: o lote legado montado com o gatilho desligado só na transação (o que a 3.1 gravava) e a releitura provada sob a trava (outra conexão tenta travar o lote com NOWAIT e não consegue); os dois mutantes (tirar o filtro da equipe; reler antes da transação) derrubam os testes.

### 242. 2026-10-21 · ERP 3.3 (polimento): o Concluir das Tarefas mora debaixo de Tarefas; abas rolam para a atual; formulários da cozinha fecham e somem quando devem

**Razão:** pedidos do fiscal de UX. A aba ativa vem do CAMINHO (`itemAtivo`), não da query: quem chegava ao Concluir pelas Tarefas (`/producao/<loja>/<lote>/concluir?de=tarefas`) via a aba "Lotes" marcada. O Concluir das Tarefas ganhou o endereço `/producao/tarefas/<loja>/<lote>/concluir` (no ERP e no espelho do nível 1), com a MESMA tela e a mesma action; o endereço antigo continua valendo. Abas (componente comum, vale para o ERP todo): ao abrir, a aba atual vem para a vista dentro do trilho — só o trilho rola, sem animação (o salto é instantâneo com ou sem `prefers-reduced-motion`). "Manter" fecha o formulário de soltar e de passar mesmo depois de um erro, e o erro dispensado não volta ao reabrir. Quem perdeu a corrida não vê mais o "Pegar" (tocar de novo só repetiria a recusa): fica a frase de quem pegou e "Ver de novo". Indicadores no celular: valor embaixo do rótulo abaixo de 640 px. Na Delivery (estoque não aberto) e com o período fechado, o aviso aparece uma vez, no alto.


### 243. 2026-10-22 · ERP I.1a: a categoria de insumo é da REDE; o insumo tem UMA; a loja personaliza só a meta (I.2)

**Alternativas:** (a) categoria por loja (cada loja classifica o insumo como quer, com herança da rede); (b) categoria da rede, uma por insumo, e a camada por loja só para meta e uso (`CategoriaNaLoja`, I.2).

**Razão:** (b). Categoria é a natureza do insumo (farinha é Mercearias e secos em qualquer loja); o insumo já é cadastro da rede. Classificar a mesma farinha diferente por loja quebraria o CMV consolidado e a comparação entre lojas. O plano diz "configuração por loja, com herança opcional": isso vale para a META por categoria e a ativação dela, que nascem na I.2 sem tocar no que a I.1a guarda. **Desvio do texto do plano, para o Rodolfo confirmar.** Tabela `CategoriaInsumo` do parceiro (RLS, FK composta); `Insumo.categoriaId`.

### 244. 2026-10-22 · ERP I.1a: "Outros / a classificar" é do sistema: não se renomeia, desativa nem exclui; as outras nove são da casa

**Razão:** é o destino do que o nome não decide e a fila de revisão; sem ela a classificação assistida não teria onde pôr o ambíguo. `sistema = true` com `chave = OUTROS`, travada na regra e no banco (gatilho `CategoriaInsumo_sistema_protegida`, que recusa nome, situação, chave e exclusão, até por SQL cru). As nove padrão (e as que a casa criar) renomeiam, reordenam, desativam (com uso) e excluem (sem uso). Cada padrão tem `chave` estável (`PROTEINA`…): renomear não faz a sugestão perdê-la, e semear de novo não recria a que a casa renomeou. Excluir só sem insumo e sem passagem de insumo por ela no histórico (uma classificação desfeita também conta); com uso, a frase manda desativar. Desativar não apaga: o insumo continua nela, ela sai das opções do cadastro novo.

### 245. 2026-10-22 · ERP I.1a: a sugestão pelo nome é determinística, por dicionário, e a conservação não conta

**Alternativas:** (a) IA externa; (b) dicionário de cozinha em arquivo puro, com teste.

**Razão:** (b): mesma entrada, mesma saída, cada resposta diz de qual palavra veio ou por que não decidiu; sem custo, sem dado saindo do ERP. Regras: palavras de conservação ("congelado", "resfriado", "IQF") nunca decidem (coxa de frango congelada é Proteína); o substantivo que abre o nome manda ("molho de tomate" é molho, "pão de queijo" é pão); frases valem antes de palavras ("batata palha" é Mercearias, "batata" é Hortifruti); Proteína, Laticínios, Panificação e Hortifruti vencem "Congelados e industrializados", que só aparece quando nada mais cabe pela natureza; vários grupos ou nenhum → Outros com o motivo ("Ambíguo: o nome lembra Proteína e Panificação"); tipo Embalagem → Descartáveis. É só sugestão: a pessoa confere e troca, e o servidor refaz a conta para gravar se foi SUGESTAO ou MANUAL (não confia no navegador). Efeito conhecido: "Nuggets de frango" cai em Congelados (o nome que abre manda); a pessoa troca.

### 246. 2026-10-22 · ERP I.1a: `categoriaId` é nulo no banco e obrigatório na regra (criar e editar)

**Razão:** o insumo antigo continua legível e nenhuma migration reprova por dado antigo; a obrigatoriedade é do servidor: insumo novo sem categoria é recusado com a frase no campo (e o formulário fica como estava); editar um insumo sem categoria também a pede (o formulário já abre com a sugestão marcada); editar um que já tem categoria sem mandar o campo a mantém (importação, rotina de preço), mas campo vazio é recusado. Nome, categoria e unidade base são obrigatórios; a unidade deixou de vir marcada em KG (quem nunca escolheu a unidade não "escolheu"). Conservação e custo inicial não viram obrigatórios aqui (I.1b).

### 247. 2026-10-22 · ERP I.1a: a classificação dos insumos antigos é por script e tela, com prévia, lote e reversão; nunca SQL cego, nunca na migration

**Razão:** prévia lista cada insumo, a sugestão, o motivo e o valor em estoque sem gravar nada; aplicar classifica só onde `categoriaId IS NULL`, numa transação, com um registro CLASSIFICOU antes/depois por insumo e o lote no registro e no insumo; rodar de novo muda 0; ambíguo vai para "Outros / a classificar" com `classificacaoMotivo`. Reverter volta a "sem categoria" só os que ainda são do lote: qualquer classificação por pessoa (edição ou lote da fila) tira o insumo do lote (`classificacaoLote` nulo). Nada além da categoria muda (id, nome, preço, unidade, embalagem, saldo, ficha, movimento: provado por retrato antes/depois). O CMV e o DRE de período fechado não leem categoria: nada de fotografia antiga muda. Tela "Classificar insumos" (mesmas regras do script `erp:classificar-insumos`) com a contagem e o valor sem categoria visíveis também na lista de Insumos.

### 248. 2026-10-22 · ERP I.1a: permissão nova `insumos.categorias` (rede inteira); aplicar e desfazer a classificação são dela; classificar insumos continua `insumos.editar`

**Razão:** mudar categoria muda o CMV de todas as lojas (`exigeRede`). Dono tem pelo perfil base; Gerente e Operador não (Gerente entra em `SEM_GERENTE`). Classificar UM insumo, ou vários pela fila, é cadastro de insumo (`insumos.editar`). Catálogo v3 (`VERSAO_DO_CATALOGO` 3) com a migration de dado `20261101010000_erp_catalogo_v3`, no padrão da v2: o perfil próprio "copiado do Dono" da v2 ganha a nova; os parciais não (a Equipe pede para revisar). A aba "Classificar insumos" pede `insumos.editar` E `insumos.ver` (`Tela.tambem`): quem só pode editar não abre a área por causa dela.

### 249. 2026-10-22 · ERP I.1a: sem categoria nova fora de "Outros" quando a padrão sumiu

**Razão:** a sugestão acha a categoria pela chave na casa; se a padrão foi excluída ou está desativada, o insumo vai para "Outros / a classificar" e o motivo diz "a categoria X não está ativa nesta casa". Nada é recriado calado.

### 250. 2026-10-22 · ERP I.1a: as dez padrão nascem por script e UMA vez, na primeira abertura de casa sem categoria; abrir tela nunca recria o que a casa excluiu

**Razão:** migration não lê nem grava dado de tenant (lição da 2.1: o dono com FORCE RLS enxerga 0 linhas). `npm run erp:semear-categorias` semeia todo parceiro ativo; só ele, por ato explícito (`completar`), devolve a padrão que faltar. Telas, ficha e classificação chamam `garantirCategoriasPadrao` sem `completar`: semeia as dez apenas quando a casa não tem categoria nenhuma (como "Outros / a classificar" não se exclui, casa sem nenhuma é casa nunca semeada) e, de resto, só garante "Outros". Corrige o veto do Guardião: a Dona excluía "Bebidas" (sem uso), o Operador abria o formulário e ela voltava, com `CRIOU` no nome dele (sem `insumos.categorias`). Agora o histórico da criação automática sai em nome do "Sistema", nunca de quem abriu a tela. Escolhido em vez de uma marca no parceiro porque "Outros" já é a marca (imutável por regra e gatilho) e a migration segue aditiva e sem dado. Parceiro somente leitura não semeia. Categoria da casa sem chave com o nome de uma padrão é adotada, não duplicada.

### 251. 2026-10-22 · ERP I.1a: nome de insumo único sem diferenciar maiúscula, acento nem espaço, só para o que entra daqui em diante; o que já existe é reportado, não mexido

**Razão:** o índice único não mudou (migration aditiva, nenhuma colisão a quebrar). A regra nova (cadastro e renomeação) compara `lower(translate(nome))` com a mesma tabela de acentos do código (teste confere as duas listas), com trava por parceiro: "Fubá", "fuba" e "FUBÁ" ao mesmo tempo dão um só. Recusa com o link do insumo que existe ("o mesmo nome, escrito de outro jeito") ou do desativado, para reativar. Os pares que já eram parecidos ("Cebola" e "cebola") continuam editáveis; aparecem em Classificar › Nomes parecidos e na prévia do script para a casa juntar ou renomear.

### 252. 2026-10-22 · ERP I.1a: idempotência do cadastro pela chave de envio (`chaveEnvio` + impressão do conteúdo), conferida no servidor

**Razão:** o botão desabilitado não basta (resposta perdida, duas abas). O formulário novo leva um UUID sorteado no servidor a cada abertura; `Insumo.chaveEnvio` é único por parceiro e `hashEnvio` é a impressão do conteúdo. Mesma chave e mesmo conteúdo devolve o insumo que já existe como sucesso (a tela diz "Insumo salvo com sucesso: <nome>" e que foi cadastrado uma vez só). A chave é POR PESSOA: o servidor guarda a impressão de `pessoa|chave`, então a chave de um nunca reconhece nem revela ("já cadastrou X") o envio de outro; mesma chave com conteúdo diferente é recusada ("já cadastrou X e agora chegou com dados diferentes"); chave torta é recusada. Cinco pedidos em paralelo dão um insumo só (trava por parceiro + índice como cinto). Falha de rede no envio volta como "não deu para confirmar" com o formulário intacto; tocar de novo reconcilia em vez de duplicar. Quem chama sem chave (seed, importação) não ganha idempotência, mas continua valendo a regra do nome.

### 253. 2026-10-22 · ERP I.1a: retorno ao salvar anunciado e sem cobrir nada

**Razão:** "Salvando…" vira região viva no formulário e no botão (que já travava); depois do redirect, o detalhe mostra "Insumo salvo com sucesso: <nome>" (criado) ou "Insumo atualizado com sucesso: <nome>" (atualizado), com o nome lido do banco (a URL só escolhe a chave do mapa). A região `role=status` nasce VAZIA e é preenchida depois da montagem, porque região que já nasce com texto não é anunciada pelo leitor de tela. O aviso fica na página (não some, não cobre ação), com "Cadastrar outro insumo" e "Ver todos os insumos". Erro de validação leva o foco ao primeiro campo com problema, na ordem da tela.

### 254. 2026-10-22 · ERP I.1a: o que ficou para a I.1b e a I.2, e o que não tem prompt Kairu

**Razão:** I.1b: conservação sem valor padrão, "Prazo de uso após abertura", custo inicial de referência, marca de referência, tipo MATERIAL, "nome duas vezes" (links `?nome=`/volta e rótulo da embalagem) e o filtro "Conservação". I.2: meta por categoria, `CategoriaNaLoja` e painéis de CMV por categoria. Não há prompt Kairu sobre categoria ou cadastro de insumo: o que foi aproveitado de "Da Ficha ao Fornecedor", "Estoque unificado" e dos pacotes de inventário e CMV está na seção da I.1a de `docs/ERP.md`.

### 255. 2026-10-22 · ERP I.1a: nome na forma composta e sem caracteres invisíveis (insumo e categoria)

**Razão:** "Farínha" decomposto (i + acento combinante) e "Proteína" com um espaço de largura zero passavam por nomes diferentes dos que parecem iguais. `limparTexto` normaliza para NFC e tira largura zero, soft hyphen, marcas de direção, seletores de variação, BOM e controles, antes do `trim`; vale em `nomeObrigatorio` (insumo, embalagem, ficha), no nome da categoria e em `chaveDoNome`. No banco a comparação usa `normalize("nome", NFC)`. Nome só de invisíveis é "nome vazio". Nomes antigos não foram mexidos.

### 256. 2026-10-22 · ERP I.1a: desfazer um lote não tira a categoria do que uma pessoa salvou depois

**Razão:** vale a mão da pessoa, não a da máquina. Salvar o insumo (mesmo sem trocar a categoria), reclassificar à mão ou aceitar a sugestão em lote tira o insumo do lote (`classificacaoLote` = nulo); a categoria e o "como foi classificada" ficam. Desfazer o lote devolve a "sem categoria" só o que ninguém tocou.

### 257. 2026-10-22 · ERP I.1a: "Classificar os N insumos" fica preso à prévia mostrada

**Razão:** entre ver a prévia e clicar, alguém pode cadastrar, classificar ou desativar a categoria. A prévia leva uma impressão (`assinatura`: quais insumos e para qual categoria); o botão a devolve e o servidor recalcula dentro da transação, sob trava. Se mudou, nada é gravado e a tela diz para conferir a prévia de agora. O script (sem prévia a conferir) não manda a impressão.

### 258. 2026-10-22 · ERP I.1a: acabamento da fila e do cadastro em série

**Razão:** "Aceitar a sugestão dos marcados" classifica pelo nome o que o nome decide e deixa na fila o que não decide (ambíguo, ou categoria sugerida não ativa), dizendo quantos ficaram; fica como "sugestão pelo nome, aceita" e sai do lote. "Cadastrar outro insumo" abre o formulário com tipo, unidade e conservação do último (só valores da lista; nome e categoria seguem em branco, porque a categoria depende do nome). Erro de categoria vazia diz "A sugestão era <X>" e oferece "Voltar à sugestão". O aviso de salvo vem antes da caixa "Como funciona" (propriedade `aviso` do cabeçalho). Atualizar diz "Insumo atualizado com sucesso: <nome>". A página Classificar exige `insumos.ver` além de `insumos.editar` (sem ver insumos ninguém vê a área só por poder classificar). A prévia diz "N insumos estão sem categoria, sendo M desativados". O filtro de categoria ocupa a largura toda no celular.

### 259. 2026-10-22 · ERP I.1b: "Insumo que falta: cadastrar" leva o nome, volta para a tela de origem e não perde o que estava preenchido

**Alternativas:** (a) continuar abrindo `/insumos/novo` em branco e sem volta; (b) abrir em outra aba; (c) cadastro rápido dentro da nota (modal); (d) `?nome=` + `?volta=` + guardar o rascunho da tela.

**Razão:** (d). As três telas (nota de compra, ficha, embalagens por canal) escolhem o insumo num `<select>`, então não há nome digitado de onde tirar o `?nome=`: o atalho passa a abrir um campo opcional ("Nome do insumo que falta") e o nome é dito AQUI, uma vez, e chega pronto no cadastro (que ainda sugere a categoria). O `?volta=` é dado de fora, então só vale caminho interno da área de quem está logado (`/erp/...` para a pessoa do parceiro, `/rodolfo/erp/<slug>/...` para o nível 1; endereço completo, `//`, barra invertida, `..` que sai da área, controle e o próprio `/insumos/novo` são ignorados): conferido na página (para não repetir lixo no HTML) e DE NOVO na action (open redirect). Salvou, a action redireciona para a origem com `?insumoCriado=<id>`; a tela de origem lê o NOME do banco (a URL só escolhe um id da lista que ela já tem), mostra "Insumo salvo com sucesso: <nome>", escolhe o insumo na primeira linha vazia (se houver) e tira o parâmetro da barra. O que estava preenchido é guardado em `sessionStorage` ao sair (só no navegador, 20 minutos; a foto da ficha não cabe e a tela avisa) e recuperado na volta, com "Descartar e começar de novo". **A chave é de QUEM fez (veto do Guardião, decisão 269):** `ff-rascunho:<parceiroId>:<usuarioId>:<caminho>`, com os ids vindos do servidor pelo layout (`n1:<id>` no nível 1). Cancelar no cadastro também volta à origem. Erro de validação não redireciona: o formulário fica como estava, com a volta no lugar. Reenvio com a mesma chave devolve o mesmo insumo e também volta (um insumo só).

### 260. 2026-10-22 · ERP I.1b: o nome da embalagem diz a que serve e o nome do insumo não se pede de novo

**Razão:** o "Nome da embalagem" da tela Nova embalagem (que vem logo depois de salvar o insumo) parecia pedir o nome de novo. É um nome legítimo (a outra forma de comprar: "caixa de 5 kg", outra marca) e é único por insumo, então continua; muda o rótulo ("Nome desta embalagem de compra"), o exemplo ("caixa de 5 kg") e a ajuda ("O insumo continua sendo “Farinha de trigo”: este nome só diferencia esta forma de comprar das outras nas notas e no estoque"). Ela só existe na tela da outra embalagem, que se abre pelo botão do detalhe: o cadastro do insumo não a pede, e o aviso de salvo não a oferece. Não foi possível reproduzir um "nome pedido duas vezes" dentro do formulário do insumo (a análise leu o código: o nome é pedido uma vez, e o estado sobrevive a avançar, voltar e errar); as duas causas reais eram os atalhos sem `?nome=` e esse rótulo.

### 261. 2026-10-22 · ERP I.1b: tipo de item ganha "Material de limpeza e uso" (`MATERIAL`, enum aditivo)

**Alternativas:** (a) só Ingrediente e Embalagem; (b) enum com `MATERIAL`; (c) uma tabela de tipos.

**Razão:** (b), valor novo em `InsumoTipo`, rótulo "Material de limpeza e uso" (detergente, luva, pano, saco de lixo; "uso" cobre o que a casa consome sem ser limpeza). O tipo é o PAPEL do item na ficha; categoria é a natureza para o CMV; conservação é onde fica guardado: a tela diz as três coisas lado a lado. Efeitos conferidos no código: **ficha técnica**, o seletor não oferece material e o servidor recusa o item de material ("não entra em ficha técnica"), mesmo mandado à mão (o que já estivesse numa ficha continua); **insumo já usado numa ficha ou na embalagem de um prato não vira material** (a ficha quebraria): recusa no campo "Tipo" com a frase, conferida com a linha travada; **embalagem por canal (1.9)**, só `EMBALAGEM` entra, material nunca; **estoque, compra, contagem, requisição e histórico** tratam material como qualquer insumo; **categoria sugerida** pelo tipo é Limpeza e higienização (a pessoa troca). Pré-preparo segue nascendo só da ficha. Migration aditiva: `ALTER TYPE ... ADD VALUE`, que a própria migration não usa (só vale depois do commit). Nenhum insumo existente muda de tipo (reclassificar tipo é decisão da casa).

### 262. 2026-10-22 · ERP I.1b: a conservação é ESCOLHIDA, obrigatória no cadastro e no editar, sem valor pré-marcado

**Razão:** o defeito real do relato "Conservação aparece como opção" era duplo: o filtro da lista chamava "Todas" de "Conservação", e o formulário abria em Seco e o servidor ASSUMIA Seco quando nada vinha (frango salvo como seco sem ninguém escolher). Agora: o campo é um select "Selecione a conservação" (opção desabilitada, só orientação) com Seco (ambiente), Pista fria, Refrigerado e Congelado (as quatro legítimas, nenhuma removida); o servidor recusa vazio, espaços, "Conservação", "Selecione a conservação" e qualquer valor fora da lista, com a frase no campo, e NADA é gravado; o prazo digitado sem conservação também não escolhe por ela. Editar com o campo ausente (importação, rotina de preço) mantém a gravada; presente e vazio é recusado. "Cadastrar outro insumo" lembra tipo e unidade do último, mas NÃO a conservação (o frango não herda o Seco da farinha). O filtro da lista diz "Todas as conservações" e ganhou "Conservação a confirmar". Rótulo do Seco: "Seco (ambiente)".

### 263. 2026-10-22 · ERP I.1b: "conservação a confirmar" lista os Seco antigos de Proteína, Laticínios e Hortifruti, sem alterar nada

**Alternativas:** (a) reclassificar por regra; (b) só avisar, sem como limpar o aviso; (c) listar e deixar uma PESSOA confirmar.

**Razão:** (c). Até a I.1a o Seco podia ser verdadeiro (batata) ou o padrão assumido (coxa de frango), e o banco não distingue; reinterpretar seria inventar dado. A coluna nova `Insumo.conservacaoConfirmadaEm` (anulável, sem default, migration `20261102010000`) diz "uma pessoa confirmou": o insumo antigo fica nulo; o novo nasce confirmado (a conservação é escolhida); confirmar pelo marcador "Confirmo que a conservação é esta" do editar, ou trocando a conservação, confirma (com um registro `CONFIRMOU` no histórico); salvar o formulário sem olhar o campo NÃO confirma; e há o botão "Confirmar que é seco" no detalhe (`insumos.editar`, não muda conservação, prazo nem custo). "A confirmar" = ativo, não pré-preparo, Seco, sem confirmação, em Proteína, Laticínios ou Hortifruti. Aparece no aviso do alto da lista (com a contagem e o link para o filtro), na coluna da conservação e no detalhe. Hortifruti inclui o Seco verdadeiro de propósito (o plano manda listar): a pessoa confirma com um toque.

### 264. 2026-10-22 · ERP I.1b: "Prazo de uso após abertura" é o campo que já existia, com o nome certo; vencimento e abertura do lote dependem da 3.4

**Razão:** a semântica dos valores gravados já era "depois de aberto ou manipulado" (1.4: o vencimento do fabricante vem no lote), então não há valor a reinterpretar: só o nome da tela mudou (bloco "Conservação e prazo de uso após abertura", coluna "Prazo", ajuda com o texto do plano: "Prazo para consumir o produto depois de abrir a embalagem, conforme orientação do fabricante e procedimento validado da operação. Não é a data de vencimento impressa no lote"), em horas ou dias, por conservação; vazio = "não informado"; nenhum prazo é sugerido nem tem padrão (3 dias é só exemplo de erro de digitação). No histórico do insumo comprado o campo é `prazoAposAbertura` ("prazo de uso após abertura"); as linhas antigas e as do pré-preparo seguem como `validade`. **Dependência registrada, nada simulado:** o modelo `Etiqueta` (`abertoEm`, `validadeEm`, `loteFornecedor`) existe sem nenhuma gravação, e `NotaEntradaItem` não tem lote nem vencimento; "Data de vencimento do lote" no recebimento e "Data/hora de abertura" no controle de lote, com a regra de não prolongar o vencimento original, ficam para a 3.4. O cadastro não guarda data de lote. Pré-preparo segue a ficha.

### 265. 2026-10-22 · ERP I.1b: "Custo inicial de referência", "Custo não informado" e a origem

**Alternativas:** (a) coluna de custo anulável (zero deixa de ser sentinela); (b) manter o 0 como sentinela e mudar a linguagem em toda a tela.

**Razão:** (b), sem migration de dado: `precoEmbalagemCentavos = 0` já é lido como "nenhum custo" por TODA conta (`custoDaEmbalagem` devolve nulo; compras, estoque, ficha, canais, CMV e orçamento passam por ele), e zero digitado é recusado. Muda o que a pessoa lê: o campo é "Custo inicial de referência (R$ por embalagem de compra)", com o texto do plano ("Informe quanto você paga pela embalagem de compra. Esse valor ajuda a calcular o custo do insumo e das fichas antes da primeira compra registrada. Depois, o custo é atualizado pelo último preço de compra."), o exemplo na unidade escolhida (saco de farinha de 5 kg por R$ 25,00 → R$ 5,00/kg, calculado pelas mesmas funções do servidor) e a conta ao vivo; "Ainda não sei o custo" mostra "Custo não informado: as fichas e a margem ficam incompletas até haver um custo inicial de referência ou uma compra lançada". A mesma palavra vale na lista, no detalhe, na prévia da ficha, no histórico e nas frases (`CUSTO_NAO_INFORMADO`). **Origem:** o detalhe diz "Origem: último preço de compra lançado" ou "Origem: custo inicial de referência (nenhuma compra lançada)"; o histórico do insumo chama o valor de "custo inicial de referência" (o preço pago mora nas notas). **O cadastro não cria nota, movimento, saldo, despesa nem conta**: provado por contagem antes/depois. Margem: uma ficha com insumo sem custo é incompleta (`faltaPreco`) e a precificação já não mostra margem confiável para custo incompleto (1.10).

### 266. 2026-10-22 · ERP I.1b: marca de referência é texto informativo, opcional, sem trava e sem relação com fornecedor

**Razão:** o plano rejeitou a trava por marca (21/10). `Insumo.marcaReferencia` (texto de 1 a 80, sem espaços nas pontas, CHECK `NOT VALID` + `VALIDATE`), no cadastro, no detalhe e no histórico ("marca de referência"; tirar a marca também é uma mudança). Nada lê a marca para recusar compra, cotação ou ficha; não há vínculo com `Fornecedor` (marca e fornecedor são coisas diferentes, e a mesma marca vale para vários insumos e parceiros). "Fornecedor homologado" e a marca alternativa na cotação seguem como evolução futura da cotação, que ainda não existe.

### 267. 2026-10-22 · ERP I.1b: o material de limpeza e uso AINDA entra na soma de compras do CMV (efeito conhecido, para o Rodolfo decidir)

**Razão:** o CMV de compra (2.3) soma todas as notas lançadas e o CMV "real" usa a fotografia do estoque de todos os insumos: nenhum dos dois lê tipo nem categoria (a categoria só vira eixo do CMV na I.2). Tirar o material de um lado só desencontraria a conta, e reescrever o cálculo agora mexeria em período já fechado, o que a regra proíbe. Por isso a tela do cadastro AVISA ao escolher o tipo ("as compras dele ainda entram na soma de compras do CMV; a separação por categoria vem depois") e a separação fica registrada como pendência da I.2 (CMV por categoria): material sai do CMV gerencial por tipo ou por categoria, sem reescrever fotografia de período fechado.

### 268. 2026-10-22 · ERP I.1b: acabamentos da I.1a e ajuda contextual

**Razão:** "Ver todos os insumos" no aviso de salvo ganhou forma de botão (secundário, como "Cadastrar outro insumo"); "Aceitar a sugestão dos marcados" diz, antes de clicar, quantos dos marcados estão "sem certeza" e ficam na fila; "Cadastrar outro insumo" deixou de lembrar a conservação (262). Ajuda contextual: `insumos`, `insumo-novo` e `insumo` na versão 3, `insumo-embalagem` na 2 (o lock acompanha); os textos falam em tipo × categoria × conservação, prazo de uso após abertura, custo inicial de referência, marca de referência, o atalho com volta e "conservação a confirmar".

### 269. 2026-10-22 · ERP I.1b (veto do Guardião): o rascunho é de quem o fez e some ao sair

**Razão:** a chave `ff-rascunho:<caminho>` era a mesma para todo mundo no navegador: num tablet compartilhado, a nota que a dona da Alfa deixou pela metade aparecia, por 20 minutos, para a dona da Beta (e para outra pessoa do mesmo parceiro). Agora: (1) a chave leva parceiro e pessoa vindos do servidor (`EscopoDoRascunho` nos dois layouts; sem escopo, a tela não guarda nem recupera nada); (2) todo `ff-rascunho:*` é apagado ao Sair (parceiro e nível 1), ao "Trocar de pessoa" da cozinha e ao abrir a tela de entrar (a do parceiro e a do /rodolfo), para o caso da sessão que expirou; (3) o rascunho guarda a versão lida da ficha, da nota ou das embalagens e, se a tela mudou desde então (outra pessoa salvou), é descartado com o aviso "mudou desde o seu rascunho"; (4) Cancelar e "Voltar" do cadastro que veio de uma nota ou ficha recarregam a página de origem (o roteador guarda a anterior por uns segundos, com a versão velha). Provado no navegador, na mesma aba: dona da Alfa deixa o rascunho, sai, a dona da Beta entra e abre a nota e a ficha sem nada; rascunho plantado com a chave de outra pessoa do mesmo parceiro não volta; o do próprio gerente volta; abrir a tela de entrar apaga tudo; o nível 1 tem a chave `n1` e também some ao sair; ficha alterada por outra pessoa descarta o rascunho. Também: `caminhoDeVolta` recusa `//` no caminho (`/erp//x`, `%2f`); editar insumo antigo só confirma a conservação se a pessoa a trocou ou marcou "Confirmo que a conservação é esta"; os dois avisos laranja da lista viraram um; "sem preço" virou "custo não informado" nas telas de estoque, produção, requisição, ficha e canais (as frases montadas na regra, em ficha, canais, CMV e contagem, ficam como herança).

### 270. 2026-10-22 · ERP I.2a: toda conta ao vivo por categoria usa a categoria DE HOJE do insumo; o período fechado lê a fotografia

**Alternativas:** (a) categoria "da época" gravada em cada nota e movimento; (b) categoria de hoje em todas as parcelas (compras, estoque inicial, estoque final, corte).

**Razão:** (b). Com a categoria da época, o bacon comprado em Laticínios e contado no estoque final já em Proteína gera um consumo fantasma (mais numa categoria, menos na outra): a soma fecha e as categorias mentem. O painel diz, na tela e na ajuda, que reclassificar um insumo muda o período em curso inteiro e que o total não muda (provado na jornada: Pão de Panificação para Mercearias, total R$ 34.250,00 antes e depois). O período FECHADO não recalcula: lê só a fotografia v4 (decisão 283), com a categoria e a meta daquele dia; reclassificar depois não o altera (provado: setembro idêntico, caractere a caractere, depois de reclassificar o Blend). Insumo sem categoria (antigo) cai em "Sem categoria", linha separada de "Outros / a classificar".

### 271. 2026-10-22 · ERP I.2a: `CategoriaNaLoja` guarda só o USO da categoria por loja

**Alternativas:** (a) categoria própria por loja; (b) só marcar se a loja usa (padrão: usa).

**Razão:** (b). A categoria continua uma só na rede (decisão 243), e a natureza do insumo não muda por loja. Categoria que a loja não usa sai do formulário de metas e do painel DAQUELA loja, salvo se tiver valor no período ("não usada nesta loja, mas teve R$ X"): custo nunca some. Gravada junto com as metas da loja, na mesma transação, com histórico ("Categoria na loja").

### 272. 2026-10-22 · ERP I.2a: meta por categoria é um CONJUNTO versionado; a loja segue a rede ou personaliza o conjunto inteiro

**Alternativas:** (a) meta por categoria e por loja, campo a campo, herdando o que falta; (b) conjunto inteiro por escopo (rede ou loja), com vigência.

**Razão:** (b). Misturar meta herdada e própria na mesma tela confunde o dono. `MetaCmvConjunto` (`lojaId` nulo = rede; `segueARede`; `vigenteDesde` = começo do período em curso, como a 2.2b, decisão 149) e `MetaCmvCategoria` (pontos-base inteiros 0 a 10000; FK composta RESTRICT para a categoria). A meta efetiva de um período P numa loja é o último conjunto da loja com `vigenteDesde <= início de P`; sem conjunto ou com `segueARede`, o da rede. Mudar a rede só afeta as lojas que seguem a rede (a tela diz quais) e mudar uma loja não toca outra (provado na jornada: Delivery em 14% de Proteína, rede em 12%, Vila da Penha segue 12%). Gatilhos do banco: só o conjunto mais novo do escopo muda; os anteriores são história. A versão (impressão do estado) barra o salvar de duas pessoas em cima da outra.

### 273. 2026-10-22 · ERP I.2a: a meta TOTAL do painel é a meta do CMV do DRE; base é a receita BRUTA (desvio do texto do plano, para o Rodolfo confirmar)

**Alternativas:** (a) meta total própria do painel; (b) a mesma `DreMeta` da linha `cmv`, gravada na mesma transação; (c) base líquida, como diz o roteiro.

**Razão:** (b) e base bruta. O CMV % do DRE, o farol e o orçamento já usam a receita bruta; duas bases para o mesmo número seriam dois CMVs. Salvar as metas por categoria na rede grava as categorias e a `DreMeta` do CMV juntas, sob a trava `erp-metas:<parceiro>` (uma fonte só: mudar a meta do CMV em "Plano e metas" muda o total do painel e vice-versa). Na I.2a a loja personaliza a DIVISÃO, não o total (total por loja mexe no DRE e no orçamento: I.2b). Pergunta ao Rodolfo: base bruta ou líquida? O roteiro diz "% da receita líquida".

### 274. 2026-10-22 · ERP I.2a: "Usar o modelo de 32%" PREENCHE, não grava; soma diferente do total é aviso, não bloqueio

**Razão:** o botão preenche os dez campos pela `chave` da categoria (Proteína 11, Hortifruti 3, Mercearias 5, Laticínios 4, Congelados 2, Panificação 2, Bebidas 3, Descartáveis 1,5, Limpeza 0,5, Outros 0; total 32) e diz "referência ilustrativa, não limite". Categoria renomeada mantém; categoria da casa sem chave fica vazia; padrão excluída ou desativada não entra e a frase diz ("Bebidas (3%) não existe nesta casa"). Nada é gravado até "Salvar as metas" (provado: 0 linhas depois do toque). Se a soma das categorias difere do total, aparece "Confira a divisão" com a diferença em pontos percentuais e dá para salvar assim (a casa pode ter metas que não fecham de propósito); sem total, sem aviso. Meta 0 em "Outros / a classificar" quer dizer "tudo que cair aqui é fila para classificar", não "sem custo".

### 275. 2026-10-22 · ERP I.2a: a DRE NÃO muda; a linha CMV do DRE é o CMV gerencial, a soma das categorias (corrige a redação da 267)

**Alternativas:** (a) separar limpeza e descartáveis numa linha própria do DRE (visão do contador); (b) o painel abre o CMV do DRE em categorias, sem linha nova.

**Razão:** (b). Cada item de nota cai em UMA categoria e a DRE tem UMA linha de CMV, então não há dupla contagem; a soma das categorias mais as linhas de variação é a linha `cmv` do DRE ao centavo (teste de invariante, e na jornada o painel e a DRE mostram R$ 39.350,00 na rede e R$ 34.250,00 na Vila da Penha). **Corrige a 267:** pelo plano, limpeza e descartáveis ENTRAM no CMV gerencial, com meta própria (0,5% e 1,5% no modelo). Separar essas duas categorias numa linha à parte muda o resultado do CMV, a meta e o orçamento juntos: fica para a I.2c, só se o Rodolfo pedir. Pergunta ao Rodolfo: DRE inalterada (padrão) ou separar limpeza e descartáveis?

### 276. 2026-10-22 · ERP I.2a: a embalagem do custo por canal (1.9) fica fora do painel

**Razão:** a 1.9 é o custo TEÓRICO do prato por canal, para preço e margem; nunca entrou no DRE. "Descartáveis e embalagens" no painel vem só de nota e estoque. Para o futuro CMV teórico, a regra é comparar com Descartáveis, nunca somar. Teste-guarda: o painel e `cmv.ts` não leem `ProdutoEmbalagem`.

### 277. 2026-10-22 · ERP I.2a: pré-preparo tem linha própria, "Pré-preparos (variação do estoque)", sem meta e sem farol

**Alternativas:** (a) transferir a produção para a categoria do nome do pré-preparo; (b) linha própria; o ingrediente consumido fica na categoria do ingrediente.

**Razão:** (b). O queijo do molho é Laticínios, não "Mercearias" pelo nome "molho"; transferir por nome joga o consumo na categoria errada. A linha aparece no painel, vazia, com o texto "Sem meta e sem farol. Entra quando o CMV real for aberto por categoria": o valor dela só nasce com o CMV real por categoria (I.2b). Pergunta ao Rodolfo: pré-preparo em linha própria (padrão) ou distribuído?

### 278. 2026-10-22 · ERP I.2a: transferência entre lojas não existe, e o painel não finge que existe

**Razão:** o termo da fórmula do plano vale 0 e não é mostrado. Quando a transferência nascer, entra como movimento com par loja para loja. O real por loja da 2.3 já distorce sem ela; a rede fica certa.

### 279. 2026-10-22 · ERP I.2a: o painel, o farol e quando a categoria fica "sem cor" (limiar de 2% é hipótese)

**Razão:** painel em `dre/cmv-categorias`: escopo rede ou loja (dentro do alcance) e período; por categoria, meta em %, meta em R$ (meta vezes a receita bruta do escopo, por linha), realizado em R$ e %, desvio e farol. **O desvio tem o sinal da DRE: realizado menos meta** (positivo é custo acima da meta, em pontos percentuais e em R$), não o "-1,30 pp" do cenário da análise, que invertia o sinal. Farol com as faixas de custo da 2.4 (`faixaDoDesvio('MENOR_MELHOR', desvioBp, 'custo')`, as cinco faixas, com a régua e a palavra). **Sem cor** quando o dado não fecha: falta faturamento, "sem o CMV de X", "sem contar", faixas desconhecidas, ou "Outros / a classificar" mais "Sem categoria" passam de 2,00% do CMV do escopo (nenhuma categoria tem cor e o aviso diz "R$ X ainda a classificar (Y% do CMV)", com o atalho para classificar só para quem edita insumos). O 2% é uma hipótese a validar com a casa. Outros e Sem categoria nunca têm farol; categoria com meta e sem compra no período diz "sem compra no período" (nunca zero com cor). "Maiores desvios": até 3 categorias que SAÍRAM da meta (faixa "um pouco pior" ou pior), em ordem do que passaram em R$; quem está "na meta" não entra, e sem ninguém fora o painel diz "Nenhuma categoria saiu da meta neste recorte". Período fechado ou encerrado sem meta (as metas valem a partir da vigência) diz "não havia meta neste período". Pergunta ao Rodolfo: o limiar de 2%.

### 280. 2026-10-22 · ERP I.2a: período encerrado sem o estoque aberto por categoria mostra a "Variação do estoque, ainda não aberta por categoria"

**Razão:** nas lojas e períodos em que o CMV da DRE é o real (estoque inicial mais compras menos estoque final), as categorias do painel saem das compras e a diferença para o real vai numa linha própria, para o total nunca divergir do DRE em silêncio (provado na jornada: setembro, compras R$ 12.200,00 mais variação de R$ 263,00 = R$ 12.463,00 do DRE). No período em curso, uma diferença que o painel não explica aparece como "Diferença que o painel não explica". O real por categoria, que dissolve essa linha, é da I.2b e depende do retrato (decisão 281).

### 281. 2026-10-22 · ERP I.2a: todo fechamento e abertura de estoque NOVOS gravam o retrato por insumo na mesma transação

**Alternativas:** (a) esperar a I.2b e reconstruir; (b) gravar desde já, sem tela.

**Razão:** (b): cada fechamento sem o retrato atrasa o real por categoria em um período. `ContagemRetratoItem` (um por insumo com saldo, quantidade, valor, nulo para insumo sem preço) é gravado antes do UPDATE que fecha a contagem, na transação de `aplicar` do FECHAMENTO do período e na de `concluirAbertura` (a contagem cíclica NÃO grava: é um pedaço do estoque, não o estoque, e `retratoGravadoEm` fica nulo; o banco recusa o retrato dela); o gatilho do banco recusa fechar com Σ valores diferente de `valorTotalCentavos`, e o código recusa antes de tentar (soma igual ao total ao centavo). Só inclusão (UPDATE, DELETE e TRUNCATE recusados, como a fotografia) e só em contagem aberta. `Contagem.retratoGravadoEm` nulo quer dizer "fechado antes da I.2": nunca reconstruído (o preço da época não existe, reconstruir seria inventar). Excluir categoria agora confere meta e retrato; a FK composta impede por SQL também.

### 282. 2026-10-22 · ERP I.2a: permissões e vazamento

**Razão:** ver o painel é `dre.ver` (na loja); editar metas e "categoria na loja" é `metas.editar` com a rede inteira; nenhuma permissão nova, catálogo segue na versão 3. Pergunta ao Rodolfo: só o Dono personaliza a loja (o gerente não). Gerente de uma loja recebe só a loja dele, também por `?rede=1` e `?loja=<outra>` (nada da outra no HTML nem no JSON da página; o Next só ecoa o parâmetro que a pessoa mesma pediu); comprador sem `dre.ver` e operador não abrem o painel; quem só tem `historico.ver` não vê as metas por categoria no Histórico (as entidades do DRE ficam atrás de `dre.ver`); as telas somem do menu e do ⌘K de quem não pode (provado na jornada com dona, gerente, operador e uma pessoa só com histórico). Ajuda contextual com `para: ['dre.ver']` e `['metas.editar']`.

### 283. 2026-10-22 · ERP I.2a: a fotografia do fechamento passa à versão 4 e guarda as categorias por loja

**Razão:** fechar o período grava `versaoDaConta = 4` e `entrada.categorias` (JSON por loja: categoria, nome da época, compra, meta efetiva e de onde veio), sem linha nova na DRE e sem mudar o CHECK de tipo de linha. A leitura filtra pelo alcance (como `lerCmvDaFotografia`, via `jsonb_each`). Fotografia v1 a v3 diz "Não apurado por categoria (fechado antes da I.2)" e nunca é recalculada; reabrir (só a FlowFoods) e fechar de novo gera v4. Setembro fechado na jornada vira v4 e não muda quando se reclassifica um insumo.

### 284. 2026-10-22 · ERP I.2a (veto do Guardião): realizado e meta de uma categoria são comparados sobre o MESMO conjunto de lojas e a MESMA receita

**Alternativas:** (a) manter o realizado de todas as lojas contra a meta só de quem usa a categoria; (b) comparar só quem usa; (c) ratear a compra de quem não usa.

**Razão:** (a) dava desvio em pp e em R$ com sinais opostos e farol errado (provado pelo Guardião: o Bairro marca Bebidas como "não usa" e compra R$ 1.000; a rede mostrava R$ 800,00 ACIMA da meta e "-0,47 pp, na meta"). Agora o realizado, a receita e a meta de uma categoria saem das lojas que a USAM, e o desvio em R$ sai dos centavos (o pp é esse valor sobre a mesma receita), então os dois têm sempre o mesmo sinal (propriedade testada para qualquer combinação de lojas, usos, receitas, compras e metas). Se uma loja que "não usa" a categoria comprou nela (c descartado: não se adivinha a regra da casa), a linha fica SEM cor, sem desvio, com o motivo escrito ("Bairro comprou Bebidas, marcada como não usa") e o valor entra no total: a soma continua sendo o CMV do DRE e custo nunca some.

### 285. 2026-10-22 · ERP I.2a (veto do Guardião): endurecimentos do banco e da ajuda

**Razão:** migration `20261103010000_erp_cmv_categorias_endurecimento` (só função e gatilho, sem SELECT nem DDL de tabela, entra limpa nos três perfis): (1) conjunto de metas por categoria NÃO nasce com vigência anterior à do mais novo do escopo (`MetaCmvConjunto_sem_retroativo`); (2) a contagem não fecha com itens de retrato soltos sem `retratoGravadoEm` (`Contagem_retrato_confere` ganhou a segunda regra). Migration ainda não vista em produção, mas a primeira já estava aplicada nos bancos locais: por isso um arquivo novo, nunca reescrever o aplicado. Ajuda: o único bloco livre de `dre-cmv-categorias` e de `dre-metas-categorias` não traz número, hipótese nem plano; o texto do painel e das metas só vai para quem tem `dre.ver` ou `metas.editar` (as duas entradas subiram para a versão 2). **Herança registrada:** o uso da categoria por loja (`CategoriaNaLoja`) NÃO tem vigência: valer hoje vale para o período em curso e para os períodos encerrados ainda abertos (o fechado lê a fotografia). Se o dono precisar do passado fiel, a I.2b dá vigência ao uso, como as metas têm.

### 286. 2026-10-22 · ERP I.2b: o CMV real por categoria é inicial + entradas − final, aberto por insumo, e só abre quando fecha no real do DRE

**Alternativas:** (a) reconstruir o estoque por categoria pelo livro; (b) usar o retrato por insumo que a I.2a passou a gravar, com o MESMO corte do real da 2.3.

**Razão:** (b). O estoque final de uma categoria é o retrato do fechamento (`ContagemRetratoItem`) mais o que entrou depois do retrato e é do período, menos o que o retrato já trazia do período seguinte: o SQL do corte é um só (`cortesDosFechamentos`, em `cmv.ts`), aberto por categoria; o real do DRE soma as linhas, o real por categoria as usa abertas. O estoque inicial é o final do período anterior (mesma regra) ou, no primeiro período, o retrato da abertura. A categoria é a de HOJE do insumo em todas as parcelas (270). A loja só abre por categoria quando existem os dois retratos E a soma de tudo (categorias, sem categoria e pré-preparos) é o real do DRE ao centavo; qualquer divergência vira "não abriu" com o motivo, nunca um número que não fecha. A loja que não abre fica pelas compras e a diferença para o real do DRE vai na linha de variação do estoque, que agora diz QUAL loja e por quê. No painel da rede, as lojas se misturam (cada uma pelo que tem), a linha final é sempre o CMV do DRE. Propriedade testada com sorteios: Σ das linhas = CMV do DRE para qualquer combinação de lojas, usos, receitas, compras e montantes.

### 287. 2026-10-22 · ERP I.2b: a abertura de antes do retrato é lida pelos movimentos ABERTURA; o fechamento de antes do retrato nunca é reconstruído

**Razão:** a abertura (1.6) gravou um movimento ABERTURA por insumo com o valor da hora, então lê-lo não inventa nada, desde que a soma bata com o `valorTotalCentavos` da contagem ao centavo; se não bater, a loja fica pelas compras. O fechamento antigo guardou só o total: o preço da época não existe e reconstruir seria inventar (281). Consequência prática: o real por categoria de uma loja começa no primeiro período cujos DOIS estoques têm retrato; o período anterior segue com compras e variação.

### 288. 2026-10-22 · ERP I.2b: pré-preparo vai à linha própria em TODAS as parcelas, e a compra × real por categoria compara real menos compra, com o sinal da 2.3

**Razão:** a linha "Pré-preparos (variação do estoque)" ganhou valor: estoque inicial + entradas − estoque final dos insumos de tipo PRE_PREPARO (tipo de hoje). Se a casa comprou um insumo pré-preparo em nota, a compra também vai a essa linha (no painel pelas compras e no real), para o painel e a comparação nunca divergirem por classificação. Valor negativo quer dizer que o estoque dele subiu. Compra × real por categoria: diferença = real − compra, em R$ e em pontos da receita das lojas comparadas, o pp com o sinal do R$ (zero quando arredonda a 0,00; propriedade testada); negativa é compra maior que consumo, o estoque da categoria subiu ("dinheiro parado"); positiva é consumo do que já estava na prateleira. Só entram as lojas com o real aberto; as outras aparecem como "ficaram de fora", com o motivo. A soma das diferenças é a da página do DRE (2.3). Diferença não é perda: o texto não diz "perda" (aproveitado do material de inventário da Kairu).

### 289. 2026-10-22 · ERP I.2b: a evolução lê os últimos 6 períodos pelo mesmo painel de cada um, sem inventar período sem dado

**Alternativas:** (a) uma leitura própria e enxuta por período; (b) reaproveitar o painel (`cmvPorCategoriaNaTx`) em laço dentro de uma transação.

**Razão:** (b): o número de um período aqui é, por construção, o do painel dele (teste compara). O fechado vem da fotografia como está (v4 só compras, v5 com o real; v1 a v3 "não apurado por categoria"); o aberto, ao vivo. Período sem faturamento nem compras fica com "—" e a frase; nunca zero. Para no primeiro dia do ERP. Sem cor (a cor é do painel do período). O número de consultas é o de cada período, NUNCA o de lojas (teste com 1 e 50 lojas). Linha de categoria sem valor em nenhum dos períodos não ocupa lugar.

### 290. 2026-10-22 · ERP I.2b: meta total por loja (resolve a pendência 2.5-(2), salão × delivery) mora no conjunto de metas da loja

**Alternativas:** (a) nova tabela de meta de CMV por loja; (b) coluna `MetaCmvConjunto.metaTotalBp`, só no conjunto da loja que personaliza.

**Razão:** (b), migration aditiva `20261104000000_erp_cmv_real_categorias` (uma coluna nula e um CHECK: 0 a 100 %, só em conjunto de loja que não segue a rede). A meta total própria vale na linha CMV do DRE da loja (ao vivo e fotografada no fechamento), no painel de categorias e no orçamento de compra 2.5 dela; vazio = vale o total da rede (a `DreMeta` da linha CMV, uma fonte só). A REDE segue sempre a meta da rede, e a tela diz quais lojas têm a própria. No orçamento, o teto da rede é a soma dos tetos das lojas e, com metas diferentes, a "meta do CMV" mostrada é a média ponderada pela receita prevista, escrita como "média (cada loja usa a sua)"; o ritmo da rede usa a média ponderada pela receita até ontem. Vigência igual à das outras metas (começo do período em curso); período anterior não muda (provado: setembro segue 32 % na Delivery). Fotografias anteriores guardaram a meta da rede na linha da loja e são lidas como estão.

### 291. 2026-10-22 · ERP I.2b: matriz categoria × loja só na rede, sem cor, e cada coluna fecha no CMV do DRE da loja

**Razão:** com duas ou mais lojas no alcance e a visão da rede (que exige a rede inteira, como o DRE); quem tem uma loja só ou é gerente de uma loja não recebe a vista (nem o JSON: testado por `?rede=1`, `?loja=` e `?vista=matriz`). Cada célula é o valor da loja, o % da receita DELA e a meta da categoria naquela loja; sem cor, porque o farol depende de dado que muda por loja. A linha de variação do estoque entra por loja, para a coluna fechar. Linha sem valor em nenhuma loja não aparece.

### 292. 2026-10-22 · ERP I.2b: desvio relativo (% da própria meta) é só leitura

**Alternativas:** (a) mudar a régua do farol para relativa; (b) mostrar o relativo ao lado do desvio em pontos, sem cor e sem ordem.

**Razão:** (b). As faixas do farol são v1 congeladas, em pontos da receita, iguais para todas as casas; mexer nelas é uma v2 e muda o fechado. Mas 0,20 pp é pouco em Hortifruti e muito em Limpeza (0,70 % contra 0,50 % é 40 % acima da meta e aparece "na meta"). O percentual da meta ("+40,0% da meta") aparece embaixo do desvio, nunca vira cor nem muda a ordem dos maiores desvios, e a ajuda explica. Pergunta ao Rodolfo: quer uma faixa relativa de verdade (v2 do farol)?

### 293. 2026-10-22 · ERP I.2b: a fotografia do fechamento passa à versão 5, com o real por categoria; v4 e anteriores são lidas como estão

**Razão:** `entrada.categorias` ganha a versão 2: por loja e categoria, o inicial, as entradas e o final (o real é a conta); mais o sem categoria, os pré-preparos, a compra de pré-preparo e o motivo de a loja não ter aberto. A leitura valida cada número inteiro; real malformado é descartado inteiro (a loja fica pelas compras). A v4 (categorias versão 1, só compras) lê como estava: sem real, com a variação do estoque; v1 a v3 dizem "não apurado por categoria". A linha da loja na fotografia leva a meta total própria da loja (290). Reclassificar depois não muda nada do fechado.

### 294. 2026-10-22 · ERP I.2b (heranças do Guardião): frases no lugar de erro bruto e a explicação do % da rede

**Razão:** (1) na rede, o % de cada categoria é sobre a receita das lojas que a USAM (284): a frase está no painel e nas metas. (2) salvar metas quando já existe conjunto do escopo com vigência depois do período de agora deixava o erro do gatilho `MetaCmvConjunto_sem_retroativo` chegar à tela; agora a conferência é feita ANTES de qualquer gravação (para não deixar gravação pela metade) e a frase diz o conjunto que existe e desde quando. O banco continua recusando por SQL.

### 295. 2026-10-22 · ERP I.2b: transferência de estoque entre lojas NÃO existe, e o painel diz isso

**Razão:** o termo "transferências recebidas − enviadas" da fórmula do plano vale 0 e não é mostrado (278). Sem transferência, o real por categoria de cada loja não desconta o que ela mandou para outra (quem manda parece consumir mais; quem recebe, menos); o da rede fica certo. A frase está na tela e na ajuda. Quando a transferência nascer, entra como movimento com par loja → loja e o corte a conta.

### 296. 2026-10-22 · ERP I.2b: o uso da categoria por loja (`CategoriaNaLoja`) continua sem vigência

**Razão:** a herança da I.2a dizia que a I.2b daria vigência ao uso "se o dono precisar do passado fiel". Não é preciso: o período fechado lê a fotografia (que guarda o uso da época) e o encerrado ainda aberto lê o uso de hoje, como todas as parcelas "de hoje" (270). Pergunta ao Rodolfo: se o aberto antigo precisar do uso da época, é uma tabela de vigência (aditiva).

### 297. 2026-10-22 · ERP I.2b: as vistas novas moram na MESMA rota (`?vista=`), sem rota nova

**Razão:** compra × real, evolução e por loja são `?vista=compra-real|evolucao|matriz` de `dre/cmv-categorias`: mesma permissão (`dre.ver`), mesma ajuda (`dre-cmv-categorias` v3), mesmo recorte de alcance, e nada novo no menu nem no ⌘K. A URL só ESCOLHE a vista (valor desconhecido cai nas categorias; a matriz pedida sem existir também). A evolução só lê os 6 períodos quando é pedida.

### 298. 2026-10-22 · ERP I.2b: materiais Kairu consultados (regra do plano)

**Razão:** `pass:cmv-fichas-e-margem` e `library:inventario-ciclico`, pelo MCP Kairu (22/10/2026). Aplicado: `null` é desconhecido, nunca zero ("—", "sem consumo no período", "sem faturamento nem compras"); CMV parcial/misto com selo e a origem de cada número; snapshot que não muda com compra mais cara amanhã (fotografia); item não contado não é zero e divergência não é perda comprovada (compra × real não diz "perda"); saldo final bate com o ledger (a soma do retrato é o total fotografado, e a das categorias é o real do DRE); concorrência e idempotência testadas (a fechar × nota da I.2a continua valendo). Deixado para depois: CMV teórico por prato, cobertura por venda, recontagem com duas versões.

### 299. 2026-10-22 · ERP I.2b (vetos da UX e do Guardião): pré-preparos somados, "não fecha" tira a cor, evolução sem período escondido

**Razão:** (1) Guardião: `comprasPorLojaECategoria` agrupa por (loja, categoria, preparo); dois pré-preparos de categorias diferentes chegavam em duas linhas com a mesma chave e o `set` apagava a primeira (painel, compra × real e fotografia saíam errados). Agora soma. Revisados os outros agrupamentos da I.2a/I.2b (retrato, corte, entradas, leitura da fotografia): todos já somavam ou têm chave única; teste com banco com DOIS pré-preparos de categorias diferentes e um insumo sem categoria, em curso, compra × real contra a 2.3 e fotografia (e o mutante que volta ao `set` derruba o teste). (2) A diferença entre o CMV do DRE e a soma do painel só é "variação do estoque" quando uma loja com real no DRE ficou pelas compras e diz qual; qualquer outra vira "Diferença que o painel não explica" e TIRA a cor de todas as categorias (o dado não fecha). (3) A matriz ganha a linha de variação sempre que ALGUMA loja tiver variação diferente de zero (a da rede pode somar zero), para cada coluna fechar no CMV da loja. (4) `insumosAClassificar` é nulo sempre que nada foi lido (fechado ou sem dia apurado). (5) UX: abaixo de 1180 px a evolução é um cartão por categoria com uma linha por período, do mais antigo ao mais novo ("Mai 26 · 4,00% · R$ 4.000,00 · meta 11,00% · −7,00 pp"), nenhum período some; sem dado ou sem valor é "—", nunca R$ 0,00; a explicação longa fica recolhida em "Como ler esta tela"; as vistas cabem em uma linha no celular; "Voltar para o período de agora", "Ver a rede" e "Ver o DRE" voltam a ser links (o botão é só "Metas por categoria"); o selo diz "CMV misto" quando parte das categorias vem do real e parte das compras, com quem é cada parte; o orçamento com o ritmo pior que a meta traz a frase de ação.

### 300. 2026-10-22 · ERP F.1a: o fornecedor evolui na MESMA tabela, sem segundo cadastro; `nome` é o nome fantasia

**Razão:** a prioridade de 21/10 ("evolução do cadastro de fornecedores, preparado para notas fiscais automáticas") pede para preservar ids, histórico, notas e vínculos. Por isso a F.1a só acrescenta colunas a `Fornecedor` (razão social, inscrição estadual, endereço, município, UF, CEP, e-mail, WhatsApp, contato comercial, prazo de pagamento, "sem nota fiscal", situação do cadastro, chave de envio) e uma coluna `cnpj` a `Loja`. Nenhuma tabela nova (portão, RLS e `MODELOS_DE_TENANT` não mudam). O `nome` continua único no parceiro e passa a ser o nome fantasia ("como a casa chama"); o `contato` em texto livre da 1.5 fica como está, só para consulta.

### 301. 2026-10-22 · ERP F.1a: obrigatórios (decisão do Rodolfo de 21/10) e a única exceção, "Compras sem nota fiscal"

**Razão:** nome fantasia, razão social, CNPJ ou CPF (dígitos verificadores), e-mail e WhatsApp com DDD. A exceção é uma só, a chave "Compras sem nota fiscal" (feira, atacarejo): pede nome e WhatsApp; razão social, CNPJ e e-mail passam a opcionais (o documento, se vier, continua conferido) e esse cadastro NUNCA casará com documento fiscal na F.1b. As mesmas obrigações valem ao cadastrar e ao editar, e o banco repete a regra num CHECK (`Fornecedor_completo_tem_o_basico`): "completo" sem o básico não existe nem por SQL cru. Cada falta volta no campo dela, com o resumo e o foco no primeiro problema. Pergunta ao Rodolfo: o fornecedor de feira que TEM CNPJ precisa de e-mail? Hoje precisa, a menos que a casa o marque "sem nota fiscal".

### 302. 2026-10-22 · ERP F.1a: "a completar" só nasce do sistema; todos os fornecedores existentes migram para ele sem perder nada

**Razão:** o cadastro provisório explícito (`situacaoCadastro = A_COMPLETAR`) não tem caminho de tela: o formulário só grava COMPLETO. Ele nasce pela migração (o DEFAULT da coluna, sem UPDATE em massa e sem SELECT sob RLS: ids, notas, embalagens, insumos padrão e histórico ficam intactos) e, na F.1b, pelo emitente desconhecido de uma nota. O "a completar" recebe nota e aparece em listas e no seletor de fornecedores normalmente; o selo mostra o que falta (calculado, não gravado: `faltaNoCadastro`). Editar é completar: o servidor exige tudo também nele, e o filtro "A completar" da lista leva ao trabalho. Nada é inventado: o contato em texto livre NÃO vira WhatsApp, e-mail ou contato comercial (o campo antigo aparece como "Contato (cadastro antigo)").

### 303. 2026-10-22 · ERP F.1a: duplicidade pelo documento fiscal normalizado; filial é outro cadastro; nada se funde

**Razão:** o mesmo CNPJ/CPF (só dígitos, escrito com ou sem máscara) no mesmo parceiro é recusado com o link do que já existe; vale também para o desativado (o link leva a reativar). Índice único parcial `Fornecedor_parceiroId_documento_key` (onde o documento não é nulo) segura a corrida; além dele, um bloqueio por parceiro (`pg_advisory_xact_lock`) faz cadastrar e editar esperarem um ao outro, e o teste dispara cinco cadastros do mesmo CNPJ ao mesmo tempo (um entra). A filial tem outro CNPJ e é gravada; a tela de ambos avisa "mesma empresa, outro estabelecimento" (mesma raiz de oito dígitos) e diz que nada é unido. Nunca se funde por nome nem por CNPJ. O nome repetido (também escrito de outro jeito, sem diferenciar caixa e acento) é recusado com a dica de acrescentar bairro ou cidade; o mesmo nome e o mesmo CNPJ em OUTRO parceiro são aceitos.

### 304. 2026-10-22 · ERP F.1a: migration segura nos 3 perfis; o índice do documento não quebra com duplicado antigo

**Razão:** `20261105000000_erp_fornecedor_cadastro` é só colunas anuláveis (ou com DEFAULT constante), um tipo, CHECKs `NOT VALID` + `VALIDATE` em bloco `BEGIN/EXCEPTION` (aviso, não reprovação) e dois índices. Nenhum passo lê tabela de tenant. O `CREATE UNIQUE INDEX` do documento fica num bloco que captura `unique_violation`: com CNPJ repetido no mesmo parceiro a migration TERMINA, avisa (o PostgreSQL não diz qual é o par ao criar um índice, então o aviso manda rodar o conferidor), o resto fica no lugar. `npm run erp:conferir-migracao` ganhou a lista: pelo portão, parceiro por parceiro, "CNPJ/CPF repetido no parceiro p1: 11.222.333/0001-81 em “A” e “B”", mais os "a completar" e os "documentos a conferir" (estes não mudam o código de saída). Resolver: corrigir o documento de cada um (ou marcar "sem nota fiscal") e rodar o `CREATE UNIQUE INDEX` da migration. Testada nos 3 perfis do banco (superusuário, dono com RLS forçada, dono sem RLS), com e sem repetido.

### 305. 2026-10-22 · ERP F.1a: documento antigo que não passa nos dígitos verificadores é mantido e vira "documento a conferir"

**Razão:** o CNPJ de uma nota antiga pode ter sido digitado errado (a 1.5 só validava na tela). A migration não apaga nem corrige: o CHECK de formato só exige 11 ou 14 dígitos; a validade dos dígitos é regra do servidor. O detalhe mostra o aviso "Documento a conferir"; editar só salva com o CNPJ certo.

### 306. 2026-10-22 · ERP F.1a: inscrição estadual é conferida só no formato

**Razão:** "ISENTO" (ou "isenta") ou de 2 a 14 dígitos, sem pontos. Cada UF tem o seu tamanho e o seu cálculo de dígito verificador; a F.1a NÃO os confere (hipótese registrada: o documento fiscal da F.1b traz a IE do emitente, que é o dado confiável). UF só aceita as 27 siglas; CEP, oito dígitos.

### 307. 2026-10-22 · ERP F.1a: WhatsApp só com DDD que existe; prazo de pagamento é só guardado e começa vazio

**Razão:** o WhatsApp é guardado em dígitos com DDD (10 ou 11), sem o 55; DDD inexistente ou número sem o 9 de celular (11 dígitos) é recusado, e o fixo de 10 dígitos vale (há quem use o WhatsApp Business no fixo). O prazo de pagamento (0 a 180 dias) é guardado e mostrado e não gera vencimento, despesa nem conta a pagar (nulo = "não informado"; sem o 28 por padrão: ausência de dado é achado, não valor).

### 308. 2026-10-22 · ERP F.1a: contatos comerciais NUNCA recebem mensagem automática

**Razão:** cadastrar WhatsApp ou e-mail de um fornecedor não autoriza o sistema a falar com ele. A F.1a não tem nenhum caminho de envio e o teste-guarda `tests/erp-fornecedor.test.ts` varre o código de compras, fornecedores e lojas (regra, telas e actions das duas árvores) atrás de Evolution, `wa.me`, `mailto:`, `fetch(`, provedores de e-mail e de SMS. Os contatos aparecem como texto, não como link de conversa. O formulário diz isso no próprio painel ("o sistema nunca manda mensagem a eles sozinho") e a ajuda também. Qualquer envio futuro precisa de decisão nova, com regra de quem autoriza.

### 309. 2026-10-22 · ERP F.1a: cadastrar fornecedor repetido não duplica (a mesma regra do insumo)

**Razão:** o formulário nasce com uma chave de envio (UUID por abertura); o servidor a guarda por pessoa (hash de pessoa + chave) com a impressão do conteúdo. Mesma chave + mesmo conteúdo = o mesmo fornecedor ("salvo com sucesso", com a nota de que o envio chegou mais de uma vez); mesma chave + conteúdo diferente = recusa; chave de outra pessoa não reconhece o envio. Resposta perdida (conexão caída) volta como "não deu para confirmar", com o formulário preenchido, e tocar de novo não duplica. Editar continua condicional à versão lida (duas abas: a segunda recebe o conflito, com "Recarregar", e o que ela digitou fica na tela).

### 310. 2026-10-22 · ERP F.1a: CNPJ da loja é o destinatário futuro; opcional, validado, não único

**Razão:** `Loja.cnpj` (14 dígitos, dígitos verificadores conferidos) é quem a F.1b usará para decidir a que loja uma nota fiscal pertence. Muda só com `lojas.gerir` (rede inteira; o gerente VÊ e não muda), em "CNPJ da loja" na linha da loja, nas duas árvores, com antes e depois no histórico e condicional ao que a tela leu. Não é único: duas lojas podem operar no mesmo CNPJ (a conferência da F.1b pedirá a loja); quando repete, a confirmação diz qual outra loja usa o mesmo. Em branco remove. Isolamento: a loja de outro parceiro não existe para a sessão ("Loja não encontrada").

### 311. 2026-10-22 · ERP F.1a: "Fornecedor novo: cadastrar" da nota volta para a nota, com o que estava preenchido

**Razão:** o mesmo caminho do "Insumo que falta: cadastrar" (I.1b): `?volta=` só com caminho interno da área do ERP (nunca volta ao próprio cadastro), a nota guarda o que foi digitado antes de sair e, na volta, o fornecedor novo já vem escolhido, com o aviso "Fornecedor salvo com sucesso". O botão diz "Cadastrar e voltar para a nota de compra". A nota continua independente do cadastro estar completo: lança com fornecedor antigo ("a completar") e novo.

### 312. 2026-10-22 · ERP F.1a: referências Kairu consultadas (as da análise da F.1) e o que foi aplicado

**Razão:** a análise da F.1 (22/10/2026) leu, pelo MCP Kairu, `library:sefaz` (inteiro), `library:compras-cotacoes` e `pass:compras-cotacao-comparavel` (cotação: fora do escopo), "Nota Certa" (emissão de nota de venda: fora) e a página "Da Ficha ao Fornecedor". Aplicado na F.1a: identificar o fornecedor pelo documento NORMALIZADO e validado, nunca pelo nome; nada de manifestação nem ação automática sobre o fornecedor ou o documento (vale também para mensagens: 308); "um clique, um pedido" como chave de envio (309); preservar o histórico e a memória do fornecedor (mesma tabela, mesmos ids). Deixado para a F.1b: parser sem entidade externa e com limite de tamanho, dedup pela chave de 44 dígitos, "resumo não é nota completa", memória de código do fornecedor → insumo com auditoria do fator.

### 313. 2026-10-22 · ERP F.1a: perguntas para o Rodolfo (não bloqueiam; o padrão está em negrito)

**Razão:** (1) fornecedor de feira que TEM CNPJ precisa de e-mail? **Sim, a menos que a casa o marque "Compras sem nota fiscal"** (301). (2) O "Cepai" é a SEFAZ? Segue sem resposta: nada da F.1a depende disso, nenhum serviço, endpoint ou credencial foi escolhido ou pedido. (3) O prazo de pagamento deve vir com algum valor? **Não, vazio = não informado** (307). (4) CNPJ repetido num cadastro antigo: **o conferidor lista e a equipe corrige o documento de cada um** (304); a F.1b nunca escolherá sozinha entre dois ativos com o mesmo CNPJ. (5) Nota com mais de 80 itens (limite da digitação) existe na rede? Fica para a F.1b (200 itens na importação).

### 314. 2026-10-22 · ERP F.1b: polimento da F.1a (nove itens dos fiscais)

**Razão:** letra em CNPJ ou WhatsApp é recusada (antes o filtro de dígitos a apagava e a pessoa não via); o CPF aparece mascarado (`***.982.247-**`) na saída do conferidor; o erro de `relatorioDeFornecedores(...)` é logado no `.catch` em vez de engolido; "sem nota" virou "nenhuma nota lançada"; o filtro de fornecedores da lista vê todos (como o das notas); o cadastro que volta para a nota diz "fornecedor" na frase de volta; o filtro "Cadastro" foi alargado; o selo "A completar" tem ajuda (`fornecedores` v3); a volta para a nota avisa quando o CNPJ é de filial; a lista mostra "Documento a conferir". Tudo em commit próprio, antes da F.1b.

### 315. 2026-10-22 · ERP F.1b: três tabelas, todas por parceiro, com RLS forçada e chave composta

**Razão:** `DocumentoFiscal` (a nota recebida: cabeçalho, emitente, destinatário, chave de 44 dígitos, totais, parcelas, situação), `DocumentoFiscalItem` (os itens como o XML os trouxe, mais a escolha da casa) e `VinculoItemFornecedor` (a memória: fornecedor + código do produto em caixa alta + unidade comercial → insumo, embalagem e fator). Cada uma com `parceiroId`, policy da role `erp_tenant`, FORCE RLS e FKs compostas `(parceiroId, id)`; só `SELECT, INSERT, UPDATE` (sem DELETE). Gatilhos: `parceiroId` imutável, conteúdo do documento imutável (só situação, loja, fornecedor e nota mudam), item só muda enquanto o documento aguarda a conferência, chave do vínculo imutável, cancelado não volta. A migration `20261106000000_erp_documento_fiscal` é aditiva, tem o bloco de RLS condicional para os 3 perfis (superusuário, dono com FORCE RLS, dono sem RLS) e nenhum passo lê tabela de tenant. A chave de acesso da nota de compra passa a ser única só entre notas NÃO canceladas (índice parcial `NotaEntrada_chave_ativa_key`, criado antes de o antigo cair): cancelar a nota libera a chave para conciliar de novo. O Prisma não enxerga índice parcial no diff; o conferidor (`erp:conferir-migracao`) enxerga e acusa o índice antigo de volta.

### 316. 2026-10-22 · ERP F.1b: parser de XML que recusa antes de ler, com frase em português

**Razão:** `fast-xml-parser` 5.11.2 (a 4.x tinha aviso no `npm audit`) com `processEntities: false`, `parseTagValue: false` e sem prefixo de namespace. Antes do parser, no texto: tamanho (900 KB, ver 331), arquivo que é zip, PDF ou tem byte nulo, UTF-8 inválido, `<!DOCTYPE`, `<!ENTITY`, instrução `<?` fora da declaração XML, entidade que não seja as cinco do XML ou numérica, nome de tag `__proto__`, número de tags e profundidade. Depois: `nfeProc` versão 4.00, protocolo com cStat 100 ou 150 (qualquer outro código, como o 110 da denegada, é recusado com o código na frase), modelo 55 (NFC-e é recusada), ambiente de produção (tpAmb 1), saída (tpNF 1), finalidade normal (finNFe 1), chave com dígito verificador módulo 11 e coerente com os campos do documento, destinatário com CNPJ de uma loja do parceiro, até 200 itens. Cada recusa é uma frase que diz o que fazer; nada é gravado. Sem DTD e sem entidade externa por construção: não há como o arquivo pedir nada à rede ou ao disco.

### 317. 2026-10-22 · ERP F.1b: a assinatura digital do XML NÃO é verificada (risco aceito)

**Razão:** Conferir o XMLDSig exige o certificado do emitente e uma biblioteca de criptografia fiscal: é a SEFAZ quem diz se a nota existe. A F.1b recebe o arquivo que a casa subiu e confere o que dá para conferir sem segredo (protocolo no próprio XML, chave com dígito verificador, coerência chave × campos, destinatário). Quem sobe um XML adulterado com a mesma chave de uma nota já recebida é recusado (mesmo identificador, outro conteúdo); um XML inventado com chave nova entra na fila, e a pessoa que confere os itens e o total é quem o barra. **Risco aceito e dito na tela.** Nada de credencial, senha, chave ou certificado é pedido ou gravado, e a captação automática (SEFAZ, Cepai, manifestação do destinatário) NÃO existe nesta fase: só upload manual.

### 318. 2026-10-22 · ERP F.1b: dinheiro como texto para centavos, quantidade em milésimos, frete rateado pelo maior resto

**Razão:** Valores do XML são lidos como texto (regex, sem `Number`/ponto flutuante) para centavos; quantidade comercial com até 4 casas vira milésimos, metade para cima na 4ª casa. O valor líquido do item é `vProd − vDesc + vOutro + vSeg + vIPI + vST (+ FCPST)`: o que a casa de fato paga por ele. O frete da nota (`vFrete` do total) vai inteiro e é rateado pelo valor líquido de cada item, o que sobra de centavos indo para o maior resto (o mesmo desempate da nota digitada); o frete por item que o emitente informa é guardado e NÃO usado (para não contar duas vezes). O total é conferido: itens + frete = `vNF`; se não fecha, a tela diz a diferença e não deixa conciliar (a pessoa descarta e pede outra nota ao fornecedor). Exemplo do roteiro: líquidos 14500, 38000 e 2500; frete 791, 2073 e 136; total R$ 580,00.

### 319. 2026-10-22 · ERP F.1b: a memória do item é por fornecedor, código e unidade; mudar uma memória que já existe exige `fornecedores.editar`

**Razão:** O mesmo código vendido em PC e em KG são dois itens (a unidade comercial entra na chave). A escolha vira memória ao salvar ou conciliar; na próxima nota o item já vem ligado, com o aviso "Lembrado deste fornecedor". O fator (quantas embalagens do insumo cabem em uma unidade comercial) vai de 0,001 a 1.000 (milésimos de 1 a 1.000.000) e mostra a conta ao vivo ("2 CX → 20 kg"). **Quem só tem `compras.lancar` cria memória nova, mas trocar uma memória existente (outro insumo, outra embalagem, outro fator) exige `fornecedores.editar`:** a memória vale para as próximas notas de todas as lojas, então não é decisão de quem está só dando entrada. Mudar a memória não mexe em nota já lançada (o passado não muda); o histórico guarda o antes e o depois.

### 320. 2026-10-22 · ERP F.1b: conciliar é uma transação só; "ligar à nota já lançada" não cria nota nem estoque

**Razão:** Conciliar trava o documento (`FOR UPDATE` e versão), grava a escolha de loja e fornecedor, as memórias e os itens, lança a nota de compra pelo MESMO núcleo da 1.5 (`lancarNotaNaTransacao`, origem `IMPORTACAO`, com a chave) e marca o documento `CONCILIADO`: ou tudo, ou nada. Cinco conciliações ao mesmo tempo: uma nota. A nota do XML nunca duplica o estoque: o custo e o razão do estoque seguem as regras da 1.5 e da 1.6 (com o estoque da loja aberto, a entrada vai para o razão só se a data da entrada for igual ou posterior à abertura; por isso a data de entrada é editável e começa na emissão). **Ligar:** se a casa já lançou a nota à mão, o XML se liga a ela e só a chave é gravada na nota existente: nenhum custo, nenhum movimento. Candidata = mesmo número, série igual ou vazia, mesma loja, sem chave, e fornecedor igual ou sem CNPJ. Mesmo fornecedor: conciliar é recusado (só ligar). Fornecedor sem CNPJ: a tela pede para conferir e oferece "Não é essa nota: concilie mesmo assim".

### 321. 2026-10-22 · ERP F.1b: cancelar a nota conciliada devolve o documento à fila; descartar o documento cancela a nota pelo caminho oficial

**Razão:** Cancelar a nota de compra que veio do XML estorna uma vez só (a regra da 1.5) e volta o documento a "Aguardando conferência", com a chave livre (índice parcial): conciliar de novo dá UMA nota ativa. Descartar um documento que aguarda só o marca como descartado, com motivo (3 a 200 caracteres, no histórico, a chave continua guardada para o mesmo arquivo não entrar de novo); descartar um conciliado cancela a nota pelo mesmo caminho do cancelamento, no mesmo ato. Descartado não volta.

### 322. 2026-10-22 · ERP F.1b: o fornecedor que o XML traz e a casa não conhece nasce "a completar"; o ambíguo nunca é escolhido sozinho

**Razão:** Emitente desconhecido: cadastro provisório (`A_COMPLETAR`) com razão, fantasia, CNPJ, inscrição estadual, endereço e UF do XML (e-mail e WhatsApp vazios), com o sufixo do CNPJ no nome se o nome já existir. Recusas com frase: fornecedor desativado com esse CNPJ (reative), fornecedor marcado "Compras sem nota fiscal" com esse CNPJ (ele nunca recebe nota fiscal), emitente com o CNPJ de uma loja do próprio grupo (transferência entre lojas não é nota de compra). Dois fornecedores ativos com o mesmo CNPJ (só onde o índice da F.1a não pôde nascer) ou duas lojas com o mesmo CNPJ: o documento fica sem resolver até a pessoa escolher, e conciliar sem escolher é recusado.

### 323. 2026-10-22 · ERP F.1b: upload pela server action, com a checagem de tamanho antes de ler os bytes (o limite foi para 900 KB: 331)

**Razão:** O arquivo vai por `FormData` para a action (sem rota de API nova e sem mexer no `next.config.js`, que limita a 1 MB por padrão). O cliente barra o arquivo maior antes de enviar (botão desabilitado e a frase na tela) e o servidor confere `file.size` ANTES de `arrayBuffer()`. Uma nota de 200 itens cabe com folga; arquivo maior é quase sempre outra coisa (zip, PDF).

### 324. 2026-10-22 · ERP F.1b: partes do desenho que ficaram diferentes da análise

**Razão:** (a) A situação do item é DERIVADA (ligado ou pendente) em vez de coluna, e não há `FORA_DO_LANCAMENTO`: item sem insumo escolhido não gera nota parcial, o documento só concilia com todos ligados. (b) O vínculo não tem `ativo`: trocar a memória é o histórico, e não há "desligar". (c) Os estados `RECEBIDO`, `ERRO` e a origem `SEFAZ` existem no tipo e ficam reservados (a captação automática é outra fase). (d) Os dois itens do XML que caem no mesmo insumo e na mesma embalagem viram UMA linha na nota (somando); a mesma escolha em dois itens de um código só é recusada com a frase. (e) A nota que veio do XML e a nota ligada não se editam: o caminho é cancelar e conciliar de novo (a edição direta volta ao detalhe com a frase).

### 325. 2026-10-22 · ERP F.1b: perfis e alcance

**Razão:** Ver a lista e o documento: `compras.ver`; receber, conferir e conciliar: `compras.lancar`, só na loja do alcance (o gerente do Delivery não vê nem abre, pelo id, o documento da Penha, e importa o XML do CNPJ da loja dele); descartar: o mesmo; trocar memória existente: `fornecedores.editar`. O operador não tem "Notas recebidas" no menu e, ao digitar a rota, volta ao início com "Essa tela não está no seu acesso". Outro parceiro: 404 no id; o parceiro B recebe a MESMA nota (mesmo CNPJ de loja) sem conflito e sem herdar a memória do A. As duas árvores (`/erp` e `/rodolfo/erp/[slug]`) têm as mesmas telas e actions, esta com `auditLog`.

### 326. 2026-10-22 · ERP F.1b: referências Kairu consultadas e o que foi aplicado

**Razão:** Pelo MCP Kairu, nesta fase: `library:sefaz` (lido inteiro de novo) e buscas por "nota fiscal XML" e "conferência formulário tabela" (design), que não trouxeram material novo; `library:design-estoque-editorial` consta na coleção de design. Da análise da F.1: `library:compras-cotacoes` e `pass:compras-cotacao-comparavel` (cotação: fora), "Nota Certa" (emissão de venda: fora), "Da Ficha ao Fornecedor", e o caso do Spettacolo (notas de entrada). Aplicado: parser sem entidade externa e com limite, deduplicação pela chave de 44 dígitos, "resumo não é nota completa" (a F.1b só recebe a nota completa, com protocolo), nenhuma manifestação nem ação automática, nada de segredo em código ou tela, memória código → insumo com fator auditado e idempotência de "um clique, um pedido". Deixado de fora de propósito: cotação, emissão, captação automática, manifestação.

### 327. 2026-10-22 · ERP F.1b: perguntas para o Rodolfo (não bloqueiam; o padrão está em negrito)

**Razão:** (1) Fornecedor de feira que TEM CNPJ precisa de e-mail? **Sim, salvo "Compras sem nota fiscal"** (301, 313). (2) O "Cepai" é a SEFAZ? **Segue sem resposta; nada da F.1b depende, nenhum serviço ou credencial foi escolhido.** (3) Nota com mais de 200 itens? **Recusada com a frase de dividir**; subir o limite é uma linha (`LIMITES_DO_XML`), mas pede conferir o tempo da tela. (4) Quem troca a memória do fator? **Quem tem `fornecedores.editar`; o gerente que só lança cria a memória e não a troca** (319). (5) A assinatura do XML? **Não é verificada** (317): quando entrar a captação pela SEFAZ, a própria SEFAZ passa a ser a prova. (6) A data de entrada começa na emissão: nota emitida antes da abertura do estoque da loja entra no custo e NÃO no razão (320); **a pessoa pode mudar a data de entrada na conferência.** (7) Nota de transferência entre lojas do próprio grupo: **recusada** (322), até o Rodolfo dizer como quer tratar.

### 328. 2026-10-22 · ERP F.1b (ajustes dos fiscais): a ordem das travas é sempre documento fiscal → nota; deadlock vira a frase de conflito

**Razão:** Descartar um documento conciliado travava documento e depois nota; cancelar a nota travava nota e depois documento: duas pessoas ao mesmo tempo podiam se esperar (deadlock do Postgres, erro 500). `cancelarNotaNaTransacao` agora trava PRIMEIRO o documento ligado (`FOR UPDATE` por `notaEntradaId`, depois da trava compartilhada do período) e só então a nota, a mesma ordem do descarte e da conciliação. Por segurança, `ehDeadlock` (40P01 / P2034) em salvar, conciliar, ligar, descartar e cancelar a nota devolve "Alguém mexeu nesta nota agora há pouco…" com o botão de recarregar, nada gravado. Teste de corrida (seis rodadas de cancelar a nota × descartar o documento ao mesmo tempo): nenhuma recusa vira erro, a nota é estornada uma vez só; sem a trava nova o teste reprova.

### 329. 2026-10-22 · ERP F.1b (ajustes dos fiscais): ligar compara o CNPJ, e com total diferente pede confirmação explícita (no servidor também)

**Razão:** A nota lançada à mão liga ao documento quando o CNPJ do fornecedor dela é o do emitente, mesmo havendo dois cadastros com esse CNPJ (antes exigia o MESMO cadastro e recusava o outro). Quando o total da nota lançada difere do da nota fiscal, "Ligar a esta nota" não liga: abre uma confirmação com a diferença em destaque ("Os valores são diferentes… R$ 520,00 de diferença… NÃO muda o valor dela") e só o botão "Sim, é a mesma nota: ligar" envia. O servidor exige a confirmação (`confirmouDiferenca`) e recusa sem ela com a mesma frase: um envio sem a tela não liga por engano.

### 330. 2026-10-22 · ERP F.1b (ajustes dos fiscais): o navegador recebe só a raiz do CNPJ dos fornecedores

**Razão:** O formulário da nota recebia o documento inteiro de todos os fornecedores só para avisar "mesma empresa, outro estabelecimento". Agora `dadosDoFormularioDeNota` manda `raizCnpj` (os oito primeiros dígitos do CNPJ) e nada para CPF (pessoa física). Teste: o HTML e o dado do formulário não trazem o CNPJ completo.

### 331. 2026-10-22 · ERP F.1b (ajustes dos fiscais): limite do XML em 900 KB (revisa o 1 MB das decisões 316 e 323)

**Razão:** O Next recusa o corpo da requisição acima de 1 MB com uma página de erro, e o arquivo vai junto com o resto do formulário. Com o teto em 900 KB, a frase amigável ("o arquivo tem X KB e o limite é 900 KB") aparece sempre, no navegador e no servidor, antes do teto do Next. Uma NF-e de 200 itens fica na casa das centenas de KB no máximo.

### 332. 2026-10-22 · ERP F.1b (ajustes dos fiscais): "Insumo que falta: cadastrar" por item da conferência, com volta mantendo as escolhas

**Razão:** O mesmo padrão da nota digitada (311): cada item sem insumo tem o atalho; o nome é dito uma vez; o caminho de volta (`?volta=`) leva de volta à conferência; o que estava escolhido (insumo, embalagem e fator de cada item, loja, fornecedor e data de entrada) é guardado só no navegador desta aba e volta com "Recuperamos o que você tinha preenchido"; o insumo novo entra no item que pediu o cadastro e o aviso diz "Insumo salvo com sucesso". Quem não pode cadastrar insumos vê "peça a quem cuida dos insumos". O rascunho de uma versão velha do documento é descartado com aviso.

### 333. 2026-10-22 · ERP F.1b (ajustes dos fiscais): mensagens sem jargão e sem eco do arquivo; XML e chave de acesso explicados

**Razão:** As recusas não trazem mais `DOCTYPE, ENTITY`, `protNFe`, `procNFe`, `indTot` nem "SEFAZ" solta; a nota denegada não repete o código nem o texto de motivo do próprio arquivo ("110: Autorizado…" contradiria a recusa): diz que a nota não está com o uso autorizado e manda conferir com o fornecedor. A tela de importar e a ajuda dizem "o site do governo que autoriza as notas (a SEFAZ)". A lista e a conferência explicam, em uma frase, o que é o arquivo XML da nota (o que o fornecedor manda por e-mail, não o PDF) e a chave de acesso (o número de 44 dígitos que impede a mesma nota de entrar duas vezes). Ajuda: `compras-documentos` e `compras-documento-importar` na versão 2.

### 334. 2026-10-22 · ERP F.1b (ajustes dos fiscais): página de "não achamos" em português nas rotas de Compras

**Razão:** `not-found.tsx` nas duas árvores de Compras (`/erp/compras` e `/rodolfo/erp/[slug]/compras`): dentro do shell, "Não achamos esta nota fiscal." (ou "esta página"), com o botão de volta para a lista; o status continua 404 e a página não diz se a nota existe para outra pessoa, loja ou parceiro. A página de erro global do app não foi mexida.

### 335. 2026-10-22 · ERP F.1b (ajustes dos fiscais): os testes de banco voltam a poder rodar em paralelo

**Razão:** O cenário de dois cadastros com o mesmo CNPJ derrubava o índice `Fornecedor_parceiroId_documento_key` no banco compartilhado. Foi para `tests/erp-documento-fiscal-cnpj-repetido.db.test.ts`, que cria um banco DESCARTÁVEL (as migrations aplicadas como superusuário, sem o índice) e o apaga no fim, como fazem os arquivos `*-migracao`. Nenhum teste da F.1b mexe mais em índice do banco compartilhado: `ERP_DB_TESTE=... npx vitest run` (paralelo) e `--no-file-parallelism` passam no `ff_dev`. Nos bancos de dono (perfis), o paralelo ainda mostra instabilidade antiga de `erp-acesso` e `erp-permissoes` (limite de login por IP, sem relação com a F.1b): ali a convenção continua sendo em sequência.


### 336. 2026-10-22 · ERP L.1: sem migration; a marca de referência já existia (I.1b) e o que faltava era a lista

**Razão:** O pedido de "migration aditiva para a marca" já estava cumprido: `Insumo.marcaReferencia` (texto, até 80, CHECK, histórico) veio na I.1b (266). A L.1 não cria coluna, índice, gatilho nem tabela: a exclusão usa o `DELETE` que o papel `erp_tenant` já tem e as FKs `Restrict` que já existem. Por isso `migrate diff` segue vazio e o `erp:conferir-migracao` não muda. O que se provou foi o `DELETE` pelo papel de tenant nos 3 perfis do banco (superusuário, dono com FORCE RLS, dono sem RLS). Um teste-guarda impede que outro arquivo do app apague `Insumo`, e outro confere no catálogo do Postgres que toda tabela com FK para `Insumo` está nas contas da tela "Remover" (tabela nova com FK reprova até entrar lá).

### 337. 2026-10-22 · ERP L.1: marca de referência continua TEXTO; entra na lista, na busca e num filtro; fornecedor homologado fica fora

**Razão:** Entidade por parceiro (tabela de marcas) custaria migration, tela de gestão e fusão de grafias, sem destravar nada que o Rodolfo pediu ("opcional, sem trava de compra ou cotação, sem homologação automática"). A grafia se resolve na leitura: o filtro "Marca" compara sem diferenciar caixa e lista cada marca uma vez (a grafia mais comum), com a contagem; "Sem marca informada" lista os que não têm; a busca acha pelo nome OU pela marca; a linha mostra "Marca: Camil". Histórico de quem mudou já existia (retrato com `marcaReferencia`). Marca ≠ fornecedor: nada na L.1 liga uma à outra, e o fornecedor homologado continua só como possibilidade futura (a cotação futura recebe a marca alternativa, herança da I.1b).

### 338. 2026-10-22 · ERP L.1: "cadastro incompleto" tem 4 motivos derivados; sem unidade e sem quantidade da embalagem não existem; custo não informado é outro filtro

**Razão:** Os motivos, derivados na leitura (nada é gravado): **sem categoria**; **categoria "Outros / a classificar"** (espera revisão); **conservação a confirmar** (I.1b); e, no pré-preparo, **validade não informada na ficha**. "Sem unidade" não existe porque a coluna é obrigatória (enum NOT NULL), e "sem a quantidade da embalagem" também não, porque o banco tem CHECK maior que zero (a primeira versão tinha esse motivo e o teste de banco mostrou que ele nunca ocorre; saiu). **Custo não informado NÃO é incompleto**: tem o filtro "Só sem custo" e o selo próprio, e a tela diz isso ao lado do filtro. A lista de motivos tem uma só fonte: o filtro do banco (`filtroDoIncompleto`) e a função da linha (`motivosDoCadastro`) saem dela, e um teste confere, insumo a insumo, que o conjunto filtrado é exatamente o dos que têm motivo. Cada linha diz "Cadastro incompleto: Sem categoria · Conservação a confirmar".

### 339. 2026-10-22 · ERP L.1: paginação 10/25/50/100 (padrão 50), validada no servidor, na URL, com dois totais de rótulos diferentes

**Razão:** `por` só vale 10, 25, 50 ou 100; qualquer outra coisa (texto, negativo, 1000, 25,5, lista) cai em 50, no servidor e na leitura da URL. A página fora da faixa é ajustada à última (a remoção de itens não deixa página inexistente); zero resultado é "0 insumos", uma página vazia, Anterior e Próxima desabilitadas. A ordem tem desempate por id (também na ordem por custo, que continua em memória e segue o nome e o id). O rodapé (`PaginacaoNumerada`, reaproveitável) diz "Mostrando 1–25 de 137 insumos · Página 1 de 6", Anterior, números compactos e Próxima, com "Itens por página" como QUATRO LINKS (funcionam sem JavaScript, voltam à página 1 e levam os filtros). No celular os números saem e fica "Página x de y". Acima da tabela: "No cadastro: N insumos (X ativos, Y desativados) · Nesta lista: M" (com "(com os filtros)" quando há filtro); o subtítulo do cabeçalho passou a ser o do cadastro ("… no cadastro"), porque antes ele mostrava só os ativos como se fosse o total. Não existe exportação de insumos hoje; quando existir, cobre todos os filtrados.

### 340. 2026-10-22 · ERP L.1: caneta e lixeira na linha, 44 x 44, com o nome no rótulo; quem não edita, o pré-preparo e o desativado não ganham o que não podem

**Razão:** Coluna "Ações" na tabela e linha própria no cartão (celular, sem link dentro de link), `aria-label="Editar Farinha de trigo"` / `"Remover Farinha de trigo"`, só para quem tem `insumos.editar` e parceiro não bloqueado (o servidor decide de novo em toda action e em toda página). Pré-preparo mostra "Pela ficha" (ele muda junto com a ficha); desativado não tem caneta (reative no detalhe) mas tem lixeira. A tabela ficou mais enxuta para caber com a coluna nova: "Outras embalagens" e "Custo inicial" só a partir de 1280 px (o custo por unidade, que é o que importa, fica sempre), o que também desfez uma rolagem lateral de 4 px a 820 px.

### 341. 2026-10-22 · ERP L.1: remover é uma TELA que mostra os vínculos antes de qualquer coisa; com vínculo só desativa

**Razão:** A lixeira nunca apaga direto: abre "Remover insumo", que lê agora e mostra em frases simples tudo o que usa o insumo: fichas (quantas fichas, não linhas; ficha desativada também conta), embalagem de prato (custo por canal), itens de notas de compra (é de onde vem o histórico de preço pago), itens de notas fiscais por XML, memória de código do fornecedor, saldos, movimentos, itens de contagem, linhas do estoque guardado de abertura/fechamento, requisições, lotes de produção, etiquetas, outras embalagens de compra e mudanças de custo no histórico do insumo (só alteração que mexeu em custo, embalagem ou frete; mudar só o nome não conta). Com qualquer um: só "Desativar" (motivo opcional; tira da lista e da busca; tudo preservado; reativa). Sem nenhum: "Desativar" ou "Excluir de vez". Pré-preparo cai no detalhe. Contagens são do parceiro todo, sem detalhar loja, valor nem nota (o insumo é cadastro da rede).

### 342. 2026-10-22 · ERP L.1: exclusão definitiva só sem vínculo, com confirmação explícita no servidor, conferida de novo na transação com a linha travada

**Razão:** `excluirInsumo`: exige "Entendi que isto apaga o cadastro e não dá para desfazer" (recusa sem a caixa, no servidor também), abre transação, trava a linha com `SELECT … FOR UPDATE`, conta os vínculos DEPOIS da trava e só então apaga e grava `EXCLUIU` no histórico (nome, tipo, categoria, marca, unidade, quem). Quem vincula nesse meio-tempo termina antes (a FK pede `FOR KEY SHARE`) e é visto; quem tenta depois da trava espera e, se a exclusão vence, falha na FK dele. A FK `Restrict` do banco é a última palavra e vira a frase "passou a ter registros ligados agora há pouco; nada foi apagado". Testes com concorrência real: a outra pessoa vincula e segura, a exclusão espera e recusa; a exclusão segura e o vínculo falha limpo; 20 rodadas de excluir × vincular ao mesmo tempo com sempre um vencedor só e nenhum vínculo órfão; duas exclusões simultâneas = uma exclui, a outra ouve "não achou". Na tela, a corrida aparece como "registros ligados a ele (1 etiqueta)" com "Recarregar". Nunca apaga movimento, nunca invalida ficha (o `DELETE` só roda com zero referências). Permissão: `insumos.editar` (a mesma de editar e desativar), porque só passa sem nenhum vínculo; sem permissão nova e sem mexer na versão do catálogo.

### 343. 2026-10-22 · ERP L.1: o retorno à lista leva `de` (filtros, página e tamanho) e `origem=lista`; o aviso vem do banco, não da URL

**Razão:** A caneta abre a edição com `de=<estado da lista>&origem=lista`; salvar volta à LISTA na mesma página, filtros e tamanho, com "Insumo atualizado com sucesso: nome" e os caminhos "Continuar editando" e "Ver o insumo". "Editar" do detalhe volta ao detalhe e guarda `de` (o "Voltar para a lista" e o "Ver todos os insumos" continuam na mesma página); "Novo insumo" e "Cadastrar outro insumo" também levam `de`. `de` é dado de fora: `deSeguro` só devolve os filtros que a lista conhece, reescritos (nada de `//`, esquema, barra invertida, controle) e o destino é sempre a lista do próprio `base`; `feito` e `ref` do aviso são do servidor (uma chave de um mapa fixo e um id), o nome vem do banco (para "excluído", do histórico `EXCLUIU`) e `ref` torto ou de outro parceiro não mostra nada.

### 344. 2026-10-22 · ERP L.1: edição reenviada depois de resposta perdida é sucesso "nada mudou", não "alguém alterou"

**Razão:** Resposta perdida na edição deixava a tela com a versão velha: tocar em salvar de novo batia na versão e dizia "alguém alterou", mesmo com a edição já gravada. Agora, com a versão velha, se o que chegou é EXATAMENTE o que está gravado (mesmo retrato, mesma categoria, sem pedir uma confirmação de conservação que ainda falta), o resultado é "Nada mudou" e nada é gravado de novo; qualquer diferença continua conflito e nada é sobrescrito. No navegador (celular, tablet nos dois sentidos e computador, nos dois temas): a requisição é executada no servidor e a resposta é derrubada; a tela não afirma sucesso nem falha, mantém o formulário, e o segundo envio volta à lista com "Nada mudou em <nome>" e uma linha só no histórico.

### 345. 2026-10-22 · ERP L.1: a busca da lista é literal (`%` e `_` são letras)

**Razão:** O Prisma não escapa os curingas do LIKE em `contains`: buscar `%` trazia o cadastro inteiro. Agora `\`, `%` e `_` são escapados na busca (só acha quem os tem no nome ou na marca). Já existia assim desde a 1.1; achado pelo teste de ataque da L.1.

### 346. 2026-10-22 · ERP L.1: ajuda contextual e contrato de design

**Razão:** `ajuda-textos.ts`: `insumos` e `insumo-novo` foram à versão 4 (filtros que se combinam, "No cadastro" × "Nesta lista", tamanhos, caneta e lixeira, cadastro incompleto, volta da caneta) e nasceu `insumo-remover` (versão 1); lock regravado. O padrão "lista paginada com ações na linha" entrou em `.interface-design/system.md` para as próximas listas (fichas, fornecedores).

### 347. 2026-10-22 · ERP L.1: referências Kairu consultadas e o que foi aplicado

**Razão:** Pelo MCP Kairu: buscas "cadastro de insumos lista paginação filtros" (nenhum prompt), "insumos" (nenhum), e, na coleção design, "estoque" (`library:design-estoque-editorial`, já a referência principal do contrato) e "corporativo" (`library:design-precisao-corporativo` v1.2.0, lido inteiro). Do Corporativo: toolbar de busca e filtros + tabela com linhas de 44 px e rodapé com paginação; "selecionar todas as linhas da página é diferente de todos os resultados" e "exportação reflete escopo e filtros" (viraram a regra de que total do cadastro, total filtrado e quantidade da página têm rótulos diferentes e de que a exportação futura cobre todos os filtrados); "preserve posição e filtros ao voltar do detalhe"; "busca sem resultado: preserve a busca e ofereça limpar filtros"; "todo botão visível executa uma ação válida ou tem indisponibilidade explicada" (a lixeira abre uma tela com os vínculos, e "Pela ficha" explica a ausência); "erro preserva o que foi preenchido, envio com progresso impede duplicação"; "lista extensa: paginar com total e navegação acessível"; alvos de 44 px e `aria-sort`. Do Editorial: separadores delicados e número de tabela sem serifa (já no contrato). Não aplicado: seleção múltipla e ações em lote (fora da L.1), inspetor lateral (o detalhe é página própria).

### 348. 2026-10-22 · ERP L.1: perguntas para o Rodolfo (não bloqueiam; o padrão adotado está em negrito)

**Razão:** (1) Quem pode excluir de vez? **Quem edita insumos (Dono e Gerente), porque só passa sem nenhum registro ligado; sem permissão nova.** (2) Mudar só o nome de um insumo, ou cadastrar e corrigir, conta como "histórico de preço" para impedir a exclusão? **Não; só mudança de custo, embalagem ou frete.** (3) Marca de referência vira lista própria (com nome padronizado) um dia? **Não agora; o filtro agrupa grafias iguais sem diferenciar caixa.** (4) "Cadastro incompleto" deve incluir marca ou prazo de uso não informados? **Não: são opcionais por decisão do Rodolfo.** (5) A lista deve ter exportação? **Não existe hoje; quando existir, cobre todos os filtrados.**


### 349. 2026-10-22 · ERP L.1 (ajustes dos fiscais): um rótulo só, "Nesta lista", com "(com os filtros)" quando há filtro

**Razão:** A tela dizia "Com os filtros" e a ajuda dizia "Nesta lista". Agora é sempre "Nesta lista: N insumos", e com filtro "Nesta lista (com os filtros): N insumos", ao lado de "No cadastro: N". A ajuda já falava em "Nesta lista" e ficou como estava (a versão da ajuda não mudou); decisão 339 e o contrato de design foram alinhados.

### 350. 2026-10-22 · ERP L.1 (ajustes dos fiscais): todo link de insumo com a lista na memória nasce de `comDe` (URLSearchParams)

**Razão:** Os endereços com "de onde vim" eram montados à mão em seis lugares. Agora `comDe(caminho, de, extras)` (em `insumo-campos.ts`) é o único: o valor de `de` (que tem `&` e `=` dentro) vai inteiro codificado como UM parâmetro (`?de=por%3D25%26pagina%3D3&origem=lista`), nunca solto, e volta igual em `searchParams.get('de')`. Teste de ida e volta com busca cheia de símbolos (`&`, `=`, `%`, `+`, `#`, aspas, acento), os quatro endereços (editar, remover, detalhe, novo) e o redirecionamento depois de salvar; no navegador, a conferência dos `href` da lista a 390 px.

### 351. 2026-10-22 · ERP L.1 (ajustes dos fiscais): no celular os filtros ficam num botão "Filtros (n)" e a ajuda nasce recolhida (pelo mecanismo que já existia)

**Razão:** A 390 px a primeira linha da lista aparecia depois da ajuda aberta e de sete filtros. Agora: a busca fica sempre à vista (placeholder "Buscar nome ou marca", que cabe no campo); "Filtros (n)" abre e fecha os selects e as caixas de marcar (abaixo de 640 px; de 640 px para cima o bloco é sempre mostrado), nasce fechado (sem piscar) e o `n` conta os filtros valendo fora a busca; os chips dizem quais são. Os campos seguem no formulário mesmo fechados. A caixa "Como funciona" usa o `recolhida: true` que as telas de contar já usavam (uma linha que abre, sem mexer na versão nem no lock; a pergunta da 1ª vez continua abrindo a caixa). Resultado: a primeira linha da lista já aparece na primeira tela do celular (topo a 732 px de 844, com o aviso de pendências ainda no caminho).

### 352. 2026-10-22 · ERP L.1 (ajustes dos fiscais): o aviso de pendências não termina mais com "· sem saldo" solto

**Razão:** "16 insumos ainda sem categoria definitiva: 13 sem categoria · 3 em Outros / a classificar · sem saldo." deixava o "sem saldo" sem assunto. Agora o valor só entra quando existe ("… · R$ 1.234,56 em estoque nas lojas que você acessa") e, sem valor, a frase termina em "3 em Outros / a classificar." A fila de classificar (coluna por insumo) continua dizendo "sem saldo" na própria linha. Teste do aviso atualizado.

### 353. 2026-10-22 · ERP L.1 (ajustes dos fiscais): ficha técnica com um insumo excluído no mesmo instante responde com frase amigável

**Razão:** A ficha trava os insumos com `FOR SHARE` antes de conferir, então a exclusão (`FOR UPDATE`) espera ou recusa por vínculo; mesmo assim, se o insumo sumiu entre a abertura da tela e o salvar, a ficha dizia "Insumo não encontrado neste cadastro". Agora, quando o histórico guarda `EXCLUIU` para aquele id, a frase é "Este insumo acabou de ser excluído do cadastro. Tire-o da ficha ou escolha outro e salve de novo; nada foi gravado." (no item certo, ao criar e ao editar); id que nunca foi do cadastro ou é de outro parceiro continua com a frase de sempre (não confirma nem nega a existência de nada). Como rede de proteção, uma violação da FK de `FichaItem`/`ProdutoEmbalagem` por insumo também vira essa frase em vez de 500 (o caminho não é alcançável pelo desenho, então não há teste que o force). Testes: excluído antes, de outro parceiro, a corrida de verdade (a ficha espera a trava e vê o insumo sumido), a ficha que vence (a exclusão recusa) e a edição. Compras e notas fiscais por XML seguem com a frase de sempre (fora do pedido).

### 354. 2026-10-22 · ERP L.1 (ajustes dos fiscais): `npm run typecheck` com a mesma memória do build

**Razão:** O `tsc` estoura a heap padrão nesta base, como o build. O script passou a `NODE_OPTIONS=--max-old-space-size=6144 tsc --noEmit`.

### 355. 2026-10-22 · ERP L.2: sem permissão nova; ver e exportar são "ver compras e notas", por loja, e o servidor lê só as lojas do acesso

**Alternativa:** criar "ver relatórios de compras" e "exportar". **Razão:** o relatório só reorganiza o que a nota de compra já mostra a quem tem `compras.ver` (quantidade, valor, frete, fornecedor, nota); uma permissão nova daria a perfil próprio antigo um buraco ou um vazio sem decisão do Rodolfo. Dono e Gerente têm (Gerente só nas lojas dele); Operador não tem `compras.ver`, então a página o leva a uma tela que ele pode, o menu nem mostra os relatórios e a planilha responde 403 sem dado. Loja pedida fora do acesso NUNCA amplia: sobra o que ele pode ver e, se nada sobra, o relatório sai vazio com a frase; o mesmo na planilha (403) e na impressão. O id de uma loja fora do acesso nem sai do servidor para a pessoa (teste no HTML). O nível 1 usa as mesmas telas pelo espelho `/rodolfo/erp/<slug>`.

### 356. 2026-10-22 · ERP L.2: o dia é o do Rio (America/Sao_Paulo) para toda loja; o intervalo é [início, fim) convertido no SQL; fuso por loja fica como pergunta

**Alternativa:** coluna `Loja.fusoHorario`. **Razão:** nenhuma loja do ERP tem fuso próprio e o resto do sistema já conta o dia no Rio (`hojeNoRio`); uma coluna sem tela para mudá-la seria um campo morto. `entradaEm` e `emitidaEm` são datas de calendário (sem fuso); só o instante do lançamento (`lancadaEm`, UTC) é lido no relógio do Rio: o filtro compara com `[meia-noite do Rio do primeiro dia, meia-noite do Rio do dia seguinte)` convertida para UTC (usa o índice) e o dia de agrupar sai de `AT TIME ZONE`. Provado no limite: 02:59:59 UTC de 11/10 é 23:59:59 de 10/10 e 03:00:00 UTC já é 11/10; 02:30 UTC de 01/10 é 23:30 de 30/09 (banco, teste puro e tela).

### 357. 2026-10-22 · ERP L.2: três datas possíveis (entrada, emissão, lançamento), a escolha fica escrita e é a mesma em filtro, total, agrupar por dia, planilha e impressão

**Razão:** "entrada" (padrão) é a data da nota que já põe a compra no período do CMV; "emissão" só existe nas notas que vieram do XML (as digitadas ficam de fora e a tela diz QUANTAS ficaram, no mesmo recorte); "lançamento" é o dia em que alguém lançou, no relógio do Rio. A frase "Data da entrada da nota, de 01/10/2026 a 31/10/2026" é a mesma na tela, no cabeçalho da planilha e na impressão (`fraseDoPeriodo`). Uma expressão SQL só (`DIA`) decide o dia; não há como filtro e total usarem datas diferentes.

### 358. 2026-10-22 · ERP L.2: preço médio é valor ÷ quantidade (ponderado) só das linhas comparáveis; sem base, não calcula; só vale para UM insumo; custo entregue é o segundo número

**Razão:** "comparável" = linha com insumo, unidade gravada, conta embalagens × conteúdo que fecha (até 1 milésimo de diferença) e valor maior que zero. O que não é comparável fica FORA da média, DENTRO do dinheiro e da contagem, e a tela lista os motivos ("a unidade não foi gravada na nota", "o valor da linha é zero (bonificação)", "a conta da embalagem não fecha", "a linha não está ligada a um insumo"); nunca vira R$ 0,00. Média de kg de insumos diferentes não é preço: o preço médio aparece no histórico de um insumo, no resumo agrupado por insumo e quando um insumo está escolhido. "Preço médio ponderado" soma só os itens; "custo médio entregue" soma também o frete atribuído (a distinção pedida entre preço do item e custo entregue). Amostra no teste: 5 kg a R$ 46, 10 kg a R$ 47, 6 kg a R$ 40 e 4 kg a R$ 50 dão R$ 45,62/kg (a média simples daria R$ 45,75). Preço abaixo de 1 centavo por unidade mostra as casas que precisa (R$ 0,0025/un), como no resto do ERP.

### 359. 2026-10-22 · ERP L.2: quantidade nunca soma unidades; cada unidade tem a sua linha; unidade que a nota não gravou aparece como "sem unidade"

**Razão:** kg, L e un ficam em linhas separadas no resumo, nos grupos (uma linha por grupo e unidade), na planilha ("Quantidade em kg", "Quantidade em L", "Quantidade em un") e na impressão. A linha sem unidade entra no dinheiro e fora de toda quantidade, e a planilha diz "não se soma (a nota não gravou a unidade)".

### 360. 2026-10-22 · ERP L.2: valores do lançamento, não do cadastro de hoje

**Razão:** a linha mostra o que a nota guardou: nome do insumo e do fornecedor (snapshot), embalagem original, quantidade de embalagens e conteúdo, quantidade convertida, unidade, valor e frete rateado. Renomear o insumo, trocar a embalagem ou o conteúdo no cadastro não muda uma compra antiga (teste: totais e linhas idênticos antes e depois de mexer no cadastro). Só o RÓTULO do grupo ("Muçarela") usa o nome de hoje, e o filtro por categoria usa a categoria de hoje do insumo (a nota não a guarda); a tela diz isso.

### 361. 2026-10-22 · ERP L.2: nota cancelada fora de todo total e separada; documento fiscal que só aguarda conferência nem é lido como compra; a nota repetida conta uma vez

**Razão:** o motor lê só itens de nota LANÇADA; as canceladas aparecem num aviso com o valor e num modo próprio ("Só notas canceladas", com banner, rotulado e sem somar com nada). A mesma nota cancelada e lançada de novo certa (o índice único deixa) entra uma vez só. `DocumentoFiscal` aguardando conferência não é consultado para compra: a tela só conta quantos aguardam e leva à tela de notas recebidas. O link do documento fiscal aparece na linha da nota que o concilia ou foi ligada a ele (`documentoId`).

### 362. 2026-10-22 · ERP L.2: tudo se soma no banco, com um SQL de fonte só e uma fotografia só (REPEATABLE READ) por tela

**Razão:** resumo, grupos, linhas, canceladas e contagens saem do mesmo trecho SQL (`fonte`, com `Prisma.sql` montado no código e conferido pelo mesmo guarda do portão); os parâmetros são sempre ligados (nenhum texto da URL vira SQL: ids com formato, listas fechadas, datas lidas). Paginação por `LIMIT/OFFSET` no banco com a contagem na mesma consulta; a ordem tem desempate (nenhuma linha repete nem some entre páginas). Como o relatório lê em várias consultas, `transacao(…, { repetivel: true })` (opção nova do portão, REPEATABLE READ) garante "soma das linhas = resumo" mesmo se alguém lança ou cancela uma nota no meio. A RLS continua valendo por baixo (`cliente.sql` roda no papel do tenant).

### 363. 2026-10-22 · ERP L.2: migration aditiva com dois índices (emissão e lançamento por loja)

**Razão:** a base "entrada" já tinha índice (`parceiroId, lojaId, entradaEm`); as outras duas ganharam `(parceiroId, lojaId, emitidaEm)` e `(parceiroId, lojaId, lancadaEm)`, ambos no `schema.prisma` (o `migrate diff` segue vazio). `CREATE INDEX IF NOT EXISTS`, sem tabela, coluna, CHECK, gatilho nem SELECT sob RLS; provada nos 3 perfis do banco com dado antigo e aplicada duas vezes. O conferidor cobra os dois índices quando a migration consta como aplicada (ou quando um deles já existe), e o banco da fase anterior continua limpo. Reverter = `DROP INDEX` dos dois nomes.

### 364. 2026-10-22 · ERP L.2: as telas ficam em Compras, no grupo "Relatórios" do menu, com URL que guarda tudo; a loja do topo só decide quando nenhuma loja foi marcada

**Razão:** `/compras/relatorios/insumo` (histórico de um insumo) e `/compras/relatorios/periodo` (compras do período), nas duas árvores, abas da área Compras. Lojas: caixa de marcar (sem marcar nenhuma = todas as do acesso; com uma só, vira texto). Atalhos de período (hoje, ontem, 7 dias, este mês, mês passado) mais "De/Até"; mês inteiro cabe aí. O histórico do insumo olha 90 dias quando a URL não traz datas; as compras do período, o mês até hoje; o período usado é sempre dito no subtítulo. Procurar pelo nome (sem acento) com um só insumo comprado já escolhe esse insumo. Cada indicador tem o seu "Ver as linhas"; cada grupo e cada fornecedor abre as linhas dele (com o chip "Aberto: …" e o × para voltar); cada linha abre a nota (com `?volta=` do relatório, validado como caminho interno) e, quando há, a nota fiscal (XML). O detalhe do insumo ganha "Ver o histórico de compras" (só com `compras.ver`). No celular e no tablet (< 1024 px) a linha vira cartão; filtros recolhem em "Filtros (n)".

### 365. 2026-10-22 · ERP L.2: a planilha é CSV (ponto e vírgula, vírgula decimal, BOM), com proteção contra fórmula e sem dependência nova

**Alternativa:** XLSX. **Razão:** não há biblioteca de planilha aprovada no projeto e o CSV abre no Excel e no Google Planilhas. Todo texto que começa com `=`, `+`, `-`, `@`, tabulação ou retorno de linha (com ou sem espaço antes) ganha apóstrofo na frente; aspas dobram; quebra de linha dentro de texto vira espaço. Número nunca é texto digitado: sai como o sistema formatou, sem milhar. Duas planilhas: "das compras" (uma linha por item, com data usada, entrada, emissão, lançamento no Rio, loja, fornecedor, nota, chave, insumo, embalagem original, quantidade de embalagens, quantidade convertida, unidade, preço unitário com 4 casas, valor dos itens, frete atribuído, descontos, total, situação, por que está sem base e se há nota fiscal) e "do resumo" (os grupos). O cabeçalho repete período, data usada, lojas e filtros; o rodapé repete os totais da tela (dinheiro somado, quantidade por unidade, canceladas fora). Teto de 50.000 linhas: acima disso a resposta é 413 em frase (nunca corta calada). Resposta com `Cache-Control: no-store` e `nosniff`; sem sessão 401, sem permissão 403, período torto 400. Não registra auditoria de download (pergunta abaixo).

### 366. 2026-10-22 · ERP L.2: o PDF é a página de impressão do navegador, sem dependência: sem menu, tabelas inteiras, até 1.500 linhas

**Razão:** "Imprimir ou salvar em PDF" abre a mesma tela com `imprimir=1`: cabeçalho com período, data usada, lojas e filtros, totais, o resumo inteiro e as linhas inteiras (sem página, com o cabeçalho da tabela se repetindo a cada folha e linha que não parte). Passou de 1.500 linhas, a página diz que não cabe em folha, mantém totais e resumo completos e manda para a planilha (nunca corta calada). O CSS de impressão (`tokens.css`) esconde menu, barra do topo, abas e botões e força papel claro, qualquer que seja o tema.

### 367. 2026-10-22 · ERP L.2: desconto é R$ 0,00 por linha, dito na tela; frete é o rateio já gravado; o total da linha é itens + frete

**Razão:** o sistema ainda não registra desconto por item (o valor de cada item é o que a nota cobra; no XML já vem líquido). A coluna "Total" mostra a composição "itens R$ x + frete R$ y − desc. R$ 0,00"; se alguma nota tiver desconto no cabeçalho, o relatório avisa quantas e que ele não é dividido pelos itens. O frete atribuído é o `freteRateadoCentavos` de cada item (rateio por maior resto, que fecha ao centavo): a soma das linhas é o frete da nota.

### 368. 2026-10-22 · ERP L.2 (extra pedido pelo Maestro): a busca de insumo ignora acento além da caixa, sem extensão nova

**Razão:** o pós-deploy da L.1 achou que "acai" não achava "Polpa de açaí" nem "ype" achava "Ypê". `busca.ts` usa `translate()` do Postgres com as mesmas letras do nome único (`chaveDoNome`), `LIKE` com o padrão escapado (`%`, `_` e `\` continuam letras), por consulta SQL parametrizada que devolve os ids. Vale para a lista de insumos (nome e marca), a busca rápida do topo e a busca dos relatórios. Extensão `unaccent` ficou de fora: exige permissão de criar extensão nos 3 perfis do banco. Fichas e fornecedores seguem só com `contains` insensível a caixa (herança).

### 369. 2026-10-22 · ERP L.2: referências Kairu consultadas e o que foi aplicado

**Razão:** pelo MCP Kairu em 22/10/2026: `library:design-precisao-corporativo` v1.2.0 (lido inteiro) e `pass:compras-cotacao-comparavel` v1.2.0 (lido inteiro); buscas "relatório de compras por insumo fornecedor período", "relatório tabela exportação" (design), "compras" e "relatório" (sem prompt de relatório de compras). Aplicado: "exportação deve refletir escopo e filtros", "toda informação derivada tem unidade, período e origem", "valor ausente não vira zero", "datas seguem o fuso da operação", "nunca carregar milhares de linhas: paginar", "nunca mostrar dado de outra unidade sem permissão", "comparar por unidade e não esconder que o preço unitário não é o custo total" (preço do item × custo entregue), "intervalo [início, fim) no dia operacional America/Sao_Paulo, virada de mês", "null é desconhecido, não zero", "export limitado às lojas autorizadas", "mesma importação duas vezes dá os mesmos totais" (a nota repetida conta uma vez). Fora de propósito: seleção múltipla e inspetor lateral (a linha abre a nota em tela cheia), comparação de fornecedores e períodos (L.3) e consumo (L.4).

### 370. 2026-10-22 · ERP L.2: perguntas para o Rodolfo (não bloqueiam; o padrão adotado está em negrito)

**Razão:** (1) Alguma loja fora do fuso do Rio? **Não: o dia de toda loja é o do Rio; fuso por loja só quando houver loja fora.** (2) O gerente deve poder baixar a planilha? **Sim: quem vê compras da loja baixa a planilha daquela loja.** (3) Registrar quem baixou cada planilha? **Não registra por enquanto; dá para registrar no histórico se a casa quiser.** (4) Precisa de XLSX de verdade? **Não: CSV abre no Excel; XLSX só com biblioteca aprovada.** (5) Desconto por item? **Não existe: o valor do item é o que a nota cobra.** (6) A categoria do relatório deve ser a do dia da compra? **Não: é a de hoje do insumo (a nota não guarda a categoria).** (7) O histórico do insumo deve abrir em 90 dias ou no mês? **90 dias; o período está sempre escrito na tela.**


### 371. 2026-10-22 · ERP L.2 (ajustes dos fiscais): a volta atravessa a nota fiscal (XML); página da URL com teto; a impressão sem landmark repetido; cartões e canceladas mais claros

**Razão:** (1) O link "nota fiscal (XML)" da linha do relatório e o "Abrir a nota fiscal" da nota abrem o documento com `?volta=` (o relatório, ou a nota de compra, que por sua vez guarda a volta ao relatório); a tela do documento (nas duas árvores) lê a volta pelo MESMO `caminhoDeVolta` da nota (só caminho interno da área, até 2.000 caracteres) e diz "Voltar para o relatório de compras" ou "Voltar para a nota de compra"; endereço de fora, `//`, outra casa e `javascript:` são ignorados. O link da nota e o da nota fiscal ficaram em linhas separadas (as áreas de toque de 44 px se atropelavam). (2) `?pagina=` é inteiro de 1 a 1.000.000 (como a lista de insumos; `1e12`, `99999999`, negativo e texto viram a primeira) e a página pedida além da última cai na última DEPOIS de contar os grupos (o rodapé diz "Página 2 de 2", e não "1 de 1"): o 22003 do `OFFSET` acabou. (3) Na impressão, o landmark interno dos totais é "Tabela dos totais". (4) "Ver a linha" no singular; o cartão do preço médio do período oferece "Agrupar por insumo" só quando ainda não está agrupado e, agrupado, diz que o preço de cada insumo está na tabela; o cartão do valor dos itens se chama "Valor dos itens (sem o frete)" e traz o frete atribuído embaixo; nas notas canceladas não há preço médio, custo entregue nem preço por linha ("não é compra"); filtros em 2 colunas de 640 a 1023 px; a "Data usada" tem nomes curtos no seletor (Entrada da nota, Emissão da nota fiscal, Lançamento no sistema) para não cortar a 1180 px; o subtítulo traz "N compras"; ícone próprio (`relatorio`, folha com gráfico) para o grupo e "Compras do período", e o relógio (`historico`) para "Histórico do insumo", distintos do medidor do Orçamento. (5) Os links soltos do detalhe do documento fiscal a 1180 px em toque passam a 44 px.

### 372. 2026-10-23 · ERP L.3 (herança da L.2): a busca sem acento também nas fichas e nos fornecedores, pela mesma conta de `busca.ts`

**Razão:** a L.2 deixou fichas e fornecedores só com `contains` insensível a caixa ("feijao" não achava "Feijão tropeiro"; "ze" não achava "Frios do Zé"). `busca.ts` ganhou `idsDeFichaPelaBusca` (nome) e `idsDeFornecedorPelaBusca` (nome fantasia e razão social), com o mesmo `translate()` do Postgres e o mesmo `LIKE` escapado (`%`, `_` e `\` continuam letras), por consulta SQL parametrizada; quem lista filtra por esses ids. Vale para a lista de fichas, a busca rápida do topo (⌘K, fichas) e a lista de fornecedores (o documento continua por trecho dos dígitos). Sem extensão, sem migration. Texto que não sobra nada para buscar (só pontuação) volta ao `contains` literal de antes.

### 373. 2026-10-23 · ERP L.3 (herança da L.2): os links de texto do detalhe do insumo têm 44 px de área em toque

**Razão:** "nota 4570" (último preço), "Mudar a categoria" e o nome da ficha dentro de frase eram links de 16 a 20 px. Receberam `ff-toque` (a classe que já cresce a área para 44 px em ponteiro de toque sem mudar o desenho nem a altura da linha). Conferido no navegador em 390, 820 e 1180 px com toque.

### 374. 2026-10-23 · ERP L.3: duas telas novas em Compras › Relatórios (Comparar fornecedores, Comparar períodos), uma planilha e uma impressão, no motor da L.2, sem migration

**Razão:** o pedido (Notion, "Comparação de fornecedores e períodos") pede o mesmo recorte da L.2 com duas leituras novas. `compras-comparacao.ts` reaproveita `fonte`, `resolverRecorte`, `gruposDoRecorte`, `canceladasDoRecorte`, `semEmissaoNoRecorte`, `documentosAguardando` e `opcoesDoRelatorio` (nada de segunda conta de preço médio, nada de segunda regra de "sem base"); a conta pura mora em `compras-comparacao-campos.ts` (sem banco, em BigInt) e a planilha em `compras-comparacao-planilha.ts`. O banco agrega (GROUP BY insumo × unidade × fornecedor, uma consulta por lado) e o código soma só células já agregadas; passou de 20.000 células num lado a tela recusa em frase (nunca corta calada). Uma fotografia por tela (`repetivel`), RLS por baixo, `compras.ver` por loja (a mesma `resolverRecorte`): operador sem R$, gerente só nas lojas dele, loja de fora nunca amplia. Os índices da L.2 bastam: **sem migration** (nenhuma coluna, índice, gatilho nem tabela). Rotas nas duas árvores (`/erp/compras/relatorios/comparar-fornecedores`, `.../comparar-periodos`, `.../comparar/exportar?tela=fornecedores|periodos`); as duas telas entram no grupo "Relatórios" do menu, com ícones próprios (`comparar`, `periodos`).

### 375. 2026-10-23 · ERP L.3: a variação do gasto se separa em efeito volume e efeito preço pela forma SIMÉTRICA (ponto médio), em inteiros, sem termo de interação

**Alternativas:** Δgasto = Δq×p0 + q1×Δp (Laspeyres; manda o termo de interação para o preço e muda se A e B trocam de lado) e a forma com o resíduo de interação separado. **Razão:** a forma simétrica fecha exatamente (E + V = G1 − G0), não depende de qual período é a "base" e não deixa um terceiro número difícil de explicar. Por insumo e unidade, com G em centavos e Q em milésimos (P = G ÷ Q): **efeito preço** E = (P1 − P0) × (Q0 + Q1) ÷ 2 = (G1·Q0 − G0·Q1)(Q0 + Q1) ÷ (2·Q0·Q1); **efeito volume** V = G1 − G0 − E = (Q1 − Q0) × (P0 + P1) ÷ 2. A conta é BigInt; E é arredondado UMA vez (metade para longe do zero) e V é o que sobra em inteiros, então qualquer soma de itens fecha ao centavo e trocar A com B troca o sinal de tudo (propriedade testada com 300 cenários sorteados). Exemplo conferido à mão: 10 kg a R$ 10,00 → 15 kg a R$ 9,50: volume +R$ 48,75 e preço −R$ 6,25 (sinais opostos), variação +R$ 42,50. A fórmula está escrita na tela, na planilha e no ERP.md. Nenhum efeito é chamado de "inflação" nem de "economia".

### 376. 2026-10-23 · ERP L.3: a troca de fornecedor é o que SOBRA do efeito preço depois de tirar o preço de quem vendeu nos dois períodos

**Razão:** pedido: "identificar efeito de composição/troca de fornecedor". Dentro do efeito preço do insumo, a parte "do mesmo fornecedor" é a soma, por fornecedor presente nos DOIS lados, do mesmo efeito preço calculado com as quantidades e o custo dele (arredondada uma vez); a **troca de fornecedor** é a diferença (E − mesmo fornecedor). Fornecedor só num lado e mudança de fatia entre fornecedores caem na troca; com um fornecedor só, a troca é zero. Exemplos à mão: 10 kg a R$ 10 do F1 → 10 kg a R$ 12 do F2: preço +R$ 20,00, mesmo fornecedor 0, troca +R$ 20,00; 6 kg do F1 a R$ 10 + 4 kg do F2 a R$ 12 → 8 kg do F1 a R$ 10,50 + 2 kg do F2 a R$ 13: preço +R$ 2,00 = mesmo fornecedor +R$ 6,50 (3,50 + 3,00) + troca −R$ 4,50 (a fatia migrou para o mais barato). É convenção contábil, dita como "o que sobra"; com um insumo só no filtro a tela mostra os fornecedores lado a lado com o efeito de cada um.

### 377. 2026-10-23 · ERP L.3: só se compara o mesmo insumo na mesma unidade; o que só aparece num lado é "entrou" ou "saiu", e percentual com denominador zero é "sem base"

**Razão:** "comparável" é a regra da L.2 (`motivo IS NULL`: insumo ligado, unidade gravada, conversão que fecha, valor > 0). Insumo × unidade só em B (ou só em A, ou em outra unidade nos dois) não tem preço do outro lado: não há como separar preço de volume, então o gasto inteiro vai para "entrou" (+G1) ou "saiu" (−G0), dito com a palavra e a frase "não dá para separar preço de volume"; nunca vira economia nem crescimento. Variação em % só com gasto de A > 0; senão "sem base" (nada comprado em A), e o custo médio de um lado sem compra é "sem base". A conta geral é volume + preço + entrou + saiu = variação, escrita na tela e conferida (se algum dia não fechar, a tela diz). Custo médio e variação do custo só por insumo (kg de coisas diferentes não têm preço só); com um insumo no filtro aparecem nos cartões. Quantidades somam por unidade (kg, L, un nunca num número só).

### 378. 2026-10-23 · ERP L.3: preço do item e custo entregue lado a lado; o "mais barato" é dito nas duas medidas; a diferença é por unidade, nunca "economia"

**Razão:** `pass:compras-cotacao-comparavel` ("o menor preço unitário não é sempre o menor custo total"). Na comparação de fornecedores cada fornecedor × unidade mostra preço do item (valor ÷ quantidade) e custo entregue ((valor + frete atribuído) ÷ quantidade), com o frete e o peso dele (% do preço do item), e dois selos separados ("Mais barato no preço do item", "Mais barato entregue"), porque o frete inverte a ordem (caso testado: Zé R$ 10,00 / R$ 12,00; Laticínios R$ 10,50 / R$ 10,50). A diferença para o mais barato é em R$ por unidade e em % (+R$ 0,50/kg, +5,0%) e nunca vira "você economizaria"; avisos: fornecedor com uma compra só, um fornecedor só (sem com quem comparar), linha sem base fora da disputa (não vira R$ 0,00), última compra de cada um (ignora linha sem base). O frete é o rateio já gravado em cada item (decisão 367); desconto por item segue R$ 0,00. Na comparação de períodos, "Medir o gasto por" escolhe entre custo entregue (padrão) e preço do item, e vale para os dois lados (testado: o mesmo item tem preço do item −R$ 6,25 e custo entregue +R$ 6,25 quando o frete sobe).

### 379. 2026-10-23 · ERP L.3: cobertura incompleta, ausência de base e critérios iguais nos dois lados são ditos ANTES dos números

**Razão:** o período B é o recorte do A com as datas trocadas (mesmas lojas, fornecedor, insumo, categoria, data usada e medida; só um formulário), então os dois lados não têm como divergir. O painel "Antes de ler" (e um link no cartão da variação) lista: períodos de tamanhos diferentes (dias de cada um), períodos que se sobrepõem, período que termina depois de hoje, lado sem compra comparável (A ou B), cobertura incompleta com o dinheiro e as linhas sem base por motivo (e a % do dinheiro que a comparação cobre), notas digitadas sem emissão (base emissão), documentos fiscais aguardando conferência; "Para ler os números" repete o que cada medida e cada efeito querem dizer, canceladas fora (A e B), descontos de cabeçalho. Cada gasto abre as linhas na tela "Compras do período" com o mesmo recorte e `volta` para a comparação (decisão 382); linhas sem base abrem em `so=sembase`.

### 380. 2026-10-23 · ERP L.3: a marca de referência é informação visível; nenhuma marca é barrada; embalagens diferentes entram pela unidade base

**Razão:** pedido: "só comparar especificações compatíveis (mesmo insumo; marca de referência visível, sem bloquear alternativas de marca)". A comparação é sempre de UM insumo (o mesmo cadastro) na mesma unidade base; a marca de referência do cadastro aparece num cartão, dita como "só informação", e a tela avisa que a nota guarda a embalagem e o fornecedor, não a marca que veio (então diferença de preço pode ser também de marca). Cada fornecedor mostra as embalagens compradas (Peça 2 kg, Padrão 1 kg...). Fora de propósito: normalizar marca por fornecedor e travar comparação por marca (exigiria snapshot de marca na nota).

### 381. 2026-10-23 · ERP L.3: a planilha e a impressão da comparação saem do mesmo motor e dizem o mesmo que a tela

**Razão:** CSV com a mesma proteção da L.2 (`;`, vírgula decimal, BOM, apóstrofo antes de `= + - @`, tab e CR, nome de fornecedor e de insumo protegidos), cabeçalho com períodos, data usada, medida, lojas, filtros, a frase efeito preço × volume e a fórmula, uma linha por insumo (ou por fornecedor), os fornecedores lado a lado quando há um insumo só e rodapé com os totais da tela (gasto A e B, variação, volume, preço, mesmo fornecedor, troca, entrou, saiu, "fecha", fora da comparação, canceladas). Preço por unidade com 4 casas por divisão inteira exata; percentual com uma casa. 401 sem sessão (na prática a porta manda para /entrar), 403 sem `compras.ver` ou sem loja do acesso, 400 período torto ou fornecedores sem insumo, 413 acima do teto. Impressão: `imprimir=1` na própria página, papel claro, sem menu, tabelas inteiras, landmarks com nomes únicos ("Totais da comparação", "Comparação por insumo", "Fornecedores de X em kg").

### 382. 2026-10-23 · ERP L.3: a volta atravessa as telas (comparação → compras → nota → XML) e os relatórios da L.2 oferecem as comparações

**Razão:** "Ver as N linhas" abre "Compras do período" com `volta` (só caminho interno da área, até 2.000 caracteres, pelo mesmo `caminhoDeVolta`); a tela mostra "Voltar para a comparação de compras" e todos os links dela carregam a volta; a nota aberta dali volta para o relatório, que volta para a comparação. Volta de fora (`https://`, `//`, outra árvore, `javascript:`) é ignorada. Do histórico de um insumo parte "Comparar os fornecedores deste insumo" e de "Compras do período" parte "Comparar com o período anterior" (mesmo tamanho, B é o período que a pessoa olhava).

### 383. 2026-10-23 · ERP L.3: referências Kairu consultadas e o que foi aplicado

**Razão:** pelo MCP Kairu em 23/10/2026: `pass:compras-cotacao-comparavel` v1.2.0 (lido inteiro) e buscas "comparação de preços variação volume preço período" (todas) e "comparativo antes e depois delta tabela" (design): sem material de comparação de períodos nem de efeito preço × volume (a decomposição é nossa, decisão 375); o design usado é o `library:design-precisao-corporativo` v1.2.0 já lido na L.2. Aplicado do pass: comparar por unidade e não esconder que o menor preço unitário não é o menor custo total (preço do item × custo entregue, decisão 378); "null significa desconhecido: nunca transforme ausência em zero ou faça média entre lojas sem explicar a origem" (sem base, nunca R$ 0,00 nem % sobre zero); "unidade incerta não participa da seleção automática" (linha sem unidade fica fora e é dita); "frete e pedido mínimo são por fornecedor: compare custo total da cesta, sem esconder" (custo entregue); datas pelo dia operacional do Rio com [início, fim) (herdado da L.2); "melhor preço não substitui decisão do comprador" (a tela nunca decide nem fala em economia); "usuário de outra loja recebe 403/404 e nenhum dado em HTML, API, export ou cache" (testado). Fora de propósito: rodadas de cotação, convites, aprovação e envio (não é o escopo da L.3).

### 384. 2026-10-23 · ERP L.3: perguntas para o Rodolfo (não bloqueiam; o padrão adotado está em negrito)

**Razão:** (1) O que comparar por padrão em "Comparar períodos"? **Os últimos 30 dias contra os 30 dias antes (mesmo tamanho); há atalhos para 7 dias, o mês até hoje contra o mesmo trecho do mês passado e mês passado contra retrasado.** (2) Medir o gasto pelo custo entregue ou pelo preço do item? **Custo entregue (padrão), com a troca a um clique; as duas leituras ficam sempre explicadas.** (3) A tela deve dizer quanto "se economizaria" comprando do mais barato? **Não: só a diferença por unidade; projetar economia exige saber quanto cada fornecedor aguenta entregar, e a nota não guarda isso.** (4) A marca comprada deve entrar na comparação? **Não nesta fase: a nota não guarda a marca; vale a marca de referência do cadastro como informação. Guardar a marca na linha da nota é uma decisão de cadastro para uma fase própria.** (5) Fornecedor novo no período (sem histórico) conta como "troca"? **Sim, como troca de fornecedor dentro do efeito preço, e o fornecedor aparece com "não vendeu" no outro período.** (6) O mês inteiro de hoje (ainda em andamento) deve poder ser comparado? **Sim, com o aviso "termina depois de hoje".**

### 385. 2026-10-23 · ERP L.3 (1ª volta da UX e do Guardião): lado sem compra é "sem base", não −100%; linhas sem base abrem; avisos no CSV; fornecedor sem cadastro pelo nome da nota

**Razão:** (1) `resumirItens` ganhou `semCompraA`, `semCompraB` e `entrouDomina`; com um lado sem NENHUMA compra comparável a variação em % é `null` (nunca "−100,0%"), a manchete é "Sem base", os efeitos volume e preço são "—" e "saiu"/"entrou" ficam com o valor. Com os dois lados com compra mas nenhum insumo nos dois, os efeitos também são "—". (2) "Ver as linhas sem base" (aviso de cobertura e cartões A e B) abre "Compras do período" com `so=sembase`, o mesmo recorte e `volta`; lado sem linha nenhuma mostra texto, não link ("Ver as 0 linhas" acabou). (3) Os avisos viraram uma função pura (`avisosDaComparacao`) que a tela e o CSV usam: o CSV traz uma linha `Aviso;...` por aviso, e a gramática do período em andamento distingue "O período B termina" de "Os períodos A e B terminam". (4) Na comparação de períodos, nota sem fornecedor cadastrado agrupa pelo nome guardado na nota (`n:<nome>`), sem nome fica em "-"; a lista de fornecedores da L.2 (`gruposDoRecorte`) segue com "-" (a URL `grupo=` da L.2 só aceita id; fica como herança). (5) `idsDeInsumoPelaBusca` e `idsDeFichaPelaBusca` sem `limite` devolvem todos os que casam (o corte de 5.000 era calado). (6) A busca por nome que acha um insumo só passa a ser resolvida DENTRO da leitura (`insumoDaBusca`), sem ler a comparação inteira duas vezes. (7) Nota curta ("a maior parte é de insumo que só aparece em B") quando o "entrou" passa de metade de uma variação positiva: o que pede para não ler como aumento de preço.

### 386. 2026-10-23 · ERP L.4 (herança da L.3, commit próprio): fornecedor sem cadastro separado pelo nome da nota, comparar períodos sem ruído e área de toque que ganha da linha seguinte

**Razão:** (1) A chave de fornecedor da L.2 agora é a mesma em "Compras do período", na comparação de fornecedores e na de períodos (`FORNECEDOR_DA_LINHA` em `compras-relatorio.ts`): o id do cadastro, ou `n:<nome que a nota guardou>` quando não há cadastro, ou `-` sem nome; o nome mostrado ganha "(sem cadastro)". Escolhi separar pelo nome (e não o rótulo "Sem fornecedor cadastrado (N nomes)") porque assim a comparação mostra QUEM vendeu mais barato, e o link "Ver as linhas" do fornecedor abre só as linhas dele (`grupo=n:<nome>`, validado como texto sem controle). (2) Comparar períodos: "Tirar os filtros" só aparece com filtro; o rodapé de "Por insumo" mostra "Sem compra" (não "B: R$ 0,00") quando o lado não tem compra comparável; com os DOIS lados sem compra comparável há um aviso só (`sem-ambos`) no lugar de dois, e a cobertura 0% diz "nada do que foi comprado entra na conta" (nunca "cobre 0,0%"); "1 compra · nenhum fornecedor com preço comparável" no lugar de "0 fornecedores". (3) Toque: o link de texto com folga invisível (`ff-toque`, link de tabela, de aviso e da trilha) agora é `position: relative; z-index: 1` (a linha seguinte, que vem depois no HTML, pintava por cima e comia os 14 px de baixo: o alvo de 44 px virava ~34), tem `min-width: 44px` (número curto como "0 g" também chega a 44 px de largura) e a linha de tabela tem passo de 44 px no toque (`td` com `height: 44px`), para duas linhas seguidas com link não se pisarem. O link "nota fiscal (XML)" embaixo do número da nota ganhou espaço no toque. **Alternativa:** trocar a folga por caixa real (`inline-flex min-h-11`) em todo link; descartada porque quebra a linha de um parágrafo com link no meio. **Prova:** testes puros e de banco novos; hit-test de toque nas matrizes da L.3 e da L.4.

### 387. 2026-10-23 · ERP L.4: o consumo e a conciliação leem o LIVRO do estoque, no dia em que o movimento entrou no livro (relógio do Rio)

**Razão:** o pedido (Notion, "Consumo e conciliação de estoque") quer saldo inicial, entradas, uso, perdas, devoluções, ajustes e saldo final que concilie. A única fonte que concilia por construção é `MovimentoEstoque` (só INSERT, quantidade e valor com sinal, antes/depois, estorno como espelho). Nada de tabela nova: **sem migration**. A data de um movimento é `ocorridoEm` lido no Rio ([início do 1º dia, início do dia seguinte) em UTC, como a L.2): uma nota de 10/10 lançada em 12/10 entra no estoque em 12/10, e "Compras do período" (L.2) continua pela data da nota (dito na tela, no CSV e na ajuda). Saldo inicial = soma do livro até antes do 1º dia; final = até o fim do último. Quantidade em milésimos da unidade base e dinheiro em centavos, como o livro gravou (nada é reprecificado). Período de até 400 dias; mais que isso a tela pede para encurtar, em frase. **Alternativa:** reconstruir o saldo por `saldoAntes/Depois` do primeiro/último movimento; descartada porque movimentos da mesma transação têm o mesmo instante e a ordem dentro deles não é garantida (a soma não depende de ordem).

### 388. 2026-10-23 · ERP L.4: cada movimento cai numa coluna só (classificação única em SQL); bruto, líquido, cancelamento, estorno e devolução separados

**Razão:** a classificação é um `CASE` só (`consumo-estoque.ts`, `BUCKET`), usado por tela, resumo, movimentos, planilha e impressão: nenhum movimento cai em duas colunas, então a soma das colunas é exatamente final − inicial (sem dupla contagem). Colunas da tela: Compras, Produzido, Uso, Perdas, Devoluções, Estornos, Ajustes (17 caixas por baixo, com origem). **Bruto** = o que foi lançado (nota lançada pela 1ª vez, requisitado); **desfazer** em colunas PRÓPRIAS (devolução de requisição; estornos = nota cancelada, nota corrigida, lote desfeito); **líquido** = bruto + desfazer. Nota cancelada: o estorno do ÚLTIMO lançamento de uma nota `CANCELADA` (versão lida da chave `compra:<nota>:<versão>:<ordem>`). Nota corrigida: o estorno do lançamento antigo e a nova entrada vão juntos, então só a diferença aparece ("corrigida +2 kg"), não uma compra a mais. Devolução: o estorno da baixa e o relançamento do líquido (chave `devolucao:`) vão juntos: requisitado −10, devolvido +3, líquido −7. Requisição de lote (tem `OrdemProducao`) separada da de setor; lote concluído entra como "Produzido" (não é compra) e lote estornado em Estornos. `PRODUCAO_CONSUMO` (reservado, nunca gravado) conta como uso do lote. **Alternativa:** uma coluna "Compras" com bruto e líquido misturados; descartada porque a nota corrigida (estorna e relança) dobraria o bruto.

### 389. 2026-10-23 · ERP L.4: a ponte inicial + movimentos = final é conferida por uma segunda soma, e o livro é conferido com o saldo guardado

**Razão:** o final de cada insumo × loja é lido por soma direta no livro; a ponte (inicial + soma das colunas) é conferida contra ele, e qualquer diferença vira o selo "A conta não fecha" (e o cartão "Conta do livro" diz "Não confere"). O saldo guardado (`SaldoEstoque`, a cópia de consulta) é conferido com a soma de TODO o livro: se diferir, lacuna "Saldo não bate". Por unidade (kg, L e un nunca se somam) o resumo traz a mesma ponte do recorte inteiro, não só da página. Prova: cenário de outubro à mão (cebola: 20 + 80 − 18 − 31,239 + 5 − 0,761 = 55 kg), conferido de novo por SQL independente do motor e com 300 sequências sorteadas.

### 390. 2026-10-23 · ERP L.4: quem vê é `estoque.ver` por loja; R$ só com `compras.ver` em TODAS as lojas do recorte, e o valor nem sai do banco

**Razão:** o pedido: "quem vê estoque da loja; R$ só para quem pode ver custo (operador/cozinha não vê R$)". Verifiquei as permissões vigentes: o operador tem `insumos.ver` ("Ver insumos e custos") e `estoque.ver`, e NÃO tem `compras.ver`; `insumos.ver` não serve de régua (a 3.2 já corrigiu a cozinha vendo R$ por ele). `compras.ver` é a que protege o valor da nota e do frete, que é a maior parte do R$ do livro. Com uma loja do recorte sem `compras.ver`, a tela inteira fica sem R$ (todo-ou-nada: somar R$ de lojas onde se vê e de lojas onde não se vê vazaria a diferença). A própria consulta do livro troca o valor por zero quando o recorte não permite ver R$ (`CASE WHEN verValores THEN valor ELSE 0 END` em `fonteDoConsumo`): o R$ nem sai do banco para a tela, a planilha e a impressão (teste: o maior valor lido pela consulta é zero para o operador; nenhum "(R$)" no CSV dele). *Texto corrigido na rodada do Guardião: antes o valor era lido e zerado no TypeScript.* Loja pedida fora do acesso NUNCA amplia (vazio; 403 na planilha); outro parceiro não existe. **Observação para o Rodolfo:** a tela do estoque da loja (1.6) já mostra "valor do estoque" a quem tem `estoque.ver`, inclusive o operador; não mexi (fora do escopo): é a pergunta 2 da decisão 397.

### 391. 2026-10-23 · ERP L.4: "Uso" é a requisição registrada, não o consumo aferido; o relatório só lê; a diferença da contagem é ajuste

**Razão:** o pedido pede dizer qual dos dois o indicador mede. É **requisição registrada**: o que o estoque entregou (a baixa de insumo é da requisição de produção ou de setor). O **consumo aferido por contagem** continua sendo a conta da 1.8 (Divergências: contado no início + entradas − contado no fim), com link para quem tem `estoque.ajustar`. A diferença de inventário entra como "Sobra/Falta na contagem" dentro de Ajustes e nunca como consumo nem perda presumidos (a tela, a ajuda e o CSV dizem isso). O relatório não grava nada, nem baixa de novo pela venda nem pela geração: teste conta linhas de movimento, saldo (versão), requisição, item atendido, nota, histórico, contagem e ordem antes e depois de tela, planilha, impressão e movimentos.

### 392. 2026-10-23 · ERP L.4: as lacunas que a tela diz, com selo de palavra

**Razão:** por insumo × loja: **sem contagem no período** (nenhuma contagem APLICADA, de `ContagemItem` contado, entrou no livro no período; diz a data da última; contagem que bate não gera movimento, então "contado" vem de `ContagemItem`, não do livro), **saldo negativo** no fim e **ficou negativo** no meio (menor `saldoDepois` do período), **sem origem** (movimento sem nota, requisição, contagem nem lote e, para perda e ajuste, sem motivo escrito), **saldo que não bate** com o livro, **unidade que mudou**, **sem valor** (quantidade e valor zero: insumo sem preço na época; só dito a quem vê R$). Duras (negativo, sem origem, saldo, unidade) entram em "Só o que pede atenção"; "sem contagem" é informativa e tem filtro próprio. Documento fiscal (XML) que só aguarda conferência nunca vira movimento: fica fora e a tela conta quantos aguardam; contagem em andamento (não aplicada) também é avisada. Loja sem a abertura do estoque é dita.

### 393. 2026-10-23 · ERP L.4: transferência entre lojas e perda lançada ainda não existem; o lugar delas está pronto e vazio

**Razão:** o livro não tem tipo de transferência nem tela que grave `PERDA` ou `AJUSTE` (herança da 1.8). Não inventei: o mapa de caixas tem `transf_entrada` e `transf_saida` (sempre zero hoje; no CSV e no linha a linha, com "ainda não existe no sistema") e a ponte diz "Transferências entre lojas: ainda não existe no sistema". Quando existir, a transferência entra numa coluna própria e não conta como compra de fora nem como consumo da rede. Perdas e ajustes manuais têm coluna e movimento prontos. Sem migration, sem enum novo (o enum novo é da fase que criar a transferência).

### 394. 2026-10-23 · ERP L.4: menu Estoque e Movimentações › Relatórios, rotas nas duas árvores e ajuda

**Razão:** escolhi o menu de Estoque (o dado é o livro do estoque; Compras já tem os relatórios de compra) num grupo "Relatórios" com um item: `/estoque/relatorios/consumo` (e `/movimentos`, `/exportar`), no `/erp` e no espelho `/rodolfo/erp/<slug>`. Entrada de ajuda nova `estoque-consumo` (v1; nenhuma entrada existente mudou), `rotuloDaVolta` conhece o relatório, e os testes de navegação ganharam o item. Permissão: `estoque.ver`.

### 395. 2026-10-23 · ERP L.4: cada número abre as linhas; planilha e impressão saem do mesmo motor

**Razão:** cada número da ponte e da tabela é um link para "Movimentos" (a coluna, o saldo inicial ou o final), com `volta`; o linha a linha de um insumo abre uma caixa só (`bucket=`). Os movimentos mostram quando entrou no livro, quantidade com sinal, saldo antes › depois e a origem com link (requisição #N e lote, nota, contagem ou abertura, conforme a permissão da loja). A restrição "só atenção" vale também para os movimentos. Planilha CSV protegida (`;`, vírgula, BOM, apóstrofo antes de `= + - @`, sinal "-" ASCII; a função de reais da L.2 errava o negativo com centavos), com os avisos da tela no cabeçalho e os totais por unidade; também baixa os movimentos de um número (`parte=movimentos`). Tetos: página de 25, 50 ou 100; planilha 50.000 linhas; impressão 1.500; passou, recusa em frase (413), nunca corta calada.

### 396. 2026-10-23 · ERP L.4: referências Kairu consultadas e o que foi aplicado

**Razão:** pelo MCP Kairu em 23/10/2026: `pass:inventario-contagem-divergencias` v1.2.0, `library:inventario-ciclico` v1.0.0 e `pass:cmv-fichas-e-margem` v1.2.0 (lidos inteiros; buscas "estoque", "CMV", "compras", "conciliação"). Aplicado: "item não contado não é zero" (sem contagem é dito, nunca "conferido"); "divergência não prova perda nem desvio" (a falta da contagem é ajuste, sem chamar de perda nem consumo); "saldo final deve bater com o razão" (ponte e saldo guardado); "custo ausente é indisponível, não prejuízo zero" (sem valor é dito, nunca R$ 0,00 como fato); "CMV parcial com a cobertura e o que ficou de fora" (lacunas e avisos antes dos números); "nunca compensar o conflito com baixa silenciosa" (o relatório não grava); dia operacional do Rio com [início, fim); quantidades em inteiros e dinheiro em centavos; "usuário de outra loja recebe 403/404 e nenhum dado em HTML, API, export ou cache" (testado). Design: o contrato do ERP (Kairu Editorial e Corporativo já lidos na UX.9); a busca de design por "tabela conciliação saldo relatório" não achou material novo.

### 397. 2026-10-23 · ERP L.4: perguntas para o Rodolfo (não bloqueiam; o padrão adotado está em negrito)

**Razão:** (1) O consumo do relatório é a requisição registrada ou o aferido por contagem? **Requisição registrada, com o aferido a um clique nas Divergências (1.8); trazer o aferido para esta tela exige contagem nas duas pontas do período.** (2) O operador pode ver o valor do estoque da loja (tela da 1.6)? **Hoje vê; este relatório esconde R$ de quem não tem `compras.ver`. Se o valor do estoque também deve ser escondido do operador, é ajuste pequeno na 1.6.** (3) A data é a do livro ou a da nota? **A do livro (decisão 387).** (4) Lançar perda e ajuste à mão (as colunas já existem vazias)? **Fase própria: pede tela, permissão `estoque.ajustar` e motivo obrigatório.** (5) Transferência entre lojas? **Fase própria; o lugar está pronto (decisão 393).** (6) Quanto tempo sem contagem vira alerta forte? **Hoje só é dito "sem contagem no período"; um prazo (ex.: 30 dias) vira alerta quando você decidir o número.**

### 398. 2026-10-23 · ERP L.4 (rodada do Guardião): relatório pesado roda em transação de relatório (somente leitura, com teto de tempo e com vagas), e o livro é lido uma vez por tela

**Razão:** o Guardião mediu que, com 320 mil movimentos, 20 pedidos juntos esgotavam o pool de conexões (o ERP inteiro travava), o timeout do Prisma não cancelava a consulta no banco, não havia `statement_timeout` e a tela lia o livro três vezes. Ficou assim: (a) `transacao(..., { relatorio: { tetoMs? } })` no portão (`tenant.ts`) abre a transação **somente leitura** no Postgres (`transaction_read_only`) e no portão (escrever dá erro), com **`statement_timeout` de 20 s local à transação** (o Postgres corta a consulta, a conexão volta limpa ao pool e o teto não vaza para a próxima transação) e prazo da transação inteira de 30 s. Passou do teto, o portão devolve `ErroDeRelatorio('tempo')` e a tela, a impressão e a planilha mostram a frase **"O relatório ficou grande demais. Diminua o período ou escolha menos lojas."** (planilha: 413), nunca um 500; a tela do consumo ainda mostra os filtros para a pessoa encurtar. (c) **Vagas por processo:** só 3 relatórios pesados rodam juntos; o 4º em diante espera até 8 s por uma vaga (a vaga é pedida ANTES de abrir a transação, então quem espera não segura conexão) e, sem vaga, recebe **"Há outro relatório grande rodando. Tente em instantes."** (planilha: 503). O pool padrão do Prisma (2 por núcleo + 1) fica com folga para o resto do ERP. A conta é do processo, não do cluster: com mais de um processo o total é a soma das vagas, e o pool de cada um precisa comportá-la. Usado nos relatórios do consumo (L.4) e também nos de compras (L.2 e L.3), onde a mudança era uma opção por chamada e a frase na página e na planilha. (b) **Uma leitura do livro por tela:** `lerConsumo` classifica o livro uma vez (CTE materializada) e dela saem o resumo de tudo, a página e as caixas dela; a página pedida além da última cai na última. Medido com 320 mil movimentos: tela de 1 mês de 8 a 10 s para 1,9 s com o banco aquecido (4,3 s com cache frio); 20 pedidos juntos agora terminam em 8,5 s, sem derrubar as telas leves (maior espera de 100 ms). Os números de cada tela são os mesmos de antes (os 22 testes de banco do consumo seguem passando). (d) O R$ passou a ser zerado **no SQL** (decisão 390 corrigida).

### 399. 2026-10-23 · ERP L.4 (rodada da UX): acabamentos que mudam o jeito de ler

**Razão:** (1) Os links de origem dos movimentos (requisição, lote, contagem, nota) levam `?volta=` para os movimentos de onde a pessoa saiu, e a tela de destino diz "Voltar para os movimentos do consumo" (só vale caminho interno da mesma área; sem volta, o "Voltar" de sempre). (2) **R$ negativo com quantidade positiva** ganha um aviso próprio ("R$ negativo"): o livro valora cada saída pelo custo do dia e cada entrada pelo valor da nota, então baixar antes da nota entrar pode deixar o R$ do saldo negativo com quantidade certa (caso do Alho: baixa de 3 kg a R$ 25 = −R$ 75, nota de 10 kg a R$ 50, saldo de 7 kg a −R$ 25). (3) Zero diz a unidade do insumo ("0 L", "0 kg"), não a menor ("0 ml", "0 g"), e número e unidade ficam juntos na quebra de linha do celular (espaço que não quebra). (4) Na comparação de períodos, o aviso "nenhum dos dois períodos teve compra" não repete o quadro vazio (a planilha segue com a frase). (5) O grupo "Relatórios" aparece no menu de Estoque: o menu só esconde o rótulo de um grupo de um item quando o rótulo repete o nome do item. (6) A linha "Compras: … lançadas, … em cancelamentos e correções de nota = … líquidas / Uso: …" sai também na impressão e na planilha (a mesma conta da tela). (7) Guardião: o grupo `n:<nome da nota>` (fornecedor sem cadastro) aceita e agrupa o nome até 500 caracteres, dos dois lados (URL e SQL cortam no mesmo ponto).


### 400. 2026-10-23 · ERP 3.4: o modelo das etiquetas — a emissão é um retrato imutável; cada impressão é um pedido; o lote do fornecedor e a abertura são fatos

**Razão:** a "Etiqueta" da 0.1 (que nenhum código gravava) vira a EMISSÃO: o retrato do que vai no papel (produto, conservação, quantidade por etiqueta, manipulação ou abertura, validade, vencimento e lote do fornecedor, marca, quem fez/abriu, loja, código, formato, quantas, se mostra a hora, versão do layout, quem emitiu e a regra da validade). Depois de gravada não muda nem some (gatilho). Cada envio é um `EtiquetaImpressao` (sequência 1 = primeira; as outras, reimpressões do MESMO retrato). O item comprado ganha `LoteDeInsumo` (o lote do fornecedor: código, vencimento, fabricação, marca) e `AberturaDeLote` (o fato de abrir uma embalagem, com a validade efetiva), os dois imutáveis. Migration aditiva `20261110000000_erp_etiquetas`: três tabelas de tenant com RLS + FORCE + política (o papel do tenant só lê e cria a abertura; o lote tem UPDATE só para as travas de linha, e o gatilho recusa mudança), FKs compostas, CHECKs de nascença, e os CHECKs novos da "Etiqueta" NOT VALID + VALIDATE que só avisa. *Corrigida na rodada 1 (decisão 420):* o pedido de impressão e a abertura também não somem: além do GRANT, o gatilho recusa DELETE (vale para o dono sem RLS); o pedido ganhou a confirmação "Já imprimi" (decisão 418).

### 401. 2026-10-23 · ERP 3.4: a etiqueta do lote produzido copia a conclusão; reimprimir não recalcula; sem validade sai "não informada"

**Razão:** o lote concluído já fotografou a validade e a conservação (3.1). A etiqueta copia (o banco confere a cópia): manipulação = conclusão, validade, conservação, código do lote e quem fez = a pessoa da equipe que pegou (decisão 241; a FlowFoods nunca assina). Reimprimir usa a emissão: mudar a ficha depois não muda o papel (testado com a ficha indo de 3 para 10 dias). Lote não concluído, cancelado, perdido ou estornado não emite; lote estornado DEPOIS da emissão não imprime mais (a tela e a regra dizem). **Hipótese para o Rodolfo:** lote concluído sem validade (a ficha não dizia) sai com "VALIDADE NÃO INFORMADA" em vez de bloquear (o Kairu bloqueia): o pote já existe na geladeira e sem etiqueta fica pior; a tela avisa e manda completar a ficha. Nunca se inventa prazo. *Corrigida na rodada 1 (decisões 417 e 420):* lote concluído que VENCEU não emite nem reimprime (Zebra, arquivo e papel), para ninguém; e o banco passou a conferir de fato a manipulação (= conclusão) e quem fez (nome e login = o lote), não só validade, conservação e código.

### 402. 2026-10-23 · ERP 3.4: validade efetiva da embalagem aberta = o MENOR entre o fim do dia do vencimento do lote e abertura + prazo depois de aberto

**Razão:** abrir não prolonga o vencimento. O prazo é o do insumo na conservação escolhida, NAQUELA hora (gravado na abertura; mudar o cadastro depois não muda). Sem prazo cadastrado: sem data ("prazo após abertura não informado") mesmo com o vencimento do lote — usar o vencimento como validade depois de aberto seria prolongar. Sem vencimento: vale só o prazo, e a tela pede para conferir a embalagem. Lote vencido não abre ("Este lote venceu em …: não abra"). A regra mora em `validadeDaAbertura` (puro) e no banco (CHECKs `validade_efetiva`, `regra_confere`, `sem_prazo_sem_data`, `lote_no_prazo` e o gatilho que confere o prazo com o insumo e o retrato do lote). *Corrigida na rodada final (decisão 425):* sem prazo, a etiqueta continua sem data de validade, mas a embalagem VENCE com o lote do fornecedor: a partir do fim do dia do vencimento (Rio) não emite, não imprime e o painel diz "venceu: não use".

### 403. 2026-10-23 · ERP 3.4: dias são duração; o vencimento é uma data que vale até o fim do dia no Rio; a hora da abertura é a do servidor

**Razão:** como na 3.1, "3 dias" são 4.320 minutos a partir do instante. O vencimento impresso pelo fornecedor é data de calendário: vale até a meia-noite do dia seguinte no relógio do Rio (sem supor horário de verão). A data e a hora da abertura não se digitam: são as do registro. Etiqueta, tela, ZPL e histórico usam o mesmo relógio (`America/Sao_Paulo`).

### 404. 2026-10-23 · ERP 3.4: abrir e imprimir não mexem em saldo, livro, nota nem custo, e valem com o período fechado

**Razão:** abrir uma embalagem registra QUANDO e POR QUEM; a baixa continua sendo a requisição (1.8) e a contagem (1.7). Registrar o lote na nota não muda a nota (nem estoque, nem custo, nem a versão). Como nada disso é dinheiro nem estoque, o período fechado do DRE não trava etiqueta, abertura nem lote (testado).

### 405. 2026-10-23 · ERP 3.4: permissões — nenhuma nova; "imprimir etiquetas" por loja; o lote na nota é de quem lança nota

**Razão:** `etiquetas.imprimir` já estava no catálogo desde a 0.4 (o operador tem): vê, emite, imprime e abre embalagem NA loja (fora dela, 404). O catálogo segue na versão 3 (só saiu o "em breve"). O nível 1 vê, emite e imprime, mas não abre (quem abre assina a etiqueta). O lote do fornecedor: ver = `compras.ver` na loja da nota; registrar e tirar = `compras.lancar` nela. Na tela de abrir, nota e fornecedor do lote só para quem vê compras naquela loja. Nenhuma tela de etiqueta mostra R$ (a cozinha imprime sem ver custo).

### 406. 2026-10-23 · ERP 3.4: o lote do fornecedor é por nota e insumo, opcional, nunca inventado; lido na embalagem quando a nota não diz

**Razão:** a edição da nota troca as linhas, então o lote mora no par (nota, insumo). No recebimento é preciso o código OU o vencimento (lote sem nada não rastreia); fabricação, marca e o resto são opcionais. O mesmo lote duas vezes no mesmo insumo da nota = "já registrado". Tirar só se ninguém abriu embalagem dele. Na hora de abrir, sem lote na lista, a pessoa lê na embalagem (vira um lote de origem "abertura", sem nota) ou marca "lote não informado" (a etiqueta diz NÃO INFORMADO). Pré-preparo não tem lote de fornecedor: a etiqueta dele é a do lote produzido. Não se guarda vencimento no cadastro do insumo. *Rodada 1 (decisão 421):* pré-preparo lançado numa nota não oferece o formulário (a tela diz a frase) e o registro recusa com ela, em vez do erro cru do banco.

### 407. 2026-10-23 · ERP 3.4: o `rastro` do XML (nLote, dFab, dVal, qLote) é sugestão, nunca lançamento

**Razão:** quando a nota veio do XML (F.1b), a tela "Lote e vencimento" mostra o que o fornecedor declarou por item ligado ao insumo, com "Registrar como no XML" (um toque, confirmado pela pessoa). Nada entra sozinho. `sugeridoPeloXml` só é gravado se o código e o vencimento baterem com o XML guardado (o formulário não decide o que é "do XML"). Rastro de item sem insumo ligado aparece à parte.

### 408. 2026-10-23 · ERP 3.4: o ZPL sai do servidor, de um layout único; 203 dpi por padrão; nada é cortado calado

**Razão:** `montarEtiqueta` (puro) desenha a etiqueta em pontos e serve a prévia em SVG, o papel A4 e o ZPL. 60 × 40 mm = 480 × 320 pontos e 60 × 60 = 480 × 480 a 203 dpi (8 pontos/mm, o comum das Zebra de balcão); 300 dpi é opção por computador (escala 1,5). `^CI28` (UTF-8: acentos ficam) e todo texto em `^FH` com `^`, `~` e `_` em hexadecimal; o texto é normalizado (NFC; quebras viram espaço; controle, largura zero, bidi, emoji e símbolos saem; aspas e travessões viram os simples). Produto em destaque, filete, validade maior; nome grande desce para a fonte mínima legível e, se ainda não couber, o formato é recusado com a frase ("use a 60 × 60"); a marca (opcional) é o que sai primeiro. A versão do layout fica gravada na emissão. *Corrigida na rodada 1 (decisão 421):* 300 dpi deixou de ser outro desenho: é o de 203 ampliado (posições, alturas e larguras ×1,5 arredondadas para baixo), então o que cabe e o que sai a 203 é o mesmo a 300 (nada some calado: antes a marca sumia em 56 casos de 120 mil); a embalagem sem prazo diz um termo só, "PRAZO APÓS ABERTURA NÃO INFORMADO" (versão do layout 2). *Corrigida na rodada final (decisões 427 e 428):* a versão do layout é a 1 (a primeira em produção; as mudanças das rodadas aconteceram antes de qualquer emissão real) e cada emissão é desenhada pela versão gravada nela; o sem prazo sai em duas linhas, "PRAZO APÓS ABERTURA" / "NÃO INFORMADO".

### 409. 2026-10-23 · ERP 3.4: Zebra pelo Browser Print do computador, com o pedido gravado antes; sem ele, arquivo .zpl e papel

**Razão:** o navegador fala direto com o aplicativo local da Zebra (`/default`, `/available`, `/write` em http://localhost:9100, ou https://localhost:9101 quando a página é https — os caminhos da própria biblioteca da Zebra, sem copiá-la para o repositório). Estados na tela: procurando, sem aplicativo, sem impressora, pronta, enviando, enviada, falhou. O pedido é gravado ANTES (preparada) e o resultado depois: "enviada" é que o aplicativo aceitou, nunca "impressa"; sem resposta em 15 s é falha com "pode ter saído"; mandar de novo é um pedido novo, por clique, com o aviso de que pode sair repetida (nunca reenvio automático). Arquivo .zpl e papel A4 ficam "arquivo gerado". A impressora escolhida e a resolução ficam no navegador daquele computador (com try/catch). Depende do Rodolfo: instalar o Browser Print no computador da Zebra, aceitar o domínio e imprimir a etiqueta de teste nos dois rolos. *Corrigida na rodada 1 (decisões 418 e 419):* sem resposta em 15 s não é falha: fica "Sem resultado" (pode ter saído); arquivo e papel não tiram da fila; a etiqueta sai de "Esperando a impressora" quando a Zebra aceita ou quando alguém toca em "Já imprimi"; sem Browser Print a tela diz "Sem Zebra neste aparelho"; os erros comuns da Zebra vêm em palavras.

### 410. 2026-10-23 · ERP 3.4: histórico de impressões sem fingir; totais que separam pedido de etiqueta

**Razão:** por loja e período (Hoje, 7 e 30 dias, de/até) e origem (lote produzido, embalagem aberta): cada pedido com primeira ou reimpressão, cópias, caminho, dpi, resultado (com o erro), quem pediu e quem fez ou abriu; 25 por página. Totais: pedidos, etiquetas (a soma das cópias), enviadas à Zebra, arquivo ou papel, falharam e "sem resultado" (a tela fechou antes de confirmar: pode ou não ter saído). O Histórico do parceiro ganha "Etiqueta", "Lote do fornecedor" e "Embalagem aberta" (Emitiu, Abriu, Registrou, Excluiu) e o filtro "Etiquetas". *Corrigida na rodada 1 (decisão 418):* cada pedido pelo nome do caminho (Zebra, Arquivo, Papel), não "primeira/reimpressão"; o total "Arquivo ou papel" deu lugar a "Já imprimi" (cópias que alguém disse que saíram); "Sem resultado" é a Zebra que não respondeu ou a tela que fechou, sem contar o que foi confirmado.

### 411. 2026-10-23 · ERP 3.4: idempotência e concorrência

**Razão:** emissão, abertura, pedido de impressão e lote da nota levam a chave do envio (gerada no servidor para funcionar sem JavaScript e trocada pelo navegador ao montar; depois de gravar, o formulário recomeça com chave nova): a mesma chave devolve o mesmo registro. O código da etiqueta (E + AAMMDD do Rio + sequência do dia no parceiro, como E261023-0007) nasce sob trava do dia e índice único. A emissão lê o lote com FOR SHARE (o estorno espera ou é esperado); o pedido trava a emissão (FOR UPDATE) para a sequência; o resultado só muda uma vez, de "preparada" (gatilho).

### 412. 2026-10-23 · ERP 3.4: até 50 etiquetas por emissão e 50 cópias por pedido; "quanto em cada" não passa do que saiu

**Razão:** a cozinha porciona um lote grande (um pote por porção): 10 (o limite do Kairu) é pouco. Quantas × quanto em cada ≤ o que saiu do lote (a tela recusa ao vivo e o servidor de novo). Quantidade é opcional (sem ela, a etiqueta sai sem quantidade). **Hipótese para o Rodolfo:** 50 serve?

### 413. 2026-10-23 · ERP 3.4: a área Etiquetas e as pontes

**Razão:** área própria com Imprimir (a loja: fila da impressora, lotes concluídos e embalagens abertas dos últimos 7 dias, busca pelo código do lote), Abrir embalagem, Histórico e Impressora (o Browser Print deste computador, com o passo a passo e a etiqueta de teste fictícia, sem gravar nada). Entrada por loja (uma loja vai direto). O lote concluído na Produção ganha "Imprimir etiqueta"; o detalhe da nota ganha "Lote e vencimento". Prévia proporcional ao papel (SVG; a etiqueta é papel branco também no tema escuro); papel A4 em tamanho real com `@page` só daquela página (o bloco de impressão do ERP não muda; o resto da tela usa `ff-nao-imprime`). `VERSAO_DO_ERP` = "Barney ERP · fase 3.4"; não sobra módulo "em breve". Ajuda nova em cada rota (e "Lote e vencimento" em Compras); "Lote" e "Detalhe da nota" ganharam uma seção.

### 414. 2026-10-23 · ERP 3.4: referências Kairu consultadas e o que foi aplicado

**Razão:** pelo MCP Kairu em 23/10/2026: `library:impressao-etiquetas` v1.0.0 (lido inteiro) e `prompt:b3592b7c-e37b-4b1d-bffb-9053848afe28` ("Da Ficha ao Fornecedor", lido inteiro). Aplicado: abas Imprimir/Histórico/Configurar (aqui Impressora); 60 × 40 e 60 × 60 a 203 dpi; ZPL sanitizado com acentos; prévia e ZPL do mesmo layout; nome longo quebra ou diz o formato maior, nunca trunca; snapshot e reimpressão sem recalcular; estados sem "PRINTED" automático e "arquivo gerado" ≠ impressão; pedido gravado antes do envio, idempotência, reenvio consciente com aviso de duplicação; total de pedidos ≠ total de etiquetas; emissor da sessão e quem manipulou separados; emissão não mexe no estoque; validade no servidor no fuso da loja, dias como duração; isolamento por loja no servidor; teste de etiqueta fictícia; busca pelo número do lote (do prompt da comunidade). Adaptado: sem prazo o Kairu bloqueia a emissão — aqui o lote sem validade sai "não informada" e a embalagem sem prazo "prazo não informado" (decisões 401 e 402, pela regra do coordenador de nunca inventar); cópias até 50 (decisão 412); Browser Print pela API local, sem empacotar o SDK. Fora: logo e CNPJ na etiqueta, hash do payload (o retrato regera o mesmo ZPL, testado), estado "confirmada pelo operador", limite de frequência, data de manipulação retroativa e o rastreio de qual lote de insumo entrou no lote produzido (limitação também do prompt da comunidade). *Rodada 1:* o estado "confirmada pelo operador" entrou ("Já imprimi", decisão 418), a pedido da UX.

### 415. 2026-10-23 · ERP 3.4: perguntas para o Rodolfo (não bloqueiam; o padrão adotado está em negrito)

**Razão:** (1) Lote concluído sem validade: imprimir com "VALIDADE NÃO INFORMADA" ou bloquear até a ficha ter prazo? **Imprime e avisa.** (2) Embalagem aberta sem prazo cadastrado: imprimir "PRAZO NÃO INFORMADO" ou bloquear? **Imprime e avisa.** (3) O vencimento vale até o fim do dia no Rio? **Sim.** (4) Até quantas etiquetas e cópias de uma vez? **50.** (5) Quem abre é quem assina; a FlowFoods (nível 1) não abre — de acordo? **Sim.** (6) Registrar o lote na nota é de quem lança nota (`compras.lancar`), e a cozinha só lê o que está na embalagem na hora de abrir — de acordo? **Sim.** (7) A Zebra do Valentin's é de 203 ou 300 dpi, e quais rolos (60 × 40, 60 × 60)? **203 e os dois**, até o teste físico dizer. (8) A etiqueta deve levar o CNPJ ou o logo da casa? **Não nesta fase.** (9) Quer a confirmação "saiu no papel" depois do envio? **Não nesta fase: "enviada" já diz que é só o aplicativo.** *Rodada 1:* (2) o termo ficou "PRAZO APÓS ABERTURA NÃO INFORMADO" (um só, decisão 423); (9) respondida pela UX: **sim, "Já imprimi"** (decisão 418); (10) nova: lote ou embalagem vencida pode imprimir com a autorização do gerente? **Não: não imprime para ninguém** (decisão 417).

### 416. 2026-10-23 · ERP 3.4: o que a prova achou e fez corrigir

**Razão:** (1) a jornada achou: depois de registrar um lote na nota, a tela voltava para ela mesma com o formulário montado e a chave do envio antiga; o segundo lote virava "já registrado". O formulário passou a ter a chave da leitura como `key` (recomeça vazio e com chave nova). (2) A matriz achou links soltos a 15–20 px com toque ("trocar", "Impressora deste computador", o lote na Produção, "Procurar de novo"): 44 px. (3) Com a RLS forçada, mudar a abertura é recusado pela falta de UPDATE do papel do tenant (antes do gatilho): o teste aceita as duas recusas. (4) Lote que chegou vencido aparece com "Venceu: não abra" na nota. *Corrigida na rodada 1 (decisão 423):* (4) o lote que chegou vencido (vence antes da entrada da nota) diz "Chegou vencido: separe e devolva ao fornecedor"; o que venceu depois segue "Venceu: não abra".

### 417. 2026-10-23 · ERP 3.4 (rodada 1): lote produzido vencido não emite nem reimprime — a mesma regra da embalagem aberta

**Razão:** a UX achou o lote produzido vencido emitindo etiqueta com aviso verde e a Zebra liberada, enquanto a embalagem aberta vencida já dizia "não abra". Agora vale para os dois e para todos (operador, gerente, dona, nível 1): venceu = a validade gravada já passou (`venceu`, `validadeEm <= agora`; o vencimento do lote vale até o fim do dia no Rio, decisão 403). O servidor recusa emitir (lote e embalagem), pedir impressão (Zebra, arquivo e papel), desenhar o papel de um pedido antigo e o "Já imprimi" (`bloqueioDaEmissao`, a mesma frase do lote estornado). A tela diz em vermelho **"Este lote venceu em DD/MM às HH:MM: não use. Separe para descarte e avise a gerência."** (embalagem: "Esta embalagem venceu em DD/MM: …"), sem o formulário de emissão e sem o painel de impressão. No painel da loja, o vencido diz "venceu: não use" em vez de "sem etiqueta ainda" e sai de "Esperando a impressora". **Alternativa descartada:** imprimir com autorização do gerente — etiqueta é para usar o produto; vencido não se usa.

### 418. 2026-10-23 · ERP 3.4 (rodada 1): a fila só se esvazia com a Zebra aceitando ou com "Já imprimi"; arquivo e papel não tiram

**Razão:** a UX achou que abrir a tela do papel ou baixar o .zpl (inclusive no tablet sem Zebra) tirava a etiqueta da fila sem nada ter saído. Agora a etiqueta sai de "Esperando a impressora" quando (a) a Zebra aceita um envio ("Enviada à impressora") ou (b) alguém toca em **"Já imprimi"**, que grava QUEM e QUANDO no último pedido ainda sem resultado (arquivo, papel ou Zebra sem resposta): colunas `confirmadaEm`, `confirmadaPorNome` e `confirmadaPorUsuarioId` em `EtiquetaImpressao` (ajuste da migration da 3.4, que ainda não está na master). Uma vez só (de novo = "já feito"); sem pedido antes = "Peça a impressão primeiro"; não muda o resultado (CHECK `EtiquetaImpressao_confirmacao` + gatilho: confirmar e mudar a situação juntos é recusado; depois de confirmado, a Zebra não grava mais resultado nele). O botão aparece no painel de impressão e na tela do papel (depois de imprimir a folha). Sem o Browser Print no aparelho, a tela diz **"Sem Zebra neste aparelho. A etiqueta fica em “Esperando a impressora”: imprima pelo computador da Zebra"** e oferece arquivo e papel como opção, com "depois que sair, toque em Já imprimi". Os pedidos ganharam nome próprio (**Zebra, Arquivo, Papel**) e o selo diz o que aconteceu: Já imprimi, Enviada à impressora, Falhou, Sem resultado, Arquivo baixado, Papel aberto. O nível 1 também confirma (fica no auditLog, `erp_etiqueta_ja_imprimi`). *Corrigida na rodada final (decisão 426):* o "Já imprimi" lê os pedidos travados (a resposta da Zebra que chega junto termina antes e vira "já feito"); o pedido não nasce confirmado e a confirmação não fica no futuro (gatilho).

### 419. 2026-10-23 · ERP 3.4 (rodada 1): Zebra sem resposta é "Sem resposta", não "Falhou"; os erros comuns da Zebra em palavras de cozinha

**Razão:** sem resposta em 15 s a etiqueta pode ter saído; chamar de falha contradizia o "pode ter saído". O pedido fica "Sem resultado" (a tela não grava FALHOU), o título é **"Sem resposta"** e a pessoa confere o papel: saiu = "Já imprimi"; não saiu = "Mandar de novo (pode sair repetida)". Erro que o aplicativo devolve em inglês vira frase (`traduzirErroDaZebra`): sem papel ("Acabou o rolo de etiquetas"), tampa aberta, fita (ribbon), pausada, cabeça quente, desligada; o que não se reconhece aparece como veio, com "A impressora respondeu:".

### 420. 2026-10-23 · ERP 3.4 (rodada 1, Guardião): o banco confere a cópia inteira e o histórico não some

**Razão:** o Guardião forjou em SQL cru, como o papel do tenant, etiquetas que a decisão 401 dizia impossíveis. O gatilho `Etiqueta_origem_confere` agora compara, na etiqueta do lote, a manipulação com a conclusão e quem fez (nome e login) com o lote, e recusa campos da abertura; na etiqueta do item aberto, o lote do fornecedor, a marca, quem abriu (nome e login) e a quantidade com a abertura, e recusa campos do lote produzido. `AberturaDeLote` e `EtiquetaImpressao` recusam DELETE no gatilho (não só pela falta de GRANT: o dono sem RLS também não apaga). O pedido não troca de id, não conclui antes de ser pedido (CHECK `concluidaEm >= solicitadaEm`) e só muda uma vez (o resultado) mais a confirmação. Migration da 3.4 ajustada no lugar (ainda não está na master); o teste da migration roda de novo nos 3 perfis.

### 421. 2026-10-23 · ERP 3.4 (rodada 1, Guardião): a chave do envio é da loja; 300 dpi do desenho de 203; o lote aceita _ : #; pré-preparo numa nota

**Razão:** (M6) a mesma chave de envio usada na Penha, reenviada pela Delivery, devolvia o id da emissão da Penha: `emissaoDaChave` agora confere a loja (outra loja = recusa, sem o id). (M3) a 300 dpi a marca sumia calada em 56 de 120 mil conteúdos que cabiam a 203: o layout de 300 é o de 203 ampliado com arredondamento para baixo (decisão 408 corrigida); varredura de 3.000 casos nos testes, 0 diferença de campos. (M8) lote do XML com `_`, `:` ou `#` era recusado: o código aceita letras, números, espaço e `. / - _ : # , ( ) +` (o ZPL continua seguro: `_` vai em hexadecimal). (M4) pré-preparo sem ficha lançado numa nota dava erro 500 ao registrar lote: a tela não oferece o formulário e diz "Pré-preparo não tem lote de fornecedor: a etiqueta dele vem do lote produzido"; a regra recusa com a mesma frase.

### 422. 2026-10-23 · ERP 3.4 (rodada 1): papel A4 sem folha em branco, com estilo de impressão só da página do papel

**Razão:** 2 cópias saíam em 2 folhas, a segunda em branco (gasta folha adesiva): a altura mínima da tela (`min-h-dvh` do shell) continuava na impressão. A página do papel leva o seu próprio estilo: `@media print { .ff-app:has(.ff-papel-etiquetas) .min-h-dvh { min-height: 0 } .ff-papel-etiquetas { margin-top: 0 } }` — só vale onde há etiquetas de papel; o bloco de impressão do ERP (`tokens.css`) não mudou.

### 423. 2026-10-23 · ERP 3.4 (rodada 1): acabamentos da UX

**Razão:** (UX 4) na nota, o link "Registrar ou ver os lotes" tem 44 px também no tablet e no computador, e o painel diz quantos lotes já estão registrados. (UX 7) nome que não cabe na 60 × 40: a barra diz **"Não cabe: use 60 × 60"** com o botão "Trocar para 60 × 60" (se nem a 60 × 60 cabe, diz). A barra diz "2 etiquetas de 60 × 40 mm", não "2 × 60 × 40 mm". (UX 8) embalagem sem prazo: um termo só, **"Prazo após abertura não informado"**, no selo, na etiqueta e no "Usar até". (UX 9) as barras de ação de emitir e de abrir ficam presas embaixo até o menu lateral aparecer (900 px), também no tablet em pé; na emissão, no celular e no tablet, o painel de impressão vem antes da prévia. (UX 10) aba Impressora: "Siga os passos abaixo" no celular ("ao lado" no computador), e os passos dizem a licença de rede local do Chrome e aceitar o certificado de https://localhost:9101 na primeira vez. (UX 13) lote que chegou vencido na nota: **"Chegou vencido: separe e devolva ao fornecedor."** (UX 12, "Registrar e emitir" num toque na abertura) **ficou de fora:** a emissão pede o tamanho e quantas, e a tela da abertura já abre com o formulário de emissão e a prévia; juntar as duas mexe no formulário de abrir inteiro, não é pequeno. *Rodada final (decisão 428):* o aviso depois de emitir não promete Zebra ("Etiqueta emitida: ela espera a impressora.").

### 424. 2026-10-23 · ERP 3.4 (rodada 1): o que a prova da rodada achou e fez corrigir

**Razão:** (1) o teste da migration da 3.4 nos 3 perfis plantava uma etiqueta de lote sem a manipulação e sem quem fez: o gatilho novo (decisão 420) recusou, como devia; o teste passou a copiar o lote e ganhou os casos forjados (manipulação, quem fez), o DELETE do pedido e da abertura e o "Já imprimi" uma vez só. (2) A matriz da rodada achou, na nota de compra, o link "Ver o estoque" (da 1.6) com 20 px com toque: 44 px, como o dos lotes. (3) O detector do ataque do Guardião para o papel após o estorno olha só se a função devolve algo; ela devolve o porquê, sem conteúdo nem layout (`conteudo` e `layout` nulos), e a tela não desenha etiqueta — o achado está fechado, o detector é que ficou largo.

### 425. 2026-10-23 · ERP 3.4 (rodada final, Guardião): a embalagem aberta SEM prazo vence junto com o lote do fornecedor

**Razão:** o Guardião abriu cebola em seco (sem prazo após abertura), de um lote que vencia no dia: depois da meia-noite a etiqueta ainda emitia, a Zebra e o papel reimprimiam (com "VENC. LOTE" passado), o "Já imprimi" confirmava e a tela dizia "Prazo após abertura não informado" em alerta, não "venceu". A validade gravada é vazia nesse caso (decisão 402: o vencimento não vira validade depois de aberto), e `venceu` só olhava ela. Agora **`limiteDeUso`** = a validade gravada; sem ela, o fim do dia do vencimento do lote no Rio. Vale em todo caminho: `bloqueioDaEmissao` (Zebra, arquivo, papel novo e antigo, "Já imprimi"), `emitirEtiquetaDaAbertura`, o motivo da tela da abertura (vermelho, sem formulário), a fila (fora) e o selo ("Venceu") e o painel ("venceu: não use"). A etiqueta continua sem data de validade (não se inventa prazo); o que muda é que ela deixa de servir quando o lote vence. Testado com o cenário dele: 1 ms antes do fim do dia emite e imprime; 1 h depois tudo recusa, para operador, dona e nível 1.

### 426. 2026-10-23 · ERP 3.4 (rodada final, Guardião): "Já imprimi" e a resposta da Zebra ao mesmo tempo; a confirmação não nasce pronta nem fica no futuro

**Razão:** com o "Já imprimi" e a resposta da Zebra chegando juntos no mesmo pedido, o Guardião viu erro cru (500) em 14 de 20 rodadas: o "Já imprimi" lia os pedidos sem trava e gravava num pedido que acabara de virar "enviada" (o CHECK `EtiquetaImpressao_confirmacao` recusava, corretamente). Agora os pedidos são lidos com `FOR UPDATE`: quem chega depois espera e vê o resultado (a Zebra aceitou = "já feito"); a gravação só vale para o pedido ainda sem resultado e sem confirmação e, se mesmo assim não gravar, a frase é "A impressora respondeu agora mesmo: veja a etiqueta de novo." (12 rodadas no teste, nunca erro cru, nunca "enviada" e "confirmada" juntas). No gatilho: o pedido não nasce com o "Já imprimi" e a hora do "Já imprimi" não fica no futuro (5 min de folga para o relógio da aplicação).

### 427. 2026-10-23 · ERP 3.4 (rodada final, Guardião): a versão do layout é a 1 e o desenho respeita a versão gravada; código morto fora

**Razão:** a emissão grava `versaoDoLayout`, mas o desenho ignorava o número. Como a migration da 3.4 ainda não está na master, nenhuma emissão real existe: as mudanças das rodadas (sem prazo, 300 dpi) são todas da primeira versão, que fica **1**. `DESENHOS` (etiquetas.ts) liga cada versão ao seu desenho e `desenhoDaEmissao` desenha a emissão pela versão dela (prévia, Zebra, arquivo e papel); versão que o sistema não tem não imprime e diz "emita de novo". Mudar o desenho depois = criar a versão 2 AO LADO da 1. `emissaoParaArquivo` (sem uso) saiu.

### 428. 2026-10-23 · ERP 3.4 (rodada final, UX): o sem prazo em duas linhas; o aviso depois de emitir; os cartões do histórico

**Razão:** (UX 4) na 60 × 40, "PRAZO APÓS ABERTURA NÃO INFORMADO" numa linha encostava na borda com Arial (482 de 480 pontos): a etiqueta quebra o mesmo termo em duas linhas, "PRAZO APÓS ABERTURA" / "NÃO INFORMADO" (a tela segue com o termo inteiro); cada parte tem folga mesmo com a estimativa de largura 10 % maior (teste). (UX 5) a tela não sabe se há Zebra no aparelho quando mostra o aviso: ele passou a dizer "Etiqueta emitida: ela espera a impressora." (UX 6) a 1440 os cartões do histórico cortavam o detalhe: detalhes curtos, quatro por linha, e o cartão novo **"Esperando o Já imprimi"** (etiquetas com arquivo baixado ou papel aberto que ninguém confirmou e que a Zebra não recebeu).

### 430. 2026-10-23 · Ponto 4: o portão do GitHub roda a suíte inteira com um Postgres de serviço; falha segura o deploy

**Alternativas:** (a) manter `npm test` sem banco (os testes de isolamento, RLS, concorrência e migration eram PULADOS — 834 no run 39857676462 — e o portão ficava verde); (b) Postgres de serviço no job `portao`, migrations aplicadas do zero e a suíte inteira com `ERP_DB_TESTE`.

**Razão:** (b). É o que o Ponto 4 aprovou: os testes críticos precisam rodar de verdade antes de publicar. O deploy já dependia do `portao` (`needs: portao`), então falha num teste com banco agora segura a publicação sem mexer em proteção de branch (Ponto 18, recusado — não foi tocado). O resumo do job (`GITHUB_STEP_SUMMARY`) mostra aprovados e pulados; os pulados são as variantes que pedem um dono NÃO superusuário com FORCE RLS (o usuário do serviço é superusuário) e continuam a rodar à mão (docs/ERP.md "Provar o isolamento"): não executado não é aprovado. Custo: o portão passa de ~3 para ~15 minutos (a suíte inteira levou 655 s na simulação local: 136 arquivos, 2.709 testes, 0 falhas). O CI usa Node 22, o mesmo da imagem de produção, e confere que o `psql` existe (sem ele, os testes de migration seriam pulados calados).

### 431. 2026-10-23 · Ponto 20: serviço `migrar` de uma vez só; `web` e `worker` só sobem depois da migration concluída

**Alternativas:** (a) a migration no comando do `web` (como era: o `worker` subia em paralelo, sem esperar, e podia rodar sobre estrutura antiga); (b) um serviço `migrar` (mesma imagem) com `restart: 'no'`, do qual `web` e `worker` dependem com `service_completed_successfully`.

**Razão:** (b). Nenhum processo opera sobre estrutura incompatível. Migration que falha = web e worker não sobem e o site fica FORA até resolver: num deploy com código novo o Compose recria web e worker antes de esperar o `migrar` (conferido no código do Compose v2 pelo revisor). A disponibilidade é a mesma de antes (o `web` ficava reiniciando em laço), mas agora nada roda sobre estrutura pela metade e o motivo fica no log do `migrar`. Para destravar é preciso marcar a tentativa como desfeita (`prisma migrate resolve --rolled-back <nome>`), senão todo `migrate deploy` para com P3009, inclusive o rollback do Dokploy — passo a passo em docs/RUNBOOK.md 1.2. A migration saiu do comando do `web` (uma fonte só). Mesma imagem do `web`: o build é o mesmo (camadas em cache). O conferidor roda com tempo máximo de 120 s, para não pendurar o deploy com o site parado.

### 432. 2026-10-23 · Ponto 15: o conferidor roda sozinho depois da migration, só registra e não bloqueia

**Razão:** o `migrar` roda `npm run erp:conferir-migracao` depois da migration. Pendência em dado antigo (CHECK que ficou `NOT VALID`, índice que faltou) sai no log com a frase "ATENÇÃO: a conferência pós-migration listou pendências"; nada é apagado, convertido ou corrigido sozinho, e o site sobe (o Ponto 15 aprovou conferir e registrar, não reparar nem derrubar). Erro ao conferir (código 2) também não bloqueia: a migration já terminou bem. O que fazer com cada pendência está em docs/RUNBOOK.md.


### 433. 2026-10-24 · Prioridade nº 1 (23/10): ajuda por ponto, em card flutuante, junto do campo — evolução da 0.6, não outro sistema

**Alternativas:** (a) manter o texto didático fixo embaixo dos campos; (b) um card genérico por tela; (c) pontos de ajuda junto de cada campo/seção, abrindo um card flutuante único, com o conteúdo no mesmo registro da 0.6 (`ajuda-textos.ts`, campo `pontos` da entrada da tela).

**Razão:** (c), como Rodolfo pediu: menos texto fixo, ajuda perto do que explica, ler/fechar/reabrir quando quiser. Uma ajuda aberta por vez (abrir outra troca o conteúdo). Abre sozinha na 1ª visita ao contexto e volta a ficar elegível 7 dias depois da última abertura automática (semanal, confirmado em 23/10). **No máximo uma abertura automática por visita à tela**, na ordem em que os pontos aparecem: com cinco pontos elegíveis, cada visita mostra um, sem fila de popups. Não abre sozinha enquanto a caixa "Como funciona" da tela ou a gaveta estão abertas, nem com as dicas desligadas, nem no nível 1. X/Escape dispensa agora; "Não mostrar novamente" corta a abertura automática; o botão do campo abre sempre. Abertura automática não rouba o foco nem rola a página; abertura manual leva o foco ao card, sobe a página se o card cobrir o campo (celular/tablet em pé) e devolve o foco ao botão ao fechar. Card não modal; "Ver passo a passo" só aparece quando há seção correspondente na gaveta; não há botão de vídeo (não existe vídeo). A caixa "Como funciona" por tela continua como estava (decisões 110–113).

### 434. 2026-10-24 · Onde mora o "já viu" dos pontos: coluna `pontos` na preferência da pessoa; o servidor decide o dia

**Razão:** é preferência da PESSOA (decisão 112), não dado do parceiro: coluna aditiva `PreferenciaErp.pontos` (fora do tenant, sem GRANT do `erp_tenant`, só `credenciais.ts` grava), itens `chave.ponto=DIA` ou `chave.ponto=x`, um por ponto, teto de 300 com CHECK no banco, gravação atômica (duas abas não perdem nada). O DIA é o dia corrido no horário de Brasília calculado no servidor (`diaDe`), e o layout manda o mesmo `hoje` para a tela: o relógio do aparelho não decide nada. Lista branca: só ponto que existe no registro. "Não mostrar novamente" não é desfeito por um "visto" de aba antiga. "Mostrar as dicas de novo" (Seu acesso) zera também os pontos. Os pontos ficam FORA do `ajuda.lock.json`: mudar um ponto não faz a caixa da tela voltar com "MUDOU" para quem já tinha fechado — o ponto tem o ciclo semanal dele.

### 435. 2026-10-24 · O que sai da tela e o que fica: indispensável continua à vista

**Razão:** saíram para os pontos as explicações longas de Cadastrar insumo (tipo × categoria × conservação, marca, conservação, prazo após abertura, unidade/embalagem/custo) e de Montar a ficha (prato × pré-preparo, descrição comercial, foto, rendimento, etapas). Ficam na tela: rótulos, obrigatório, unidades, erros, alertas, a linha curta do tipo, a categoria sugerida, os formatos da foto ("JPG, PNG ou WebP.") e "Não é a data de vencimento impressa no lote" — essa distinção foi correção prioritária e não pode depender de abrir ajuda. Componente compartilhado em tela sem o ponto (ex.: Embalagem de compra) mantém o texto antigo (`useTemPonto`). Corrigido no caminho: o texto dizia que lote e abertura "ainda não existem no ERP" — existem desde a 3.4 (recebimento e etiquetas). Um teste reprova `<PontoDeAjuda ponto="...">` sem texto no registro.

### 436. 2026-10-24 · Compose: a imagem do app é construída uma vez por deploy (`web` builda; `migrar` e `worker` reutilizam)

**Razão:** os três serviços tinham `build:` do mesmo Dockerfile. No Docker 29/Compose 5.6 o BuildKit já reaproveitava as camadas (o passo pesado rodava uma vez — testado), então não houve três compilações do Next nem relação com a queda da VPS de 23/10. A mudança garante isso em qualquer versão e deixa uma imagem só por deploy (`flowfoods-web:local`, `pull_policy: never` nos outros dois). Depois do 1º deploy, as três tags antigas ficam presas na última versão: `docker image rm` nelas libera o espaço (docs/RUNBOOK.md).
