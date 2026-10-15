# ERP Barney — fatia vertical (Passo zero), fundação do banco (0.1), multi-tenant (0.2) e login (0.3)

Plano, fases e ordem: página "FlowFoods Barney — ERP" no Notion. Este arquivo
só diz como ver a fatia funcionando e quais regras o código já trava.

## O que existe

| Peça | Onde |
|---|---|
| Parceiro Flow (tenant) e Insumo | `prisma/schema.prisma` (bloco ERP) + migration `20261015000000_erp_insumo` |
| Esquema inteiro de Ficha, Estoque, Produção e DRE (0.1) | bloco ERP + migration `20261015010000_erp_fundacao` |
| Portão de tenant (`doParceiro`, `gravarParceiroFlow`) | `src/lib/erp/tenant.ts` |
| Contexto de tenant (sessão + parceiro + cliente) | `src/lib/erp/contexto.ts` (`exigirNivel1`, `exigirParceiro`) |
| RLS no banco (papel `erp_tenant`) | migration `20261015020000_erp_multitenant` |
| Milésimos e centavos (texto → inteiro, arredondamento) | `src/lib/erp/unidades.ts` |
| Regras de cadastro | `insumos.ts`, `parceiros.ts` (N1), `estrutura.ts` (lojas e marcas), `historico.ts`, `slug.ts` |
| Telas | `/rodolfo/erp` (N1: parceiros + novo) e `/rodolfo/erp/<slug>` com abas Insumos · Lojas e marcas (`/estrutura`) · Acessos (`/acessos`) · Histórico (`/historico`) · Cadastro (`/cadastro`) |
| Login das pessoas dos parceiros (0.3) | `UsuarioErp` e companhia (bloco "acesso das pessoas" do esquema) + migration `20261015030000_erp_login` |
| Acesso ao banco das credenciais (único módulo) | `src/lib/erp/credenciais.ts` (regras puras em `acesso.ts`; rosto em `rosto.ts`; cookie em `sessao.ts`/`sessao-cookie.ts`) |
| Telas da pessoa do parceiro | `/entrar` (e-mail e senha, entrar com o rosto), `/entrar/primeiro-acesso/<token>`, `/entrar/escolher`, `/erp` (Insumos) e `/erp/acesso` (Seu acesso: rosto) |

## O que a 0.2 entregou (multi-tenant)

1. **Parceiro Flow no nível 1.** Em `/rodolfo/erp`: criar (nome, endereço/slug
   gerado do nome e editável só na criação, nasce Ativo ou Aguardando
   liberação). Na aba Cadastro: renomear (permitido também em suspenso) e mudar
   a situação (Aguardando liberação → Ativo, Ativo → Suspenso com motivo
   obrigatório, Suspenso → Ativo). Toda mudança grava antes/depois em
   `HistoricoAlteracao` do próprio parceiro **na mesma transação**
   (`gravarParceiroFlow`), aparece no histórico curto da aba Cadastro e no
   Histórico completo. Mudança é condicional ao valor lido (duas abas não se
   atropelam). Criar parceiro pela landing/aprovação de lead é da 0.5.
2. **Estrutura N2 → N3.** Aba "Lojas e marcas": cadastro (nome; loja ganha slug
   próprio) e lista. Cadastro de loja, marca e insumo grava o "depois" no
   histórico, na mesma transação. Aba "Histórico": tudo, com filtro por
   entidade, 100 últimas.
3. **Contexto num lugar só.** `exigirParceiro(slug)` confere a sessão, resolve o
   parceiro (uma ida ao banco por requisição, `react.cache`) e devolve o
   cliente do portão. Todas as páginas e server actions do ERP passam por ele
   (ou por `exigirNivel1` na lista N1). Parceiro **não ATIVO** (suspenso ou
   aguardando liberação) recebe cliente **somente leitura**: o portão recusa
   create/update/upsert/delete e a transação abre `transaction_read_only` no
   Postgres. E, por baixo, **toda escrita de qualquer `doParceiro`** (worker,
   webhook) confere o status na própria transação, com `FOR SHARE`
   (`erp_exigir_parceiro_ativo`, decisão 32).
4. **RLS no banco.** Ver "Regras travadas" (camada 4) e decisão 31. Instalada
   só quando o usuário da migration pode (dono das tabelas + papel disponível);
   senão a migration avisa e segue, e o portão detecta em runtime e opera sem
   o papel (aviso único no log).

## O que a 0.3 entregou (login das pessoas dos parceiros)

1. **Contas.** `UsuarioErp` (e-mail único e minúsculo, senha bcrypt custo 12,
   nula até o primeiro acesso) + `AcessoParceiro` (vínculo pessoa × parceiro,
   ATIVO/DESATIVADO). Uma pessoa pode estar em mais de um parceiro (consultor,
   sócio de rede): a identidade é uma, o vínculo é por parceiro (decisão 34).
   Ela NUNCA entra no /rodolfo: o login de lá só lê `User`.
2. **Gestão pelo nível 1** (aba Acessos): criar (nome, e-mail) gera o link de
   primeiro acesso (token de 32 bytes, guardado só o SHA-256, 72 h, uso
   único); gerar link novo (revoga o anterior; serve também para senha
   esquecida); desativar/reativar. E-mail que já entra em outro parceiro só
   ganha o vínculo (sem link). Tudo com antes/depois no histórico do parceiro,
   na mesma transação. Sem envio automático: o Rodolfo copia o link.
3. **Entrar** em `/entrar`: e-mail e senha; mensagem única ("E-mail ou senha
   incorretos.") para e-mail inexistente, senha errada, senha não definida e
   acesso desativado; limite de 5 falhas por e-mail (desde o último acerto) e
   20 por IP em 15 min, guardado no banco (`TentativaEntradaErp`, que também é
   a auditoria ok/falhou). **Contar e reservar é atômico** (revisão da 0.3):
   numa transação com `pg_advisory_xact_lock` do e-mail e do IP, conta as
   falhas e grava a tentativa como falha ("EM_ANDAMENTO") ANTES do bcrypt; no
   fim vira OK ou o motivo. Pedidos simultâneos esperam a trava e veem as
   reservas uns dos outros: 20 chutes paralelos no mesmo e-mail testam 5
   senhas (teste com banco). Quem não consegue entrar tem saída em todas as
   larguras: "Esqueceu a senha ou não consegue entrar? Fale com a FlowFoods"
   (WhatsApp, `AJUDA_DE_ACESSO_ERP` em `src/lib/constants.ts`), também no link
   vencido e em "Seu acesso". Sessão própria
   (cookie `ff_erp` / `__Host-ff_erp`, token aleatório, só o hash no banco,
   7 dias), validada no banco a CADA requisição: desativar derruba na próxima.
   Sair encerra a sessão. Trocar a senha derruba todas as sessões da pessoa.
4. **`/erp`**: mostra o parceiro da sessão e a MESMA tela de Insumos do nível 1
   (`tela-insumos.tsx`), sempre por `exigirParceiroDaSessao()` → `doParceiro`
   com o parceiro DA SESSÃO; nenhuma rota recebe parceiro pela URL. Quem tem
   mais de um parceiro escolhe em `/entrar/escolher` (vínculo conferido).
   Parceiro suspenso/aguardando: entra, mas só lê (decisão 38).
5. **Entrar com o rosto** (passkey/WebAuthn, `@simplewebauthn`): verificação do
   usuário obrigatória — no celular, Face ID/reconhecimento facial/digital do
   próprio aparelho. O servidor guarda só a chave pública; nenhuma imagem é
   capturada ou enviada. Ativar em `/erp/acesso` exige sessão aberta com senha
   há até 30 min; desafio no banco, 5 min, uso único, preso ao tipo e à pessoa,
   com teto de abertos (10 por IP na entrada, 3 por pessoa no registro) e
   recusado para IP já bloqueado por falhas;
   contador conferido (condicional no banco); listar e remover aparelhos.
   `rpID`/`origin` de `ERP_WEBAUTHN_RP_ID`/`ERP_WEBAUTHN_ORIGIN`, senão do
   `NEXTAUTH_URL`. Fora de https (e do localhost) o botão nem aparece
   (`rostoPossivel`): hoje a produção é http. Senha continua sendo o caminho
   principal.
6. **Sessões separadas.** O middleware manda `/erp` sem o cookie próprio para
   `/entrar`; o `/rodolfo` só aceita o JWT do next-auth. Provado em teste
   (middleware) e na prova visual (uma sessão não abre a outra área).

### Por que as credenciais ficam fora do tenant (decisão 35)

E-mail, senha, link, rosto e sessão precisam ser lidos ANTES de saber o
parceiro (no login), então não cabem na RLS por parceiro. Em troca, travas:
`MODELOS_DE_CREDENCIAL` (o `prisma` do portal recusa em runtime), teste-guarda
(só `credenciais.ts` toca nelas; só ele e o portão importam `base.ts` e
`fecharComHistorico`), papel `erp_tenant` sem GRANT nelas (a migration revoga,
no padrão condicional da 0.2) e o histórico das mudanças no tenant do parceiro.

## Mapa do esquema (0.1)

Toda tabela abaixo tem `parceiroId` (tenant) e só se acessa por `doParceiro`.

| Bloco | Tabela | Para quê |
|---|---|---|
| Estrutura | `ParceiroFlow` | N2, o tenant. Ganhou `periodoTipo`/`periodoDiaInicio` (sugestão de período do DRE) |
| Estrutura | `Loja` | N3, loja/unidade do parceiro; estoque, produção e faturamento são por loja |
| Estrutura | `Marca` | marca do grupo; produto e faturamento podem apontar marca |
| Estrutura | `Colaborador` | pessoa da operação; âncora do histórico por funcionário (login vem na 0.3) |
| Insumos | `Insumo` | já existia; ganhou tipo (ingrediente/embalagem/pré-preparo), taxa de entrega, conservação e validade por conservação, mínimo, fornecedor padrão, origem |
| Insumos | `InsumoVariante` | outras embalagens de compra do mesmo insumo |
| Compras | `Fornecedor` | quem vende |
| Compras | `NotaEntrada` / `NotaEntradaItem` | nota de compra e itens com snapshot; só mexe no estoque quando LANCADA |
| Ficha | `FichaTecnica` | prato ou pré-preparo, rendimento; pré-preparo pode produzir um Insumo |
| Ficha | `FichaItem` | insumo OU subficha, quantidade líquida, fator de correção |
| Venda | `ProdutoVenda` | item de venda (aponta a ficha) |
| Venda | `ProdutoCanal` | preço por canal: manual sobrescreve o sugerido; margem-alvo |
| Venda | `ProdutoEmbalagem` | camada de embalagem por canal (delivery, iFood) |
| Venda | `CanalConfig` | taxa do canal (%, fixa) e margem-alvo padrão, por parceiro |
| Estoque | `SaldoEstoque` | saldo e valor por loja × insumo (cache dos movimentos, com versão) |
| Estoque | `MovimentoEstoque` | livro-razão: entrada, requisição, produção, ajuste, contagem, perda; snapshot e saldo antes/depois |
| Estoque | `Contagem` / `ContagemItem` | abertura, cíclica, fechamento de período; sistema × contado. O "piso obrigatório no fechamento" (1.7) é regra da lógica da 1.7, não do esquema |
| Estoque | `Requisicao` / `RequisicaoItem` | pedido do setor; a baixa sai daqui |
| Produção | `OrdemProducao` | lote: planejado/produzido, custo, responsável (snapshot). Lista do dia = ordens planejadas × saldo (derivada) |
| Produção | `Etiqueta` | etiqueta impressa: lote do fornecedor, validade, abertura, snapshot |
| DRE | `FaturamentoLancamento` | faturamento por loja × marca × canal × dia: valor, pedidos, clientes (= atendimentos do dia, não clientes únicos); chave de idempotência única |
| DRE | `DreLinha` / `DreMeta` | linhas do DRE (com `sentido`: maior ou menor é melhor) e meta % por linha, por canal ou da rede (canal nulo), com vigência |
| DRE | `Despesa` | despesa manual/importada numa linha; loja nula = rede, canal nulo = rateio; importada exige chave de idempotência |
| DRE | `PeriodoApuracao` | períodos configuráveis; contagem de fechamento aponta o período |
| DRE | `FarolFaixa` | 5 faixas por linha do DRE × canal (nulo = rede), sobre o desvio vs meta já com o sentido da linha |
| Auditoria | `HistoricoAlteracao` | antes/depois de todo corte, ajuste ou alteração sensível |

### Unidades inteiras

| Grandeza | Unidade guardada | Exemplo |
|---|---|---|
| Quantidade | milésimos da unidade base | 1,5 kg = 1500 |
| Dinheiro | centavos (`Int`) | R$ 89,90 = 8990 |
| Percentual, meta, taxa, margem | pontos-base | 12% = 1200 |
| Fator de correção/rendimento | milésimos | FC 1,18 = 1180 |
| Validade | minutos | 3 dias = 4320 |

Custo unitário nunca é gravado: guarda-se quantidade e valor total, e o
custo médio sai da divisão (em `unidades.ts`). Nada acumulado é gravado
(DRE, CMV, total do mês são somas), por isso não há `BigInt`.

## Regras travadas

- **Multi-tenant.** Modelo de tenant só se lê/grava por `doParceiro(id)`, que
  amarra o parceiro em toda query e estoura se alguém apontar outro. Para
  transação: `cliente.transacao(tx => …)`. Quatro camadas:
  1. **Runtime, portal.** O `prisma` de `src/lib/db.ts` é travado: qualquer
     operação num modelo de tenant (inclusive dentro de `$transaction`) e
     qualquer relação de tenant do ParceiroFlow estoura. O portão usa um
     PrismaClient base próprio, privado de `tenant.ts`.
  2. **Runtime, portão.** Dado de create/update/upsert só aceita escalares:
     `connect`, create aninhado, `connectOrCreate` etc. são recusados (FK entra
     como `fichaId`). O cliente expõe só operações de dado, congeladas, sem
     `$parent`.
  3. **Banco.** FK composta com `parceiroId` e trigger que recusa UPDATE do
     `parceiroId` em toda tabela de tenant.
  4. **Banco, RLS (0.2).** As 29 tabelas de tenant têm RLS ligada e FORÇADA,
     com política `"parceiroId" = app.parceiro_id` para o papel `erp_tenant`
     (NOLOGIN, sem BYPASSRLS, GRANT só nessas tabelas; livro-razão e histórico
     só SELECT/INSERT). Toda operação do portão roda numa transação que começa
     com `set_config('app.parceiro_id', id, true)` + `set_config('role',
     'erp_tenant', true)`. Assim até SQL cru **dentro do contexto** só vê o
     parceiro: `cliente.sql` (template com parâmetros) é o caminho para
     relatório; ele recusa `set_config`, `SET`, `RESET`, `ROLE`, `COMMIT`,
     `ROLLBACK`, `BEGIN`, `START TRANSACTION` e `SAVEPOINT` no texto, e leitura
     avulsa abre read-only. Sem `app.parceiro_id`, debaixo do papel, nada
     aparece. O usuário do app é superusuário e ignora RLS fora do papel:
     migrations, seed e o `prisma` do portal seguem iguais. Se a migration não
     puder instalar a RLS (usuário sem dono/papel), ela avisa e segue; o portão
     detecta e opera sem o papel (aviso único no log).
  5. **Banco, status (0.2).** Escrita só em parceiro ATIVO, conferido na
     transação da escrita com `FOR SHARE` (`erp_exigir_parceiro_ativo`).

  `tests/erp-tenant-portao.test.ts` ainda varre o código atrás de `prisma.<modelo>`,
  SQL cru nas tabelas e relações do ParceiroFlow (o SQL cru do portal só é
  vigiado aí), e confere `MODELOS_DE_TENANT` e `RELACOES_DE_TENANT` contra o esquema.
- **Inteiros.** Quantidade em milésimos da unidade base, dinheiro em centavos.
  O banco tem CHECK: quantidade > 0, preço >= 0 (e faixas de %/fator).
- **Tenant nas FKs.** Toda FK entre tabelas de tenant é composta
  `(parceiroId, xId) → (parceiroId, id)`: o banco recusa ficha de B com insumo
  de A, mesmo por SQL cru. O teste-guarda confere isso no esquema.
- **Livro-razão.** `MovimentoEstoque` e `HistoricoAlteracao` não aceitam
  UPDATE (trigger); correção é lançamento novo. Movimento tem CHECK de sinal
  por tipo e de saldo antes + quantidade = depois.
- **Idempotência.** `FaturamentoLancamento.chaveIdempotencia` é única por
  parceiro (manual: `manual:<loja>:<marca ou ->:<canal>:<data>`); despesa
  importada e movimento também têm chave única.
- **Nulo que não repete.** Unique com `NULLS NOT DISTINCT` (escrito no SQL, o
  Prisma não descreve): produto sem marca, meta de rede e faixa de rede não
  duplicam.
- **Origem.** `origem` MANUAL/IMPORTACAO/INTEGRACAO onde dado pode vir de fora.
- **Servidor decide.** O formulário manda texto; a conversão e o custo por
  unidade são calculados no servidor. A prévia na tela é só prévia.

## Ver funcionando (local, nunca produção)

```bash
# Postgres local com DATABASE_URL apontando para localhost no .env
npx prisma migrate deploy
npm run erp:seed-teste        # Casa Alfa e Beta (ativas) e Gama (suspensa), com lojas, marcas, insumos
npm run build && npm start    # entre em /rodolfo/login → menu ERP
```

## Provar o isolamento

```bash
ERP_DB_TESTE=postgresql://USUARIO:SENHA@localhost:5432/BANCO \
  npx vitest run tests/erp-isolamento.db.test.ts tests/erp-rls.db.test.ts
```

`erp-rls.db.test.ts` prova: toda tabela com `parceiroId` tem RLS forçada e
política; o papel não alcança `User`/`ParceiroFlow`/portal; SQL cru sem WHERE no
contexto de B (avulso e dentro de `transacao`) não vê, não altera, não apaga e
não grava em A; sem contexto nada aparece; papel e parceiro não vazam para o
pool; `cliente.sql` recusa mexer no contexto; cliente somente leitura é barrado
no portão e no banco; `doParceiro` gravável não escreve em suspenso/aguardando;
suspensão concorrente espera a escrita em curso; criar/renomear/suspender
gravam histórico e são atômicos.

Os dois arquivos rodam como superusuário ou como dono não-superusuário (com ou
sem RLS instalada): o que depende da RLS é pulado sem ela
(`tests/erp-db-apoio.ts`). Com dono não-superusuário, use
`--no-file-parallelism` (a limpeza desliga o FORCE numa transação).

Sem `ERP_DB_TESTE`, esse arquivo é pulado e a suíte padrão segue sem banco.

## Provar o login (0.3)

```bash
npx vitest run tests/erp-acesso.test.ts            # sem banco: senha, token, limite, WebAuthn com autenticador sintético, middleware
ERP_DB_TESTE=postgresql://USUARIO:SENHA@localhost:5432/BANCO \
  npx vitest run tests/erp-acesso.db.test.ts       # com banco: link, senha, limite, desativar, 2 parceiros, suspenso, rosto de ponta a ponta
```

O rosto usa um autenticador sintético (`tests/erp-autenticador-sintetico.ts`):
chave EC P-256 real, assinatura real, sem mock da verificação. Rodado também
com dono não-superusuário (com e sem a RLS instalada).

## Herança para as próximas subfases (apontada pelos fiscais na 0.1)

- `NULLS NOT DISTINCT` existe só no SQL da migration (o Prisma não enxerga): migration futura que mexa nesses índices precisa reescrevê-lo à mão.
- ~~`$queryRaw` do portal alcança tabelas do ERP; antes de relatório em SQL cru: RLS ou papel separado.~~ **Resolvido na 0.2 para o caminho do ERP:** RLS + papel `erp_tenant`; relatório em SQL cru vai por `cliente.sql` (contexto do parceiro). O `$queryRaw` do `prisma` do PORTAL continua superusuário (ignora RLS) e segue vigiado pelo teste-guarda — fechar isso de vez exige o app conectar com usuário não-superusuário (credencial/infra nova; ver decisão 31).
- RLS protege contra consulta que ESQUECE o filtro, não contra SQL escrito para fugir (`RESET ROLE`/`set_config` também são SQL). Nunca montar `cliente.sql` por concatenação.
- Tabela nova de tenant: além da lista do portão, a migration precisa de `GRANT` para `erp_tenant`, `ENABLE`/`FORCE ROW LEVEL SECURITY` e a política, no MESMO padrão condicional da `20261015020000` (só se o papel estiver disponível) — o teste `erp-rls.db.test.ts` reprova se faltar.
- Worker/webhook que escrever no ERP: use `doParceiro(id)`; a conferência de status já está no portão (não precisa repetir), mas trate `ErroDeTenant` "não está ATIVO".
- Cada operação avulsa do portão é uma transação curta (contexto + operação). Tela com muitas leituras: agrupar em `cliente.transacao`.
- Dois pools de conexão por processo (portal + portão de tenant): conferir `connection_limit` na VPS.
- `DreLinha.sentido` tem default `MENOR_MELHOR`: linhas de receita nascem `MAIOR_MELHOR` (tratar na 2.2).
- "Piso obrigatório" da contagem fica na lógica da 1.7.

## Herança da 0.2 (apontada pelos fiscais)

- `cliente.sql` filtra erro de descuido, não código feito para burlar (`query_to_xml`, `U&"…"`, `pg_settings` passam); tem falso positivo com `role`/`begin` em alias/string. Revisar antes da primeira fase com relatório em SQL cru.
- Sem RLS em produção o único sinal é um aviso no log: criar health check que falhe se `papelDisponivel()` for falso no cenário compose.
- Suspensão sob escrita contínua pode esperar; `gravarParceiroFlow` precisa de timeout maior e mensagem em PT-BR para o estouro.
- Na 0.4, `exigirParceiro` passa a conferir se o usuário pertence ao parceiro (o slug vem do cliente via `.bind`).
- Identificador técnico da loja (`vila-da-penha`) aparece sob o nome: esconder numa fase de tela.

## Herança da 0.3 (para as próximas subfases)

- **0.4:** `AcessoParceiro` é onde entram perfil, setores e lojas da pessoa; ligar `Colaborador` (tenant) ao vínculo exige cuidado — credencial não pode apontar para modelo de tenant (o teste-guarda reprova): o caminho é o `Colaborador` apontar para o usuário, não o contrário. `/erp` hoje deixa qualquer pessoa ativa cadastrar insumo (sem perfis ainda).
- **0.5:** o envio do link (WhatsApp/e-mail) entra no `criarAcesso`/`gerarNovoLink`; hoje o Rodolfo copia.
- `TentativaEntradaErp`, `SessaoErp` encerradas/vencidas e `ConviteAcesso` usados crescem sem faxina: criar rotina de retenção (ex.: 90 dias) no worker.
- **IP do limite.** Vale o `X-Real-Ip`; sem ele, o ÚLTIMO item do `X-Forwarded-For`. O Traefik (Dokploy), com a configuração padrão (sem `forwardedHeaders.insecure` nem `trustedIPs` abertos), apaga o `X-Real-Ip` que vem de fora e escreve o IP real da conexão — por isso ele é o preferido. Isso só vale se o `web` NÃO estiver exposto direto na internet (o compose usa `expose`, não `ports`): acesso direto à porta 3000 deixa o cabeçalho ser inventado e o limite por IP fica contornável (o por e-mail continua). Sem proxy nenhum (dev), todos caem em "desconhecido" e dividem o limite de IP.
- Rosto exige https em produção; trocar o domínio invalida as chaves (as pessoas ativam de novo).
- Contador do rosto é `BigInt` (uint32 do aparelho) — exceção única à regra "sem BigInt", não é número de negócio.

## Herança da 0.3 (apontada pelos fiscais)

- HTTPS em produção é pré-requisito antes de abrir o acesso aos parceiros: sem ele, cookie sai sem Secure e a entrada pelo rosto fica escondida.
- Limite por IP depende do Traefik sobrescrever `X-Real-Ip` (porta 3000 nunca publicada direto).
- bcrypt em JS (custo 12) no processo principal: sob rajada o login enfileira. Avaliar bcrypt nativo ou fila limitada.
- Bloqueio por e-mail pode ser mantido por terceiro: dar ao nível 1 um "desbloquear" (0.4 ou 0.5).
- Após a reserva de tentativa, exceção de infraestrutura deixa a linha EM_ANDAMENTO (conta como falha por 15 min): finalizar como ERRO_INTERNO num try/catch.
- Faxina de desafios vencidos roda dentro da transação do pedido: mover para fora/amostragem quando o volume crescer.
- Link de senha nova vale para a pessoa em todos os parceiros dela: rever com vários administradores (0.4).
