# ERP Barney — fatia vertical (Passo zero), fundação do banco (0.1), multi-tenant (0.2), login (0.3) e permissões (0.4)

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
| Telas da pessoa do parceiro | `/entrar` (e-mail e senha, entrar com o rosto), `/entrar/primeiro-acesso/<token>`, `/entrar/escolher`, `/erp` (Insumos), `/erp/lojas`, `/erp/equipe`, `/erp/historico` e `/erp/acesso` (Seu acesso: o que a pessoa pode, rosto) — cada aba só aparece para quem pode |
| Permissões (0.4): catálogo, perfis base, resolução, checagem única, sem escalada | `src/lib/erp/permissoes.ts` (puro) + `equipe.ts` (formulários e retrato do histórico, puro); banco em `credenciais.ts`; migrations `20261015040000_erp_permissoes` e `20261016000000_erp_revogar_meios_de_entrada` |
| Tela de Equipe (a MESMA no nível 1 e no parceiro) | `src/app/rodolfo/erp/equipe/*` (`TelaEquipe`), usada em `/rodolfo/erp/<slug>/acessos` e `/erp/equipe`; telas compartilhadas `tela-estrutura.tsx`, `tela-historico.tsx`, `tela-insumos.tsx` |

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

## O que a 0.4 entregou (permissões)

1. **Catálogo em código, versionado** (`permissoes.ts`, `VERSAO_DO_CATALOGO`):
   permissões por módulo e ação, com rótulo humano (`insumos.ver` "Ver insumos
   e custos", `insumos.editar` "Cadastrar e editar insumos", `lojas.ver`,
   `lojas.gerir`, `acessos.gerir` "Cuidar da equipe", `historico.ver`) e já as
   dos módulos futuros, sem tela (ficha técnica, compras/fornecedores,
   estoque/contagem/ajuste/requisição, produção, etiquetas, faturamento, DRE,
   despesas, metas, precificação). Algumas são **por loja** (checadas com
   `lojaId`); `lojas.gerir` e `historico.ver` **exigem a rede inteira**.
2. **Perfis base em código**: Dono (tudo), Gerente (tudo menos equipe, cadastro
   de lojas, metas e preços), Operador (consulta, contagem, requisição,
   produção, etiquetas). **Perfil próprio** (`PerfilAcesso`, por parceiro):
   nasce copiando um base, marca/desmarca, guarda a lista completa
   (fotografia) e, opcionalmente, para quais setores foi pensado. **Ajuste por
   pessoa** no vínculo: extras e removidas (guardado o ajuste mínimo).
   Efetivas = (perfil ∪ extras) − removidas (decisão 39).
3. **Setores** (os 10 do contrato) são atributo da pessoa no vínculo, vários por
   pessoa: filtram a Equipe e sugerem o perfil próprio pensado para eles. **Não
   concedem nada** (decisão 39).
4. **Lojas e 3 níveis**: N1 FlowFoods (`ALCANCE_FLOWFOODS`, tudo, todo
   parceiro); N2 rede (vínculo com `redeInteira`, inclusive lojas futuras); N3
   loja (vínculo com `lojaIds`). "Sócio de uma unidade" é N3 com o perfil que
   o dono quiser. CHECK no banco: um perfil só (base OU próprio) e rede inteira
   OU pelo menos uma loja; FK composta garante perfil do mesmo parceiro.
   `lojaIds` não tem FK (credencial não aponta para tenant): toda consulta de
   loja passa pelo portão, então id estranho não acha nada (decisão 40).
5. **Servidor decide**: `validarSessao` resolve o alcance do vínculo DESTE
   parceiro a cada requisição (mudou o perfil: vale na próxima tela, sem
   relogar). O contexto (`exigirParceiro`/`exigirParceiroDaSessao`) leva
   `alcance`; toda página e server action do `/erp` chama a checagem única
   (`exigirPermissao` / `exigirPermissaoNaPagina` / `recusaDaAcao`, mesma
   regra) — teste-guarda reprova página ou action sem ela. A tela esconde o
   que não pode (abas, formulário de insumo, cadastro de loja). Quem abre uma
   tela fora do acesso pela URL volta para a primeira que pode, com aviso.
   Listas de loja (`listarEstrutura`, `listarLojasDoAlcance`) filtram pelo
   alcance na consulta.
6. **Equipe** (`/erp/equipe` para quem tem "cuidar da equipe"; aba Acessos do
   nível 1, mesma tela): pessoas (filtro por setor, perfil, lojas, setores,
   ajuste fino), perfis (prontos e próprios: criar, editar, excluir sem uso),
   criar acesso com link, desativar/reativar. **Sem escalada**: o ator precisa
   cobrir o que a pessoa tem antes e o que vai ter depois, permissões E lojas
   (`cobre`); perfil próprio só por quem tem a rede inteira. **Último
   administrador** (ativo + cuidar da equipe + rede inteira): nenhuma mudança
   zera, nem do nível 1; transação de equipe sob `pg_advisory_xact_lock` do
   parceiro (dois tirando um ao outro: só um consegue). Ninguém desativa o
   próprio acesso. Antes/depois legível no histórico, na mesma transação
   (decisão 41).
7. **Heranças endereçadas**: `exigirParceiro` segue só do nível 1 (o slug só
   escolhe; quem libera é a sessão do /rodolfo); pessoa do parceiro tem o
   parceiro SÓ da sessão e precisa de vínculo ATIVO nele (sessão adulterada no
   banco morre; teste). **Link de senha** sai do nível 1, ou de quem cuida da
   equipe só se a pessoa não tem vínculo em outro parceiro (a senha vale em
   todos) — decisão 41. **Revisão (Guardião):** o link guarda quem gerou
   (`ConviteAcesso.doNivel1`); link de parceiro é reconferido NA HORA DO USO
   (sob trava da pessoa) e morre quando a pessoa ganha vínculo em mais um
   parceiro (todo vínculo novo revoga links pendentes); senha criada por link
   de parceiro fica marcada (`UsuarioErp.senhaPorLinkDoParceiroId`) e, se a
   pessoa ganhar outro parceiro, é apagada junto com TODOS os rostos e desafios
   de rosto pendentes dela (sessões caem, links já revogados) e o nível 1
   manda link novo. **Revisão (Fiscal QA + Guardião, volta 3):** recuperar ou
   redefinir a senha pelo link também REVOGA todos os outros meios de entrar
   (rostos, desafios, sessões, links pendentes), numa função só
   (`revogarMeiosDeEntrada`) usada por todo caminho que muda a senha, com o
   número de rostos removidos no histórico de cada parceiro da pessoa; "Seu
   acesso" avisa que os aparelhos saíram e que dá para ativar de novo. Login,
   entrada pelo rosto e ativação de rosto em voo durante a limpeza não gravam
   depois dela: `UsuarioErp.versaoCredencial` lida antes da conferência e
   exigida igual na gravação, sob a trava da pessoa; sessão de versão velha
   não vale (migration `20261016000000_erp_revogar_meios_de_entrada`). Só o nível 1 vincula e-mail que já está em outro parceiro (a
   pessoa do parceiro recebe frase neutra; o nível 1 é avisado quando o e-mail
   já tem senha). As funções de equipe conferem o ator NO BANCO (vínculo deste
   parceiro, ativo, parceiro ativo, "cuidar da equipe"), não só a action.
   Perfil próprio só muda se quem edita cobre cada pessoa que usa o perfil,
   antes e depois. Na tela: desativar, tirar "cuidar da equipe" e salvar perfil
   em uso pedem confirmação na própria tela. A lista do nível 1 marca parceiro
   com pessoas ativas e ninguém cuidando da equipe. **Liberar tentativas** pelo nível 1 (botão na linha da
   pessoa bloqueada; grava "tentativa ok" marcada, o contador por e-mail
   recomeça; o por IP segue). Vínculos que já existiam viram Gerente com rede
   inteira (sem ganhar "cuidar da equipe").

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

## Provar as permissões (0.4)

```bash
npx vitest run tests/erp-permissoes.test.ts         # sem banco: catálogo, resolução, lojas, checagem, sem escalada, último admin, formulários, guarda das páginas/actions
ERP_DB_TESTE=postgresql://USUARIO:SENHA@localhost:5432/BANCO \
  npx vitest run tests/erp-permissoes.db.test.ts    # com banco: o fluxo inteiro (ver cabeçalho do arquivo)
```

Rodado como superusuário e como dono não-superusuário com e sem a RLS
instalada (migration 0.4 aplicada nos dois cenários; 4 arquivos com banco:
61 + 6 pulados sem RLS, 67/67 com RLS). O teste com banco chama a server
action de verdade (`src/app/erp/actions.ts`) com o contexto apontado para o
banco de teste: o operador é recusado pelo servidor.

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
- ~~Na 0.4, `exigirParceiro` passa a conferir se o usuário pertence ao parceiro.~~ **0.4:** `exigirParceiro` é só do nível 1 (que alcança todo parceiro); a pessoa do parceiro nunca passa por ele — o parceiro dela vem da sessão, com vínculo ATIVO conferido a cada requisição (teste).
- ~~Identificador técnico da loja aparece sob o nome.~~ **0.4:** escondido no `/erp`; só o nível 1 vê.

## Herança da 0.3 (para as próximas subfases)

- ~~**0.4:** perfil, setores e lojas no `AcessoParceiro`; `/erp` deixava qualquer pessoa cadastrar insumo.~~ **Feito na 0.4.** `Colaborador` NÃO foi ligado à pessoa: setores não precisaram dele (moram no vínculo). Fica para a fase de RH/produção (3.3): `Colaborador` (tenant) ganharia `usuarioId` SEM relação Prisma (relação criaria campo de volta no `UsuarioErp` e o teste-guarda reprova credencial apontando para tenant), conferido na escrita.
- **0.5:** o envio do link (WhatsApp/e-mail) entra no `criarAcesso`/`gerarNovoLink`; hoje o Rodolfo copia.
- `TentativaEntradaErp`, `SessaoErp` encerradas/vencidas e `ConviteAcesso` usados crescem sem faxina: criar rotina de retenção (ex.: 90 dias) no worker.
- **IP do limite.** Vale o `X-Real-Ip`; sem ele, o ÚLTIMO item do `X-Forwarded-For`. O Traefik (Dokploy), com a configuração padrão (sem `forwardedHeaders.insecure` nem `trustedIPs` abertos), apaga o `X-Real-Ip` que vem de fora e escreve o IP real da conexão — por isso ele é o preferido. Isso só vale se o `web` NÃO estiver exposto direto na internet (o compose usa `expose`, não `ports`): acesso direto à porta 3000 deixa o cabeçalho ser inventado e o limite por IP fica contornável (o por e-mail continua). Sem proxy nenhum (dev), todos caem em "desconhecido" e dividem o limite de IP.
- Rosto exige https em produção; trocar o domínio invalida as chaves (as pessoas ativam de novo).
- Contador do rosto é `BigInt` (uint32 do aparelho) — exceção única à regra "sem BigInt", não é número de negócio.

## Herança da 0.3 (apontada pelos fiscais)

- HTTPS em produção é pré-requisito antes de abrir o acesso aos parceiros: sem ele, cookie sai sem Secure e a entrada pelo rosto fica escondida.
- Limite por IP depende do Traefik sobrescrever `X-Real-Ip` (porta 3000 nunca publicada direto).
- bcrypt em JS (custo 12) no processo principal: sob rajada o login enfileira. Avaliar bcrypt nativo ou fila limitada.
- ~~Bloqueio por e-mail pode ser mantido por terceiro: "desbloquear" no nível 1.~~ **0.4:** "Liberar tentativas" na aba Acessos.
- Após a reserva de tentativa, exceção de infraestrutura deixa a linha EM_ANDAMENTO (conta como falha por 15 min): finalizar como ERRO_INTERNO num try/catch.
- Faxina de desafios vencidos roda dentro da transação do pedido: mover para fora/amostragem quando o volume crescer.
- ~~Link de senha nova vale em todos os parceiros: rever com vários administradores.~~ **0.4:** decisão 41 (só nível 1, ou administrador de parceiro onde a pessoa está sozinha).

## Herança da 0.4 (para as próximas subfases)

- Módulo novo (ficha, compras, estoque...): usar as permissões que já estão no
  catálogo; página com `exigirPermissaoNaPagina`, action com `recusaDaAcao`/
  `exigirPermissao` (o teste-guarda cobra no `/erp`), e as por loja SEMPRE com
  `{ lojaId }` + consulta filtrada por `filtroDeLojas(alcance)`.
- Permissão nova no catálogo: subir `VERSAO_DO_CATALOGO`; perfis próprios NÃO
  ganham sozinhos (fotografia). Falta a tela avisar "perfil criado antes de X
  funções novas" (o campo `catalogoVersao` já existe).
- Permissão removida do catálogo: some do efeito na hora (nomes fora do
  catálogo são ignorados); a lista no banco fica com o nome velho até alguém
  salvar o perfil.
- `lojaIds` sem FK: loja não é apagada hoje (só inativada). Se um dia for, limpar
  o id dos vínculos na mesma transação.
- Quem cuida da equipe só de algumas lojas vê na Equipe só quem trabalha nelas
  (e quem tem a rede); o nome de loja fora do alcance aparece como "+N lojas".
- `listarAcessos` conta tentativas por pessoa (2 consultas cada): trocar por
  uma consulta agrupada quando a equipe passar de dezenas.
- O envio do link (0.5) entra em `executar.ts`/`criarAcesso`; a regra do link
  (decisão 41) já está no servidor.

## Herança da 0.4 (apontada pelos fiscais)

- `validarSessao` (segunda trava por versão) sem teste próprio; entrada pelo rosto durante a limpeza sem teste de ordem forçada.
- Texto em "Seu acesso": "quando sua senha foi trocada ou apagada" é mais preciso.
- `abrirSessao` com timeout 10 s < 15 s de `naEquipe`: login atrás de mudança longa de equipe pode virar erro 500.
- Remover um rosto não derruba sessões abertas por ele (a sessão não guarda o aparelho).
- Dono de A ainda muda perfil/desativa a pessoa em A depois que ela entra em B (afeta só A).
