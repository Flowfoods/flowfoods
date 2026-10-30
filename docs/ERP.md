# ERP Barney — fatia vertical (Passo zero), fundação do banco (0.1), multi-tenant (0.2), login (0.3), permissões (0.4), shell único e cadastro de insumos (1.1), ficha técnica (1.2), pré-preparos e custo em cascata (1.3), validade por conservação (1.4), entrada de compra e custo pelo último preço (1.5), abertura do estoque (1.6), contagem do dia a dia com piso no fechamento do período (1.7), requisição com baixa e cruzamento requisição × contagem (1.8), precificação dentro da ficha: custo por canal em camadas (1.9), preço e margem por canal na ficha (1.10), onboarding: pedido de acesso, quadro e ativação (0.5), ajuda contextual (0.6), entrada de faturamento por canal (2.1), DRE ao vivo (2.2a), metas e fechamento do período (2.2b), dois CMVs: compra e real (2.3), farol por canal em 5 faixas (2.4), orçamento de compra (2.5), produção de intermediários (3.1), lista do dia (3.2), a cozinha pega a tarefa: histórico e indicadores por pessoa (3.3), categorias de insumo, categoria obrigatória, confirmação ao salvar e idempotência (I.1a), cadastro de insumos claro (I.1b), metas por categoria e CMV por categoria pelas compras (I.2a), CMV real por categoria, compra × real, evolução, matriz e meta total por loja (I.2b), cadastro de fornecedor evoluído e CNPJ da loja (F.1a), notas fiscais por XML (F.1b), relatórios de compras (L.2), comparação de fornecedores e de períodos (L.3)

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
| Regras de cadastro | `insumos.ts` + `variantes.ts` (com banco) e `insumo-campos.ts` (puro), `parceiros.ts` (N1), `estrutura.ts` (lojas e marcas), `historico.ts`, `slug.ts` |
| Telas | `/rodolfo/erp` (N1: parceiros + novo) e `/rodolfo/erp/<slug>` (hub do parceiro) com `/insumos` · `/lojas` (era `/estrutura`) · `/equipe` (era `/acessos`) · `/historico` · `/cadastro` — os nomes velhos redirecionam |
| Login das pessoas dos parceiros (0.3) | `UsuarioErp` e companhia (bloco "acesso das pessoas" do esquema) + migration `20261015030000_erp_login` |
| Acesso ao banco das credenciais (único módulo) | `src/lib/erp/credenciais.ts` (regras puras em `acesso.ts`; rosto em `rosto.ts`; cookie em `sessao.ts`/`sessao-cookie.ts`) |
| Telas da pessoa do parceiro | `/entrar` (e-mail e senha, entrar com o rosto), `/entrar/primeiro-acesso/<token>`, `/entrar/escolher`, `/erp` (hub Módulos da Rede), `/erp/insumos`, `/erp/lojas`, `/erp/equipe`, `/erp/historico` e `/erp/acesso` (Seu acesso: o que a pessoa pode, rosto) — cada aba só aparece para quem pode |
| Permissões (0.4): catálogo, perfis base, resolução, checagem única, sem escalada | `src/lib/erp/permissoes.ts` (puro) + `equipe.ts` (formulários e retrato do histórico, puro); banco em `credenciais.ts`; migrations `20261015040000_erp_permissoes` e `20261016000000_erp_revogar_meios_de_entrada` |
| Telas compartilhadas (as MESMAS no nível 1 e no parceiro) | `src/components/erp/telas/*`: `equipe/` (`TelaEquipe`), `estrutura/`, `historico/`, `insumos/`, `hub-do-parceiro.tsx` |
| Ficha técnica (1.2): regras, planilha, foto | `src/lib/erp/{fichas,ficha-campos,ficha-planilha,ficha-importar,foto,arquivos,foto-resposta}.ts`; telas em `src/components/erp/telas/fichas/`; peças de cadastro comuns em `telas/cadastro/`; migration `20261016010000_erp_ficha_foto`; modelo `public/modelos/fichas-tecnicas.csv` |
| Pré-preparo, fator de correção, custo em cascata (1.3) | `src/lib/erp/{ficha-cascata,ficha-custos}.ts` (conta e grafo puros; leitura por nível); regras em `fichas.ts`; migration `20261016020000_erp_subficha` |
| Validade por conservação (1.4) | `src/lib/erp/validade.ts` (puro: leitura, dias/horas ↔ minutos, texto, colunas); telas `telas/cadastro/{validade,campos-validade}.tsx`; migration `20261017000000_erp_validade` |
| Entrada de compra e custo pelo último preço (1.5) | `src/lib/erp/{compra-campos,compras-custo,compras}.ts` (puro / última compra numa consulta / regras com banco); telas em `src/components/erp/telas/compras/`; rotas `/erp/compras` e `/rodolfo/erp/<slug>/compras` (notas, `nova`, `<id>`, `<id>/editar`, `fornecedores`); migrations `20261018000000_erp_validar_checks_insumo` e `20261018010000_erp_compras` |
| Estoque: abertura do zero, livro-razão + saldo, nota entrando no estoque (1.6) | `src/lib/erp/{estoque-campos,estoque}.ts` (puro / com banco); telas em `src/components/erp/telas/estoque/`; rotas `/erp/estoque` e `/rodolfo/erp/<slug>/estoque` (`<loja>`, `<loja>/abertura`, `<loja>/abertura/conferir`); migration `20261019000000_erp_estoque_abertura` |
| Contagem do dia a dia (inventário cíclico que fecha sozinho) e fechamento do período com piso (1.7) | `src/lib/erp/{contagem-campos,contagem}.ts` (puro / com banco; `contarItem` da 1.6 generalizado com ganchos); telas `telas/estoque/{planejar,planejar-form,conferir-contagem,periodo,cobertura,rascunho}.tsx`; rotas `<loja>/contagens/nova`, `<loja>/contagens/<id>`, `<loja>/contagens/<id>/conferir`, `<loja>/periodo` em `/erp/estoque` e `/rodolfo/erp/<slug>/estoque`; migrations `20261020000000_erp_contagem_ciclica` e `20261020010000_erp_contagem_fotografia` |
| Requisição (o setor pede, o estoque entrega e dá baixa) e divergências requisição × contagem (1.8) | `src/lib/erp/{requisicao-campos,requisicao}.ts` (puro / com banco); telas em `src/components/erp/telas/requisicoes/`; rotas `<loja>/requisicoes` (quadro), `/nova`, `/<id>`, `/<id>/atender`, `<loja>/divergencias`, e `requisicoes`/`divergencias` (escolher a loja) em `/erp/estoque` e `/rodolfo/erp/<slug>/estoque`; migration `20261021000000_erp_requisicao` |
| Precificação dentro da ficha: custo por canal em camadas (loja · delivery · iFood), embalagens por canal e taxa do iFood (1.9) | `src/lib/erp/{canal-campos,canais}.ts` (puro / com banco); telas `telas/fichas/{custo-por-canal,canais,form-embalagens,form-taxa}.tsx`; rotas `fichas/<id>/canais` (embalagens) e `fichas/canais` (canais de venda e taxa) em `/erp` e `/rodolfo/erp/<slug>`; migration `20261022000000_erp_custo_por_canal` |
| Preço e margem por canal na ficha: sugerido pela margem-alvo, preço próprio, margem bruta e líquida, farol (1.10) | `src/lib/erp/preco-campos.ts` (puro: a MESMA conta no servidor e na prévia) + `canais.ts` (`contaDosCanais`, `salvarPrecos`, `salvarMargensAlvo`, `precosDaLista`); telas `telas/fichas/{custo-por-canal,form-margens}.tsx` (e a `ui/dica.tsx`, que saiu na 0.6); sem migration |
| Onboarding (0.5): pedido de acesso (landing ou manual), quadro "Aguardando liberação" e ativação | `src/lib/erp/{pedido-textos,pedido-campos,pedidos,trava}.ts` (textos e limites / regras puras / banco / trava) + `ativarPedido` em `credenciais.ts`; landing `src/components/FormComecar.tsx` + `src/app/comecar/actions.ts`; N1 em `src/app/rodolfo/(painel)/onboarding/` (`/rodolfo/onboarding`, `/<id>`, `/novo`); migration `20261023000000_erp_onboarding` |
| Ajuda contextual (0.6): caixas de aula por tela, botão "?" e gaveta; a preferência de cada pessoa | `src/lib/erp/{ajuda,ajuda-rota,ajuda-textos,ajuda-integridade}.ts` + `ajuda.lock.json` (registro, rota e decisão da caixa, texto, trava de versão); `src/components/erp/shell/ajuda.tsx` e `ui/link-de-ajuda.tsx`; `Shell.tsx`; gravação em `credenciais.ts` (`gravarPreferenciaDeAjuda`) e `acaoAjuda*` em `src/app/erp/actions.ts`; bloco "Dicas" em `/erp/acesso`; `npm run ajuda:lock`; migration `20261024000000_erp_preferencia_ajuda` |
| Faturamento por canal (2.1): lançar o dia, planilha CSV, mês com faltas, leitura única do grão, trava do período | `src/lib/erp/{faturamento-campos,faturamento-planilha,faturamento,periodo-trava}.ts` (puro / planilha pura / com banco / trava); telas em `src/components/erp/telas/faturamento/`; rotas `faturamento`, `faturamento/lancar`, `faturamento/importar`, `faturamento/<loja>/<aaaa-mm-dd>` em `/erp` e `/rodolfo/erp/<slug>`; canais da loja em `telas/estrutura/form-canais.tsx`; modelo `public/modelos/faturamento.csv`; migration `20261025000000_erp_faturamento` |
| DRE ao vivo (2.2a): plano de contas por parceiro, despesas por competência, contas a pagar, regra do período, DRE rede × loja | `src/lib/erp/{periodo-campos,periodos,dre-plano,plano,despesa-campos,despesas,dre-campos,dre,texto-limpo}.ts` (período puro / período com banco / plano padrão puro / plano com banco / despesa pura / despesa com banco / DRE puro / DRE com banco); telas em `src/components/erp/telas/dre/`; rotas `dre`, `dre/despesas`, `dre/despesas/nova`, `dre/despesas/<id>`, `dre/despesas/<id>/editar`, `dre/periodos`, `dre/plano` em `/erp` e `/rodolfo/erp/<slug>`; migration `20261026000000_erp_dre_despesas` |
| Metas e fechamento do período (2.2b): meta % por linha com vigência, realizado × meta, receita contra o ano passado, fechar com fotografia imutável, reabrir só pelo nível 1, notas e estoque obedecendo o fechamento | `src/lib/erp/{dre-metas-campos,dre-metas,dre-entrada,dre-fechamento-campos,dre-fotografia,dre-fechamento}.ts` (meta pura / meta com banco / leitura única do DRE / fechamento puro / fotografia com banco / fechar e reabrir); telas `telas/dre/{form-metas,form-fechar,form-reabrir,periodo-fechamento}.tsx`; rota `dre/periodos/<inicio>` em `/erp` e `/rodolfo/erp/<slug>`; migration `20261027000000_erp_dre_fechamento` |
| Dois CMVs (2.3): compra (dia a dia, data da nota) e real (inicial + compras − final, fecha na contagem), corte do estoque final, compra × real, fotografia v2 | `src/lib/erp/{cmv-campos,cmv-comparacao,cmv}.ts` (conta pura / comparação pura / leitura com banco, chamada só por `entradaDoDre`); `dre-campos.ts` (`cmv` e as linhas `cmv:compra`, `cmv:real`), `dre.ts`, `dre-fotografia.ts` (`lerCmvDaFotografia`), `dre-fechamento.ts`; tela `telas/dre/cmv-painel.tsx` dentro do DRE; migration `20261028000000_erp_cmv` |
| Produção de intermediários (3.1): planejar o lote pela ficha, requisição dos insumos criada junto, concluir com rendimento e validade, o lote entra no estoque, cancelar e estornar, quadro kanban | `src/lib/erp/{producao-campos,producao}.ts` (puro / com banco) + `criarRequisicaoNaTx` e `listaDaFichaNaTx` em `requisicao.ts`; telas em `src/components/erp/telas/producao/` e o esqueleto comum dos quadros em `telas/quadro/`; rotas `/erp/producao` e `/rodolfo/erp/<slug>/producao` (`<loja>`, `<loja>/nova`, `<loja>/<lote>`, `<loja>/<lote>/concluir`); migration `20261029000000_erp_producao` |
| Lista do dia (3.2): o gerente define o que a loja produz no dia; a tela cruza com o estoque (vai usar / tem / comprar, com a cascata dos pré-preparos) e cada linha vira lote pela regra da 3.1 | `src/lib/erp/{producao-lista-campos,producao-lista}.ts` (conta pura / com banco) + `planejarProducaoNaTx` em `producao.ts`; telas `telas/producao/{lista,form-lista}.tsx`; rotas `/erp/producao/lista` e `/rodolfo/erp/<slug>/producao/lista` (`<loja>?dia=aaaa-mm-dd`); migration `20261030000000_erp_lista_do_dia` |
| A cozinha pega a tarefa (3.3): pegar o lote (ou a linha da lista de hoje), soltar, passar para outra pessoa, concluir pela tela da cozinha; histórico da produção e indicadores por pessoa | regras de escrita em `producao.ts` (`pegarNaTx`, `pegarProducao`, `soltarProducao`, `passarProducao`) e `producao-lista.ts` (`pegarDaLista`); leituras em `producao-equipe.ts` (`tarefasDoDia`, `historicoDaProducao`, `indicadoresDaProducao`); conta pura em `producao-equipe-campos.ts`; quem pode receber em `credenciais.ts` (`pessoasQueProduzem`); telas `telas/producao/{tarefas,form-tarefas,historico-producao,indicadores,periodo}.tsx`; rotas `/erp/producao/{tarefas,historico,indicadores}` (`/<loja>`) e o espelho `/rodolfo/erp/<slug>/producao/...`; migration `20261031000000_erp_producao_equipe` |
| Categorias de insumo (I.1a): tabela da rede, categoria obrigatória no cadastro, sugestão pelo nome, classificação assistida, retorno ao salvar e chave de envio | `src/lib/erp/{categoria-campos,categoria-sugestao}.ts` (puros) + `{categorias,classificar}.ts` (com banco) + `insumos.ts` (cadastrar e editar); telas `telas/insumos/{categorias,classificar,form-categorias,form-classificar,aviso-classificar,executar-categorias}.tsx` e `telas/cadastro/anuncio.tsx`; rotas `insumos/categorias` e `insumos/classificar` em `/erp` e `/rodolfo/erp/<slug>`; scripts `erp:semear-categorias` e `erp:classificar-insumos`; migrations `20261101000000_erp_insumo_categorias` e `20261101010000_erp_catalogo_v3` |
| Metas por categoria e CMV por categoria pelas compras (I.2a): conjunto de metas por rede e loja com vigência, modelo de 32%, retrato do estoque por insumo, painel com farol e maiores desvios, fotografia v4 | `src/lib/erp/{cmv-categorias-campos,metas-categorias,cmv-categorias,retrato-estoque}.ts` (o primeiro é puro) e as mudanças em `dre.ts` (`dreDoPeriodoNaTx`), `dre-metas.ts`, `dre-fechamento.ts`, `contagem.ts`, `estoque.ts` e `categorias.ts`; telas `telas/dre/{cmv-categorias,metas-categorias,form-metas-categorias}.tsx`; rotas `dre/cmv-categorias` e `dre/metas-categorias` em `/erp` e `/rodolfo/erp/<slug>`; migration `20261103000000_erp_cmv_categorias` |
| Foto sem metadados e envio por rota própria (1.3, herança da 1.2) | `src/lib/erp/{foto-metadados,foto-envio}.ts`; rotas `/erp/fichas/fotos` e `/rodolfo/erp/<slug>/fichas/fotos` |
| Navegação por áreas (UX.9): hub de 4 áreas, abas por rota, trilha com a área, ações no ⌘K; rota nova `/estoque/contagens` | `src/lib/erp/modulos.ts` (`areasConstruidas`, `abasDaArea`, `acoesDaNavegacao`, `montarTrilha`) e `src/lib/rodolfo/modulos.ts`; `src/components/erp/ui/{abas,hub}.tsx`, `telas/hub-do-parceiro.tsx`, `shell/Shell.tsx`; sem migration |
| Shell e design system (1.1) | `src/components/erp/{tokens.css,shell/*,ui/*}`; módulos em `src/lib/erp/modulos.ts` e `src/lib/rodolfo/modulos.ts`; visão em `src/lib/erp/visao.ts`; tema em `src/lib/erp/tema.ts`; contrato visual em `.interface-design/system.md` |

## O que a 0.2 entregou (multi-tenant)

1. **Parceiro Flow no nível 1.** Em `/rodolfo/erp`: criar (nome, endereço/slug
   gerado do nome e editável só na criação, nasce Ativo ou Aguardando
   liberação). Na aba Cadastro: renomear (permitido também em suspenso) e mudar
   a situação (Aguardando liberação → Ativo, Ativo → Suspenso com motivo
   obrigatório, Suspenso → Ativo). Toda mudança grava antes/depois em
   `HistoricoAlteracao` do próprio parceiro **na mesma transação**
   (`gravarParceiroFlow`), aparece no histórico curto da aba Cadastro e no
   Histórico completo. Mudança é condicional ao valor lido (duas abas não se
   atropelam). (0.5: o parceiro deixou de ser criado por esse formulário: nasce na ativação de um pedido, já ATIVO e com dono; ver "O que a 0.5 entregou".)
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
   Parceiro suspenso: entra, mas só lê (decisão 38). Parceiro em RASCUNHO NÃO entra (0.5, decisão 92).
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

## O que a 1.1 entregou — shell único e design system (Cartão A)

1. **Um shell só para `/erp` e `/rodolfo`** (`AppShell`). Menu LATERAL fixo
   no desktop (≥ 900 px), recolhível (cookie `ff_menu`); abaixo de 900 px vira
   gaveta à esquerda (botão Menu, `<dialog>` nativo: Escape, fundo inerte,
   foco volta ao botão). No topo do menu, o **seletor de módulo**; embaixo, os
   grupos do módulo (abrem e fecham), item ativo com `aria-current` e o
   indicador vermelho de 2 px; a fase no rodapé. **Barra superior**: trilha,
   seletor de visão, busca ⌘K, sino e menu do usuário (nome, papel, iniciais,
   tema, Sair). As sessões continuam separadas: cada layout resolve a SUA e
   entrega dados prontos; o shell não decide nada.
2. **Hub de módulos** como entrada: `/erp` ("Módulos da Rede"),
   `/rodolfo` ("Módulos da FlowFoods") e `/rodolfo/erp/<slug>` (o hub do
   parceiro visto pelo N1). Grade 4/3/2 colunas; card = quadrado do ícone na
   cor do módulo + nome + subtítulo. Módulos do plano sem tela (Ficha 1.2,
   Compras 1.5, Estoque 1.6, Faturamento e DRE 2.1, Produção 3.1, Etiquetas
   3.4) aparecem desabilitados com a fase, SÓ para quem vai poder vê-los, e
   nunca com link. `modulosDoParceiro(alcance)` filtra pela mesma regra de
   `pode` (0.4); quem abre tela fora do acesso volta para o hub com aviso.
3. **Barney antigo dentro do shell** (Regra Nº 2): grupo de rota
   `src/app/rodolfo/(painel)` para Hoje (agora `/rodolfo/hoje`), Leads,
   Cadência (`/rodolfo/barney`), Inbox, Visitas, Métricas, Portal do cliente,
   Config e Parceiros Flow; `(acesso)` para login e definição de senha, FORA
   do shell. Lógica intacta; casca reconstruída com o design system.
   Descartados sem shim: `rodolfo/ui.tsx`, `rodolfo/botoes.tsx`,
   `logout-button.tsx`, `rodolfo/erp/{ui,campos,abas}.tsx`, `erp/abas.tsx`,
   `entrar/marca.tsx`, a métrica "Por unidade kg · L · un" e a cópia de
   rótulo/campo/botão dentro do formulário de insumo.
4. **Design system** em `src/components/erp/ui`: `Painel`, `Metrica`,
   `Numero`, `Selo`, `Ponto`, `Vazio`, `Aviso`, `Barra`, `Linha`, `Citacao`,
   `PageHeader`/`IconeDoModulo`, `HubDeModulos`, `FiltroEmLinks`,
   `BuscaEmFormulario`, `Segmentos`, `Dialogo`, `Marca`, botões
   (`classeDeBotao`, `BotaoEnviar`, `BotaoAcao`) e campos (`ROTULO`, `CAMPO`,
   `Erro`, `Resultado`). Kit Kairu Dark "pulso" na geometria (menu de altura
   total, indicador de 2 px, cards 14 px, botões 7 px, foco 3 px, 160/220 ms,
   gaveta < 900 px, sheet < 600 px) e Corporativo nas tabelas (linha 44 px,
   cabeçalho em `forte`, números tabulares à direita); cor e tipo FlowFoods.
5. **Tema claro e escuro, escolhido pela pessoa** (Claro / Escuro / Do
   aparelho) no menu do usuário: cookie `ff_tema` lido NO SERVIDOR pelos
   layouts do shell (`data-tema` no wrapper `.ff-app`); "Do aparelho" resolve
   no CSS. Zero JS para pintar, zero flash. O layout raiz não lê o cookie: o
   `/` continua estático (○ no build). `/entrar` e `/portal` não mudaram.
6. **Visão "Rede Completa ↔ loja"** (cookie `ff_visao` =
   `<parceiroId>:<rede|lojaId>`): opções = lojas que o alcance já alcança;
   conferida no servidor a cada requisição (`visaoDaRequisicao`); valor
   forjado, de outro parceiro ou de loja fora do alcance cai na primeira
   opção. A action recusa loja fora do alcance sem gravar nada. N3 não vê
   "Rede Completa". Nunca concede: a checagem continua `exigirPermissao`.
   Insumo é cadastro da rede: com loja escolhida, a tela diz "Loja X ·
   cadastro da rede: N insumos" em vez de fingir que filtrou.
7. **Busca ⌘K** (Ctrl+K ou "/"): telas permitidas (a mesma lista do menu),
   parceiros (N1) e insumos do parceiro atual por nome — no servidor, com
   "ver insumos" conferido (`acaoBuscarNoErp`, `acaoBuscarNoParceiro`).
8. **Notificações honestas**: parceiro não tem fonte ainda → sino sem ponto,
   "Nada novo por aqui."; N1 mostra só "respostas sem classificar" (a mesma
   contagem de Hoje). Nenhum número inventado.
9. Telas do N1 conferem a sessão na página (`exigirNivel1`) além do
   middleware; o layout não substitui a checagem.

## Provar o shell (1.1)

```bash
npx vitest run tests/erp-shell.test.ts   # módulos por perfil, visão, tema, rotas, guarda
npm run build                            # "/" tem de sair ○ (estático)
```
Na tela: entrar como Dono e como Operador do mesmo parceiro e comparar o
menu e o hub; abrir `/erp/equipe` como Operador (volta ao hub com aviso);
trocar o tema no menu do usuário e recarregar com JS desligado.

## O que a 1.1 entregou — cadastro de insumos (Cartão B)

Sem migration: o esquema da 0.1 já tinha `InsumoVariante`, `tipo`,
`conservacao`, `taxaEntregaCentavos` e `ativo`.

1. **Embalagem digitada como se compra.** "Quanto vem" em kg ou g, L ou ml
   (un é un); o servidor converte para milésimos da unidade base
   (`lerQuantidadeNa`: em g/ml só inteiro, 1 g é o menor passo). Preço e frete
   em centavos, lidos do texto no servidor.
2. **Custo de referência EXATO = (preço + frete) ÷ conteúdo**, guardado como
   fração inteira reduzida (`CustoExato { centavos, milesimos }`, em
   `custoDaEmbalagem`): nada se arredonda antes de usar. A ficha técnica (1.3)
   usa `custoDaQuantidade(custo, quantidadeMilesimos)`, UM arredondamento
   (metade para cima) no fim: 180 g a R$ 94,90 por 5 kg = 342 centavos; 30
   guardanapos a R$ 4,00 o milheiro = 12 centavos. Comparar e ordenar é por
   multiplicação cruzada exata (`compararCustos`, BigInt por dentro). A tela
   mostra duas casas a partir de 1 centavo e, abaixo disso, as casas que
   precisar ("R$ 0,004/un", nunca "R$ 0,00"); em un, a conta ainda diz o
   milheiro. A conta por extenso é a mesma na prévia, na lista, no detalhe e
   no histórico: "R$ 89,90 + R$ 5,00 frete ÷ 5 kg = R$ 18,98/kg" /
   "R$ 4,00 ÷ 1.000 un = R$ 0,004/un (R$ 4,00 o milheiro)". Frete é **por
   embalagem**. Custo pelas compras reais (último preço) continua sendo a 1.5.
3. **"Ainda não sei o preço"** grava 0 e a tela diz **"Sem preço"** (desde a I.1b: "Ainda não sei o custo" e **"Custo não informado"**) (custo
   incompleto, nunca R$ 0,00), com filtro próprio; na ordem por custo fica
   sempre no fim. Preço 0 digitado sem marcar é recusado.
4. **Outras embalagens de compra** (`InsumoVariante`, na tela "Embalagem"):
   caixa, fardo, outra marca — nome único por insumo, conteúdo na unidade do
   insumo, preço, frete, código de barras opcional, desativar. O detalhe diz
   em texto qual sai mais barata e por quanto. A do insumo é a padrão.
5. **Editar com controle de concorrência.** Insumo: `updateMany` condicional ao
   `atualizadoEm` lido; embalagem (sem `atualizadoEm`): condicional aos valores
   lidos (impressão na tela + os mesmos valores no `where`). Duas abas: a
   segunda recebe "Alguém alterou… Recarregue" e nada é sobrescrito.
6. **Unidade travada** quando o insumo tem outra embalagem ou qualquer uso
   (ficha, nota, saldo, movimento, contagem, requisição, produção, etiqueta,
   ficha que o produz), conferido com a linha travada na transação; a
   embalagem nova trava o insumo em FOR SHARE.
7. **Desativar/reativar** com motivo opcional (não apaga: há FK de uso). Sai
   da lista padrão (filtro "Desativados"/"Todos"); nome repetido
   de um desativado oferece abrir e reativar.
8. **Histórico** na MESMA transação de toda gravação, só com o que mudou:
   tipo, conservação, embalagem ("5 kg"), preço ("Sem preço"), frete ("Sem
   frete"), custo por unidade (a fração exata do momento, não um centavo
   arredondado), situação, código de barras; cada
   linha diz de quem é ("Cebola · Caixa 10 kg"). Campos na ordem da tela (o
   jsonb não guarda ordem). O filtro "Insumos" do histórico inclui as
   embalagens; o detalhe mostra as últimas 10 alterações do insumo e das
   embalagens dele.
9. **Telas** (as MESMAS no N1 e no parceiro, em
   `src/components/erp/telas/insumos/`): lista densa (kit Corporativo) com
   cabeçalho "Rede Completa · N insumos" + "Novo insumo", busca e filtros
   (tipo, conservação, situação, só sem preço) na URL, ordenar por nome ou
   custo (`aria-sort`), 50 por página com total, cartões no celular; novo,
   editar e embalagem em **tela própria** (no celular, tela cheia); detalhe
   com a conta, as embalagens, situação e alterações; voltar preserva os
   filtros (`?de=`). Resumo de erros quando há mais de um; aviso ao sair com
   o formulário alterado. Menu ganha "Novo insumo" (só com "cadastrar e
   editar insumos"); a busca ⌘K abre o detalhe.
10. **Permissões e tenant.** Páginas: `exigirPermissaoNaPagina(ctx,
    'insumos.ver' | 'insumos.editar')` (N1: `exigirPermissao`); actions finas
    (`src/app/erp/insumos/actions.ts` e
    `src/app/rodolfo/(painel)/erp/[slug]/insumos/actions.ts`): contexto →
    `recusaDaAcao(ctx, 'insumos.editar')` → bloqueio → lib. Quem só vê não
    tem botão nenhum; parceiro suspenso vê os botões desabilitados com o
    motivo, e o portão recusa a escrita do mesmo jeito. Id de outro parceiro na
    URL é 404 (lido pelo portão). Saíram a tela/form da 0.2 e as actions
    `acaoCadastrarInsumoDaSessao`/`acaoCadastrarInsumo` velhas.

## Provar os insumos (1.1)

```bash
npx vitest run tests/erp-insumos.test.ts       # conversão, custo com frete, Sem preço, formulário, histórico
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_shell npx vitest run tests/erp-insumos.db.test.ts
npm run erp:seed-teste                          # Casa Alfa ganha frete, g/ml, embalagens, Sem preço e desativado
```
Na tela: a dona cadastra um insumo com frete, duas embalagens (uma em g),
edita, desativa e vê em Histórico › Insumos; o operador vê lista e detalhe sem
botão nenhum e, abrindo `/erp/insumos/novo`, volta ao hub com aviso.

## O que a 1.2 entregou — ficha técnica (criar do zero e importar, com foto e descrição)

Migration `20261016010000_erp_ficha_foto` (aditiva): `descricao`, `fotoArquivo`,
`fotoMime`, `fotoBytes` em `FichaTecnica` + CHECKs (nome sorteado, tipo,
tamanho, tudo ou nada). Nenhuma tabela nova: portão e RLS sem mudança.

1. **Ficha é a receita** (`FichaTecnica`): Prato (rende N porções inteiras) ou
   Pré-preparo (rende kg/g, L/ml ou un). Produto de venda e preço por canal
   (`ProdutoVenda`) são 1.9/1.10; subficha, fator de correção e pré-preparo
   que vira insumo são 1.3 (o esquema e a conta já recebem).
2. **Itens**: insumo + quantidade LÍQUIDA digitada em g/kg, ml/L ou un,
   convertida no servidor para milésimos da unidade base do insumo
   (`escalaDaSigla` + `lerQuantidadeNa`); unidade de outra família, meio
   grama, zero, insumo repetido ou desativado (fora os que já estavam na
   ficha) são erro na linha. Até 60 itens. Os insumos citados são lidos com
   FOR SHARE (a unidade não muda no meio) e pelo portão (insumo de outro
   parceiro não existe para a regra; o banco recusa pela FK composta).
3. **Custo exato, nunca gravado**: Σ custo de referência × quantidade × fator,
   em fração BigInt (`custoExatoDaQuantidade`, `somar`), e o custo por porção
   (ou por kg/L/un) = total ÷ rendimento; arredonda só na tela. Insumo "Sem
   preço" deixa o custo **incompleto**: selo, valor parcial dito como "sem
   contar X (sem preço)", nunca R$ 0,00 no lugar. Herança da 1.1 resolvida:
   `custoDaQuantidade` recusa resultado acima de 2^53 (RangeError).
4. **Foto e descrição**: descrição curta (até 280) + modo de preparo (até
   4000, com quebras de linha). Uma foto por ficha: tipo conferido pelos BYTES
   (JPEG/PNG/WebP; SVG/GIF recusados), até 8 MB, nome sorteado (32 hex), em
   `<ERP_ARQUIVOS_DIR>/<parceiroId>/fichas/` (volume `erp-arquivos` no
   compose). Vai para o disco antes da transação e sai se ela não fechar; a
   antiga só é apagada depois do commit. Servida por
   `/erp/fichas/<id>/foto` e `/rodolfo/erp/<slug>/fichas/<id>/foto`, que leem
   a ficha pelo portão (de outro parceiro: 404) e exigem "ver fichas" (403),
   com `nosniff` e CSP fechada. O navegador reduz para 1600 px em JPEG antes
   de enviar (HEIC do iPhone também); server action aceita até 9 MB.
5. **Importar planilha** (CSV; não há lib de XLSX no repo e não se adicionou
   dependência): modelo para baixar, uma linha por insumo, `;` ou `,`, aspas,
   UTF-8 ou Windows-1252. Prévia sem gravar (nova / vai mudar / igual / com
   erro e a linha), insumo não encontrado com "Cadastrar “X”" (o novo insumo
   já abre com o nome). Importar = UMA transação, só as fichas sem erro.
   Idempotente pelo nome da ficha: reimportar não cria nem altera; mudou,
   atualiza só aquela; descrição e modo vazios não apagam o que existe.
   `origem = IMPORTACAO`, histórico com motivo "Importada por planilha".
6. **Editar** condicional a `atualizadoEm` (duas abas: a segunda recebe
   "alguém alterou", nada sobrescrito); itens trocados por inteiro; desativar
   e reativar com motivo. **Histórico** na mesma transação, legível: rende,
   descrição, foto (com foto / foto anterior → foto nova / sem foto),
   insumos numa frase ("Pão brioche 1 un · Blend 180 g"), modo de preparo.
7. **Telas** (as MESMAS no N1 e no parceiro, `telas/fichas/`): lista com
   miniatura, "Rede Completa · N fichas", "Importar planilha" + "Nova ficha",
   busca/tipo/situação/"só custo incompleto" na URL, cartões no celular;
   detalhe com foto e descrição no topo, custo por porção com a conta,
   insumos com quantidade e custo, modo de preparo, situação e alterações;
   nova/editar em tela própria com prévia da conta; importar com prévia.
   Módulo "Ficha técnica" no menu, no hub (saiu de "em breve") e no ⌘K.
8. **Permissões e tenant**: páginas `exigirPermissaoNaPagina(ctx,
   'fichas.ver' | 'fichas.editar')` (N1: `exigirPermissao`); actions
   (`src/app/erp/fichas/actions.ts` e `.../[slug]/fichas/actions.ts`):
   contexto → `recusaDaAcao(ctx, 'fichas.editar')` → bloqueio → lib. Operador
   vê lista, detalhe e foto; criar/editar/importar volta ao hub com aviso.
9. **Regra Nº 2**: estado/concluir/erros/situação/BotaoOuMotivo dos insumos
   viraram `telas/cadastro/*`; paginação virou `ui/paginacao.tsx`; subtítulo
   de lista virou `cadastro/subtitulo.ts`; nada copiado.

## Provar a ficha técnica (1.2)

```bash
npx vitest run tests/erp-fichas.test.ts       # conversão, custo exato e incompleto, planilha, foto, histórico, filtros
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-fichas.db.test.ts
```
Na tela: a dona cria uma ficha com foto e 3 insumos (um sem preço: custo
incompleto), edita, importa a planilha do modelo e reimporta (tudo "igual");
o operador vê lista, detalhe e foto, sem botão nenhum.

## O que a 1.3 entregou — subfichas / pré-preparos, fator de correção, custo em cascata

Migration `20261016020000_erp_subficha` (aditiva): só o CHECK `fatorCorrecaoMilesimos <= 10000`.
O resto já estava no esquema da 0.1 (`subfichaId` com CHECK insumo-OU-subficha
e "não aponta para si", fator ≥ 1000, `insumoProduzidoId`). Nenhuma tabela nova.

1. **Item = insumo OU pré-preparo.** No formulário, o mesmo seletor tem dois
   grupos ("Pré-preparos (fichas da casa)" e "Insumos"); o pré-preparo vai como
   `ficha:<id>`. Só ficha **Pré-preparo** entra em outra (prato não). A
   quantidade é na unidade do rendimento do pré-preparo (rende 2 kg → g/kg).
   O servidor lê os pré-preparos pelo portão, travados (FOR SHARE): de outro
   parceiro "não encontrado" (e o banco recusa pela FK composta).
2. **Fator de correção** por item (1 a 10, vazio = 1; aceita "1,18" e
   "1.18"): a quantidade digitada é a LIMPA e o custo paga a BRUTA (líquida ×
   fator). A tela mostra "Peso bruto 354 g para 300 g limpos (fator 1,18)" na
   prévia e "bruto · fator" no detalhe; o histórico diz "Cebola 300 g (fator
   1,18)". Vale também para item de pré-preparo.
3. **Rendimento / cocção** é o rendimento da ficha do pré-preparo: quanto sai
   pronto (já com o que o cozimento tira ou põe). Custo do pré-preparo por kg
   (L, un) = custo da receita ÷ rendimento — é o "preço" dele em quem o usa.
4. **Custo em cascata, nunca gravado** (decisão 57): fração BigInt até o fim
   (`custoDoUso`), um arredondamento só na tela. Leitura por nível
   (`ficha-custos.ts`): uma consulta por nível, `id in [...]`, até 5 níveis —
   a lista de 50 fichas faz as mesmas 8 consultas que uma (teste conta). Memo:
   cada ficha calculada uma vez por leitura. **Incompleto sobe**: insumo sem
   preço dentro do molho deixa o molho e o burger incompletos, com a frase
   "“Molho cheddar” com custo incompleto (falta preço em “Picles”)"; o parcial
   entra, nunca R$ 0,00. O filtro "só custo incompleto" enxerga a cascata.
   Teto de exibição 2^53 centavos: acima, a tela diz "acima do limite" e a
   gravação da ficha é recusada.
5. **Círculo e profundidade recusados no servidor** (decisão 58): toda
   gravação de ficha (formulário e planilha) pega `pg_advisory_xact_lock` do
   "grafo de fichas" do parceiro ANTES de ler as ligações; lê todas (1
   consulta), troca as da ficha e confere círculo (frase: "Assim fica um
   círculo: “Base de cebola” usa “Molho cheddar”, que usa “Base de cebola”") e
   **profundidade máxima de 5 fichas numa cadeia** (prato › molho › base › …,
   contando quem usa acima e o que é usado abaixo). Duas edições simultâneas
   que juntas fariam o círculo: uma entra, a outra é recusada (teste com
   banco; sem a trava o mesmo teste falha). A conta não entra em laço se um
   círculo aparecer no banco por fora: o item vira incompleto.
6. **Pré-preparo vira insumo** (decisão 59): na mesma transação, a ficha
   mantém o `Insumo` tipo PRE_PREPARO que produz (nome = da ficha, unidade =
   do rendimento, situação acompanha; embalagem não se usa). Nome já usado
   por outro insumo é recusado (adota só insumo de pré-preparo solto e sem
   preço). Pré-preparo usado por outra ficha não vira prato nem muda a família
   da unidade. Fichas de pré-preparo da 1.2 ganham o insumo na próxima
   gravação. Em Insumos: selo "Pré-preparo", custo da ficha ("R$ 24,07/kg",
   "incompleto" se for o caso), fora do filtro "só sem preço", ordena pelo
   custo da ficha; o detalhe mostra a conta da ficha com link, sem editar,
   sem embalagem e sem situação (o servidor recusa as três). Na receita, o
   insumo produzido não aparece no seletor: vale o pré-preparo.
7. **Telas**: detalhe da ficha com "Insumos e pré-preparos" (quantidade
   limpa, bruto, custo), "De onde vem: R$ 24,07 por kg (R$ 48,15 ÷ 2 kg)" que
   abre a receita do pré-preparo com o custo de cada item, painel
   "Pré-preparo" (aparece em Insumos como…, usado em…, "mudar esta receita muda
   o custo dessas fichas na hora"); lista com "com 1 pré-preparo"; formulário
   com o fator, peso bruto, custo do pré-preparo por kg e prévia em cascata.
8. **Planilha**: coluna opcional `fator`; item com nome de pré-preparo vira
   subficha (o pré-preparo vence o insumo produzido de mesmo nome);
   pré-preparo novo citado na MESMA planilha pede para ser importado antes; a
   planilha que faria círculo é recusada inteira, com o nome da ficha.
9. **Herança da 1.2 resolvida**: (a) foto regravada sem metadados, nos bytes,
   sem lib (decisão 60; JPEG guarda só o que desenha a imagem e a orientação
   num APP1 mínimo; PNG só chunks de imagem e cor; WebP sem EXIF/XMP, VP8X
   corrigido; malformado recusado). (b) Foto por rota própria
   (`POST <base>/fichas/fotos`): sessão (401), `fichas.editar` (403),
   bloqueio e origem conferidos ANTES de ler o corpo; Content-Length
   obrigatório e leitura com teto de 8 MB; vai para `pendentes/` e a action só
   recebe o nome, move para o lugar e devolve se a transação falhar; faxina de
   pendentes > 24 h a cada envio. O `bodySizeLimit` global de 9 MB saiu
   (server actions no padrão de 1 MB; planilha até 256 KB). O navegador
   redesenha toda foto antes de enviar (orientação aplicada). (c) Importação
   até 300 fichas por arquivo, e o estouro do tempo da transação vira "A
   importação passou de 30 segundos e foi desfeita: nada foi gravado. Divida a
   planilha…". (d) Mensagem de suspenso cita fichas técnicas;
   `pastaDoErp`/`versaoDaFoto`/`siglaDaPlanilha` não são mais exportados; no
   celular, o modo de preparo vem logo depois da foto.

## Provar os pré-preparos (1.3)

```bash
npx vitest run tests/erp-subfichas.test.ts tests/erp-fichas.test.ts   # fator, cascata 3 níveis exata, incompleto, círculo, profundidade, EXIF
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-subfichas.db.test.ts tests/erp-fichas.db.test.ts
```
Na tela: a dona cria "Molho cheddar" (pré-preparo, rende 2 kg, cebola com
fator 1,18, foto do celular), usa 40 g num "Burger cheddar", abre "De onde
vem", muda o preço do cheddar e vê o burger mudar; cria "Base de cebola",
põe no molho e tenta pôr o molho na base: recusado.

## O que a 1.4 entregou — validade por conservação na ficha (e no insumo)

Migration `20261017000000_erp_validade` (aditiva): em `FichaTecnica`,
`conservacao` (nula) + `validade{Seco,PistaFria,Refrigerado,Congelado}Min`;
CHECKs de faixa (1 min a 730 dias) e da principal (nas duas tabelas; no
Insumo, `NOT VALID`). Nenhuma tabela nova: portão, RLS e trigger sem mudança.

1. **Mesmo modelo no insumo e na ficha** (decisão 61): a principal (onde
   fica normalmente) e a validade em MINUTOS em cada conservação aceita. Aceita
   = tem validade: marcar sem dizer quanto dura é erro na linha. Principal
   entre as aceitas; uma marcada só já é a principal. Dias ou horas inteiros
   (pista fria costuma ser horas); 0, decimal e mais de 730 dias recusados.
2. **Ficha**: bloco "Onde fica e quanto dura" no formulário (4 linhas com
   ícone, marcar, número, dias/horas, principal; digitar marca a linha).
   Opcional: sem nenhuma, "Validade não informada" (em atenção no
   pré-preparo, com atalho para editar). Detalhe: a lista com a principal
   primeiro ("Refrigerado 3 dias", "Congelado 30 dias"); listas de fichas e de
   insumos: "Refrigerado: 3 dias · Congelado: 30 dias".
3. **Insumo comprado**: o mesmo bloco ("Onde guarda e quanto dura"); a
   principal sempre existe, as validades são as de depois de aberto ou
   manipulado (a do fabricante vem do lote, na 3.4). Formulário antigo (só a
   conservação) continua valendo. Filtro "Conservação" da lista = fica ali
   (principal ou com validade nela).
4. **Insumo produzido** (herança c da 1.3, decisão 62): conservação e
   validades vêm da ficha do pré-preparo, na mesma transação, com histórico;
   não se editam em Insumos.
5. **Planilha** (decisão 63): colunas opcionais `conservacao`,
   `validade_seco`, `validade_pista_fria`, `validade_refrigerado`,
   `validade_congelado`; sem elas (ou vazias), a ficha mantém a dela; a prévia
   mostra como fica. Modelo para baixar atualizado.
6. **Histórico**: `conservação` e `validade` em texto ("Refrigerado 3 dias ·
   Congelado 30 dias"); edição concorrente recusada (`atualizadoEm`);
   permissões `fichas.editar`/`insumos.editar` no servidor (operador só vê).
7. **Heranças da 1.3 resolvidas**: (a) `lerFormFicha` recusa o insumo
   produzido como item comum ("escolha-o em Pré-preparos"), também no
   formulário forjado; (b) limpeza de JPEG guarda só C0–CF, DB, DD, DA,
   D0–D7, DC, DF (mais APP0/ICC/Adobe) e RECUSA qualquer outro marcador; (c)
   item 4; (d) faxina de fotos pendentes também ao abrir a lista de fichas (no
   máximo a cada 10 min por parceiro e processo; olha até 500 e apaga até 50
   por vez); (e) trilha abaixo de 1024 px troca os níveis do meio por "…";
   histórico de itens diz o que entrou, saiu e mudou ("Cebola: 300 g (fator
   1,18) → 250 g"); texto do fator curto ("Bruto 354 g (fator 1,18)"); "Sem
   foto" vira faixa baixa no celular; exceção do scanner na seta do comentário.

## Provar a validade (1.4)

```bash
npx vitest run tests/erp-validade.test.ts      # dias/horas ↔ minutos, regras, planilha com e sem colunas, heranças a, b, d, e
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-validade.db.test.ts
```
Na tela: a dona marca o "Molho cheddar" como refrigerado 3 dias e congelado
30 (principal refrigerado), vê no detalhe e em Insumos ("Refrigerado: 3 dias ·
Congelado: 30 dias"), importa uma planilha com `validade_pista_fria`; o
operador vê a validade e não tem botão nenhum.

## O que a 1.5 entregou — entrada de compra (nota) e custo pelo último preço

Migration `20261018010000_erp_compras` (aditiva): `NotaEntrada.serie` (''
= sem série), `atualizadoEm`, `canceladaEm`, `motivoCancelamento`;
`NotaEntradaItem.freteRateadoCentavos`, `embalagemSnapshot`, `ordem`;
`Fornecedor.atualizadoEm`; CHECKs (frete rateado ≥ 0, número/série curtos,
cancelada ⇔ data de cancelamento, lançada ⇒ data de lançamento); índice único
PARCIAL `NotaEntrada_chave_da_nota` (parceiro + fornecedor + número + série,
fora as canceladas — só no SQL, o Prisma não descreve). Nenhuma tabela nova:
portão, RLS e trigger sem mudança. E `20261018000000_erp_validar_checks_insumo`
(herança a da 1.4).

1. **A nota NÃO mexe no estoque nesta fase** (decisão 64): o estoque da loja
   só abre na 1.6 (1ª contagem). Nenhum `MovimentoEstoque`/`SaldoEstoque` é
   gravado (teste com banco e prova visual conferem). `LANCADA` = conferida,
   vale para o custo.
2. **Custo pelo último preço, derivado** (decisão 65): o custo de referência
   do insumo é o da nota LANÇADA mais recente que o comprou — Σ(valor + frete
   rateado) ÷ Σ quantidade dos itens dele naquela nota; sem nota, o preço
   cadastrado da embalagem padrão (1.1). Ordem: **data da nota** (a digitada,
   não a de digitação); mesma data, a lançada por último (`lancadaEm`); depois
   o id. Nada é gravado: lançar, editar ou cancelar muda o custo na próxima
   leitura; `custoDoInsumo` é a única porta da cascata, então fichas,
   pré-preparos, planilha, lista e detalhe acompanham. Uma consulta
   `DISTINCT ON` por leitura (`compras-custo.ts`, pelo `cliente.sql`): a lista
   de fichas passou de 8 para 9 consultas, constante. Filtros "sem preço" e
   "custo incompleto" enxergam a compra.
3. **Item da nota** (decisão 66): insumo + embalagem (padrão, outra cadastrada
   ou "a granel" por kg/L/un) + quantas embalagens (até 3 casas) + o **valor
   total do item** como está na nota (o unitário sai da divisão, nunca de um
   campo arredondado). Quantidade base = embalagens × conteúdo, arredondada ao
   milésimo. Snapshot: nome do insumo, unidade, embalagem ("Caixa · 5 kg").
   Valor 0 (bonificação) e insumo de pré-preparo recusados; insumo/embalagem
   desativados só ficam se já estavam na nota.
4. **Frete da nota rateado pelo valor dos itens** (maior resto; a soma bate ao
   centavo) e **total conferido no servidor**: Σ itens + frete = total
   digitado, senão "A soma dá R$ X (itens R$ Y + frete R$ Z), mas a nota diz
   R$ W". Desconto da nota fica 0 (pendência).
5. **Idempotência** (decisão 67): a mesma nota (fornecedor + número + série;
   número só de dígitos perde zeros à esquerda, "000123" = "123") não entra
   duas vezes — conferida antes (frase com link para a lançada, ou "em outra
   loja" sem dizer qual) e garantida pelo índice parcial (dois lançamentos
   simultâneos: um entra, o outro recebe a frase). Cancelada libera a chave.
6. **Editar** (condicional a `atualizadoEm`, itens trocados por inteiro,
   histórico com o que entrou e saiu) e **cancelar** (motivo obrigatório; a
   nota sai do custo e cada insumo volta à compra anterior ou ao cadastrado).
7. **Por loja e permissões**: nota é da loja; `compras.ver` e
   `compras.lancar` com `lojaId` (a regra recebe o alcance e confere a loja de
   antes e a de depois), `fornecedores.editar` para o cadastro. Lista e
   detalhe só nas lojas do alcance (fora: 404). A visão do topo (loja) filtra
   a lista; "Limpar" não a tira. Operador não tem compras (o módulo some).
   Compras saiu de "em breve" no catálogo e no hub.
8. **Prévia do impacto** ("Conferir o impacto", nada gravado): total
   conferido, frete por item, custo de cada insumo antes → depois ("sobe",
   "desce", "não muda: vale a nota de DD/MM, mais nova") e as fichas que
   mudam em cascata (por porção/kg), até 30. Na tela, a conta ao vivo usa as
   mesmas funções puras.
9. **Fornecedor** (evoluído na F.1a, ver "O que a F.1a entregou"): nome (único no parceiro), CNPJ/CPF opcional (dígitos
   verificadores), contato; editar condicional, desativar/reativar com motivo;
   detalhe com o que já vendeu (último preço por insumo) e as últimas notas das
   lojas de quem vê. Cadastro da rede.
10. **No insumo**: "Custo de referência — Último preço pago" com a conta da
    compra e "Último preço: R$ X em DD/MM (nota N, fornecedor F, loja)"; painel
    "Preço pago" com as últimas compras (canceladas riscadas) e o último preço
    de cada fornecedor, do mais barato ao mais caro. A comparação de embalagens
    continua pelo preço cadastrado. Lista: "compra DD/MM" ou "cadastrado" sob o
    custo. **Revisão do Guardião:** o CUSTO de referência (número derivado) é
    da rede e aparece para quem vê o insumo; número/série da nota, fornecedor,
    loja, quantidade, valor e frete de cada compra só para quem tem "ver
    compras e notas" NAQUELA loja (`obterInsumo(cliente, id, alcance)`,
    `lojasComCompras`) — fora disso nem saem do servidor (teste com banco do
    gerente de outra loja e do operador; prova visual confere o HTML). O
    mesmo no detalhe do fornecedor e no Histórico (nota e fornecedor só com
    "ver compras"). Data da nota em dd/mm/aaaa com máscara própria (o
    `type="date"` segue o idioma do aparelho).
11. **Importação**: lançar nota é a importação manual. CSV de notas e XML de
    NF-e ficam como pendência (não entraram: o volume de hoje é digitável e o
    XML pede casar código do fornecedor → insumo com memória).
12. **Heranças da 1.4 resolvidas**: (a) migration valida os CHECKs do Insumo
    (passa nos dados da 1.4 no ff_dev) e o 23514 vira frase
    (`checkVioladoDe`, `erroDoCheck`); (b) 0xC8 fora dos marcadores JPEG; (c)
    principal escolhida sem validade é erro na principal; (d) validade da
    lista de fichas em linha própria, "Principal" desabilitado mais visível,
    "Validade não informada" em 15 px, "Validade depois de aberto" como
    subtítulo do painel do insumo, contorno do selo de atenção a 70 %.

## Provar as compras (1.5)

```bash
npx vitest run tests/erp-compras.test.ts       # rateio, conversão, total conferido, desempate, cancelar, número/série, CNPJ, heranças b e c
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-compras.db.test.ts
```
Na tela: a dona cadastra o fornecedor, lança na Vila da Penha uma nota com 3
itens e frete, confere a prévia ("Queijo cheddar fatiado: R$ 57,27/kg → …",
Burger cheddar junto), lança, vê o burger mudar; tenta a mesma nota de novo
(recusada); cancela e o custo volta; o gerente do Delivery não vê a nota; o
operador não tem Compras.

## O que a 1.6 entregou — estoque: abertura do zero (1ª contagem = saldo inicial)

Migration `20261019000000_erp_estoque_abertura` (aditiva, sem tabela nova:
portão e RLS iguais): `Contagem.versao/iniciadaPorNome/fechadaPorNome/
naoContadosNoFechamento`; `ContagemItem.versao`, snapshot de conservação e
embalagem padrão (nome + conteúdo), o digitado (`embalagensMilesimos`,
`soltoMilesimos`, `escalaDigitada`) e `contadoPorNome`;
`MovimentoEstoque.notaId` (FK composta para a nota) e `estornoDeId` (FK
composta para o próprio razão, ÚNICA, `NO ACTION` para a limpeza apagar os
dois no mesmo DELETE). CHECKs: contagem FECHADA ⇔ `fechadaEm`; item contado ⇔
`contadoEm`; digitado ≥ 0; sinal do tipo INVERTIDO para o estorno; um
documento (agora com `notaId`); documento pelo tipo (compra tem nota,
abertura tem o item da contagem). Trigger `MovimentoEstoque_estorno_espelho`
(estorno = espelho exato). Índice único PARCIAL `Contagem_uma_abertura_por_loja`
(só no SQL; `migrate diff` vazio). Rodada em banco novo como superusuário, como
dono não-superusuário com RLS e sem RLS.

1. **Estado da loja, derivado** (decisão 69): sem abertura = "Não aberto";
   contagem ABERTURA em andamento = "Em contagem"; FECHADA = "Aberto" desde
   `fechadaEm`. Uma abertura por loja (índice parcial; "Abrir estoque" em
   corrida devolve a mesma). Loja desativada não abre.
2. **Lista congelada**: todos os insumos ATIVOS (ingrediente, embalagem e
   pré-preparo), com nome, unidade, conservação e a embalagem padrão do
   momento. Insumo criado depois começa em zero na loja.
3. **Contar** (decisão 70): embalagens fechadas da padrão (quando ela não é 1
   kg/1 L/1 un) + solto em kg/g, L/ml ou un; normalizado = round(emb ×
   conteúdo) + solto. Vazio = não contado; "Não tem" grava zero. Salva
   sozinho; versão por item: outra pessoa salvou antes = conflito com o número
   e o nome dela ("ficar com o dela / usar o meu"); retentativa do mesmo número
   = ok; mudar um número já contado deixa antes/depois no histórico
   (`RECONTOU`).
4. **Conferir e concluir**: contados, zerados, não contados, sem preço, valor
   inicial pelo custo de referência (um arredondamento por item; sem preço =
   pendente), notas de hoje já lançadas. Concluir: `estoque.ajustar`, versão
   conferida, não contados só com confirmação; um `ABERTURA` por item > 0
   (chave `abertura:<item>`), saldo de TODOS os itens (zero inclusive),
   contagem FECHADA com o valor total fotografado e o histórico (`CONCLUIU`,
   com quantos entraram com zero). Concluir de novo = já feito. Não se reabre:
   correção é contagem (1.7). Descartar só a contagem em andamento, com motivo.
5. **Livro-razão + saldo na mesma transação**: `gravarMovimentos` cria o saldo
   que falta, trava os saldos em ordem (loja, insumo) com `FOR UPDATE`, calcula
   antes/depois (o CHECK confere), insere o razão e atualiza o saldo pela
   versão lida. Saldo = soma do razão (quantidade e valor; teste com banco
   confere). Nunca UPDATE em movimento.
6. **Nota × estoque** (decisão 68): movimenta = loja aberta ∧ nota lançada
   depois da conclusão ∧ data da nota ≥ dia da abertura (Rio). Entrada =
   valor do item + frete rateado, com `notaId`. Editar: estorna o que valia e
   entra o novo, só se o efeito mudou; mudar de loja estorna na de antes;
   cancelar estorna. A nota diz o efeito (detalhe: frase + entradas/estornos
   com o saldo antes/depois; prévia: "Entra no estoque da X ao lançar").
7. **Telas** (módulo Estoque saiu de "em breve"): Estoque por loja (situação,
   andamento, valor, abrir); Estoque da loja (não aberto / em contagem /
   saldo por insumo com custo de referência e valor, filtros por lugar e "com
   saldo", livro do estoque com estornos); Contagem de abertura para o
   celular (por conservação, busca, Faltam/Contados/Todos, campo de 48 px,
   Salvando/Salvo/Falha, quanto falta no rodapé fixo, Enter vai ao próximo);
   Conferir e concluir; no insumo, "Estoque por loja" (só as lojas do alcance).
8. **Permissões** (catálogo 0.4, sem permissão nova): `estoque.ver`,
   `estoque.contar` (operador), `estoque.ajustar` (abrir, concluir,
   descartar), sempre com a loja; fora do alcance = 404.
9. **Heranças da 1.5 resolvidas**: campo de data com erro visível ao sair
   (e o navegador não envia data incompleta/impossível); sem cadastrar
   fornecedor/insumo, "peça a quem cuida das compras"; "Nota 4521-1" igual no
   desktop, no celular, no fornecedor e no preço pago (`numeroDaNota`).

## Provar o estoque (1.6)

```bash
npx vitest run tests/erp-estoque.test.ts       # contar (emb + solto, kg/g, vazio ≠ zero), valor exato, nota × abertura, estorno, saldo antes/depois
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-estoque.db.test.ts
```
Na tela: a dona abre o estoque da Vila da Penha; conta no celular (390) em
duas sessões (ela e o operador), com conflito no mesmo item; confere (não
contados confirmados) e conclui; vê saldo e valor; lança nota na Penha e o
saldo sobe; cancela e o saldo volta (estorno no livro); o gerente da Delivery
não vê a Penha (404); o operador conta, mas não conclui.

## O que a 1.7 entregou — contagem do dia a dia (inventário cíclico + fecha sozinha) e piso no fechamento do período

Migration `20261020000000_erp_contagem_ciclica` (ADITIVA, sem exceção à
regra; sem tabela nova: portão e RLS iguais): enum `ContagemDesfecho`
(APLICADA, APLICADA_SOZINHA, VENCIDA) e `Contagem.desfecho` (FECHADA ⇔
desfecho; as aberturas já fechadas viram APLICADA — com a RLS forçada, o
FORCE sai e volta só naquela transação), `Contagem.titulo`; CHECKs (cíclica
tem prazo, fechamento tem período, só a cíclica fecha sozinha/vence, título
curto, `CONTAGEM` aponta o item da contagem — CHECK novo ao lado do da 1.6);
índice parcial `Contagem_um_fechamento_por_loja_e_periodo` (só no SQL); na
`Loja`, as regras da contagem com default e faixa. Provada em banco novo
com dado da 1.6 como superusuário, dono não-superusuário com RLS e sem RLS
(`migrate diff` vazio).

1. **Ciclo = um pedaço por vez, pelo lugar** (decisão 72): o gerente
   planeja escolhendo a conservação (é onde se conta) e "quais" — vencidos
   pela frequência da curva ABC (valor do saldo hoje: A até 80 %, B até 95 %,
   C o resto; frequência por classe na loja, padrão 7/15/30 dias; nunca
   contado = vencido), todos do lugar, ou só a curva A — e marca/desmarca à
   mão ("Recontar" no saldo abre com um insumo só: é como se corrige número
   errado da abertura). Lista congelada como na 1.6; um insumo numa contagem
   aberta só (trava da loja); até 500 por ciclo.
2. **Contar = a tela da 1.6, generalizada** (`TelaContagem`, `contarItem`
   com ganchos): a cada número salvo, o esperado é FOTOGRAFADO do livro
   (`saldoSistemaMilesimos`).
3. **Ajuste = contado − esperado, somado ao saldo de agora** (decisão 73):
   nunca "saldo = contagem". Nota que entra depois de contar continua no
   estoque; a conferência mostra "depois de contar: +4,54 kg (Nota 78111)" e
   em quanto o saldo fica. `CONTAGEM` ± por item com diferença, valor pelo
   custo de referência de agora (um arredondamento; sem preço = 0 e
   "pendente"), chave `contagem:<item>`, `contagemItemId`. Não contado fica
   como está (só com confirmação). Item recontado e aplicado depois por
   outra contagem fica de fora.
4. **Fecha sozinha** (decisão 74): contou o último item e TODOS batem
   (diferença ≤ tolerância da loja em R$ por item, padrão R$ 5,00; sem preço
   só se exato) e nada mexeu nos itens depois de contados → aplica na
   transação de quem salvou (`APLICADA_SOZINHA`, "fechou sozinha" no nome de
   quem fechou e no histórico). **Prazo** = fim do dia seguinte (Rio):
   passou = "fechou sem aplicar" (`VENCIDA`), derivado na leitura e gravado
   na próxima escrita (salvar, aplicar, planejar, fechar); número não entra;
   aplicar é recusado. Sem cron.
5. **Período e piso** (decisão 75): período pelo `ParceiroFlow` (mensal do
   dia d; quinzenal d..d+14 e d+15..; semanal com dia 1–7 = segunda…domingo;
   personalizado = `PeriodoApuracao` cadastrado, sem ele o mês civil).
   Cobertura = insumos com contagem APLICADA no período (abertura, cíclica,
   fechamento) sobre o universo (saldo ≠ 0 agora ∪ contados), por valor e
   por itens; piso padrão 80 % do valor e 50 % dos insumos. **Fechamento**:
   contagem FECHAMENTO (loja × período) com o que ainda não foi contado no
   período ("para o piso" nos de maior valor); abre nos 3 últimos dias do
   período (ou depois), sem cíclica aberta; aplicar só com a cobertura (com
   o que foi contado nele, pelo saldo de depois do ajuste) no piso — senão a
   frase com os números e quantos faltam, nada gravado. Fotografa o estoque
   final (valor pelo custo de referência) em `valorTotalCentavos`: base do
   CMV real (2.3, não feito). `PeriodoApuracao` é criado (upsert) ao começar;
   o `status` dele é do DRE (2.2) — se já FECHADO, recusa.
6. **Regras da loja** (piso, frequência, tolerância): só com "cadastrar
   lojas" (rede inteira = dona): o gerente não baixa o piso que o trava.
   Condicional aos valores lidos, histórico na mesma transação.
7. **Telas** (as mesmas no N1 e no parceiro): no estoque da loja, "Contagem
   do dia a dia" (cobertura × piso com a marca do piso, abertas, Planejar,
   Ver o período) e "Recontar" por insumo; Planejar contagem; a contagem;
   Conferir divergências / Conferir e fechar (livro ao contar, contado,
   diferença em quantidade e R$, depois de contar, fica em; bateram e sem
   contar; aplicar, descartar; resultado quando fechada); Período e
   contagens (cobertura, o que falta, fechamento, contagens, regras).
8. **Permissões** (catálogo 0.4, sem permissão nova): ver = `estoque.ver`,
   contar = `estoque.contar`, planejar/aplicar/descartar/fechar =
   `estoque.ajustar`, sempre com a loja; regras = `lojas.gerir`.
9. **Heranças da 1.6 resolvidas**: (a) tetos — contagem até 100 mil
   kg/L/un por item, valor por item até R$ 1 milhão (conferência e servidor,
   abertura e cíclica), total da contagem e razão/saldo conferidos contra o
   INTEGER antes do banco (`ErroDeTeto`), também na nota: frase em vez de
   500; (b) contagem com luva — alvos de 48 px ("Não tem", kg/g, "Falhou ·
   tentar de novo"), rascunho local por contagem/item com a versão
   (`rascunho.ts`: reenviado quando o sinal volta ou a página reabre;
   número velho vira conflito no servidor, nunca sobrescreve; salvo =
   apagado), "em breve" no lugar das fases, "Só gerente ou dona concluem",
   cabeçalho do estoque mais curto e explicação recolhível, filtro de
   conservação que rola com indício a 390 px.

10. **Revisão (Guardião + UX, volta 1)**: (a) o número vale para quando
    foi DIGITADO (decisão 76): a tela manda a idade do número (relógio do
    aparelho; o rascunho guarda a hora em que se digitou), o servidor prende
    entre o início da contagem e agora e fotografa o livro daquele instante
    (`livroNoInstante`: saldo − o que entrou depois, numa consulta); o
    rascunho reenviado depois de uma nota não apaga a nota — ela aparece em
    "depois de contar" e segura o "fecha sozinha"; corrigir número segue a
    mesma regra. Rascunho por contagem E pessoa. (b) Fotografia imutável no
    banco: migration aditiva `20261020010000_erp_contagem_fotografia`
    (gatilhos `Contagem_fechada_imutavel` e `ContagemItem_da_fechada_imutavel`;
    DELETE segue possível, como no razão). (c) Regras da loja só gravam com as
    seis regras lidas. (d) Conferência com colunas fixas e "depois de contar"
    na 2ª linha do item; perda em vermelho, sobra em verde; "Mais caro (A) /
    Médio (B) / Menor (C)", "Todos daqui"; uma faixa só na contagem aplicada;
    "Cobertura da semana de …"; contagem fechada mostra o "fica em" que o
    ajuste dela deixou.

## Provar a contagem (1.7)

```bash
npx vitest run tests/erp-contagem.test.ts tests/erp-estoque.test.ts   # período, ABC, vencidos, prazo, divergência, fecha sozinha, ajuste exato, cobertura × piso, regras; tetos e rascunho (heranças a–b)
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-contagem.db.test.ts tests/erp-estoque.db.test.ts
```
Na tela (Casa Alfa, Vila da Penha aberta há 10 dias, semana que termina
hoje): o gerente planeja os refrigerados; o operador conta no celular, o
sinal cai ("Falhou", guardado no aparelho) e volta (reenviado, "Salvo"); a
dona lança nota de cheddar no meio; o gerente confere ("depois de contar:
+4,54 kg") e aplica; a cobertura sobe; o fechamento com só o guardanapo é
recusado ("não fecha abaixo do piso"); conta os "para o piso" e fecha; um
"Recontar" que bate fecha sozinho.

## O que a 1.8 entregou — requisição, baixa pela requisição e cruzamento requisição × contagem

Migration `20261021000000_erp_requisicao` (ADITIVA, sem exceção à regra; sem
tabela nova: portão e RLS iguais): `RequisicaoStatus` + `PARCIAL` (ADD VALUE,
não usado no mesmo arquivo); em `Requisicao`, `numero` (único por loja),
`versao`, `paraDia`, nomes de quem pediu/entregou/cancelou, `canceladaEm` +
`motivoCancelamento`, `fichaId` (FK composta) + snapshot do nome e da
quantidade; em `RequisicaoItem`, `devolvidoMilesimos` e `ordem`; CHECKs (setor
da lista da 0.4, cancelada ⇔ data e motivo, atendida tem data, textos curtos,
ficha coerente, devolvido ≥ 0, e `REQUISICAO` aponta o item — novo, ao lado dos
da 1.6/1.7). Provada em banco novo com dado da 1.7 como superusuário e dono
não-superusuário com e sem RLS (`migrate diff` vazio).

1. **Requisição = pedido de saída do estoque da LOJA para um setor** (decisão
   77): setor da 0.4 (cozinha, salão, caixa…), para quando (hoje até 14 dias),
   itens em kg/g, L/ml ou un, observação; número sequencial por loja (#12) sob
   trava. Estados: Pedida → Atendida em parte (saiu parte, o resto ainda sai)
   → Atendida (tudo saiu, ou "encerrar o resto" com o corte à vista) ·
   Cancelada (só sem nada entregue, com motivo). Precisa do estoque aberto.
2. **A baixa é na ENTREGA** (decisão 77): `REQUISICAO` (−) por item que sai,
   valor pelo custo de referência de agora (um arredondamento; sem preço = 0 e
   "pendente"), snapshot, `requisicaoItemId`, chave `requisicao:<item>:<versão>`;
   razão e saldo na mesma transação (`gravarMovimentos`). Entrega parcial,
   várias entregas, até o dobro do pedido (a peça de 2,1 kg passa; acima é
   dedo errado). Entregar de novo a mesma tela: versão lida + `FOR UPDATE` —
   "já atendida" ou o conflito, nunca baixa dupla.
3. **Saldo insuficiente não para a cozinha** (decisão 78): a entrega passa com
   a confirmação de quem entrega ("o produto está aqui, o livro é que está
   errado"); o negativo vira alarme (tela, histórico e Divergências).
4. **Devolução por estorno** (decisão 79): estorna as baixas ativas do item
   (espelho exato, conferido pelo trigger) e baixa de novo o líquido, valor
   proporcional ao da época; nenhuma linha muda; Σ `REQUISICAO` = consumo
   requisitado líquido; `devolvidoMilesimos` à vista.
5. **Da ficha técnica**: "Puxar de uma ficha" — ficha + quanto vai produzir →
   insumos pela receita, quantidade BRUTA (líquida × fator × quantidade ÷
   rendimento, BigInt, um arredondamento); pré-preparo da receita entra pelo
   insumo que ele produz (vem pronto), SEM cascata (fazer o pré-preparo é a
   3.1). A lista volta editável; a requisição guarda a ficha e a quantidade.
   Porta da 3.1: `criarRequisicao` aceita a origem ficha e `OrdemProducao.requisicaoId` já existe.
6. **Cruzamento requisição × contagem** (decisão 80, só leitura): por
   insumo, trechos entre duas contagens APLICADAS consecutivas (a abertura vale
   da conclusão; as outras, de quando foi contado). Consumo apurado = contado
   no início + entradas (compra, produção, e os estornos com o sinal deles) −
   contado no fim; requisitado = Σ −`REQUISICAO`; outras saídas lançadas
   (perda, produção, ajuste); **sumiço = consumo − requisitado − outras** (é o
   "esperado − contado" da 1.7). > 0 = sumiu sem requisição; < 0 = requisitou
   a mais. R$ pelo custo de referência de hoje. Janela = trechos que terminam
   nela (padrão: o período do parceiro; dd/mm/aaaa; até 366 dias). **Pequeno e
   repetido**: sumiço dentro da tolerância da loja em 2+ trechos — o que o
   "fecha sozinha" deixa passar (herança da 1.7) — com a soma. Por setor:
   o que pediu e o sumiço nos insumos que ele pede (onde olhar, não culpa).
   Abaixo de zero agora; requisitado sem contagem para cruzar.
7. **Telas** (as mesmas no N1 e no parceiro): quadro por estado (título na cor
   do estado + barra fina + contador; atrasada = filete vermelho + "2d de
   atraso"; "Nenhum item nesta etapa"); nova (celular primeiro, setor da
   pessoa marcado, rodapé fixo); entregar (o livro ao lado, "fica em",
   negativo com confirmação, encerrar o resto); detalhe (pedido × saiu × voltou
   × falta × no livro, o que saiu do livro, receber de volta, cancelar,
   histórico); divergências. Menu Estoque: Requisições e Divergências (uma loja
   no acesso vai direto); no estoque da loja, o painel de requisições; o livro
   leva à requisição.
8. **Permissões** (catálogo 0.4, sem permissão nova): quadro e detalhe =
   `requisicao.pedir` OU `requisicao.atender`; pedir = `requisicao.pedir`
   (operador pede); entregar, encerrar e receber de volta =
   `requisicao.atender` (gerente/dona); cancelar a pedida = qualquer das duas;
   divergências = `estoque.ajustar`. Sempre com a loja; fora do alcance = 404.
   Setor não concede (decisão 39): só pré-escolhe o setor do pedido (a sessão
   passou a levar os setores da pessoa).
9. **Heranças da 1.7 resolvidas**: coluna "Contado" com a conta das embalagens
   curta e em linha própria ("1 × 2 kg + 600 g", `contaDaContagem`, também no
   celular); "sem preço" curto na coluna Diferença.

## Provar a requisição (1.8)

```bash
npx vitest run tests/erp-requisicao.test.ts      # pedido, ficha (bruta, sem cascata), entrega parcial, baixa exata, negativo, devolução, consumo × requisitado, sumiço em R$, pequenos repetidos, por setor
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-requisicao.db.test.ts
```
Na tela (Casa Alfa, Vila da Penha aberta há 10 dias): o cozinheiro pede no
celular 2 kg de cheddar e 1 kg de bacon (setor Cozinha já marcado); o
estoquista entrega 2 kg e 600 g (atendida em parte; o livro mostra a saída);
reenviar a tela velha não baixa de novo; uma pedida para anteontem aparece com
"2d de atraso"; uma contagem acusa 500 g de bacon a menos → Divergências
"R$ 21,45 sem requisição", e o cheddar como pequeno e repetido; a gerente da
Delivery recebe 404 na Penha; o operador não entrega nem vê divergências.

## O que a 1.9 entregou — precificação dentro da ficha técnica: custo por canal em camadas

Migration `20261022000000_erp_custo_por_canal` (ADITIVA, sem exceção à regra;
sem tabela nova: portão e RLS iguais): `CanalConfig.taxaPagamentoBp` (default
0, CHECK 0..10000) + CHECK comissão + pagamento < 100 %; teto da embalagem por
porção (`ProdutoEmbalagem` ≤ 1.000 un). Provada em banco novo com dado da 1.8
como superusuário e dono não-superusuário com e sem RLS (`migrate diff` vazio).

1. **Onde mora** (decisão 81): na ficha de PRATO (pré-preparo não se vende),
   painel "Custo por canal". Por baixo, o `ProdutoVenda` da casa (sem marca,
   nome = o da ficha, criado na 1ª gravação das embalagens; renomear a ficha
   leva o nome junto, na mesma transação). As embalagens são dele
   (`ProdutoEmbalagem`, produto × canal × insumo). Marca e nome de venda
   próprios (o mesmo prato em duas marcas) ficam para a 1.10+.
2. **Camadas, exatas** (`camadasDoCanal`): Loja = insumos (o custo de UMA
   porção, a cascata da 1.3 com o último preço da 1.5); Delivery = + as
   embalagens do delivery; iFood = + as embalagens do iFood + a taxa do iFood.
   Fração BigInt até a tela; um arredondamento na exibição. Embalagem entra
   INTEIRA (~100 % de rendimento: sem fator), pelo custo de referência — a nota
   da caixa kraft mais cara sobe delivery e iFood na próxima leitura, a loja
   não muda.
3. **Embalagem por canal** (tela própria "Embalagens por canal"): só insumo
   tipo Embalagem do estoque (o seletor nem mostra os outros; o servidor
   recusa), quantidade por porção em un, g/kg ou ml/L, até 20 por canal e
   1.000 por porção; delivery e iFood com listas próprias ("Começar com as do
   delivery"); desativada ou que deixou de ser embalagem só fica se já
   estava; prévia exata ao vivo. Gravar trava a ficha (`FOR NO KEY UPDATE`),
   confere a impressão da lista lida (duas abas: a segunda recebe "alguém
   mudou") e trava os insumos citados (`FOR SHARE`); histórico na ficha
   ("embalagens do iFood · entrou: Sacola kraft 1 un"), na mesma transação;
   a mesma lista em outra ordem não é mudança.
4. **Taxa do iFood por Parceiro Flow** (decisão 82, tela "Canais de venda"):
   comissão do plano (`taxaBp`) + pagamento online (`taxaPagamentoBp`), em
   pontos-base sobre o PREÇO. Hipóteses (documentadas, configuráveis): as duas
   incidem sobre o preço do prato; mensalidade do plano, taxa de entrega e
   taxa fixa por pedido não entram no custo do prato (são do mês e do pedido:
   lucro por pedido, Notion "Evolução"). Nada pré-preenchido: sem configurar,
   o iFood fica "Não configurada" e o canal, incompleto. Editar condicional
   ao `atualizadoEm`; a primeira configuração em corrida cai no único
   (parceiro, canal); histórico em `CanalConfig` ("comissão: 23%").
5. **Taxa × preço** (decisão 83): o preço é da 1.10, então a camada da taxa
   aparece como "26,2% do preço" e "a cada R$ 10,00: R$ 2,62"; o custo do
   iFood é "R$ 9,98 + 26,2% do preço". A conta já está pronta:
   `camadasDoCanal({ …, precoCentavos })` resolve a taxa em fração exata e o
   total; `taxaSobrePreco` é a porta.
6. **Incompleto propagado**: insumo da ficha sem preço deixa os três canais
   incompletos; embalagem sem preço, só o canal dela; taxa não configurada, só
   o iFood. O parcial entra (nunca R$ 0,00) e a tela diz o porquê ("iFood:
   custo incompleto — falta preço em “Sacola”").
7. **Telas** (as mesmas no N1 e no parceiro): detalhe do prato com a tabela
   densa (Kairu Corporativo) — canais nas colunas, camadas empilhadas nas
   linhas (insumos da receita, embalagens e cada uma com a quantidade, taxa do
   iFood, custo do canal); no celular, um bloco por canal; "Embalagens por
   canal"; "Canais de venda" no menu da Ficha técnica (o que entra no custo de
   cada canal, a taxa do iFood, últimas alterações). Precificação saiu de "em
   breve" no catálogo.
8. **Permissões** (catálogo 0.4, sem permissão nova): ver o custo por canal e
   os canais = `fichas.ver` + `precos.ver` (o custo por canal nem sai do
   servidor sem `precos.ver`; operador não vê); editar embalagens =
   `fichas.editar` + `precos.ver` (o que vai no saco é operação: o gerente
   pode); taxa do iFood = `precos.editar` (só a dona). Tenant: embalagem,
   produto e taxa de outro parceiro não existem (portão + RLS + FK composta).
9. **Heranças da 1.8 resolvidas**: (a) a entrega confere o negativo com os
   saldos TRAVADOS (`saldosTravados`, `FOR UPDATE` na ordem de
   `gravarMovimentos`): duas entregas do mesmo insumo em requisições
   diferentes se enfileiram e a segunda pede a confirmação (teste de corrida;
   falha sem a trava); (b) `fichaQuantidade` ≤ 10.000.000 também na gravação
   (`TETO_DA_QUANTIDADE_DA_FICHA`); (c) teste com banco estável (a corrida do
   número decidia quem era #2); (d) cartão pendente do quadro com "há 53 min",
   histórico DENTRO da requisição pelo estado ("Pedida", "Entregue", "Voltou
   para o estoque", "Cancelada"), seletor do insumo na nova requisição em
   linha inteira, agrupado pelo lugar (nome inteiro no celular).

## Provar o custo por canal (1.9)

```bash
npx vitest run tests/erp-canais.test.ts         # camadas exatas, embalagem inteira, pontos-base, incompleto, leitura, retrato
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-canais.db.test.ts tests/erp-requisicao.db.test.ts
```
Na tela (Casa Alfa): a dona abre o "Burger cheddar" (iFood "Não
configurada"), configura as embalagens (delivery: caixa kraft + 2 guardanapos;
iFood: caixa kraft + sacola + 2 guardanapos), a taxa do iFood (23 % + 3,2 %) e
vê Loja R$ 8,45 · Delivery R$ 9,66 · iFood R$ 9,98 + 26,2% do preço; uma nota
da caixa kraft mais cara sobe delivery e iFood no mesmo valor e a loja não
muda; o gerente vê e edita embalagens, mas não a taxa; o operador não vê a
precificação (e volta ao hub nas duas telas).

## O que a 1.10 entregou — preço e margem por canal dentro da ficha

Sem migration: `ProdutoCanal.precoManualCentavos` e `CanalConfig.margemAlvoPadraoBp`
(e os CHECKs da 0.1) já bastavam. Portão, RLS e FK composta iguais.

1. **Definições** (decisão 85): custo do canal = insumos + embalagens (+ a
   taxa, quando há preço); **margem bruta** = preço − insumos − embalagens;
   **margem líquida** = bruta − taxa do canal (iFood: comissão + pagamento
   online × preço; loja e delivery próprio não cobram: líquida = bruta). % sempre
   sobre o preço. Despesa fixa, mensalidade e entrega ficam fora (DRE, lucro
   por pedido).
2. **Margem-alvo** (decisão 86): alvo da margem LÍQUIDA, por canal, do parceiro
   (`CanalConfig.margemAlvoPadraoBp`), em "Canais de venda" — vazio = sem alvo;
   0 % = empate; iFood só com a taxa configurada e taxa + alvo < 100 % (nos dois
   formulários). Sem override por prato: o preço próprio é o override
   (`ProdutoCanal.margemAlvoBp` segue sem uso). Não vem de `DreMeta`.
3. **Sugerido** (decisão 86): `(insumos + embalagens) ÷ (1 − taxa − alvo)`, fração
   exata, arredondado PARA CIMA ao centavo (o menor preço que atinge o alvo; um
   centavo a menos não atinge — teste). "De cardápio" = a próxima ,90, só um botão
   "usar R$ 28,90" que preenche o campo. Ex.: R$ 10,18 ÷ (1 − 26,2% − 60%) =
   R$ 73,77.
4. **Preço do canal** = o próprio (sobrescreve; > 0 e ≤ R$ 100.000,00) ou, vazio,
   o sugerido (acompanha o custo). Custo incompleto: sugerido e margens
   "Incompleto/Incompleta" com o porquê — nunca o número parcial; o preço
   próprio pode ser salvo (decisão 87).
5. **Servidor decide** (decisão 88): o formulário manda só o texto do preço de
   cada canal + a impressão dos preços lidos (+ a dos custos, só para a frase).
   `salvarPrecos` trava a ficha (`FOR NO KEY UPDATE`), confere a impressão (duas
   abas: "alguém mudou os preços"), lê o custo de AGORA (cascata, embalagens com
   o último preço, taxa, alvo), recalcula com `precoDoCanal` e grava o preço e o
   histórico na mesma transação. Campo forjado (margem, sugerido, custo) não é
   lido. A prévia ao vivo é a MESMA função (as entradas atravessam em texto,
   `entradaParaTela`/`entradaDaTela`).
6. **Snapshot** (decisão 89): histórico da ficha, só o canal que mudou: "preço no
   iFood: sugerido (R$ 51,20) → R$ 29,90", "margem líquida no iFood: R$ 30,72
   (60,0%) → R$ 15,00 (50,2%)" e "custo do iFood na hora: R$ 14,90" (este só no
   depois, sempre visível). Preço × nota: o custo é lido depois da trava, na
   transação do preço; o histórico grava um custo coerente com a margem (teste
   de corrida); se o custo mudou desde a tela, a frase avisa ("o custo mudou
   enquanto você editava").
7. **Farol simples** com a palavra: "no alvo" (ok) · "abaixo do alvo" (atenção) ·
   "prejuízo" (erro, líquida < 0). Sem as 5 faixas do DRE 2.4.
8. **Telas**: no detalhe do prato, "Preço e margem por canal" (Kairu Corporativo,
   canais nas colunas): o que entra (insumos, embalagens, taxa do iFood em R$ com
   preço, custo do canal), margem-alvo, sugerido com a conta curta ("R$ 11,10 ÷
   0,138"), preço de venda (campo só para a dona; placeholder = o sugerido),
   margem bruta e líquida em R$ e %, farol; "Salvar preços" (secundário: o
   primário da tela é "Editar ficha"). Celular: um bloco por canal. "Canais de
   venda": coluna da margem-alvo e o formulário das margens com o exemplo ao vivo
   ("Prato de R$ 10,00: sai a R$ 33,34"); "se vender a R$ 30,00 no iFood…". Lista
   de fichas: margem líquida por canal a partir de 1024 px (em cinza quando vale
   o sugerido), linha de apoio no tablet e no celular; leitura em lote.
9. **Permissões**: ver = `fichas.ver` + `precos.ver` (dona e gerente; o operador
   não recebe nada, nem na lista); mudar preço e margem-alvo = `precos.editar`
   (só a dona; a action confere). N1 pode tudo.
10. **Heranças da 1.9 resolvidas**: (a) prato com produto de venda não vira
    pré-preparo (`conferirEstrutura`, ficha travada; edição e planilha); (b)
    aviso discreto de delivery/iFood sem embalagem, "Camada" → "O que entra",
    explicação longa vira dica (`Dica`, `<details>` nativo), histórico de
    embalagens de/para "Nenhuma" só com o que entrou/saiu. As duas decisões do
    Rodolfo (taxa do iFood; operador ver o custo da receita) ficam como estão.

11. **Veto do Guardião (1ª reprovação), corrigido** (decisão 90): o retrato do
    preço gravado no histórico da ficha aparecia em "Últimas alterações" para
    quem só tinha `fichas.ver` (o operador via "preço no iFood…"). Agora
    `listarHistorico` exige `verPrecos` (todo leitor decide, o compilador
    cobra): sem `precos.ver`, as linhas de `CanalConfig` (taxa, margem-alvo)
    somem e da ficha saem preço, margem, custo na hora e embalagens por canal —
    no servidor, antes do payload; a alteração que só tinha isso some inteira.
    `obterFicha(…, { verPrecos })` (padrão: não); `/erp/historico` passa
    `precos.ver`. Testes com banco montam a PÁGINA (detalhe e histórico) para o
    operador e um perfil com `historico.ver` sem `precos.ver`. Junto: margens
    exigem também `precos.ver`; "usar R$ X,90" respeita o limite; número grande
    demais leva a frase do limite (a prévia usa `lerPrecos`); prejuízo em selo
    cheio; no celular da lista, só os canais fora do alvo; histórico "R$ 29,90
    (o sugerido era R$ 87,06)".

## Provar o preço por canal (1.10)

```bash
npx vitest run tests/erp-precos.test.ts          # sugerido exato e para cima, limites, bruta/líquida, farol, incompleto, leitura, retrato, ida e volta
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-precos.db.test.ts tests/erp-canais.db.test.ts
```
Na tela (Casa Alfa): a dona define as margens-alvo (loja 70 %, delivery 65 %,
iFood 60 %), abre o "Burger cheddar", vê os sugeridos, digita R$ 29,90 no iFood
e vê a taxa virar R$ 7,83 e as margens mudarem ao vivo ("abaixo do alvo"), salva
(o servidor chega no mesmo número); uma nota do queijo cheddar mais cara baixa a
margem do iFood; o gerente vê sem o campo; o operador não vê (nem na lista).

## O que a 0.5 entregou — onboarding: a landing capta, o Rodolfo ativa

Migration `20261023000000_erp_onboarding` (ADITIVA; 3 enums, 3 tabelas, 1 gatilho; nenhuma
tabela existente muda: a ligação com o parceiro fica do lado do pedido; sem índice parcial:
`migrate diff` vazio). Provada em banco novo como superusuário, dono não-superusuário com RLS e sem
RLS, e no `ff_dev` com dado.

1. **O pedido mora FORA do tenant** (decisão 91). `PedidoParceiro` (grupo, responsável, WhatsApp em
   E.164, e-mail minúsculo, lojas, marcas, cidade, consentimento + versão, etapa, `etapaDesde`,
   `versao`, `reenvios`, motivo da recusa, `parceiroCriadoId`), `PedidoParceiroEvento` (só se
   acrescenta: o gatilho recusa UPDATE; guarda etapa antes/depois, motivo e autor, nunca dado pessoal)
   e `TentativaPedidoParceiro` (limite do formulário). O vínculo se chama `parceiroCriadoId` (não
   `parceiroId`, a marca de tabela de tenant). CHECKs: lojas 1–200, marcas 1–50, e-mail minúsculo,
   ATIVADO ⇔ parceiro criado, RECUSADO ⇒ motivo ≥ 3, LANDING ⇒ consentimento, dados excluídos só em
   recusado. O papel `erp_tenant` não tem GRANT (a migration revoga, no padrão condicional da 0.3) e o
   `prisma` do portal recusa os modelos (`MODELOS_DE_PEDIDO`). Só `pedidos.ts` e a ativação em
   `credenciais.ts` tocam neles; nada em `/erp`, `/entrar` ou `telas/` os importa (teste-guarda).
2. **Landing** (`/` continua estática, ○ no build): formulário dentro do convite final (`#comecar`,
   componente cliente + server action) com nome do grupo, responsável, WhatsApp (celular BR),
   e-mail, lojas, marcas, cidade/UF e a caixa obrigatória "Autorizo a FlowFoods a usar estes dados só
   para falar comigo sobre a consultoria e o sistema." (versão `v1`). **Funciona sem JavaScript**
   (formulário nativo; a página volta com a resposta) e mantém o que foi digitado quando há erro. Os
   botões do WhatsApp continuam. Sem `DATABASE_URL` (ou erro inesperado) a resposta é "Fale pelo
   WhatsApp" com o link, nunca 500. O placeholder do e-mail não usa a palavra proibida pelo gate.
3. **Resposta única e anti-abuso** (decisão 94). Tudo numa transação sob `pg_advisory_xact_lock` do IP
   (depois, nesta ordem, o teto global e o e-mail e o WhatsApp): limite de **3 por hora e 10 por dia
   por IP** (conta pedido novo, reenvio e armadilha), **teto global de 100 cartões novos por dia**, e
   um teto de ruído por IP (40 linhas/hora; passou, nem anota). Tabela própria: pedido que falha não
   trava o login de quem divide o IP. IP real = o `X-Real-Ip` do Traefik (herança da 0.3). Campo
   escondido `site_da_empresa` (fora da tela, `tabindex=-1`, `aria-hidden`): preenchido, a resposta é
   a mesma e nada é gravado além da tentativa `ARMADILHA`. **Reenvio**: pedido aberto com o mesmo
   e-mail OU WhatsApp recebe `reenvios + 1` e um evento `REENVIOU` no MESMO cartão (o cartão não é
   reescrito: ninguém assume o cartão de outro mandando o e-mail dele). O formulário nunca consulta
   `UsuarioErp`: e-mail que já entra no ERP, de pedido aberto e novo recebem a mesma resposta, byte a
   byte (provado em teste e no navegador sem JavaScript).
4. **Quadro "Aguardando liberação"** em `/rodolfo/onboarding` (menu Parceiros Flow; contagem e atraso
   no sino do nível 1; só o nível 1 lê): colunas **Novo · Em conversa · Ativado · Recusado** (as duas
   últimas, 30 dias). Cartão = grupo, quem pediu e onde, lojas/marcas, "chegou há 3d", origem
   (site/digitado) e "mandou de novo 3×". **Atraso** (decisão 97): Novo > 2 dias, Em conversa > 7 dias
   sem movimento (`etapaDesde`; reenvio do lead não conta como movimento), dias corridos no calendário
   do Rio, → **filete vermelho de 2 px à esquerda + "Xd de atraso"** (na 1.8 o filete é de 3 px; aqui
   são 2, como pedido). Mover de etapa por botão no detalhe (sem arrastar). No celular as colunas
   viram abas (links `?etapa=`, sem JavaScript); de 768 px, todas à vista; 4 por linha a partir de
   1280 px.
5. **Detalhe do pedido**: quem pediu (WhatsApp `wa.me` só com dígitos, e-mail `mailto` só se válido,
   montados no servidor), a autorização (data e versão do texto), o histórico antes/depois, as marcas
   só-leitura do nível 1 ("este e-mail já tem acesso ao ERP", com os parceiros, e por isso não serve de dono; "este WhatsApp já está no
   Barney: status Y" — nada é pausado na cadência) e a decisão: marcar em conversa / voltar a Novo,
   **ativar**, **recusar** (motivo obrigatório, 3–200) e, no recusado, **excluir dados pessoais**.
6. **Ativar** (decisão 93; só nível 1; `ativarPedido` em `credenciais.ts`): formulário pré-preenchido
   e editável (nome do parceiro, link/slug gerado e editável, nome e e-mail do dono). UMA transação:
   trava `erp-pedido:<id>` → confere etapa aberta e versão lida → cria o `ParceiroFlow` ATIVO →
   `criarAcessoNaTransacao` (o miolo de `criarAcesso`, extraído: dono = perfil Dono com a rede inteira,
   mesma regra de e-mail já existente e de `revogarMeiosDeEntrada`) → convite do nível 1 (72 h, uso
   único, só o hash) → `updateMany` condicional marca o pedido ATIVADO com `parceiroCriadoId` → evento
   `ATIVOU` → **por último** o histórico do parceiro (CRIOU do parceiro, CRIOU e GEROU_LINK do acesso).
   Duas ativações juntas, ou ativar × recusar: um vence, o outro recebe "Este pedido já foi ativado por
   X em DD/MM. Nada foi criado de novo." (slug repetido vira frase). Falha no meio não deixa nada (teste
   com gatilho de falha forçada). **A ativação só cria pessoa NOVA** (decisão 99, veto do Guardião): se o
   e-mail do dono já existe em `UsuarioErp` — com senha, com convite pendente, com acesso desativado,
   em qualquer caixa —, a ativação é RECUSADA com a frase "Este e-mail já tem acesso ao ERP. Use outro
   e-mail para o dono; depois, em Equipe do parceiro, dê acesso a essa pessoa.", sem criar nada e sem
   tocar em senha, rosto, sessão ou link de ninguém. Antes isso era um sequestro de conta: o e-mail de
   outra pessoa no formulário público + o WhatsApp do atacante faziam a ativação apagar a senha e os
   rostos da vítima e mandar o link do nível 1 para o atacante. A checagem fica dentro da transação
   (`soPessoaNova` no miolo do acesso) e a corrida com a Equipe criando o mesmo e-mail cai no único do
   e-mail (P2002 vira a mesma frase). O formulário de ativação mostra a frase UMA vez, no campo do e-mail, e
   desabilita "Ativar e criar acesso" enquanto o e-mail do pedido está em conflito (o servidor confere de
   novo, inclusive quando o e-mail digitado é outro que já existe). O único caminho em que dado do
   público chega a `criarAcesso`/`gerarNovoLink` é esta ativação (o pedido manual e o formulário do site
   só gravam o pedido).
7. **Convite sem SMTP** (decisão 95): o link aparece UMA vez, na resposta da ativação (estado da tela,
   no topo da coluna de decisão), com **Copiar** e **Abrir no WhatsApp** (`wa.me/<número do pedido>`
   com a mensagem e o link). O token não vai para o banco, o AuditLog, o histórico nem a URL (teste e
   prova procuram o token em 7 tabelas). Recarregou: o link não volta; "Gerar link novo" na Equipe
   (herança da 0.3/0.4 fechada: o envio do link é esse botão, sem servidor de envio).
8. **Parceiro em RASCUNHO não entra** (decisão 92, revoga a 38 só para RASCUNHO): `abrirSessao`,
   `validarSessao` (a sessão aberta morre na próxima requisição), `escolherParceiro` e `conviteValido`
   ignoram vínculo de parceiro em RASCUNHO; `criarAcesso` e `gerarNovoLink` recusam nele. Suspenso
   segue entrando e lendo. Como não há acesso à produção para contar quem ficaria de fora, a **lista
   de parceiros do nível 1** avisa, na linha de cada RASCUNHO com pessoas ativas, "N pessoas não
   entram: ative para liberar o acesso" (`rascunhosComPessoasAtivas`); ativar é a transição
   RASCUNHO → ATIVO que já existe na aba Cadastro.
9. **Regra Nº 2: um caminho só.** O formulário "Novo parceiro" com "Nasce como: Aguardando liberação"
   saiu (e a action `acaoCriarParceiro`): "Aguardando liberação" é o quadro, "Cadastrar pedido manual"
   (tela própria, origem MANUAL, sem a caixa de autorização, "Já estamos conversando" opcional;
   contato igual a pedido aberto é recusado) é a entrada do que não veio do site, e a ativação é a
   mesma. O rótulo do status RASCUNHO passou a "Rascunho" (legado). `criarParceiro` fica para o seed e
   os testes. A métrica "Aguardando liberação" da lista soma pedidos abertos + rascunhos. O Lead do
   Barney não foi reaproveitado (unicidade do telefone devolveria erro diferente, e o lead entraria na
   cadência automática).
10. **LGPD** (decisão 96): consentimento versionado; pedido recusado guardado por 180 dias (o detalhe
    diz até quando); "Excluir dados pessoais" anonimiza o pedido recusado (nome, contato, cidade e o
    motivo da recusa, que vira "[apagado]") e mantém o cartão e o histórico sem dado pessoal. O motivo
    mora SÓ no pedido: o evento RECUSOU (só-inclusão) não o copia (decisão 100). O texto público "(ver
    como usamos)" no formulário promete os 180 dias e o pedido de exclusão pelo WhatsApp: enquanto a
    rotina automática não existe, a exclusão é manual. A rotina que apaga sozinha aos 180 dias NÃO foi feita (pendência).

## Provar o onboarding (0.5)

```bash
npx vitest run tests/erp-onboarding.test.ts tests/erp-tenant-portao.test.ts   # limpeza e bidi, validação, consentimento, atraso, links, landing sem banco, guarda (só pedidos.ts e a ativação tocam o pedido)
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev \
  npx vitest run tests/erp-onboarding.db.test.ts tests/erp-rls.db.test.ts tests/erp-acesso.db.test.ts
```
`erp-onboarding.db.test.ts` (33 testes): envio válido, sem caixa, armadilha, enumeração (resposta
idêntica), reenvio, **20 envios paralelos do mesmo IP = exatamente 3**, 10/dia, teto global, ruído, login
independente, quadro e atraso, versão, pedido manual, evento só-inclusão, CHECKs, `prisma` do portal
recusa, ativar (tudo + token ausente do banco + link de uso único + a dona entra no ERP), ativar duas
vezes, **corrida de ativação dupla = 1 parceiro**, ativar × recusar, atomicidade (falha forçada),
slug repetido, tela velha, **sequestro de conta nas variantes com senha+rosto+sessão, convite pendente, senha de link de parceiro e acesso desativado (a cadeia vai até a sessão do atacante e o teste FALHA sem a correção)**, corrida com a Equipe, recusa com e sem motivo, excluir dados,
**RASCUNHO que não entra** (login, sessão aberta, link, criar acesso) e N2 sem leitura do pedido.
Rodado como superusuário, como dono não-superusuário com RLS (247 testes) e sem RLS (239 + 8 pulados),
duas vezes seguidas no `ff_dev`.

Na tela (produção local, `NODE_ENV=production`, porta 3100; roteiro em `prova05/jornada.mjs` no
scratchpad): enviar o formulário do site (com e sem JavaScript; com erro, com a armadilha, o 4º envio do
mesmo IP bloqueado) → o quadro mostra o Novo de 3 dias com "1d de atraso" e o Em conversa de 9 dias com
"2d de atraso" (filete de 2 px) → ativar, copiar o link e abrir no WhatsApp → o link aberto num navegador
novo cria a senha, o segundo uso dá "link vencido" e a dona entra no ERP como Dono → recusar com e sem
motivo → cadastrar pedido manual → lista de parceiros com o aviso do rascunho. Prints em 390/820/1440,
claro e escuro.

## O que a UX.9 entregou — navegação por ÁREAS (seção 9 do plano, antes da 0.6)

Só reorganização: nenhuma regra de negócio, permissão do catálogo, consulta, action, esquema ou migration
mudou (o diff não toca `prisma/`, nem `src/lib/erp/*` fora de `modulos.ts`, nem `actions.ts`/`executar.ts`).
Nenhuma URL antiga mudou, sumiu ou redireciona. O servidor continua sendo a autoridade: esconder aba, card
ou ação é conforto; a página e a action seguem conferindo `exigirPermissaoNaPagina`/`recusaDaAcao`.

**Mapa de navegação (área = módulo, aba = item do menu, ação = `acoes` da área).** Fonte única em
`src/lib/erp/modulos.ts` (`areasConstruidas`); o hub, o menu, o seletor, as abas e o ⌘K saem dela.

| Área (card do hub) | Abas (rota, permissão) | Ações no cabeçalho da aba e no ⌘K (permissão) |
|---|---|---|
| Cadastros e Cardápio | Insumos `/insumos` (insumos.ver) · Fichas e produtos `/fichas` (fichas.ver) · Precificação `/fichas/canais` (precos.ver) | Novo insumo (insumos.editar) · Nova ficha e Importar planilha (fichas.editar) |
| Compras e Fornecedores | Compras `/compras` · Fornecedores `/compras/fornecedores` (compras.ver) | Lançar nota (compras.lancar) · Novo fornecedor (fornecedores.editar) |
| Estoque e Movimentações | Visão geral `/estoque` (estoque.ver) · **Contagens `/estoque/contagens` (nova)** (estoque.ver) · Requisições (pedir ou atender) · Divergências (estoque.ajustar) | nenhuma (Nova requisição, Planejar contagem e Abrir estoque são da loja) |
| Rede e Equipe | Lojas e marcas (lojas.ver) · Equipe (acessos.gerir) · Histórico (historico.ver) · Seu acesso (livre) / Cadastro do parceiro (nível 1) | nenhuma |
| Futuros (desabilitados, sem link; Faturamento e DRE virou área na 2.1) | Produção 3.1 · Etiquetas 3.4 | |

1. **Hub** (`/erp` "Áreas da Rede" e `/rodolfo/erp/<slug>`): um card por área com acesso (nome, descrição do
   fluxo e as abas permitidas; sem número, R$ nem %). O título é o link principal e estica sobre o card todo
   (o card inteiro leva à primeira aba permitida); os nomes das abas são links irmãos acima dessa camada
   (nunca link dentro de link; chegam por Tab depois do título, e "Contagens" abre `/estoque/contagens`). Não há
   rota de "visão geral de área". Nenhum card é uma ação. Abaixo de 600 px, uma coluna. O `flatMap` de itens
   do hub saiu (Regra Nº 2: não há hub novo ao lado do velho).
2. **Área sem aba permitida some** do hub, do seletor, do menu e do ⌘K; as ações somem com ela. "Rede e
   Equipe" sempre aparece (Seu acesso é livre). A visão "Rede ↔ loja" nunca muda áreas nem abas.
3. **Abas** (`src/components/erp/ui/abas.tsx`, montadas pelo `Shell` no topo do conteúdo a partir de
   `abasDaArea`): `<nav aria-label="Seções de <área>">`, cada aba é um link de rota, a atual leva
   `aria-current="page"` (não é `role=tablist`: cada aba é uma rota). Indicador de 2 px embaixo, o mesmo do
   menu; foco por dentro da aba; no celular o trilho rola só dentro dele. Menos de duas abas, sem barra.
4. **Trilha** `Início › Área (link para a entrada) › Aba › extra`. As telas de ação declaram a própria trilha
   (Novo insumo, Nova ficha, Importar planilha, Lançar nota, Novo fornecedor) e o "Fornecedores" repetido
   saiu. No nível 1 a trilha continua `Parceiros Flow › Aba`. Abaixo de 640 px não há trilha: quem dá o
   contexto são as abas e o h1.
5. **⌘K** acha as abas ("Área · subtítulo") e as ações, só das áreas visíveis e permitidas. Nenhum resultado
   traz R$, custo nem margem (`buscarInsumos`/`buscarFichas` não selecionam dinheiro).
6. **Contagens** é a única rota nova (`/estoque/contagens` e o espelho `/rodolfo/erp/<slug>/estoque/contagens`):
   escolhe a loja (com Selo do estado do estoque); com uma só loja no acesso vai direto ao período dela.
   Porta: "ver o estoque". A contagem mora dentro da loja (`<loja>/periodo`, `<loja>/contagens/...`) e acende
   a aba Contagens (`ativoEm`).
7. **Precificação** é o nome da aba e o título da tela `/fichas/canais` (taxa do iFood, embalagens, margem-alvo);
   o link "Margem de cada prato" (só com "ver fichas") leva a `/fichas?tipo=PRATO`, onde preço e margem por ficha já aparecem, filtrados
   no servidor por "ver preços". Nenhuma lista nova.
8. **Nível 1**: `comParceiroAtual` monta um grupo por área dentro de "Parceiros Flow" (mais "Áreas do parceiro")
   e leva as ações para o ⌘K. O seletor do menu diz "Área".
9. Rótulos: "Fichas e produtos" é só rótulo (não existe entidade "produto" nova); "Lançar nota" continua. O
   título de cada tela é o da aba: "Compras" (era "Notas de compra") e "Visão geral" (era "Estoque por loja", que
   passa ao subtítulo). O seletor de área do menu usa um `resumo` curto (até 20 caracteres), não o subtítulo do card.
10. Kit Kairu: card de 14 px (Dark), um CTA principal por cabeçalho e `aria-current="page"` no destino ativo
    (Corporativo), vazio com próximo passo. Identidade FlowFoods mantida; scanner do avoid-ai-design com 0 P0 e 0 P1.

## Provar a navegação por áreas (UX.9)

```bash
npx vitest run tests/erp-navegacao.test.ts tests/erp-shell.test.ts   # papéis × áreas/abas/ações, hub renderizado, itemAtivo em toda rota, trilha, abas, URLs, guardas
npx prisma validate && npm run typecheck && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run   # duas vezes
npm run build                                                          # "/" continua ○ (estático)
```
Na tela (build de produção local, porta própria, banco de prova): entrar como Dono e como Operador (uma loja) e
fazer insumo → ficha → nota → estoque → contagem só por cards, abas e botões, sem digitar URL; conferir o hub
(4 cards; Operador sem Compras e sem Precificação), o menu e o seletor, o ⌘K ("forn": Fornecedores, Lançar nota,
Novo fornecedor; Operador sem nenhuma ação), a trilha `Início › Cadastros e Cardápio › Insumos › Novo insumo` e
as abas com `aria-current`, em 390/820/1440, claro e escuro; abrir `/erp/compras/nova` como Operador volta ao hub
com o aviso.

## O que a 0.6 entregou — ajuda contextual (caixas que dão aula por função, "?" sempre à mão)

Migration `20261024000000_erp_preferencia_ajuda` (ADITIVA; 1 tabela, 1 função de apoio ao CHECK; nenhuma tabela
existente muda; `migrate diff` vazio). Provada em banco novo como superusuário e como dono não-superusuário com RLS e sem
RLS, e no `ff_dev` copiado com dado. Nenhuma tabela de tenant mudou: portão e RLS iguais.

1. **O texto mora no código** (decisão 110): `src/lib/erp/ajuda-textos.ts` (só texto) + `ajuda.ts` (registro, filtro por
   permissão, lint). Uma entrada por tela (novo e editar dividem): `chave`, `area`, `rotas` (padrão do Next, relativas à base:
   `estoque/[lojaId]`), `titulo`, `versao`, `aula` (blocos), `secoes` (o que a gaveta mostra a mais). A chave é a ROTA
   (decisão 111): a mesma entrada serve o `/erp` e o `/rodolfo/erp/<slug>`. São 36 entradas para 43 rotas, incluindo a única
   rota nova da seção 9, `/estoque/contagens`, e o Cadastro do parceiro (só nível 1).
2. **Aula por permissão** (decisão 113): `Bloco = { texto, para?: Permissao[] }`; quem tem QUALQUER uma lê. O layout entrega
   ao shell o registro já filtrado (`ajudaParaATela(alcance)`): o operador não recebe nada sobre preço, nem na caixa nem na
   gaveta; a dona e o gerente recebem. Perfil próprio vale pelas permissões; setor não concede.
3. **Caixa de aula** (`CaixaDeAula`, desenhada pelo `Shell` acima da página): etiqueta "COMO FUNCIONA", título em serifa, 2 a 4
   frases, "Entendi, não mostrar de novo" e "Ver tudo sobre esta tela". Painel claro com borda fina, nos tokens do tema;
   sem ícone, gradiente, emoji nem borda colorida. A rota decide a entrada; a preferência vem do layout, então **o HTML do
   servidor de quem fechou ou desligou já vem sem a caixa** (sem flash, sem diferença de hidratação). Os botões são
   `<form action>` de server action: **sem JavaScript** a caixa vem e "não mostrar de novo" funciona; com JavaScript ela some
   na hora. "Ver tudo" precisa de JavaScript e nasce escondido (decisão 114).
4. **1ª vez** (decisão 115): enquanto a pessoa não respondeu, a caixa de qualquer tela traz "Quer as dicas de como usar cada
   tela?" com "Manter as dicas" e "Desligar" (sem modal). Sem resposta = ligadas. Desligar tira só as caixas.
5. **Botão "?" e gaveta** (decisão 120): o "?" fica no topo entre a busca e o sino, sempre (também com as dicas desligadas),
   com `aria-label`, `aria-haspopup="dialog"` e alvo de 44 px. O atalho `?` abre a gaveta fora de campo. A gaveta
   (`Dialogo` ganhou `lado="direita"`, `focoNoTitulo` e `voltarPara`) entra pela direita no desktop e vira folha embaixo
   abaixo de 600 px; traz a aula, as seções, "Outras telas de {área}" (as abas que a pessoa pode abrir), a saída "Fale com a
   FlowFoods" (WhatsApp, `AJUDA_DE_USO_ERP`) e, com as dicas desligadas, "Religar". O foco vai ao título; Esc fecha e o foco
   volta a quem abriu (o "?" se foi o atalho); o fundo fica inerte. `LinkDeAjuda` (`ui/link-de-ajuda.tsx`) abre a gaveta já
   na seção: é o que as telas usam no lugar da `Dica` ("Como a conta é feita", "Como abre o estoque de uma loja").
6. **Preferência da pessoa** (decisão 112): tabela `PreferenciaErp` (1 linha por `UsuarioErp`, criada na 1ª escolha): `dicasLigadas`,
   `escolhidaEm`, `fechadas` (`chave@versão`, no máximo 300). **Fora do tenant**, lida na mesma consulta de `validarSessao`
   (`SessaoValida.ajuda`), gravada só por `gravarPreferenciaDeAjuda(token, mudança)` em `credenciais.ts`; `erp_tenant` sem
   GRANT; o `prisma` do portal recusa (`MODELOS_DE_CREDENCIAL`); apagar a pessoa apaga a linha. "Seu acesso" tem o bloco
   **Dicas**: ligar e desligar, e "Mostrar de novo as que fechei" (zera a lista).
7. **Versão** (decisão 116): mudou a função da tela, sobe a `versao` da entrada e a caixa volta, com "Mudou", para quem
   tinha fechado a anterior. Fechar só aceita `chave@versão` que existe no registro agora; a gravação é atômica
   (duas abas, nenhum fechamento se perde), a versão antiga da mesma caixa sai e o 301º tira o mais velho.
8. **Ações da própria pessoa** (decisão 119): `acaoAjudaFechar`, `acaoAjudaDicas`, `acaoAjudaReabrir`; nenhuma recebe quem é
   a pessoa (o `usuarioId` sai da sessão, revalidada a cada gravação); campo forjado é ignorado; sem sessão ou com o JWT do
   nível 1 nada grava; valem em parceiro suspenso (não tocam o tenant).
9. **Nível 1** (decisão 118): dentro do parceiro tem o "?" (mesmo registro, todas as permissões), sem caixa, sem pergunta e
   sem preferência. Telas do Barney e a lista de parceiros não têm "?".
10. **Regra Nº 2** (decisão 117): `ui/dica.tsx` e a prop `explicacao` das telas de contar saíram; "Como a conta é feita" e
    "Como abre o estoque de uma loja" são seções do registro; "O servidor refaz a conta ao salvar" virou "A conta é refeita na
    hora de salvar". Ficam: dicas de campo (`aria-describedby`), `<details>` que mostram dado e subtítulos de painel.
11. **Telas de contar** (decisão 121): a caixa de `estoque/[lojaId]/abertura` e `contagens/[contagemId]` nasce RECOLHIDA (`recolhida: true`
    na entrada): uma linha "Como funciona · Contagem de abertura" (46 px) que abre (`<details>`, funciona sem JS). Aberta, ela ocupava 313 px e
    empurrava o 1º campo de contagem para 931 px de uma tela de 844 (operador a 390 px); recolhida, o campo fica em 665 px, e depois de
    "Entendi" sobe para 603 px. Com a pergunta da 1ª vez pendente ela nasce aberta.
12. **Finos da aprovação**: o gate enxerga `page.(t|j)sx?`; `LinkDeAjuda` nasce escondido até montar (sem JS não faria nada); no celular o
    seletor de visão diz "Rede" (não corta); "Outras telas" na gaveta tem a cor do texto principal e sublinha no hover e no foco;
    textos: "cobre a perda da limpeza", "faixa vermelha" no lugar de "filete" e a conta de preço em palavras (versões de montar a ficha, da ficha e das
    requisições subiram para 2, com o lock regravado).
13. **Correções de passagem**: o seletor de visão cede espaço na barra superior estreita (a 390 px o "?" não cabia com 44 px);
    o `Dialogo` em folha (< 600 px) ganhou `height: auto`; o texto da ajuda diz que as regras da contagem (piso, frequência,
    tolerância) ficam em Período e contagens, não em Lojas (a análise tinha isso trocado).

### A regra nova: toda subfase atualiza a ajuda

Tela ou rota nova: entrada nova em `ajuda-textos.ts`, no MESMO diff (o teste reprova rota sem ajuda). Função da tela mudou:
ajuste o texto, suba a `versao` e rode `npm run ajuda:lock` (o script se recusa a gravar texto novo com a versão velha). O modelo
de "O que a X entregou" ganha a linha obrigatória **"Ajuda: chaves novas/alteradas"**, e o fiscal confere o diff de
`ajuda-textos.ts` contra as telas mexidas. Texto curto, carioca, sem jargão; permissão no `para` quando o assunto é de quem só
alguns podem ver.

## Provar a ajuda (0.6)

```bash
npx vitest run tests/erp-ajuda.test.ts      # gate: rota sem ajuda, órfã, permissão, jargão, versão/lock; rota casa; filtro por permissão; caixa; HTML do servidor; guardas
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-ajuda.db.test.ts   # com banco: preferência, abas, forja, teto, sessão morta, CASCADE
npm run ajuda:lock                          # regrava ajuda.lock.json (depois de subir a versão de uma entrada)
```
`erp-ajuda.test.ts` (40 testes, sem banco): toda página do `/erp` e do espelho do nível 1 tem exatamente uma entrada (remover
uma reprova com o nome da rota; entrada órfã também); a `area` de cada entrada é a área onde a tela acende no menu; o lint
reprova jargão, "!", emoji, `<`/`>`, markdown, bloco com mais de 320 caracteres e permissão inexistente; texto alterado
sem subir a versão reprova (e o script do lock se recusa); o operador não recebe preço, a dona recebe; o HTML do servidor
(o `AppShell` renderizado) não tem a caixa para quem fechou ou desligou, tem a pergunta só até a 1ª resposta, tem "Mudou" quando
a versão sobe e não tem "?" fora do ERP; `dangerouslySetInnerHTML` não existe; `Dica` e `explicacao` não existem.
`erp-ajuda.db.test.ts` (13 testes): pessoa nova ligada e sem resposta; manter e desligar valem em outro aparelho e não mexem na
colega; fechar some só aquela caixa, nas duas sessões; `usuarioId` forjado é ignorado; chave forjada, gigante, de versão
inexistente ou com SQL é recusada sem gravar; 36 fechamentos simultâneos de duas abas não perdem nenhum; teto de 300 e o CHECK do banco;
sem cookie, token lixo, JWT do nível 1 ou sessão encerrada nada grava; a preferência vale nos dois parceiros e o parceiro
suspenso não impede de ajustá-la; apagar a pessoa apaga a linha; o `prisma` do portal recusa a tabela. E o `erp-rls.db.test.ts`
confere sozinho que `PreferenciaErp` não tem RLS nem GRANT para `erp_tenant`.

Na tela (build de produção local, porta 3100, banco `ff_06` copiado do `ff_dev`; roteiro `prova06/jornada.mjs` no scratchpad, 94
conferências): 1ª tela da pessoa nova com a caixa e a pergunta (sem modal) → manter (grava; a pergunta some) → fechar a caixa de
Insumos (some em menos de 100 ms; o HTML do servidor já vem sem ela; as outras telas seguem com a delas) → "?" abre a gaveta
(direita no desktop, folha no celular; foco no título; Esc fecha e o foco volta ao "?"; Tab não alcança nada fora dela; o
atalho `?` abre fora de campo e não dispara dentro de campo) → dona lê sobre preço na caixa e na gaveta, operador não (e o
link "Como a conta é feita" abre a gaveta já na seção) → desligar (nenhuma caixa em nenhuma tela, em outro aparelho também) →
religar em Seu acesso e "Mostrar de novo as que fechei" → sem JavaScript (cookie de sessão levado a um contexto sem JS: a
caixa e a pergunta vêm no HTML, "Manter" e "não mostrar de novo" funcionam e recarregam sem ela) → sem flash (CPU 6× e rede
lenta, com um observador de mutação que prova o controle positivo: com a caixa aberta ele a enxerga; fechada ou desligada, zero)
→ nível 1 dentro do parceiro (só o "?"; Barney e lista de parceiros sem "?") → axe (wcag2a/2aa) sem violação no hub com
caixa e pergunta, em `/estoque/contagens` e com a gaveta aberta, nos dois temas; zero erro de console e de hidratação; zero
rolagem horizontal a 390, 820 e 1440. Prints em 390/820/1440, claro e escuro, dona e operador, em `shots-0.6/`.

## O que a 2.1 entregou — entrada de faturamento por canal (manual + planilha; integração desenhada)

Primeira da Prioridade 002 (DRE). Migration `20261025000000_erp_faturamento` (ADITIVA; nenhuma tabela nova, portão e RLS iguais;
`migrate diff` vazio). Decisões 123 a 134. Permissões: as que o catálogo já tinha (`faturamento.ver`, `faturamento.lancar`, por
loja); `VERSAO_DO_CATALOGO` continua 1 e o módulo deixou de ser `emBreve`.

1. **O grão e o número** (123, 124). Loja × canal (LOJA, DELIVERY_PROPRIO, IFOOD) × dia civil do Rio; `marcaId` nulo. Valor em centavos
   = venda dos PRODUTOS de pedidos concluídos, já sem o desconto que a casa pagou (sem taxa de entrega cobrada, sem 10 %/gorjeta, sem
   cancelado; iFood: total dos itens menos o incentivo da loja). Pedidos e clientes (atendimentos) são inteiros; clientes em branco
   vale os pedidos. Ticket médio = Σ valor ÷ Σ pedidos do recorte, derivado (a tabela nem tem a coluna).
2. **Uma fonte por grão** (125). Digitado e planilha dividem UMA linha por grão (chave `manual:<loja>:-:<canal>:<dia>`, índice único
   parcial como cinto): redigitar ou reimportar é correção, nunca soma. Integração usa outro espaço de chave; `faturamentoDosGraos`
   (a leitura única, que a 2.2 usa) faz a integração vencer e mostra a digitada como conferência com a diferença.
3. **Lançar o dia** (`faturamento/<loja>/<data>`, pensada para o celular). Um bloco por canal que a loja vende, com faturamento, pedidos,
   clientes, "Não vendeu" (grava 0/0/0) e o ticket ao vivo (só prévia: o servidor lê o TEXTO e refaz tudo; campo forjado é ignorado).
   Em branco continua "sem lançamento" (126). Salvar é tudo ou nada; regravar o mesmo número é "igual" (nenhuma linha, nenhum
   histórico); corrigir é no lugar, condicional ao `atualizadoEm` de cada canal (127): a segunda aba recebe "Fulano lançou o iFood deste
   dia agora: R$ X · N pedidos" e nada é sobrescrito; 10 criações paralelas = 1 linha. Remover (loja ou dia errado) exige motivo de 3 a
   200 letras e deixa o antes no histórico. Data: dd/mm/aaaa ou ISO, até hoje no Rio e até 3 anos para trás (o ano passado vale);
   loja desativada e canal desligado não recebem lançamento novo. "Lançar o dia" (`faturamento/lancar`) pede a loja e a data; com uma
   loja só no acesso, vai direto ao dia de hoje.
4. **Planilha** (128; `faturamento/importar`, modelo em `public/modelos/faturamento.csv`: `data;loja;canal;faturamento;pedidos;clientes`).
   Prévia sem gravar (nova / vai mudar com antes → depois / igual / com erro e o motivo por linha), importar numa transação só com as
   linhas válidas, impressão da prévia conferida lá dentro (mundo mudou = recusa tudo), reimportar = tudo "igual", zero gravação.
   Limites: 256 KB, 5.000 linhas, 20 colunas, 200 letras por campo, 30 s. Célula que começa com `= + - @`, tab ou CR é recusada
   (nunca casa loja ou canal); o eco da célula é cortado em 40 letras, sem controle nem bidi; a prévia mostra no máximo 300 linhas
   (erros e mudanças primeiro) e todas entram.
5. **Mês e faltas** (`faturamento?mes=aaaa-mm`). Visão de uma loja: calendário (grade de 7 colunas a partir de 640 px, lista de dias no
   celular), célula = total do dia e os canais, com a FALTA destacada (filete vermelho de 2 px e a palavra "falta iFood"); falta =
   canal que a loja vende, sem lançamento, do 1º lançamento dela até ontem (hoje é "em aberto", zero lançado não é falta, loja só
   delivery não acusa a Loja). Visão rede (quem tem a rede inteira): soma das lojas do alcance e tabela loja × canal com as faltas;
   o nome da loja abre o calendário dela (`?loja=`, `?rede=1` volta). Totais por canal e do mês (faturamento, pedidos, clientes,
   ticket). Sem comparação com o ano passado (2.2).
6. **Canais da loja** (126). Em Lojas e marcas, "Canais de venda" na linha da loja (só `lojas.gerir`): Loja, Delivery próprio, iFood,
   pelo menos um, antes/depois no histórico; desligar não apaga o que foi lançado.
7. **Período fechado** (132). Toda escrita pega `pg_advisory_xact_lock_shared('erp-faturamento:<parceiro>')` (`periodo-trava.ts`) e
   recusa data dentro de `PeriodoApuracao` FECHADO ("O período X já foi fechado no DRE"). A 2.2, ao fechar, usa `travarParaFechar`
   (a MESMA chave, exclusiva). A 2.1 não cria nem fecha período.
8. **Navegação e ajuda** (134). A área "Faturamento e DRE" (chave `dre`) saiu de `MODULOS_FUTUROS` e virou área com a aba "Faturamento"
   (`faturamento.ver`) e as ações "Lançar o dia" e "Importar faturamento" (`faturamento.lancar`), no cabeçalho e no ⌘K (nenhum
   resultado com R$). `VERSAO_DO_ERP` = fase 2.1. A tela do mês acende a aba em toda rota (`ROTAS_ATIVAS`).
9. **Quem lança e quem vê** (130). Telas = `faturamento.ver` com a loja; gravar, remover e importar = ver E lançar na loja de CADA
   linha. Dono e Gerente têm; Operador não. Loja fora do alcance, de outro parceiro, inexistente, dia futuro ou inválido: 404 igual.
   Quem não tem `faturamento.ver` não recebe nada: nem a área (hub, menu, ⌘K), nem o histórico (133: `verFaturamento` ausente =
   fechado; HTML e payload conferidos).
10. **Contrato da integração** (129, SEM implementação). `<fonte>:<tipo>:<idExterno>` (`chaveDeIntegracao`), `origem = INTEGRACAO`,
    `origemRef = idExterno`, upsert por chave (reenviar atualiza, nunca soma), pedido só CONCLUÍDO e cancelado depois = a mesma
    chave zerada; o worker grava por `doParceiro`, pega a mesma trava e respeita período fechado. Tipo `EntradaDeIntegracao` em
    `faturamento.ts`. Mapear a loja do iFood para `Loja` fica para a fase da integração.

11. **Conferência pós-deploy da migration.** Atenção: enquanto um grão tiver duplicada humana antiga (índice ausente), a
    leitura do mês e da rede SOMA as duas linhas daquele grão (apontado pelo Guardião: 5 + 6 = 11) até alguém remover a
    duplicada. Gravações novas seguem idempotentes pelo único de `chaveIdempotencia`. Os WARNINGs da migration (CHECK que ficou NOT VALID, índice do grão não criado) só
    aparecem no terminal de quem a roda, não no log do auto-deploy. Depois de cada deploy que traga a 2.1:
    `npm run erp:conferir-migracao` (lê `pg_constraint` e `pg_indexes`, que não passam pela RLS; só leitura; sai com código 1 e uma
    frase por pendência, ou 0 com "conferida"). Sem o script: `SELECT conname FROM pg_constraint WHERE NOT convalidated AND
    (conname LIKE 'FaturamentoLancamento\_%' OR conname = 'Loja_canais_ao_menos_um');` e
    `SELECT count(*) FROM pg_indexes WHERE indexname = 'FaturamentoLancamento_grao_humano';` (esperado: zero linhas e 1). Para
    resolver: corrigir a linha antiga e rodar `ALTER TABLE … VALIDATE CONSTRAINT …` (ou o `CREATE UNIQUE INDEX` da migration).

**Ajuda: chaves novas/alteradas.** Novas: `faturamento` (v1, com seções "O que entra no número" e "Falta não é zero"),
`faturamento-lancar` (v1), `faturamento-dia` (v1, seção "Dia de período fechado") e `faturamento-importar` (v1, seção "As colunas do
modelo"); blocos de lançar e remover com `para: ['faturamento.lancar']`. `faturamento-dia` nasce com a caixa recolhida (`recolhida: true`, como nas telas de contar: os campos ficam à vista no celular). Alterada: `lojas` v1 para v2 (faturamento é por loja; os canais
de venda), com `ajuda.lock.json` regravado. Área nova `dre` em `AreaDaAjuda`.

## Provar o faturamento (2.1)

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run   # duas vezes seguidas
npm run build                                                          # "/" continua estático
```
`tests/erp-faturamento.test.ts` (sem banco): formatos brasileiros, valores extremos, data futura/antiga, chaves, planilha (inclusive
fórmula e eco), leitura do grão, mês, faltas, ticket, histórico, modelo CSV. `tests/erp-faturamento.db.test.ts`: o roteiro do gerente
(3 linhas, chaves, histórico na mesma transação), regravar igual, duas abas, 10 criações paralelas, loja fora do alcance/outro
parceiro/id forjado, CHECKs por SQL cru, canal desligado, remover, período FECHADO (e a trava esperando o fechamento), planilha
(prévia, reimportar, vai mudar, erros por linha, mundo mudou), integração plantada vencendo, faltas e ticket, vazamento no histórico.
`tests/erp-faturamento-telas.db.test.ts`: as actions e páginas de verdade (campo forjado, operador, gerente de outra loja, suspenso,
espelho do nível 1, 404, Histórico de perfil sem `faturamento.ver`). `tests/erp-faturamento-migracao.db.test.ts`: a migration com
dado antigo plantado (bom e violando cada CHECK, mais duplicidade humana): contagem preservada, CHECK NOT VALID só onde há violação,
índice ausente com duplicidade.

Migration, em bancos novos como superusuário, dono não-superusuário com RLS e sem RLS (`m21_ff`, `m21_ff_dono`, `m21_ff_semrls`: 2
linhas antigas preservadas, 0 CHECK inválido, índice criado, CHECKs recusam, `migrate diff` vazio) e no `ff_dev`.

Na tela (build de produção local, porta 3100, banco `ff_21` copiado do `ff_dev`; roteiro `prova21/jornada.mjs` no scratchpad, 112
conferências): o gerente da Vila da Penha, no celular, abre o mês (com as faltas), "Lançar o dia" vai direto ao dia de hoje, lança
Loja 4.350,00/62/140, Delivery 1.200,00/30 e iFood "Não vendeu" (3 linhas, histórico CRIOU), corrige o iFood duas vezes (histórico
3.210,00 → 3.120,00), regrava igual ("Nada mudou", nada novo), duas abas (a segunda recebe o conflito com o número e o nome), lança e
remove com motivo, importa um CSV com erro de loja, data futura, negativo, fórmula e linha repetida (as válidas entram), reimporta
(tudo igual, botão desabilitado), uma linha alterada vira "vai mudar" com antes → depois; o total e o ticket do mês batem com a
soma do banco; a loja de delivery e o dia futuro são 404; operador sem acesso em hub, menu, ⌘K e URL; Hugo (`historico.ver` sem
`faturamento.ver`) não recebe nada no HTML; a dona vê a rede, a unidade só delivery sem falta de salão, escolhe a loja, edita canais e
vê o faturamento no Histórico; o nível 1 lança pelo espelho e a loja de outro parceiro é 404. Axe (wcag2a/2aa) sem violação nos dois
temas, zero erro de console, zero rolagem horizontal a 390, 820 e 1440. Prints em `shots-2.1/`.

## O que a 2.2a entregou — DRE ao vivo (plano de contas, despesas por competência, contas a pagar, regra do período)

Segunda da Prioridade 002, primeira metade da 2.2 (a divisão foi aprovada pelo Maestro: 2.2a = o DRE que já funciona no meio do mês;
2.2b = metas, comparação e fechamento). Migration `20261026000000_erp_dre_despesas` (ADITIVA; uma tabela nova, `RegraDoPeriodo`, com
portão e RLS iguais às outras; `migrate diff` vazio). Decisões 135 a 148. Permissões: o catálogo não ganhou nada (`dre.ver`,
`despesas.lancar` por loja; `metas.editar` passou a exigir a rede inteira); `VERSAO_DO_CATALOGO` continua 1.

1. **Plano de contas padrão, editável por parceiro** (135, 136). Vive em código (`PLANO_PADRAO`, cada linha com `codigo` estável:
   `aluguel`, `salarios`, `energia`…). O parceiro o grava na primeira escrita (`garantirPlano`, idempotente sob trava); antes disso a
   leitura é virtual (sem `id`, nada gravado). Pode renomear, ocultar e criar linha em grupo de despesa; nunca apagar. Linha oculta sai
   do formulário e continua no DRE dos períodos em que tem valor. Linhas calculadas (receita por canal, taxas do iFood, subtotais, CMV,
   margem, resultados) são do sistema. Tela `dre/plano`, só `metas.editar` com a rede inteira.
2. **Despesa por competência** (137, 138). Um dia, um mês ou um intervalo de até 366 dias; valor da despesa INTEIRA em centavos. O
   DRE apropria dia a dia por arredondamento ACUMULADO: a parte até o dia k de D é `round(V·k/D)`; a soma fecha o valor ao centavo e
   o erro de qualquer fatia é menor que 1 centavo, qualquer que seja o corte dos outros períodos (aluguel de R$ 6.000,00 em outubro, até
   ontem 16/31 = R$ 3.096,77). Loja ou rede, nunca rateio. Lançar tem `envio` aleatório (duplo clique = uma despesa, "já lançada");
   editar e remover são condicionais ao `atualizadoEm` (duas abas: a segunda recebe o conflito). Remover exige motivo. Despesa em
   período FECHADO é recusada pela trava compartilhada da 2.1 (`travarParaEscrever`).
3. **Recorrentes** (139). "Repete todo mês" vale só para mês inteiro; cada mês é uma despesa própria encadeada (`repeteDeId`,
   único por parceiro). "Lançar as do mês passado" mostra o valor de cada uma para conferir, cria só as que faltam (idempotente:
   repetir não oferece nada) e respeita o alcance (gerente de uma loja só vê e lança as da loja dele). "Não repete mais" para a cadeia.
4. **Contas a pagar mínimas** (140). `vencimento` e `pagaEm` opcionais; filtro "A pagar" por ordem de vencimento, com vencidas e
   "vencem em até 7 dias". Pagar não muda o DRE (é caixa, e o DRE é competência).
5. **Regra do período, fonte única** (141, 142). `RegraDoPeriodo` (mensal, quinzenal ou semanal, com o dia em que começa, versionada por
   `vigenteDesde`). O DRE e a contagem de estoque (1.7) leem pelo MESMO módulo, `periodos.ts` (`periodoDe`, `periodoAnteriorDe`,
   `registrarPeriodo`); `ParceiroFlow.periodoTipo/periodoDiaInicio` ficaram sem uso (a migration copiou o valor antigo para a primeira
   regra) e `PERSONALIZADO` deixou de existir na tela. Regra nova nunca é retroativa: vale do dia seguinte ao fim do período de agora;
   o primeiro período novo nasce cortado no começo; uma regra futura pendente pode ser trocada ou cancelada. Um gatilho no banco
   (`PeriodoApuracao_sem_sobreposicao`) recusa dois períodos que se sobrepõem na mesma loja/parceiro. Tela `dre/periodos`.
6. **O DRE** (143 a 146). Rede × loja, no período escolhido, em reais e em % da receita bruta (%, em pontos-base). Receita por canal
   (a leitura única da 2.1) → deduções (taxas do iFood ESTIMADAS: faturamento do iFood × (comissão + pagamento online), um
   arredondamento por loja, rede = soma) → receita líquida → CMV ("Em breve", sem número) → variáveis → margem → pessoal,
   ocupação, utilidades, administrativas, marketing, outras → resultado operacional → financeiras → resultado. Tudo que depende do CMV
   diz "sem contar o CMV"; zero é "—", nunca "R$ 0,00"; sem faturamento a receita é "—". Período em curso é PARCIAL, dia a dia até
   ontem, sem projeção ("dia 17 de 31"); faturamento faltando aparece como "Incompleto" e a despesa recorrente que falta, como "Falta
   lançar". A tabela "Por loja" mostra o resultado de cada loja ANTES das despesas da rede e a linha da rede com elas.
7. **Quem vê o quê** (147). Despesas e DRE: `dre.ver` (ver despesas = `dre.ver` OU `despesas.lancar`). Despesa da rede só a quem tem a
   rede inteira; o gerente de uma loja nunca recebe despesa, linha nem total da rede, nem pela URL (`?rede=1` e `?loja=` só escolhem
   dentro do alcance). Plano e regra do período: `metas.editar` exigindo a rede inteira. Histórico: `verDre` (ausente = fechado) tira
   despesa, plano e regra da consulta; quem não tem `dre.ver` não recebe nada nem pelo filtro da URL nem no HTML. O ⌘K só mostra o que
   a pessoa abre.
8. **Navegação** (148). A área "Faturamento e DRE" ganhou o grupo "Resultado" (Despesas, DRE, Períodos, Plano de contas) ao lado de
   "Faturamento"; ação nova "Lançar despesa" no cabeçalho e no ⌘K; `VERSAO_DO_ERP = 'Barney ERP · fase 2.2a'`. A limpeza de texto
   (`limparTexto`) saiu de `pedido-campos` para `texto-limpo.ts` (puro, sem Node) porque o formulário roda no navegador.
9. **Migration** (aditiva, robusta a dado antigo, segura para superusuário e dono não-superusuário com e sem FORCE RLS). Colunas novas
   (`DreLinha.codigo/atualizadoEm`, `Despesa.competenciaFim/recorrente/repeteDeId/vencimento/pagaEm/atualizadoPorNome`), valores novos de
   `DreGrupo` (UTILIDADES, RESULTADO), CHECKs `NOT VALID` + `VALIDATE` que avisa e segue (valor 1..R$ 10 mi, competência ≥ 2020 e
   ≤ 365 dias, textos curtos, recorrente de mês inteiro, linha calculada tem código, regra: dia na faixa e sem PERSONALIZADO),
   `RegraDoPeriodo` (só inclusão por gatilho, `parceiroId` imutável) com a regra antiga copiada ANTES de ligar a RLS, RLS condicional
   que se recusa a seguir se as tabelas antigas têm RLS e a nova não puder ter, e o gatilho anti-sobreposição. Nenhum passo lê tabela de
   tenant sob RLS. O passo verificável pós-deploy é `npm run erp:conferir-migracao` (agora com os CHECKs da 2.2a, só quando a tabela
   `RegraDoPeriodo` existe).
10. **Fora desta subfase (vai para a 2.2b)**: metas com vigência e realizado × meta, comparação com o ano passado, fechar período com
    fotografia, reabrir, notas e fechamento de estoque obedecendo período fechado, faróis, CMV (2.3).

**Ajuda: chaves novas/alteradas.** Novas: `dre` (v2, nasce recolhida: é a tela da reunião), `dre-despesas`, `dre-despesa`, `dre-despesa-nova` (serve a
lançar e a editar), `dre-periodos`, `dre-plano` (as demais, v1). Alteradas: `faturamento-dia` v1 para v2 (a seção "Dia de período fechado" diz onde
se define o período) e `periodo` (estoque) v1 para v2 (o período é o mesmo do DRE, definido em Períodos), com `ajuda.lock.json`
regravado (46 entradas). Toda rota nova tem entrada.

## Provar o DRE (2.2a)

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # duas vezes seguidas
npm run build                                                          # "/" continua estático
npm run erp:conferir-migracao                                           # CHECKs validados e índice do grão
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-dre.test.ts` (sem banco, 42): apropriação exata ao centavo (soma fecha, fatias independentes do corte, ano bissexto,
intervalo de 366 dias), competência (dia, mês, intervalo, limites), períodos semanal/quinzenal/mensal com dia de início, troca de regra
(vigência, primeiro período cortado, regra futura trocada ou cancelada), plano padrão, `montarDre` (taxa do iFood, CMV, "sem contar",
zero, percentuais). `tests/erp-dre.db.test.ts` (30): lançar, duplo envio, corrida, duas abas, editar/remover/pagar, recorrentes
(idempotência e alcance), plano (renomear, ocultar, criar, parceiro virgem), regra do período e gatilho de sobreposição, período
FECHADO recusado e a trava esperando o fechamento, isolamento entre parceiros, gerente de uma loja sem despesa da rede, vazamento no
Histórico. `tests/erp-dre-telas.db.test.ts` (11): actions e páginas de verdade (404, acesso, HTML do DRE sem dado alheio, Histórico de
perfil sem `dre.ver`). `tests/erp-dre-migracao.db.test.ts` (7): a migration com dado antigo nos 3 perfis do banco.

Migration provada em banco novo como superusuário, dono não-superusuário com RLS e sem RLS (dado antigo preservado, regra copiada,
CHECKs só `NOT VALID` onde há violação, gatilhos presentes), e no `ff_dev`.

Na tela (build de produção local, porta 3100, banco `ff_22a` copiado do `ff_dev`; roteiro `prova22a/jornada.mjs` no scratchpad, 92
conferências): a dona lança aluguel (R$ 6.000,00, repete), salário (R$ 9.500,00) e luz (R$ 1.240,50, vence em 8 dias, com duplo clique =
uma despesa) e o DRE do meio do mês (dia 17, até ontem) mostra a receita bruta igual à soma do banco, taxa do iFood estimada, CMV
"Em breve", resultado "sem contar o CMV" e as despesas apropriadas ao centavo (3.096,77 · 4.903,23 · 640,26) — conta refeita em
BigInt dentro do roteiro; o DRE da loja traz o aluguel dela e a receita dela; "Lançar as do mês passado" cria contador (rede) e
internet (loja) com o valor conferido e, repetido, não oferece nada; a luz entra em "A pagar" e sai ao ser paga sem mexer no DRE; renomear
Energia, ocultar Condomínio e criar "Seguro do ponto" refletem no formulário e no DRE; trocar a regra para quinzenal grava a vigência no
dia 01/11 e outubro não muda; setembro aparece encerrado. O gerente da Vila da Penha, no celular, vê só o DRE e as despesas da loja
(`?rede=1` e a loja de fora não dão nada), não tem "Rede" no formulário, lança uma despesa da loja, não abre plano nem Histórico (que
exige a rede inteira); o operador não vê nada em menu, ⌘K, URL nem HTML; Hugo (`historico.ver` sem `dre.ver`) não recebe despesa,
plano nem regra no HTML, nem pelo filtro da URL; o nível 1 vê o DRE, as despesas e o plano do parceiro e a loja de outro parceiro não abre.
Axe (wcag2a/2aa) sem violação nos dois temas, zero erro de console, zero rolagem horizontal a 390, 820 e 1440. Prints em
`shots-2.2a/`. Scanner `avoid-ai-design`: 0 P0 e 0 P1 (3 P2 de "meta strings com ponto médio", já existentes no padrão da casa).

## O que a 2.2b entregou — metas, comparação com o ano passado e fechamento do período

Segunda metade da 2.2. Migration `20261027000000_erp_dre_fechamento` (ADITIVA; duas tabelas novas, `DreFotografia` e `DreFotografiaLinha`,
colunas novas em `DreMeta` e `PeriodoApuracao`, gatilhos, RLS condicional; `migrate diff` vazio). Decisões 149 a 159 (158 e 159 vieram da revisão de UX e do Guardião). Permissões: o
catálogo não ganhou nada (`dre.ver`, `metas.editar` com a rede inteira; reabrir exige `alcance.nivel === 'FLOWFOODS'`, que é do
portal do Rodolfo, não do parceiro); `VERSAO_DO_CATALOGO` continua 1.

1. **Metas por linha, com vigência** (149). Tela "Plano e metas" (`dre/plano`): cada linha do DRE aceita uma meta em % da receita bruta,
   de 0 a 100,00 (inteiro em pontos-base, `lerPontosBase`); vazio é "sem meta" e GRAVA uma linha (`semMeta`) para que a ausência também
   tenha vigência e histórico. A meta vale a partir do começo do período em curso (`vigenteDesde`): os períodos anteriores seguem com a
   meta que valia neles; a meta efetiva de um período é a última com `vigenteDesde` menor ou igual ao começo dele. A receita não tem
   meta (é a base do percentual). Salvar é "tudo ou nada" sob a trava `erp-metas:<parceiro>`; o que não mudou não grava nem entra no
   Histórico; duas abas: a segunda recebe o conflito pela `versao`. Meta por canal, por loja e em reais ficam para a 2.4.
2. **Realizado × meta no DRE** (150). Colunas Meta, Meta em R$ e Desvio; o desvio é em pontos percentuais, o realizado menos a meta, e
   a palavra vem do `sentido` da linha (maior é melhor ou menor é melhor): "melhor que a meta", "pior que a meta" ou "na meta" quando
   a diferença é menor que 5 pontos-base (0,05 pp). Sem cor, sem farol: só texto. A meta é do parceiro (em % da receita bruta) e também
   mede o DRE de cada loja, em % da receita da loja, com o desvio sob o nome da linha; linha sem meta fica sem comparação, não inventa
   uma.
3. **Receita contra o ano passado** (151). Só a receita (bruta e por canal), nas MESMAS datas um ano antes (29/02 vira 28/02), com a
   cobertura dita ("N de M dias com lançamento"); sem lançamento nenhum vira uma frase, não uma coluna de traços. No celular a variação
   desce para baixo do nome da linha. Variação em pontos-base de 1 casa.
4. **Fechar o período** (152). Página `dre/periodos/<inicio>`. Condições DURAS (travam; não existe campo para passar por cima): o
   período ainda não terminou, faturamento faltando (lojas, canais e dias sem lançamento nem "Não vendeu"), houve venda no iFood e a
   taxa do iFood não está configurada, contagem de FECHAMENTO do estoque em andamento, rede sem nenhum lançamento de faturamento no
   período. RESSALVAS (confirmáveis: marcar uma a uma e escrever UMA justificativa de 10 a 300 letras): despesa recorrente que não
   foi lançada no mês, fechamento de estoque de uma loja que concluiu a contagem e não o aplicou antes de o DRE fechar, e loja ativa
   que já existia e não tem faturamento nenhum no período (numa rede que tem lançamento). A tela leva uma impressão (hash) das condições
   que a pessoa viu e o servidor confere de novo dentro da transação de fechar: se algo mudou, não fecha e manda reler. O DRE fechado
   diz "Fechado com ressalvas" para sempre.
5. **A fotografia** (153). Ao fechar, o servidor pega `travarParaFechar` e lê pela MESMA `entradaDoDre` que alimenta o DRE ao vivo (uma
   leitura só; `montarDre` é puro), e grava `DreFotografia` + `DreFotografiaLinha` com valores em `BigInt`, a `entrada` de onde saíram, a
   taxa do iFood, o plano, as metas e as ressalvas daquele momento. O DRE de um período fechado lê SÓ a fotografia vigente (filtrada
   pelo alcance de quem lê) e é idêntico ao ao-vivo de quando fechou; mudar plano, taxa ou meta depois não mexe nele. No banco:
   gatilhos recusam UPDATE/DELETE em fotografia e linha (só se fecha a versão anterior ao reabrir), índice parcial garante UMA vigente
   por período, `NULLS NOT DISTINCT` na unicidade por versão, e um gatilho adiado impede um período FECHADO sem fotografia vigente (o
   SQL na mão que marcar FECHADO sem fotografia falha no commit). Revisão (Guardião): um gatilho `BEFORE INSERT` só deixa nascer fotografia
   com o período ABERTO, na versão seguinte à última e vigente (o ataque "marcar a vigente como substituída e inserir uma v999 vigente"
   deixando o período FECHADO falha na hora, como `erp_tenant` e como dono), `BEFORE TRUNCATE` recusa esvaziar as duas tabelas, e um gatilho
   ADIADO recusa no commit período ABERTO com fotografia vigente (o UPDATE solto FECHADO → ABERTO sem marcar a fotografia como substituída; a
   função relê o status de agora, porque o evento adiado traz a linha como era). Fechar e reabrir pelo sistema passam. A ordem
   legítima é a do fechamento: fotografia com o período ABERTO e só depois FECHADO, na mesma transação.
6. **Reabrir** (154). Só o nível 1 (a FlowFoods), na página do período do portal do Rodolfo, com motivo de 3 a 200 letras. A fotografia
   vigente vira "substituída" (nunca some), o período volta a ABERTO e o Histórico guarda antes e depois. Fechar de novo gera a
   versão 2; a lista "Versões" mostra todas. O dono do parceiro vê a frase "só a FlowFoods reabre" e não recebe formulário nem
   action (a action de reabrir só existe no espelho do nível 1). Período FECHADO de antes da fotografia: o nível 1 também vê o formulário
   (com a explicação de que reabrir e fechar de novo grava a primeira fotografia).
7. **Notas de compra e fechamento de estoque obedecem o fechamento** (155). Lançar, editar e cancelar nota (`compras.ts`) e iniciar e
   concluir contagem de FECHAMENTO (`contagem.ts`) pegam `travarParaEscrever` e recusam período FECHADO com a mesma frase da despesa.
   **Ordem das travas, a mesma em todo lugar**: chave do período (`erp-faturamento:<parceiro>`, compartilhada na escrita e exclusiva
   no fechar) → loja/aberturas → períodos (`erp-periodos`). Cada teste de corrida da 2.2b falha se a trava for tirada (verificado
   tirando a trava e vendo o teste cair).
8. **Recorrente que sobrevive** (156). A cadeia de recorrentes era cortada por mês pulado; agora `recorrentesEmFalta` olha o ÚLTIMO elo
   numa janela de 12 meses e `faltaLancar` desduplica pela origem: a internet de agosto ainda aparece como falta em setembro e em
   outubro até ser lançada ou parar de repetir. A loja que nunca lançou nada entra como ressalva de fechamento, não como bloqueio (ver 4).
9. **Navegação, ajuda, histórico** (157). A aba "Plano de contas" virou "Plano e metas"; a página do período entra no mesmo grupo
   "Resultado"; `VERSAO_DO_ERP = 'Barney ERP · fase 2.2b'`. O Histórico ganha FECHOU e REABRIU (período e fotografia) e a meta
   (`DreMeta`), todos atrás de `verDre`: quem não tem `dre.ver` não recebe nada, nem pelo filtro da URL nem no HTML.
10. **Migration** (aditiva, segura para superusuário e para dono não-superusuário com e sem FORCE RLS). Colunas novas, CHECKs `NOT VALID`
    + `VALIDATE` que avisa e segue (meta 0..10000 pontos-base, `semMeta` só com percentual zero, textos curtos, versão positiva, datas e taxa na faixa), tabelas novas com
    CHECKs, FKs, índices, os gatilhos de imutabilidade (fotografia, linha, período fechado) e de `parceiroId`, os dois gatilhos adiados e a RLS condicional das duas tabelas novas
    (grants mínimos; recusa seguir se as tabelas antigas têm RLS e as novas não puderem ter). Nenhum passo depende de SELECT sob RLS.
    O passo verificável pós-deploy continua sendo `npm run erp:conferir-migracao` (agora com os CHECKs e os gatilhos da 2.2b).
11. **Aviso único de período fechado** (revisão de UX, decisão 158; o aviso que nasce depois de digitar rola para a vista, acima da barra fixa de salvar: ele MEDE a barra real (`data-barra-fixa`, que toda barra `sticky bottom-0` declara, com teste de guarda) em vez de usar margem chumbada; ao editar uma nota de período fechado o aviso vem no topo. Medido em 360, 375, 390, 414, 820 e 1440, nos dois temas, em despesa nova/editar, recorrentes, nota nova/editar/detalhe e faturamento: link inteiro na tela e o toque acerta o link). Um componente só (`AvisoDoPeriodoFechado`) para faturamento (dia),
    despesa (avulsa, editar, detalhe), recorrentes do mês passado, nota (lançar, editar, detalhe) e estoque: diz o período, o que não dá,
    a saída ("Para mexer em <período>, peça à FlowFoods para reabrir o período"), a alternativa de quem lança (nota: "ou lance com a data de
    hoje, se a compra entrou agora"; despesa: "ou lance com competência em <período em aberto>") e leva a Períodos (sem link para quem não
    abre Períodos). A frase do servidor (`fraseDoPeriodoFechado`, em `periodo-fechado-campos.ts`) também traz a saída, então importação e
    qualquer recusa em texto puro dizem o que fazer. A tela AVISA ANTES: a data da nota e a competência da despesa digitadas já acendem o
    aviso (os períodos fechados vêm de `avisoDePeriodos`, só nome e datas); as recorrentes de um mês fechado não aparecem como lista
    editável; o dia de faturamento fechado avisa no topo. O servidor segue sendo quem decide.
12. **Metas no celular**: grupos recolhidos (abrem sob demanda, de tablet para cima aparecem sempre), "Salvar as metas" fixo embaixo, linha filha
    sem meta própria diz "meta no grupo <Grupo>" em cinza quando o grupo tem meta; o ano passado leva a variação sob o nome da linha (nenhuma
    coluna cortada). A cobertura parcial do ano passado já dizia "N de M dias com lançamento" (testado: "12 de 15 dias").
13. **Fora desta subfase**: CMV e custo real (2.3), metas por canal, por loja e em reais, farol por faixa (2.4), despesa importada,
    reabrir pelo dono (depende do Rodolfo).

**Ajuda: chaves novas/alteradas.** Nova: `dre-periodo` (v1, a página de fechar e reabrir). Alteradas, com `ajuda.lock.json` regravado
(47 entradas): `dre` v2 para v3 (meta, desvio e ano passado), `dre-plano` v1 para v2 (agora também define as metas), `dre-periodos` v1 para
v2 (período fechado e a página de cada um), `periodo` (estoque) v2 para v3 (fechamento de estoque recusa período fechado), `compra` v1
para v2 e `compra-nova` v1 para v2 (a nota em período fechado é recusada), `faturamento-dia` v2 para v4 (a saída: peça à FlowFoods).

## Provar o fechamento (2.2b)

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # duas vezes seguidas
npm run build
npm run erp:conferir-migracao                                           # CHECKs e gatilhos da 2.2a e da 2.2b
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
Os arquivos de banco que a 2.2b mexe também rodam num banco com dono NÃO-superusuário e FORCE RLS (um de cada vez, em sequência:
`npx vitest run --no-file-parallelism`; os 3 arquivos de migração criam bancos e exigem superusuário, e já provam os 3 perfis por dentro).
`tests/erp-dre-metas.test.ts` (sem banco, 43): leitura da meta (vírgula, ponto, 0 a 100,00, vazio, lixo), "na meta" abaixo de 5 pontos-base
e a palavra por `sentido`, ano passado (29/02, cobertura, sem lançamento), impressão das condições. `tests/erp-dre-fechamento.db.test.ts`
(53): metas (vigência, sem meta como linha, conflito, histórico, alcance), condições duras e ressalvas, fotografia igual ao ao-vivo,
imutabilidade (UPDATE/DELETE e SQL na mão recusados), período FECHADO sem fotografia recusado no commit, reabrir (só nível 1, motivo,
versão 2), notas e estoque recusados no período fechado, recorrente que sobrevive, vazamento (sem `dre.ver` nada; gerente de loja nada
da rede) e as corridas (fechar × despesa, fechar × nota, fechar × faturamento, fechar × concluir contagem, duas pessoas fechando), mais o
teste DETERMINÍSTICO da trava: uma transação segura `travarParaEscrever`, `fecharPeriodo` (e depois `reabrirPeriodo`) roda em paralelo e
NÃO termina em 900 ms, a despesa gravada na transação tem de estar na fotografia; sem a linha `await travarParaFechar(tx)` de
`fecharPeriodo` (ou a de `reabrirPeriodo`) o teste cai, verificado comentando cada uma. Também o ataque da v999 por SQL cru como `erp_tenant`
e o TRUNCATE.
`tests/erp-dre-fechamento-migracao.db.test.ts` (7): a migration com dado antigo nos 3 perfis do banco. `tests/erp-dre-fechamento-telas.db.test.ts`
(11): actions e páginas de verdade (reabrir inexistente no espelho do parceiro, 404, HTML sem dado alheio; o aviso de período fechado nas
recorrentes de setembro e no dia de faturamento; o período fechado de antes da fotografia). `tests/erp-periodo-fechado.test.ts` (7, sem
banco): a frase, a leitura de volta, o componente e os formulários da nota e da despesa avisando antes de enviar.
`tests/erp-dre-metas-tela.test.ts` (3, sem banco): a tabela de metas por grupo no celular.

Na tela (build de produção local, porta 3100, banco `ff_22b_prova` copiado do `ff_dev`; roteiro `prova22b/jornada.mjs` no scratchpad, 69
conferências, com a revisão de UX): a dona abre "Plano e metas", tenta 101 % (recusado, nada gravado), grava 25,5 % de pessoal e deixa marketing sem meta
(linha `semMeta` gravada); o DRE de outubro mostra Meta, Meta em R$, Desvio e a receita contra o ano passado; ao tentar fechar setembro vê a
condição dura (um dia de iFood sem lançamento), lança o dia 12 pelo formulário do dia, volta e vê as duas ressalvas (contador da rede e
internet da loja); fechar sem marcar não fecha, justificativa de 5 letras é recusada sem gravar, com as duas marcadas e a justificativa
fecha ("Fechado com ressalvas", versão 1, uma fotografia); no período fechado, despesa avulsa, recorrentes, dia de faturamento (só
consulta, sem botão) e nota de compra são recusados e não criam nenhuma linha; o dono não tem formulário de reabrir. O nível 1 reabre: motivo
de 2 letras recusado, motivo válido reabre; a dona lança as 2 recorrentes e fecha sem ressalva (versão 2, versão 1 guardada em
"Versões"). O gerente da Vila da Penha, a 390 px, vê só a loja dele (sem página do período nem plano); o operador não vê nada; Hugo
(`historico.ver` sem `dre.ver`) não vê fechamento nem meta no Histórico. Na revisão: o aviso de período fechado aparece antes de enviar (despesa, nota) e nas recorrentes e no dia de faturamento, com a saída e o link, e as
recusas não criam linha; no celular o ano passado não corta coluna (dona e gerente) e a tabela de metas abre por grupo com "Salvar as metas" fixo.
Axe (wcag2a/2aa) sem violação nos dois temas, zero erro de
console, zero rolagem horizontal a 390, 820 e 1440. Prints em `shots-2.2b/`. Scanner `avoid-ai-design`: 0 P0 e 0 P1 (1 P2 de "meta
strings com ponto médio", o padrão da casa).

## O que a 2.3 entregou — dois CMVs: o de compra (dia a dia) e o real (fecha na contagem), e a comparação no fechamento

Terceira da Prioridade 002. Migration `20261028000000_erp_cmv` (ADITIVA; uma coluna, `Contagem.itensSemPreco`, e um CHECK; nenhuma tabela nova, portão e
RLS iguais; `migrate diff` vazio). Decisões 160 a 171. O CMV em si é DERIVADO (notas + livro + retrato do fechamento de estoque); a fotografia usa
`versaoDaConta` e a `chave` livre das linhas, que já existiam. Permissões: o catálogo não ganhou nada (`dre.ver` já é "Ver DRE e CMV");
`VERSAO_DO_ERP` = fase 2.3.

1. **CMV de compra** (160). Σ (valor + frete rateado) dos itens das notas LANÇADAS da loja, pela data da nota (`entradaEm`), no recorte do DRE (até ontem
   no período em curso). Vale sem estoque aberto. Rede = soma das lojas do alcance.
2. **CMV real** (161). Estoque inicial + compras do livro (`ENTRADA_COMPRA` das notas do período, pela data da nota) − estoque final. Só com o período
   encerrado e os dois estoques apurados. Período em curso nunca tem real. Sem o real, o motivo vem escrito ("falta o fechamento de estoque de setembro
   de 2026 (estoque inicial)", "o estoque abriu em 15/10; o real começa em novembro de 2026", "estoque não aberto", "fecha na contagem de fechamento
   (abre em 29/10)").
3. **O corte do estoque final** (162, a pergunta aberta da 1.7). EF(P) = retrato do fechamento de P + Σ movimentos depois do retrato com competência até o
   fim de P − Σ movimentos até o retrato com competência depois do fim, fora os ajustes do próprio fechamento. Competência = data da nota (compra e
   estorno) ou dia do Rio do `ocorridoEm`. Somado no banco numa consulta só (`cmv.ts`). Provado com mutantes: sem a exclusão dos ajustes do próprio
   fechamento e sem a trava exclusiva do fechamento os testes caem.
4. **Estoque inicial** (163) = EF do período anterior, pela mesma regra, nunca reavaliado; no primeiro período, a abertura concluída no primeiro dia. O real
   de períodos seguidos encadeia (teste para N períodos, e com dado: R$ 20.300,00 + R$ 23.950,00 = R$ 44.250,00).
5. **Valoração e itens sem preço** (164). `Contagem.itensSemPreco` é gravada no mesmo UPDATE que fecha a abertura e o fechamento; a tela diz "estoque final
   sem o valor de N insumos sem preço", e "não registrado" para a contagem de antes da 2.3. Aparece no painel e nas telas do fechamento do estoque.
6. **O que entra no resultado** (165, 171). O CMV que vale é SUBTRAÍDO da receita líquida na margem de contribuição e dali segue para os resultados (cenário: VP R$ 120.000,00 − R$ 23.950,00 = R$ 96.050,00; rede R$ 160.000,00 − R$ 27.950,00 = R$ 132.050,00 e, com a despesa da rede, R$ 131.050,00). Por loja: real, senão compra com o selo, senão nulo com a frase (nunca R$ 0,00; resultados "sem contar o CMV"). A
   rede soma o que vale em cada loja e o selo diz as fontes ("misto: real em …; pelas compras em …; sem o CMV de …"), em até 120 letras (CHECK da
   fotografia); o aviso dos resultados diz QUAIS lojas ficaram sem CMV ("sem contar o CMV de Centro"). A linha `cmv` tem abaixo as de detalhe `cmv:compra` e `cmv:real` (tipo `linha`, fora do plano, sem meta, fora do formulário de metas).
7. **Compra × real** (166), painel dentro da página do DRE (nenhuma rota nova), só no período encerrado: por loja com o real, a diferença em R$ e em pontos
   da receita, "o estoque subiu R$ X (de A para B): comprou mais do que consumiu, é dinheiro parado na prateleira", e as notas que já estavam na contagem de
   abertura; a soma das lojas comparadas; quem ficou só pelas compras, com o motivo; "Ver as notas" só com `compras.ver` e "Ver o estoque" só com `estoque.ver`.
8. **Fotografia v2** (167). Fechar grava `versaoDaConta = 2`, as linhas do CMV de cada escopo e `entrada.cmv` por loja (compra, real, inicial, final, compras
   do real, instante do retrato, ids, motivo, sem preço). O fechado lê só a fotografia; o painel dele extrai do JSON apenas as lojas que a pessoa alcança. A
   v1, de antes do CMV, mostra "não apurado neste fechamento (fechado antes do CMV)" e nunca é recalculada: reabrir (só nível 1) e fechar de novo gera a v2.
   O Histórico do FECHOU ganha "CMV: R$ X (real|compras|misto)", atrás de `verDre`.
9. **Meta** (168). A linha `cmv` compara com o que vale; sem valor, "sem valor apurado".
10. **Vazamento** (169). Sem `dre.ver` nada de CMV; gerente de uma loja só recebe a loja dele (`?rede=1` e `?loja=<outra>` não trazem nada, o HTML não leva a base
    da conta); o operador não vê nada (menu, ⌘K, URL).
11. **Migration** (aditiva, segura para superusuário e dono não-superusuário com e sem FORCE RLS): coluna nova e CHECK `NOT VALID` + `VALIDATE` que avisa e
    segue; nenhum passo lê tabela de tenant sob RLS. `npm run erp:conferir-migracao` passou a olhar o CHECK.
12. **Fora desta subfase** (170): transferência entre lojas, CMV teórico, CMV por canal ou marca, PEPS/médio, desconto e bonificação, tipo "limpeza", perda à mão.

**Ajuda: chaves novas/alteradas.** Nenhuma nova (nenhuma rota nova). Alteradas, com `ajuda.lock.json` regravado: `dre` v3 para v5 (o CMV, o desconto na margem e a seção "Os dois CMVs: compra e real"), `dre-plano` v2 para v3 (a meta do CMV), `dre-periodo` v1 para v2 (a fotografia leva o CMV, e a v1 antiga), `periodo` (estoque) v3 para v4 (o valor do fechamento é a base do real; contar depois do fim não estraga), `compra-nova` v2 para v3 (a data da nota decide o período do CMV; limpeza e pagamento a fornecedor não são nota nem despesa duplicada).

## Provar o CMV (2.3)

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # duas vezes seguidas
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
Os arquivos de banco que a 2.3 mexe também rodam num banco com dono NÃO-superusuário e FORCE RLS, em sequência (`npx vitest run --no-file-parallelism`).
`tests/erp-cmv.test.ts` (sem banco, 32; inclui o CMV abatido na margem e nos resultados): o corte, o real, o encadeamento (200 sorteios), o que vale, o selo (inclusive o comprido), compra × real, o
sem preço, a fotografia de ida e volta. `tests/erp-cmv.db.test.ts` (20; inclui a data da nota trocada de mês nos dois sentidos, com e sem mudança de valor, contra o consumo de verdade, e o gerente de duas lojas): o cenário da análise (Casa Alfa: Vila da Penha, Delivery, Centro; setembro e
outubro) com os critérios 1 a 15: R$ 20.000,00 parcial; estoque final de setembro R$ 11.700,00 e de outubro R$ 13.550,00; real R$ 23.950,00 contra
compra R$ 25.800,00 (−R$ 1.850,00); rede "misto" R$ 27.950,00 com a soma do "Por loja" mais a despesa da rede igual ao resultado; nota tardia (o real não
muda); cíclica tardia; setembro com a nota na abertura (R$ 20.300,00); sem fechamento; estoque que abre no meio; itens sem preço pelo fluxo de verdade;
fechar com a fotografia v2 igual ao ao vivo; v1 e a v2 por reabrir; a corrida fechar × nota (espera a trava); e as consultas constantes (1 ou 50 lojas).
`tests/erp-cmv-telas.db.test.ts` (5): o HTML da dona, do gerente (também por `?rede=1` e `?loja=`), do operador, de quem não tem compras e estoque, e o
Histórico. `tests/erp-cmv-migracao.db.test.ts` (3): a migration com dado antigo nos 3 perfis do banco. Apoio do cenário: `tests/erp-cmv-apoio.ts`.

Na tela (build de produção local, porta 3100, banco `ff_23` copiado do `ff_dev`; roteiro `prova23/jornada.mjs` no scratchpad, 74 conferências, com a margem conferida como receita líquida menos CMV, o painel medido sem corte a 768, 820, 1024, 1280 e 1440 e a conta de fechamento aplicada sem "abaixo do piso"): a dona abre
outubro (em curso: "pelas compras · parcial", o real diz que abre em 29/10, "sem o CMV de Centro" na rede); setembro encerrado (painel compra × real (cartões abaixo de 1280 px) com
as duas lojas, a soma, a frase, "não registrado", insumos sem preço e quem ficou só pelas compras); fecha setembro com as duas ressalvas (fotografia v2 com
as 15 linhas do CMV e R$ 63.500,00 de real na Vila da Penha) e lê o fechado igual ao ao vivo; o gerente da Vila da Penha, a 390 px, só vê a loja dele (e nada
da base da conta no HTML, também por `?rede=1` e pela URL de outra loja); o operador volta ao hub sem CMV, fora do menu e do ⌘K; Hugo (`historico.ver` sem
`dre.ver`) não vê o fechamento nem o CMV no Histórico, e a dona vê "CMV … (misto)"; o nível 1 vê o mesmo painel pelo espelho; a contagem de fechamento do
estoque diz os insumos sem preço. Axe (wcag2a/2aa) sem violação nos dois temas, zero erro de console, zero rolagem horizontal a 390, 820 e 1440. Prints em
`shots-2.3/`. Scanner `avoid-ai-design`: 0 P0 e 0 P1 (P2 de "meta strings com ponto médio", o padrão da casa).

## O que a 2.4 entregou — farol por canal, em 5 faixas

Quarta da Prioridade 002. **Nenhuma migration** (`DreMeta` já guarda a meta de crescimento, `entrada` da fotografia é Json, `versaoDaConta` já aceita 3, `FarolFaixa` fica vazia e sem uso; `migrate diff` vazio).
Decisões 172 a 181. Permissões: o catálogo não ganhou nada (`dre.ver`); `VERSAO_DO_ERP` = fase 2.4.

**Como "por canal em todas as linhas com meta" foi interpretado, e por quê (desvio consciente da letra do plano; o Maestro registra na seção 8 do Notion).** Só é por canal o número que NASCE no canal: a receita de cada canal
(Loja, Delivery próprio, iFood) tem farol, contra uma meta de crescimento sobre o ano passado. CMV e despesa têm farol só no total (rede ou loja), nunca rateados pela receita. Ratear daria ao iFood o mesmo CMV % do salão por
construção (três faróis iguais parecem três diagnósticos e são um só), e a margem do iFood sairia pior só pela taxa, escondendo embalagem e motoboy: o dono decidiria em cima de conta inventada. Cor é afirmação, e sem número é hipótese
(decisão 172). CMV por canal de verdade só com venda por prato × ficha por canal (CMV teórico, fora).

1. **As 5 faixas** (173), `farol-campos.ts`: `FAIXAS_DO_FAROL` v1, fixas e congeladas, iguais para todo parceiro, em pontos percentuais absolutos. `faixaDoDesvio(sentido, desvioBp, escala)`; `s` é o desvio já com o sentido (positivo = melhor).
   | Faixa | Custo, margem, resultado (pp da receita) | Receita (pp de crescimento) | Palavra |
   |---|---|---|---|
   | Azul | s ≥ +3,0 | s ≥ +5,0 | bem melhor que a meta (+ "confira se está tudo lançado" em linha de custo) |
   | Verde | s ≥ −0,5 | s ≥ −1,0 | na meta |
   | Amarelo | s ≥ −1,5 | s ≥ −3,0 | um pouco pior |
   | Laranja | s ≥ −3,0 | s ≥ −6,0 | pior que a meta |
   | Vermelho | abaixo | abaixo | muito pior que a meta |
   A palavra substitui a da 2.2b ("melhor/pior que a meta", "na meta" de menos de 5 pontos-base). Os testes da 2.2b que conferiam a palavra foram atualizados.
2. **Meta de crescimento da receita** (175): as 4 linhas de receita (total e os 3 canais) aceitam UMA meta, de 0 a 100,00 %, de crescimento sobre o mesmo período do ano passado (0 = igualar). `tipoDaMeta(chave)` = `crescimento` | `percentual`; a mesma coluna do `DreMeta`, `canal` nulo.
   O realizado é a variação do canal (pontos-base, `dividirExato`), só com cobertura completa dos dois lados; meta em R$ = ano passado × (1 + meta). Recusa por `lerMetaDigitada`: 100,01, negativo, notação científica, letra; as duas linhas de detalhe do CMV seguem sem meta.
   A tela "Plano e metas" ganhou o campo nas linhas de receita, com a explicação, e o Histórico escreve "crescimento sobre o ano passado".
3. **Sem cor quando o dado não fecha** (176), `farol-dre-campos.ts` (pura, a mesma regra no ao vivo e no fechado): sem comparação (sem faturamento, sem valor, sem lançamento, ano passado incompleto ou zero); falta lançamento de faturamento no escopo (nenhuma linha daquele
   escopo tem cor, só o desvio em texto); "sem contar o CMV de X"; despesa que repete todo mês sem lançar (a linha, o grupo e os resultados abaixo, não o que não depende dela: o falso azul); período fechado antes do farol (receita "não apurada neste fechamento").
   O CMV pelas compras, parcial ou misto, tem cor e o selo da fonte ao lado, mas o CMV de um escopo com mais de uma loja fica sem cor quando falta o CMV de alguma que vendeu ("Compras, incompleto", "Real, incompleto": "sem o CMV de X"). A cobertura do ano passado é por loja (cada loja ativa com todos os dias; na receita do canal, cada loja que vende o canal com todos os dias dele), e o motivo diz quem falta. Loja que fechou sem nenhum lançamento (ressalva) também tira a cor. A despesa recorrente em falta agora leva `linhaId` e `grupo` (`RecorrenteEmFalta` e a ressalva do fechamento).
4. **Acessibilidade e marca** (177): régua de 5 casas (5 quadrados de 10 px, a casa da faixa cheia; azul à esquerda, vermelho à direita, a posição diz a faixa em escala de cinza), palavra, desvio e `aria-label` com "faixa N de 5". Tokens `--ff-farol-{azul,verde,amarelo,laranja,vermelho}`
   no `tokens.css` (três blocos de tema) e no Tailwind (`text-farol-*`), dessaturados, com contraste ≥ 4,5:1 sobre `painel`, `fundo` e a linha de resultado nos dois temas (testado lendo o próprio CSS; claro: amarelo #6F6300 e laranja #B04400, escuro: verde #5DBB84 e vermelho #F5424D, e o `erro` do shell subiu para o mesmo tom: o selo "Sem CMV" dava 4,42:1 sobre a linha de grupo). A cor só mora em `text-farol-*` e no glifo (`farol.tsx`);
   teste-guarda por grep em `src/` contra `border-`, `bg-`, `ring-`, `divide-`, `from-`, `to-`, `fill-`… com `farol-`.
5. **Onde aparece** (178), nenhuma rota nova: (a) coluna "Farol" na tabela do DRE, depois de Desvio, e a régua + palavra + desvio sob o nome da linha no celular; (b) painel no topo da página do DRE, no kit Bento da Kairu (lido pelo MCP, `library:design-mosaico-bento`; entram a
   estrutura modular, o equivalente em texto da meta e "N lojas incluídas"; a paleta tonal do kit não entra, a marca manda): "Faróis do período" (as 5 faixas, quantas linhas em cada, as laranja e vermelhas como âncora para a linha, as sem cor com o motivo) e um bloco por canal que o escopo vende
   (receita, % da receita, pedidos, ticket médio, ano passado, variação, meta de crescimento e farol), com a frase única "compra e despesa são da loja, não do canal". "Meta em R$" aparece a partir de 1280 px para a coluna do farol caber. Fora do hub, do ⌘K, de alerta e de WhatsApp.
6. **Fechado** (179): a fotografia grava `versaoDaConta = 3`, `entrada.anoPassado` (por loja: o nome, se era exigida, os canais que vendia, os dias com lançamento e, por canal, o total e os dias), `entrada.farol = { versao: 1 }` (o fechado lê as faixas por essa versão), os pedidos em `entrada.receitas` e a meta de crescimento no `metaBp` das linhas de receita. O fechado lê a faixa, a variação e o ano passado SÓ dela
   (`lerCanaisDaFotografia` extrai do JSON só as lojas do alcance de quem lê). Editar o faturamento de um período antigo depois não muda o fechado. v1 e v2: o farol de custo sai das linhas gravadas com as faixas v1; a receita diz "não apurado neste fechamento (fechado antes do farol)" e nunca se recalcula;
   o painel "Receita contra o ano passado" da 2.2b segue lendo ao vivo nesses (herança). Reabrir (só o nível 1) e fechar de novo gera a v3.
7. **Vazamento** (180): sem `dre.ver` nada de farol (tela, menu, ⌘K, HTML, Histórico e o texto da ajuda: os blocos do farol são `para: ['dre.ver']`); o gerente de uma loja só recebe o escopo dele, também por `?rede=1` e `?loja=<outra>`, ao vivo e no fechado; a contagem de faixas da rede só conta linhas da rede.
8. **Herança do fiscal pós-deploy da 2.3** (181): a página do período (`/erp/dre/periodos/<data>`) diz "CMV: não apurado neste fechamento (fechado antes do CMV)" no resumo de uma fotografia v1 (e não "sem contar o CMV"), e "Ver o DRE desta versão" mostra a mesma frase na linha do CMV das versões antigas.
9. **Fora desta subfase**: rateio de CMV e despesa por canal, CMV teórico, `Despesa.canal` no formulário (motoboy e cartão por canal), meta em R$, por loja ou negativa, faixas por parceiro (`FarolFaixa`), alerta, sino, WhatsApp, hub, farol no "Por loja", receita com marca.

**Ajuda: chaves novas/alteradas.** Nenhuma nova (nenhuma rota nova). Alteradas, com `ajuda.lock.json` regravado: `dre` v5 para v6 (a seção "O farol: 5 faixas" e o desvio sem a palavra antiga), `dre-plano` v3 para v4 (a meta de crescimento da receita), `dre-periodo` v2 para v3 (a fotografia guarda o ano passado e as faixas).

### A 2.4 volta (21/10/2026)

Retirada em 17/10 (commit 650c43b) depois da 2ª reprovação, voltou pelo revert desse commit, por cima da 3.1 e da revisão visual. A correção
apontada pelo Guardião entrou (decisão 207): na receita bruta, o dia de cada loja só conta se todos os canais que ela precisa cobrir têm
lançamento. Teste novo com o caso exato (salão lançado, iFood do dia 1 não) e o canal novo que não trava. Conflitos resolvidos: o vermelho de
erro do escuro fica o da revisão visual (#F5525A, mais contraste que o #F5424D da 2.4); `VERSAO_DO_ERP` segue "fase 3.1". Prova: 1.673 testes
com banco; na tela (build de produção, dados de outubro/2025 e 2026 com o iFood de 01/10/2025 da Penha faltando), a receita bruta mostra "—"
e "Ano passado incompleto: Vila da Penha (iFood) 19 de 20", Loja e Delivery seguem com −3,9 % e −4,0 %; DRE, Plano e metas e Faturamento sem
rolagem lateral e sem violação do axe nos 4 formatos e 2 temas.

## O que a 2.5 entregou — orçamento de compra ao vivo (quanto ainda cabe sem furar o CMV meta)

Quinta da Prioridade 002. **Nenhuma migration** (tudo é derivado: meta do CMV, faturamento e notas que já existiam; `migrate diff` vazio). Decisões 208 a 212, e 213 a 216 na
rodada de correção 1 (veto do Guardião e revisão de UX; ver "Rodada de correção 1" abaixo).
Permissões: o catálogo não ganhou nada (ver = `compras.ver` ou `compras.lancar` na loja; a conta inteira = `dre.ver` na loja); `VERSAO_DO_ERP` continua
"fase 3.1" (a fase mais alta no ar; decisão 212).

1. **A conta** (208), `orcamento-campos.ts` (pura): teto = meta do CMV × receita prevista do período; cabe = teto − já comprado (negativo = passou). Já comprado =
   notas LANÇADAS com data no período INTEIRO, valor + frete rateado (a soma do CMV de compra da 2.3, agora até o fim do período: a nota de hoje conta; cancelada e
   nota de outro período não). Só o período em curso (a regra do período de `periodos.ts`: mensal, quinzenal ou semanal). Loja desativada fica fora.
2. **A receita prevista** (209), por loja: o vendido nos dias do período com faturamento completo (cada canal que a loja vende lançado, "Não vendeu" conta) + cada dia
   que falta (hoje até o fim) e cada dia sem lançamento completo pela média do mesmo dia da semana nas últimas 4 semanas completas da loja. Dia antes do primeiro
   lançamento da loja não existe; dia da semana sem nenhum dia completo nas 4 semanas conta só o que já foi lançado nele (zero nos dias que faltam), com a frase ("sábado sem dia completo nas últimas 4 semanas: conta só o que já foi lançado";
   decisão 214). Menos de 14 dias completos na janela = sem número ("poucos dias com faturamento completo nas últimas 4 semanas: 9 de 14 necessários").
   Sem meta do CMV = sem número ("falta a meta do CMV", com o link para Plano e metas a quem define metas). Nunca R$ 0,00 para dado ausente. É a única tela que
   projeta (o DRE segue até ontem, decisão 145); a conta por dia da semana acerta o mês de 5 sábados (R$ 41.000,00 contra R$ 40.300,00 da linear, no teste).
3. **Cobertura por loja e o farol** (211). A rede só tem número quando cada loja ativa tem ("sem o orçamento de Centro"). O farol é o "ritmo das compras": CMV pelas
   compras até ontem ÷ receita até ontem contra a meta, `faixaDoDesvio` na escala de custo, o `Farol` da 2.4 (cor só no glifo e na palavra). Sem cor: dia do período sem
   lançamento completo em alguma loja do escopo (`faltam lançamentos de faturamento`; o número segue, pela média) ou loja que vendeu sem nota até ontem.
4. **Quem vê o quê** (210). O servidor monta a vista (`orcamento.ts`). Com `dre.ver` na loja: cabe, teto, já comprado, receita prevista (vendido + pela média, os dias),
   a conta por extenso e o ritmo com o farol. Sem `dre.ver` (o comprador, ou quem só vê faturamento): só o "cabe" = TETO arredondado para baixo em degraus por faixa
   (R$ 500 / R$ 1.000 / R$ 5.000) − já comprado, o motivo e os avisos; nem a meta, nem o percentual, nem a receita (decisão 213: arredonda-se o teto, nunca o saldo).
   A linha da rede só para quem tem a rede inteira. Gerente de uma loja: só a dele, por `lojaId` de outra = nada. Operador: não abre. Outro parceiro: o portão não enxerga.
5. **Onde aparece** (212): aba **Orçamento** na área Compras (`/compras/orcamento` e o espelho do nível 1): o bloco da rede (ou da loja escolhida no topo) com o número
   grande, a conta por extenso e o ritmo; a tabela "Por loja" (Corporativo; cartões abaixo de 1024 px). Na nota: a prévia "Conferir o impacto" ganhou "Orçamento de
   compra" ("antes desta nota, cabe R$ 2.300,00 · Com esta nota, passa R$ 700,00 do orçamento. É um aviso: a nota pode ser lançada."); o detalhe da nota lançada do
   período em curso diz como ficou, com link para a aba. **Aviso, nunca bloqueio**: lançar a nota que passa grava igual (teste).
6. **A soma única das compras**: `comprasPorLoja` (`cmv.ts`) agora serve o CMV de compra do DRE e o orçamento; `semNotaId` tira a versão gravada de uma nota em edição.
7. **Fora desta subfase**: meta do CMV por loja (a meta é do parceiro e mede todas as lojas, como no DRE), dia de pagamento e sazonalidade na previsão, orçamento por
   fornecedor ou por grupo de insumo, "comprar na semana" (Kairu "Da Ficha ao Fornecedor": consultado, fora do escopo), alerta, sino e WhatsApp, orçamento de período passado.

**Ajuda: chaves novas/alteradas.** Nova: `compras-orcamento` (v2 depois da rodada de correção, recolhida; os blocos da conta e do ritmo são `para: ['dre.ver']`, o do arredondado vale para todos).
Alteradas, com `ajuda.lock.json` regravado (53 entradas): `compra-nova` v3 para v4 ("Conferir o impacto" mostra o orçamento; passar é aviso) e `compra` v2 para v3
(o detalhe diz como ficou o orçamento).

### Rodada de correção 1 (21/10/2026): o veto do Guardião e a revisão de UX

| Achado | O que mudou | Decisão |
|---|---|---|
| Guardião B1 (veto): o "cabe" arredondado a R$ 100 vazava o centavo (15 prévias de edição → faixa de R$ 8,29; 14 notas lançadas e canceladas → centavo exato) | arredonda-se o TETO para baixo em degraus por faixa (R$ 500 abaixo de R$ 10.000; R$ 1.000 até R$ 50.000; R$ 5.000 daí para cima); "cabe" = teto arredondado − já comprado; a prévia e o detalhe partem dele; rede = soma dos tetos arredondados (bate com o "Por loja", achado M6). Os dois ataques refeitos no banco devolvem sempre R$ 12.000,00 para um teto real de R$ 12.300,00 | 213 |
| Guardião I2: "não a realizada" e ±R$ 333 estavam errados | hipótese reescrita: com meta de 30 %, quem vê só o limite seguro sabe a receita prevista com erro de ±1 % a ±5 % (teto a partir de R$ 6 mil; ±1,4 % numa loja de R$ 120 mil por mês), e no fim do período a prevista é quase a realizada; alternativa "só status, sem número" para o Rodolfo | 210, 213 |
| Guardião I3: loja que abriu no meio do período ganhava receita dos dias em que não existia | dia antes do 1º lançamento fica fora do vendido, da projeção e dos "sem lançamento" (loja de 05/10: 4 dias fora, R$ 35.000,00) | 214 |
| Guardião I4: loja que vendeu sem nota mostrava "já comprado R$ 0,00" e "cabe o teto inteiro" sem aviso | "sem nota de compra" no lugar de R$ 0,00 e o aviso, também para o comprador e na rede; a prévia da 1ª nota avisa | 215 |
| Guardião M5: dia da semana sem amostra entrava pela média geral | conta ZERO, com a frase (na rodada extra: o dia lançado em parte vale o que foi lançado, e a frase é "sem dia completo nas últimas 4 semanas") | 214, 217 |
| UX B1: a sobra de uma loja escondia a que passou | abaixo do número da rede, em `erro`: "<Loja> já passou R$ X: a sobra de outra loja não cobre"; número e "Por loja" no mesmo painel (lado a lado a partir de 1280 px) e a caixa recolhida: em 1440 × 900, com a caixa ABERTA (1ª visita), a última loja termina em 886 px (dona) e 858 px (comprador) | 216 |
| UX I2 a I6, M7 a M13 | nome em linha própria no celular e "arredondado" dito uma vez (subtítulo); tabela Corporativo de uma linha (44 px) e lista para quem não vê a receita; o orçamento logo abaixo de "Itens + frete = …" na prévia; a linha que explica o farol × o número; "Ver o orçamento" e "Definir a meta" com 48 px no toque; espaço que não quebra em "pp" e "%" (`dre-campos.ts`, o DRE inteiro); "= passou R$ X"; sem o rodapé repetido; "Vale combinar…" só para quem não define metas; "Hoje, …" no detalhe de nota antiga; sem meta, a receita prevista (também da rede) e o link para Plano e metas; sem faturamento, "Lançar o faturamento" | 216 |

Ajuda: `compras-orcamento` v1 → v2 (recolhida; a sobra que não cobre; o teto arredondado; os dias fora e o zero); lock regravado (53 entradas).

### Rodada extra de correção (21/10/2026): "limite seguro" para quem não vê o DRE, sem rolagem lateral

| Achado | O que mudou | Decisão |
|---|---|---|
| UX B1: o teto arredondado fazia a tela do comprador afirmar estouro que não existe, e ele lia "teto" sem definição | para quem não vê o DRE o número é o LIMITE SEGURO: "cabe R$ X no limite seguro" / "acima do limite seguro em R$ X", tom de atenção, subtítulo "Valor aproximado, sempre para menos: a conta exata pode ter mais folga e fica com quem vê o DRE."; o mesmo na prévia, no detalhe e na linha da rede ("<Loja> está acima do limite seguro em R$ X"); valores exibidos em degraus de R$ 100 para menos folga (sem centavos); "orçamento", "passou" e "teto" não aparecem para essa pessoa | 217 |
| UX B2: rolagem lateral com uma loja sem número | célula "sem número", o motivo uma vez sob o nome (12 px, quebra linha), farol sem `whitespace-nowrap` | 217 |
| UX I3, M4 a M8 | a prévia vem para a vista depois de "Conferir o impacto" (respeita `prefers-reduced-motion`); "sem número" no detalhe começa pelo nome da loja; na rede, o link "Lançar o faturamento" segue quando a loja sem número é por falta de faturamento; "Como a conta chega aqui" diz por quê, sem espaço em branco; "Prevista" no cabeçalho (nome inteiro no `title` e para o leitor de tela); sem número, sem o subtítulo do "aproximado" | 217 |
| Guardião (textos e menor) | o erro da receita para quem vê o limite seguro é ±1 % a ±5 % (não ~±8 %); o risco "quem vê faturamento descobre a meta em ~14 dias" foi aceito pelo Maestro; dia incompleto num dia da semana sem amostra vale o lançado (piso) | 213, 217 |

Ajuda: `compras-orcamento` v2 → v3 (o limite seguro em uma frase; o piso do dia sem amostra); lock regravado.

Prova da rodada extra (build de produção do último commit; bancos `ff_25x` e `ff_25sf` (Delivery sem faturamento) copiados do `ff_25`; roteiros `pw/rx.mjs`,
`pw/rxlat.mjs` e `pw/shots.mjs` no scratchpad, prints em `pw/rx/`): a dona confere e lança R$ 15.300,00 na Vila da Penha (no celular, depois de "Conferir o
impacto" a prévia sobe para a vista: topo dela a 114 px de 844); ela vê "cabe R$ 303,00" e o comprador, "Vila da Penha em Outubro de 2026: acima do limite
seguro em R$ 300,00. Valor aproximado, sempre para menos…" (tom de atenção, "Ver o limite seguro"), sem "orçamento", "passou" nem "teto" nos textos do número;
a prévia do comprador (1440, menos movimento) chega à vista e diz "Limite seguro de compra … fica acima do limite seguro em R$ 400,00". Orçamento e detalhe
(cenário do limite) e orçamento (loja sem faturamento), dona e comprador, em 390, 820, 1180 e 1440, claro e escuro: 48 telas, zero rolagem lateral, zero
violação do axe; sem faturamento também a 1024 e a 1280, na rede e na loja: zero rolagem, e a dona tem "Lançar o faturamento".

## Provar o orçamento de compra (2.5)

```bash
npx tsc --noEmit && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism
npm run build
```
`tests/erp-orcamento.test.ts` (sem banco, 28 depois da rodada de correção; inclui os degraus do teto, o teto que nunca cresce nem passa do real, o ataque refeito na conta pura, a loja de 05/10 e o sábado sem amostra): a previsão por dia da semana (5 sábados, dia sem um canal pela média, "Não vendeu" é zero, dia da semana sem amostra,
o mínimo de 14 dias, o 1º dia do período, semanal e quinzenal), o teto com um arredondamento, o passou, sem meta, as 5 faixas do ritmo, sem cor por falta de faturamento e
por loja sem nota, a cobertura por loja da rede, o arredondamento prudente e a prévia arredondada. `tests/erp-orcamento-tela.test.ts` (sem banco, 7): a linha da prévia,
o aviso do detalhe, a tela de quem não vê a receita (nenhuma palavra da conta, nenhum R$ 0,00). `tests/erp-orcamento.db.test.ts` (23; na rodada de correção: os dois ataques do Guardião refeitos pelo comprador, a loja de 05/10, a loja sem nota e a rede dizendo quem passou): o cenário da Casa Orçamento
(Penha R$ 41.000,00 × 30 % − R$ 10.000,00 = cabe R$ 2.300,00; Delivery R$ 4.150,00; rede R$ 6.450,00; cancelada e setembro fora; ritmo amarelo e azul), a outra casa
isolada, o comprador (só R$ 2.300,00 / R$ 4.100,00 / R$ 6.400,00 no JSON, nada da conta), quem só vê faturamento, gerente de uma loja, loja fora do alcance, operador,
nível 1, a página de verdade (HTML da dona com a conta, do comprador sem receita), a nota que passa (prévia, lança igual, o detalhe avisa), a edição sem contar duas
vezes, a prévia do comprador arredondada, a loja nova que tira o número da rede e o dia sem iFood que tira a cor e não o número.

Na tela, 1ª rodada (substituída pela prova da rodada de correção 1, abaixo; build de produção local, porta 3100, banco `ff_25` copiado do `ff`, com meta do CMV de 30 %, 4 notas de outubro lançadas pela regra e um comprador =
gerente sem `faturamento.ver`, `faturamento.lancar`, `dre.ver` e `despesas.lancar`; roteiros `pw/shots.mjs` e `pw/previa25.mjs` no scratchpad): a dona vê a rede
(cabe R$ 13.887,00 = 30 % × R$ 241.290,00 − R$ 58.500,00, ritmo 37,6 % contra 30 %, vermelho), a Penha cabendo e o Delivery "passou R$ 1.716,00"; o comprador vê
R$ 13.800,00 / R$ 15.600,00 / passou R$ 1.800,00, "arredondado a R$ 100", sem receita, teto, já comprado nem farol; a prévia de uma nota de R$ 1.500,00 no Delivery
diz "passa R$ 3.216,00" (dona) e "passa R$ 3.300,00" (comprador, arredondado); a nota é lançada igual e o detalhe avisa "passou R$ 3.216,00 … o orçamento avisa,
não bloqueia"; o operador volta ao hub sem nenhum valor no HTML. Orçamento e detalhe da nota com dona, gerente e comprador em 390, 820, 1180 (toque) e 1440, claro e
escuro, e a prévia em 390 e 1440 nos dois temas: zero rolagem lateral e zero violação do axe (wcag2a/2aa). Erros de console só os já conhecidos (prefetch de RSC
abortado na troca de página e um 404 de recurso do shell, iguais nas outras telas).

Na tela, rodada de correção 1 (build de produção do último commit, portas 3100 e 3101; bancos `ff_25r1` e `ff_25sm` (sem meta) copiados do `ff_25`; roteiros
`pw/shots.mjs` e `pw/r1.mjs` no scratchpad, prints em `pw/r1/`): orçamento e detalhe de nota com dona e comprador em 390, 820, 1180 (toque) e 1440, claro e escuro
(32 telas): zero rolagem lateral, zero violação do axe. Em 1440 × 900 com a caixa aberta (1ª visita), a última loja do "Por loja" termina em 886 px (dona) e 858 px
(comprador), linhas de 44 px, e "Vila da Penha · Delivery já passou … a sobra de outra loja não cobre" logo abaixo do número. A prévia (390 e 1440, claro e escuro,
dona e comprador) traz o orçamento antes do bloco do estoque; o comprador lê "pelo teto arredondado para baixo (sem a receita)" e "Vale combinar com quem define as
metas" (a dona, que define, não); lançada a nota, o detalhe diz "A nota está lançada…", e a nota antiga diz "Hoje, …". "Ver o orçamento" e "Definir a meta do CMV"
medem 48 px no toque. Sem meta: a dona vê a receita prevista e o link; o comprador, "sem número" com o motivo.

## O que a 3.1 entregou — produção de intermediários: o lote nasce da ficha, os insumos saem pela requisição, o lote entra no estoque

Primeira da Prioridade 003 (a 2.4, faróis, foi retirada no commit 650c43b em 17/10 e voltou em 21/10, ver "A 2.4 volta"; nada daqui depende dela). Migration
`20261029000000_erp_producao` (ADITIVA: colunas e CHECKs novos em `OrdemProducao`, dois gatilhos, dois índices; nenhuma tabela nova, portão e RLS
iguais; `migrate diff` vazio). Decisões 190 a 201. A tabela `OrdemProducao` e o tipo `PRODUCAO_ENTRADA` já existiam desde a 0.1; o tipo
`PRODUCAO_CONSUMO` continua RESERVADO e sem uso (a saída dos insumos é a `REQUISICAO` da própria ordem). `VERSAO_DO_ERP` = fase 3.1.

1. **Planejar** (190, 191). Da ficha de um pré-preparo (ex.: molho cheddar, rende 2 kg): a pessoa diz quanto quer (5 kg) e a tela monta a lista pela
   ficha (cheddar 2,5 kg, leite 2,5 L, cebola 885 g, já com o fator de correção), que ela pode ajustar. Planejar grava o lote E a requisição dos insumos
   (setor Cozinha) na MESMA transação (`criarRequisicaoNaTx`); nada sai do estoque ainda. Código do lote `AAMMDD-NN`, por loja e dia, nunca reaproveitado
   (nem o do lote cancelado). Idempotente pela chave do envio (duplo clique = 1 lote). A data é de hoje a 14 dias (sem produção retroativa).
2. **Começar a produzir.** Muda a etapa (Planejada → Em produção), com versão lida e histórico.
3. **Entregar os insumos.** É a tela de entregar da 1.8, sem mudança de fluxo: a requisição do lote diz "do lote AAMMDD-NN", não se cancela por ela
   (cancela-se o lote) e a entrega dá baixa no livro item a item, com o preço do saldo. As baixas do exemplo somam −R$ 117,81.
4. **Concluir** (192, 193, 194, 195, 196). Só com a requisição ATENDIDA (senão: "Faltam sair 885 g de Cebola branca pela requisição #N: entregue ou
   encerre o resto."). O cozinheiro diz quanto saiu de verdade (kg|g, L|ml, un); fora de ±10% do planejado (estrito: exatamente 10% passa) pede MOTIVO;
   produzido 0 é lote PERDIDO (motivo obrigatório, nenhuma entrada no estoque, o custo dos insumos fica como perda do lote). A conservação escolhida
   (refrigerado ou congelado) dá a validade, gravada como retrato (mudar a ficha depois não muda o lote). O lote entra no estoque da MESMA loja como
   `PRODUCAO_ENTRADA` (com `ordemProducaoId`), no insumo que a ficha produz, valorizado pelo que de fato saiu. Concluir duas vezes (outra aba) = uma
   entrada só ("já concluído").
5. **Custo do lote** (194). Baixas reais ÷ quantidade que saiu, em fração exata (nunca gravado: o custo por kg é calculado na tela). 5 kg planejados,
   4,6 kg de verdade: R$ 117,81 ÷ 4,6 = R$ 25,61/kg contra R$ 23,56/kg que a ficha prevê hoje; rendimento 92%; os 400 g que faltaram custaram R$ 9,42.
   Insumo que saiu sem preço deixa o custo "incompleto" (com a frase dos insumos). Só quem tem `insumos.ver` recebe R$: o cozinheiro sem a permissão
   produz, vê quanto saiu e o rendimento, e o HTML não leva valor nenhum (também fora do Histórico).
6. **Cancelar e estornar** (197). Cancelar só com saída LÍQUIDA ZERO da requisição (nada saiu, ou tudo voltou pela devolução da 1.8); cancela a requisição
   junto, com motivo. Estornar um lote concluído exige `estoque.ajustar` e motivo; grava o espelho exato da entrada (conferido por gatilho) e deixa a ordem
   CANCELADA guardando a conclusão ("Estornada"). Ordem concluída não muda por SQL cru (gatilho).
7. **Trava do período** (198, 199). Concluir e estornar respeitam o período fechado do DRE, e a lacuna da 1.8 foi fechada: atender e devolver itens de
   requisição também. Ordem fixa das travas, a mesma em todo caminho: período (compartilhada) → abertura da loja → requisição FOR UPDATE → ordem FOR UPDATE
   → saldos.
8. **Quadro kanban** (200). Planejadas · Em produção · Concluídas hoje · Canceladas hoje; atrasado = filete vermelho à esquerda (3 px) + "Xd de atraso" (a
   cor nunca é o único sinal). O esqueleto (`telas/quadro/quadro.tsx`: `GradeDoQuadro`, `ColunaDoQuadro`, `CartaoDoQuadro`) é COMUM e já serve os três
   quadros (pedidos de acesso da 0.5 com filete de 2 px, requisições da 1.8 e produção), sem mudar o que eles faziam. O cartão cancelado deixou a
   opacidade (o texto perdia contraste) e fica sobre o fundo da página.
9. **Menu, permissões e histórico** (201). Área Produção ativa no hub, nas abas e no ⌘K ("Nova produção"); a ficha de pré-preparo ganhou "Produzir este
   pré-preparo". Catálogo de permissões sem novidade: `producao.ver` e `producao.registrar` (o operador da cozinha produz); o grupo `etiquetas` nasce
   `emBreve`. O Histórico fala "Lote" (Planejou, Iniciou, Concluiu, Cancelou, Estornou) e tira os campos de custo de quem não vê custos. O livro do
   estoque liga a entrada ao lote.
10. **Migration** (aditiva, segura para superusuário e para dono não-superusuário com e sem FORCE RLS). Colunas novas (versão, retratos de unidade,
    conservação e validade, quem planejou/iniciou/concluiu/cancelou, motivos, `insumosSemPreco`, `chaveIdempotencia`), nove CHECKs em `OrdemProducao` e o
    da entrada, todos `NOT VALID` + `VALIDATE` em bloco que avisa em vez de quebrar; índices únicos `(parceiroId, requisicaoId)` e
    `(parceiroId, chaveIdempotencia)` criados em bloco que apanha `unique_violation`; gatilhos `OrdemProducao_concluida_imutavel` e
    `MovimentoEstoque_producao_confere`. Nenhum passo depende de SELECT sob RLS. `npm run erp:conferir-migracao` lista, depois do deploy, o que ficou
    pendente (CHECK `NOT VALID`, índice ausente, gatilho ausente).
11. **Fora desta subfase**: etiqueta do lote (grupo `etiquetas`, em breve), produção em lote sobre vários pré-preparos, sub-estoque de produção (o lote entra no
    estoque da loja), sobra de insumo devolvida pela tela do lote (devolve-se pela requisição, como na 1.8), ordem retroativa e a requisição de produção
    nas Divergências (ver a herança).

**Ajuda: chaves novas/alteradas.** Novas (`ajuda.lock.json` regravado, 52 entradas): `producao`, `producao-quadro`, `producao-nova` (rotas `producao/nova` e
`producao/[lojaId]/nova`), `producao-lote`, `producao-concluir`. Alteradas: `requisicao` v1 para v2 (a requisição do lote) e `ficha` v2 para v3 ("Produzir este
pré-preparo").

## Provar a produção (3.1)

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # duas vezes seguidas
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
Os arquivos de banco que a 3.1 mexe também rodam num banco com dono NÃO-superusuário e FORCE RLS, e com dono sem RLS (`ff_dono` e `ff_semrls`, bancos novos com
todas as migrations aplicadas por `psql` como o dono), em sequência: `npx vitest run --no-file-parallelism <arquivos *.db.test.ts, menos *-migracao>`. Nos dois a
suíte de banco inteira passou (26 arquivos; no dono com FORCE RLS o teste do papel `erp_tenant` precisa da tabela `_prisma_migrations`, que um banco montado por
`psql` não tem). Teste que lê com SQL cru precisa do contexto do parceiro ou do portão: sob FORCE RLS o SELECT cru enxerga 0 linhas (o critério 17 foi
reescrito pelo portão por isso).
`tests/erp-producao.test.ts` (sem banco, 30): código do lote, rendimento (±10% estrito, 0 = perdido), leitura da conclusão em kg|g, L|ml e un, validade, custo
em fração exata (R$ 25,61/kg, R$ 9,42), insumo sem preço, atraso, situação dos insumos. `tests/erp-producao.db.test.ts` (26): os critérios da análise com o
molho cheddar (lista 2,5 kg / 2,5 L / 885 g, baixas de −R$ 117,81, 4,6 kg, 92%, validade de 3 dias refrigerado e 30 dias congelado), idempotência, o banco recusando
(entrada em outra loja ou outro insumo, ordem concluída por SQL cru, estorno que não é espelho), alcance e outro parceiro, e os testes MUTANTES das travas:
segurar `travarParaFechar` e provar que concluir, atender, devolver e estornar ESPERAM (cerca de 900 ms); tirar `conferirPeriodoAberto` de qualquer um dos quatro
derruba o teste. `tests/erp-producao-migracao.db.test.ts` (6): a migration com dado antigo plantado (limpo e ruim) nos 3 perfis do banco. `tests/erp-producao-telas.db.test.ts` (12): o
HTML por perfil (dona, gerente, cozinheiro, cozinheiro sem custos), o vazamento do custo, o alcance, as actions e o espelho do nível 1.

Na tela (build de produção local, porta 3100, banco `ff_31` copiado do `ff_dev`; roteiro `prova31/jornada.mjs` no scratchpad, 151 conferências): o cozinheiro, a
390 px com toque, vê a área Produção no hub, o quadro com o lote de anteontem atrasado (filete de 3 px, "2d de atraso", "Insumos por entregar"), monta a lista da
ficha (0,885 · 2,5 · 2,5), planeja com duplo clique (um lote só), começa e é barrado ao concluir antes da entrega; o estoquista entrega pela requisição do lote (aviso
do lote, sem cancelar; baixas de −R$ 117,81); o cozinheiro conclui com 4,6 kg (92%, R$ 25,61/kg contra R$ 23,56/kg, R$ 9,42, validade 3 dias) e o lote aparece no livro do
estoque; 4,4 kg (88%) pede motivo, o servidor também recusa sem ele, congelado vence em 30 dias; duas abas concluindo põem uma entrada só; o cozinheiro sem custos
produz e não recebe R$ no HTML; cancelar sem saída passa, com 2,5 kg de cheddar entregue recusa e depois de devolver passa (saída líquida zero); o gerente estorna (só
quem ajusta o saldo); com o período fechado concluir e entregar são recusados e, reaberto, passam; o gerente da Delivery recebe 404 no que é da Penha e vê o aviso de
estoque não aberto; a dona de outro parceiro recebe 404; o nível 1 vê o mesmo pelo espelho; os quadros da 0.5 (filete de 2 px) e da 1.8 (3 px) seguem iguais. Axe
(wcag2a/2aa) sem violação nos dois temas, zero erro de console, zero rolagem horizontal a 390, 820, 1280 e 1440. Prints em `shots-3.1/`. Scanner `avoid-ai-design`: 0 P0 e 0
P1 (P2 de "meta strings com ponto médio", o padrão da casa).

## O que a 3.2 entregou — lista do dia: o gerente define o que produzir, a tela cruza com o estoque (vai usar / tem / comprar) e cada linha vira lote

Segunda da Prioridade 003. Migration `20261030000000_erp_lista_do_dia` (ADITIVA: duas tabelas novas de tenant, `ListaProducao` e
`ListaProducaoItem`, com `parceiroId`, FKs compostas, CHECKs de nascença, RLS + FORCE + política e GRANT no padrão condicional da 0.2/2.2a/2.2b;
nenhuma coluna mexida nas antigas; `migrate diff` vazio). Decisões 218 a 227. Permissão nova `producao.planejar` ("Definir a lista do dia
(o que a loja produz)", catálogo na versão 2). `VERSAO_DO_ERP` = fase 3.2.

1. **A lista** (218, 219). Uma por LOJA e DIA (de hoje a 14 dias à frente; dia que passou é consulta). Quem tem "definir a lista do dia" (dono e
   gerente pelo perfil base; o operador não) escolhe os pré-preparos (os mesmos da "Nova produção": ficha Pré-preparo ativa que vira insumo) e
   quanto produzir, na unidade do rendimento ("5" = 5 kg de molho). A cozinha (`producao.ver`) lê a lista e os lotes dela, sem formulário.
   Salvar refaz a conta; o mesmo pré-preparo não fica em duas linhas abertas (some numa só). Salvar a lista vazia a apaga (fica sem linhas,
   e a versão segue: decisão 229, rodada 1).
2. **A conta** (220, 223), `producao-lista-campos.ts` (pura). Vai usar = a receita de cada linha, BRUTA (fator de correção), arredondada como a
   requisição do lote vai pedir (`quantidadesDaFicha`, a mesma conta da 1.8/3.1); na unidade do insumo, sem converter (a embalagem padrão só
   aparece como apoio quando tem conteúdo declarado diferente de 1 kg/1 L/1 un: "≈ 2 embalagens de 900 ml"). Tem = o saldo da loja agora.
   Comprar = max(0, vai usar − tem), com a palavra ("falta 500 ml", em vermelho; "dá", em verde). Saldo negativo é alarme e entra na conta
   ("−550 ml, abaixo de zero"; o comprar cobre o buraco). Loja sem saldo apurado (estoque não aberto ou em contagem de abertura): o "tem" e o
   "comprar" viram a frase do motivo, nunca 0.
3. **A cascata** (221). Pré-preparo dentro da receita (a cebola caramelizada na maionese) vem do estoque, pelo insumo que ele produz:
   primeiro o que tem, depois o que a própria lista produz dele; o que ainda falta é "falta produzir" e entra pela receita dele na matéria-prima
   (ordem topológica, até o fundo; círculo forçado no banco vira aviso e não entra em laço). "Pôr na lista" põe o pré-preparo com o que falta
   (se já há linha aberta dele, soma nela; o segundo clique com a mesma versão não soma de novo).
4. **Vira lote, sem segunda baixa** (222). "Gerar os lotes" transforma as linhas abertas em lotes PLANEJADOS pela regra da 3.1
   (`planejarProducaoNaTx`, extraída de `planejarProducao`: código `AAMMDD-NN`, a requisição dos insumos nasce junto; nada sai do estoque),
   todas ou nenhuma, numa transação; a linha guarda o lote (único). Depois disso a linha conta só o que ainda falta SAIR pela requisição do lote
   (o que saiu já está no saldo); o lote concluído não conta. Provado: entregar a requisição do molho baixa uma vez e o "comprar" de todos os
   insumos fica igual; o insumo que o lote deixou abaixo de zero continua na conta (vai usar 0, comprar = o buraco). Os lotes do mesmo dia
   planejados fora da lista (Nova produção) aparecem ("Também planejados para este dia") e entram na conta.
5. **A linha que virou lote não muda** (224). Nem sai da lista: regra e gatilho `ListaProducaoItem_lote_confere` (até por SQL cru). Cancelar o
   lote (3.1) devolve a linha à lista (editável; "lote X cancelado"), e ela pode virar outro lote. O lote de uma linha é da mesma loja, do
   mesmo dia e da mesma ficha (gatilho); a lista não muda de loja nem de dia (gatilho).
6. **Idempotência, travas e período** (224). Uma lista por loja e dia (índice único; criar = `createMany` com `skipDuplicates` e ler
   `FOR UPDATE`). Toda escrita confere a versão lida; o MESMO conteúdo já gravado volta "já feito" (duplo clique, outra aba). Ordem das travas:
   período (compartilhada) → a lista (`FOR UPDATE`) → as da 3.1 dentro de planejar (dia do lote, requisição da loja). Dia da lista em período
   FECHADO do DRE: salvar, pôr e gerar são recusados com a frase de sempre, e a tela mostra o `AvisoDoPeriodoFechado` antes.
7. **Para quem compra** (226). A lista não faz pedido: "Lançar nota" leva a Compras. Custo estimado do que falta (último preço pago, fração
   exata, "sem contar X (sem preço)") só para quem tem `insumos.ver` E define a lista ou compra (rodada 1: a cozinha lê só quantidades),
   montado no servidor. O orçamento de compra da 2.5 entra por
   `orcamentoNaNota` com a compra estimada somada, na vista de quem lê (quem não vê o DRE lê o limite seguro; quem não vê custos não leva o
   valor nem para a conta, que parte de zero).
8. **Tela** (225). Aba "Lista do dia" (a primeira da área Produção: o card da área abre nela); escolha da loja quando há mais de uma; o dia
   (Ontem · Hoje · Amanhã + outro dia); "O que produzir" (as que viraram lote, com a etapa e o link do lote; as em aberto, no formulário de
   celular: seletor em largura cheia, quantidade de 48 px com teclado de números e a unidade ao lado); "Pré-preparos que entram nas receitas";
   "Matéria-prima: vai usar, tem e comprar" (tabela Corporativo a partir de 768 px, cartões abaixo); "Para quem compra"; histórico da lista.
   O mesmo no espelho do nível 1 (com rastro no `auditLog`).
9. **Histórico** (227). Entidade "Lista do dia": Montada (CRIOU), Mudou (ALTEROU, o que entrou, saiu e mudou de quantidade), Apagada (EXCLUIU),
   Lotes gerados (GEROU_LOTES, com os códigos); sem R$. O lote diz de qual lista veio ("da lista"). O filtro "Produção" do Histórico geral
   inclui a lista; quem não vê produção não recebe nada dela.
10. **Migration** (aditiva, segura para superusuário e para dono não-superusuário com e sem FORCE RLS; nenhum passo lê tabela de tenant).
    `npm run erp:conferir-migracao` confere as tabelas (e a RLS forçada quando as antigas têm), os dois índices únicos e os quatro gatilhos.
11. **Fora desta subfase**: o robô do cronograma (demanda por dia da semana, política de lote, lote mínimo, embalagem fechada, capacidade por
    turno), sugerir quantidades pelas vendas, exportar a lista em PDF, comparação de preço por fornecedor e cotações, pedido de compra
    automático, estoque mínimo e requisições pendentes de outros setores no "tem", "pegar da lista" com histórico e indicadores por funcionário
    (3.3), etiqueta do lote (3.4). Motivos na seção Kairu abaixo e na herança.

**Ajuda: chaves novas** (`ajuda.lock.json` regravado, 55 entradas): `producao-lista` (a escolha da loja) e `producao-lista-loja` (a lista: aula
sem R$ para todos, um bloco para quem define a lista e outro para quem registra produção; seções "Como a conta é feita" e "Para quem compra",
esta com blocos `para` de Compras e de custos).

### Referências Kairu consultadas (regra do plano)

Lidas pelo MCP da Kairu em 21/10/2026, conteúdo integral (não só o título):

| Material | O que foi lido | Aplicado | Adaptado | Deixado para outra fase (motivo) |
|---|---|---|---|---|
| `prompt:b3592b7c-e37b-4b1d-bffb-9053848afe28` "Da Ficha ao Fornecedor" (comunidade, Fill · Empada da Casa) | descrição e Full Prompt inteiros; os 3 prints NÃO foram abertos (só a legenda) | a tela "Pedido de produção" em três colunas (vai usar / tem / comprar; verde dá, vermelho falta — aqui sempre com a palavra); estoque negativo permitido e mostrado como alarme; quantidade sempre com a unidade; custo incompleto ≠ custo baixo ("sem contar X"); a cascata das fichas; "ninguém precisa abrir o estoque para saber se a produção para por falta" | "botão recalcula" = Salvar a lista refaz a conta no servidor; o pedido vira LOTE da 3.1 com requisição (a baixa é a entrega), não baixa direta; a trava de duplicidade de 2 dias virou versão lida + um lote por linha + linhas abertas sem ficha repetida; a ponte para a compra é o link para Compras e o orçamento da 2.5, sem lista de fornecedores | robô do cronograma (demanda por dia da semana, tendência com piso, curva ABC, política de lote, lote mínimo, embalagem fechada, teto, capacidade por turno): é "cronograma", não "lista do dia", e o próprio material pede 2 semanas em paralelo com a decisão humana antes; PDF para o mercado; comparação de preço e cotações (fase de compras); vínculo código do fornecedor × fator (já há variantes na 1.1) |
| `pass:producao-lotes-e-consumo` "Produção da cozinha" (oficial Kairu/Nina) | `read_material` inteiro, `blueprint.md` e `nina-origin.md`; `reference.mjs`, `fixtures.json`, testes e `demo.html` não foram abertos | "planejar não produz, não baixa ingrediente" (dito na tela ao gerar); criação idempotente (duplo clique não duplica OP); "custo desconhecido não é zero"; estados de tela (vazio, sem permissão, parcial = sem saldo com a frase); loja e período (o dia) como filtro; status e ação principal em 390 × 844 | `requestKey`/fingerprint = versão lida + "mesmo conteúdo = já feito" (a chave da 3.1 continua na Nova produção) | versão aprovada e imutável da ficha no lote (snapshot da receita), equipamentos, ciclos, consumo, tarifas e qualidade: fora do escopo do ERP agora (a 3.1 já retrata nome, unidade e validade do lote) |

## Provar a lista do dia (3.2)

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-producao-lista.test.ts` (sem banco, 22): a conta do molho cheddar (2,5 kg · 2,5 L · 885 g, a mesma da requisição), unidade e
embalagem padrão, negativo, sem saldo, a cascata (base que falta, base na lista, três níveis, círculo, ficha desativada), insumo desativado,
linha em lote (só o que falta sair), o negativo que o lote deixou (o comprar não some), o estado da linha, o custo exato, a leitura do
formulário, o dia e as frases. `tests/erp-producao-lista.db.test.ts` (16): o cenário inteiro (molho cheddar 5 kg + molho especial 4 kg:
cebola falta 1,565 kg, leite 500 ml, óleo 100 ml, base falta produzir 1 kg, compra estimada R$ 12,89), duplo clique e duas abas, edição com
histórico, apagar, permissões e alcance (cozinha, sem produção, gerente de outra loja, outro parceiro), custo e orçamento por perfil, gerar
(lotes da 3.1, nada no livro, conta igual), gerar em paralelo, sem segunda baixa (entregar a requisição: comprar igual), a linha travada (regra
e gatilho por SQL cru), cancelar e refazer, concluir, pôr na lista, lote fora da lista, loja sem estoque, dia fora, RLS e o teste MUTANTE do
período (segurar `travarParaFechar`: salvar espera ~900 ms e é recusado). Mutantes conferidos à mão: tirar a trava do período, a conferência
de versão ou o `FOR UPDATE` da lista derruba os testes. `tests/erp-producao-lista-telas.db.test.ts` (9): o HTML por perfil (gerente, cozinha,
chefe sem custos sem R$, comprador com o limite seguro e sem "orçamento"), as actions (lista-salva, lista-ja, lotes-gerados, lotes-ja, recusa
da cozinha), 404 de outra loja e de outro parceiro, a loja sem estoque, o dia que passou, o espelho do nível 1 e o Histórico geral.
`tests/erp-producao-lista-migracao.db.test.ts` (3): a migration com dado antigo nos 3 perfis do banco (superusuário, dono com FORCE RLS, dono
sem RLS), CHECKs, FKs, índices, gatilhos, RLS, o outro parceiro, e o conferidor acusando o gatilho e a RLS que faltarem.

Rodada final no código de `7ba31ba`: `prisma validate`, `tsc`, lint e portão de conteúdo limpos; `erp:conferir-migracao` e `migrate diff`
vazio no `ff_32`. Suíte inteira com banco, como superusuário: 89 arquivos e 1809 testes passando. Como dono com FORCE RLS (`ff_dono_32`;
arquivos da lista, da produção, da RLS e do isolamento): 101 de 102 passando. A única falha é a já registrada na 3.1: o banco montado por
psql não tem `_prisma_migrations`, que o teste da 0.2 lê. Sem RLS (`ff_semrls`, rodada da implementação): 523 passando e 9 pulados.

Na tela (build de produção do último commit de código, `7ba31ba`, com o `BUILD_ID` gerado às 17:26:45, depois do commit das 17:25:37;
porta 3100; banco `ff_32p` copiado do `ff_32`, com os dados feitos pelas regras do sistema em `.local-scripts/lista32.ts` e `lista32b.ts`,
fora do git: estoque da Vila da Penha aberto há 10 dias, fichas Molho cheddar, Cebola caramelizada e Maionese de bacon (com a cebola
dentro), o óleo abaixo de zero por uma requisição do salão entregue, a lista de amanhã, a da Delivery sem estoque aberto, meta do CMV de
30 %, um chefe = operador + "definir a lista do dia" − custos e um comprador = gerente sem DRE, despesas, faturamento e lista; roteiro
`prova32/jornada.mjs` no scratchpad, 32 conferências, 0 falha). O card da área Produção abre a Lista do dia; com duas lojas no acesso,
a escolha da loja; hoje ainda sem lista. O gerente, a 390 px com toque, monta Molho cheddar 5 kg e Maionese de bacon 2 kg (campo de
48 px, `inputmode=decimal`, o aviso "Há mudança por salvar"), salva e lê "falta 500 ml" no leite, o óleo "abaixo de zero", "falta
produzir 400 g" da cebola caramelizada e a compra estimada em R$. "Pôr na lista" põe a cebola (3 pré-preparos). Gerar com duplo toque
cria 3 lotes, não 6; as linhas mostram o lote planejado; nenhuma baixa no livro (a baixa é a entrega). A cozinha (operador) vê os 3
pré-preparos sem "Salvar" nem "Gerar", abre o lote pelo link, e o quadro de Lotes mostra os lotes da lista. O chefe sem custos monta a
lista e não recebe R$ nem "compra estimada" no conteúdo. O comprador vê "Para quem compra", "Lançar nota" e o limite seguro, sem
"orçamento" nem "passou", e não monta a lista. A Delivery mostra a frase do estoque não aberto, nunca "tem 0", e o gerar fica desabilitado
com o motivo escrito. Matriz: dona, gerente e operador × escolha da loja, lista de hoje, lista de amanhã e Delivery × 390, 820, 1180 e
1440 × claro e escuro (32 telas cada), mais chefe e comprador × 2 páginas × 390 e 1440 × 2 temas (8 cada). São 112 telas, com zero
rolagem lateral e zero violação do axe (wcag2a/2aa). Alvos abaixo de 44 px só no shell e no rastro (pular para o conteúdo, logo, links do
rastro, "Seu acesso"), que já existiam. O vão no topo de "O que produzir" mede 20 px, que é o padding do painel. Prints em
`pw/prova32/jornada/` (10, da jornada) e `pw/prova32/matriz-*/`. Observações: o console só registrou "Failed to fetch RSC payload" de
prefetch do Next abortado quando o roteiro navega (links do menu, com o navegador caindo na navegação normal), nada da lista. O "R$"
que aparece no HTML inteiro do chefe é o texto da ajuda do shell ("nunca R$ 0,00", da 0.6), não da lista; por isso a conferência olha o
`main`.

## Rodada de correção 1 da 3.2 (fiscais: Guardião e UX)

Decisões 228 a 230, e correções na 219, 224 e 226. Migration nova `20261030010000_erp_catalogo_v2` (só DADO: `PerfilAcesso`, fora do
tenant). Nenhuma estrutura mudou; `migrate diff` vazio.

| Achado | Correção | Teste |
|---|---|---|
| B1 (bloqueante): lote de fora da lista com pré-preparo dentro não entrava na cascata ("sem ficha", "ficha desativada" falso, sem "Pôr na lista") | fichas e insumos da conta lidos até fechar: as das linhas e dos lotes de fora, o que cada ficha usa e a ficha que produz cada pré-preparo que aparece (na receita ou saindo pela requisição) | `erp-producao-lista.db`: "lote de FORA… (revisão B1)", dois e três níveis iguais à conta como linha; adversarial A1 |
| I1: cancelar o lote não mudava a versão; a aba velha apagava a linha devolvida e o Gerar dela recriava o lote cancelado | cancelar e estornar travam a lista antes do lote e sobem a versão; o salvar manda `vistas` (linha não vista = conflito com a frase); o gerar manda `linha` (só essas) | "cancelar ou estornar… (revisão I1)", "cancelar e salvar ao mesmo tempo: sem deadlock"; telas (action sem `linha` = nada); adversariais A2 e A3 |
| M1: lista apagada e montada de novo voltava à versão 1; a aba velha sobrescrevia | a linha da lista fica (apagar = sem linhas), a versão segue | "editar…" (apagar, montar de novo, abas velhas em conflito, gerar numa apagada); adversarial A4 |
| M2: sócio de perfil próprio v1 ("copiado do Dono") deixava de cobrir Gerente e Dono base | migration de dado + regra pela versão gravada; os demais perfis v1 não ganham nada e a Equipe pede para revisar | `erp-permissoes` (puro: cobre, ninguém ganha indevido, SQL = catálogo); `erp-permissoes.db` (desativa, reativa e gera link do gerente; parcial com "revisar"; salvar leva à v2); migration com dado antigo nos 3 perfis do banco, duas vezes; adversarial A8 |
| UX I1: "Pôr na lista" apagava o que foi digitado e não salvo | desabilitado com o motivo enquanto há mudança por salvar (estado compartilhado no cliente) | jornada na tela |
| UX I2: confirmação fora da vista; "Salvar" vermelho de uma linha vazia depois de gerar | o aviso vem para a vista e recebe o foco (respeita `prefers-reduced-motion`); sem linha vazia com tudo em lote, "Salvar" secundário | telas ("depois de gerar…"); jornada |
| UX I3: a cozinha via R$ na lista | custo e "Para quem compra" só para `insumos.ver` E (planejar OU ver/lançar nota); bloco da ajuda só para quem compra | telas: HTML do operador padrão sem R$ |
| UX menores | quantidade em negrito na leitura; "use vírgula: 2,5 kg" e "maior que zero"; "nesta tela"; plural do Gerar; "com a requisição" no singular; dia fora do prazo sem frase repetida nem "Monte a lista"; fileira única a partir de 640 px; atalho "N insumos faltam · M abaixo de zero" | `erp-producao-lista` (frases); telas (fora do prazo, atalho, negrito) |

Mutantes conferidos (cada um derruba o teste dele): só as fichas das linhas (B1); sem subir a versão no cancelar; no estornar; sem a
conferência das `vistas`; gerar todas as em aberto em vez das pedidas; apagar a linha da lista; custo para todo `insumos.ver`; sem a regra
do catálogo.

Provas da rodada 1, no código de `a807000`:
- **Estáticos.** `prisma validate`, `tsc`, lint e portão limpos; `erp:conferir-migracao` ok e `migrate diff` vazio no `ff_32`.
- **Suíte com banco, superusuário.** 89 arquivos e 1816 testes passando.
- **Dono com FORCE RLS** (`ff_dono_32`; lista, telas da lista, produção, telas da produção, RLS, isolamento e permissões). 130 de 131
  passando. A única falha é a conhecida: o banco montado por psql não tem `_prisma_migrations`. O teste de migration precisa da URL de
  superusuário, porque cria os bancos; ele mesmo cobre os três perfis do banco e passou na suíte do superusuário.
- **Testes adversariais do Guardião.** 8 de 8 sem nenhuma mudança neles, como superusuário e como dono com FORCE RLS. Antes da correção
  falhavam A1, A2, A3, A4 e A8.

Na tela, rodada 1:
- **Build.** Produção de `a807000`, com o `BUILD_ID` gerado às 18:23:01, depois do commit das 18:21:20. Porta 3100, banco `ff_32r1`
  copiado do `ff_32`. Dados de `.local-scripts/lista32.ts`, `lista32b.ts` e `lista32r1.ts` (o lote de fora da lista, daqui a dois dias).
- **Jornada.** Roteiro `prova32r1/jornada.mjs` no scratchpad: 38 conferências, 0 falha. O gerente, a 390 px com toque, monta Molho
  cheddar 5 kg e Maionese de bacon 2 kg ("Gerar os 2 lotes" no plural) e salva: "Lista salva." vem para a vista com o foco. Ao digitar
  sem salvar, "Pôr na lista" e o Gerar ficam desabilitados com o motivo; ao voltar ao número salvo, liberam. Salva o 6, põe a cebola
  caramelizada na lista (o aviso na vista e com o foco) e gera com duplo toque: 3 lotes, o aviso "Lotes gerados." na vista, nenhuma
  linha vazia, "Salvar a lista" secundário e a frase de tudo em lote. O atalho "4 insumos faltam · 1 abaixo de zero: ver a
  matéria-prima" (44 px) leva ao painel. A cozinha (operador padrão, com "ver insumos e custos") lê vai usar / tem / falta, sem R$, sem
  "compra estimada" e sem "Para quem compra", com a quantidade em 600 na cor do texto.
- **B1 na tela.** Daqui a dois dias só existe a maionese de fora da lista, e a tela mostra a cebola caramelizada "falta produzir 300 g"
  com "Pôr na lista", sem "ficha desativada", e a cebola roxa em cascata. Fora do prazo, a frase aparece uma vez só, sem "Monte a lista".
  A 820 px, a linha cabe numa fileira (quantidade de 112 px). Chefe sem custos, comprador e Delivery como na 1ª rodada.
- **Matriz.** Dona, gerente e operador × escolha da loja, hoje, amanhã e Delivery × 390, 820, 1180 e 1440 × claro e escuro: 96 telas, zero
  rolagem lateral, zero violação do axe. R$ no `main` só para dona e gerente, nas páginas da Penha; nunca para o operador. Alvos abaixo de
  44 px só no shell e no rastro, que já existiam. No console, só o prefetch do Next abortado pela navegação do roteiro.
- **Prints.** Em `pw/prova32r1/jornada/` (12) e `pw/prova32r1/matriz-*/`.

## O que a 3.3 entregou — a cozinha pega a tarefa: quem fez, quanto e quando; histórico da produção e indicadores por pessoa

Terceira da Prioridade 003. Fecha o ciclo do lado da COZINHA: a gerência define a lista (3.2), a cozinha pega o que vai fazer,
executa e conclui pela regra da 3.1, e isso vira histórico e indicadores por pessoa. Migration `20261031000000_erp_producao_equipe`
(ADITIVA: uma coluna, quatro CHECKs e dois índices em `OrdemProducao`; nenhuma tabela nova; `migrate diff` vazio). Decisões 231 a
240. Nenhuma permissão nova (catálogo segue na versão 2). `VERSAO_DO_ERP` = fase 3.3.

1. **Quem é o funcionário** (231). A pessoa do login: `responsavelUsuarioId` (texto, sem FK: a credencial mora fora do tenant) e
   `responsavelNomeSnapshot`, que já existiam, e `responsavelDesde` (nova). No tablet compartilhado cada um entra com o próprio
   acesso: a tela diz "Você está como Caio" e tem "Não é você? Trocar de pessoa". O `Colaborador` da 0.1 continua sem uso,
   reservado para quem trabalha sem login (o freelancer da fase tardia). O nível 1 não pega.
2. **Pegar é começar** (232, 233). Na tela da cozinha (aba Tarefas), "Pegar" leva o lote de Planejada a Em produção com o nome e
   a hora (`pegarProducao`, que é o `iniciarProducao` da 3.1). A linha da lista de HOJE que ainda não virou lote vira o lote dela
   na hora em que alguém pega (`pegarDaLista`: `planejarProducaoNaTx` + `pegarNaTx`, numa transação, travando período → lista → as
   da 3.1). Duplo toque = "já feito"; duas pessoas ao mesmo tempo = uma pega e a outra lê "Este lote está com Caio (pegou às
   09:12)"; a linha que a gerência mudou depois que a tela abriu é conflito. Pegar não toca no livro do estoque: nada de segunda
   produção nem de segunda baixa (a baixa continua sendo a entrega da requisição).
3. **Soltar e passar** (234). Quem pegou solta o próprio lote (com motivo): ele fica Em produção, sem ninguém, e volta para "Para
   pegar". A gerência (`producao.planejar`) solta o de qualquer pessoa e passa para outra — só quem registra produção na loja,
   lido das credenciais no servidor (`pessoasQueProduzem`); a hora de quem recebe começa agora. Histórico: Pegou, Soltou, Passou.
4. **Concluir** (235). A conclusão da 3.1 (rendimento real, motivo fora de ±10%, validade), aberta pela tela da cozinha
   (`?de=tarefas` volta para ela). O lote com outra pessoa só ela ou a gerência conclui ou cancela. Quem pegou fica como "quem
   fez" mesmo se a gerência concluir ("quem fez: Duda" no histórico da conclusão); sem pegar, quem conclui é quem fez; o nível 1
   nunca é. O banco não deixa concluir antes de pegar nem dar dono a lote planejado.
5. **Histórico da produção** (238). Aba Histórico: os lotes encerrados da loja no período (Hoje · 7 dias · 30 dias, ou de/até, até
   92 dias), com filtros de pessoa e pré-preparo: o quê, quanto (produzido de planejado), rendimento ("fora de ±10%" escrito),
   quem fez e quem concluiu, quando pegou e quando terminou, o tempo e o motivo. Concluídos, perdidos, estornados e cancelados. O
   custo do lote só para quem tem `insumos.ver` (o servidor não manda). Sem dado é frase ("sem hora de pegar", "cancelado antes de
   produzir"), nunca zero.
6. **Indicadores por pessoa** (236, 237). Aba Indicadores, da gerência: de cada pessoa, lotes concluídos, quanto produziu de cada
   ficha, rendimento médio contra o planejado (cada lote pesa igual; os perdidos à parte), fora de ±10%, tempo médio (de pegar, ou
   da entrega dos insumos se foi depois, até concluir), perdidos, cancelados com ela e estornados. Sempre com o período e a
   amostra ("1 lote: amostra pequena, ainda não diz muito"); ordem alfabética, sem nota, sem cor por pessoa e sem R$. HIPÓTESE a
   validar com a casa (decisão 237).
7. **Telas** (240). Tarefas: celular e tablet primeiro, botões de 56 px (`classeDeBotaoDaCozinha`), cartões "Com você" (Concluir,
   desabilitado com o motivo enquanto os insumos não saem; Soltar), "Para pegar", "Com outras pessoas" (a gerência solta e passa)
   e "Feitas hoje". A cozinha entra na área Produção pelas Tarefas; a gerência continua entrando pela Lista do dia. Histórico e
   Indicadores: tabela Corporativo a partir de 1280 px e cartões abaixo. O lote mostra quem está com ele (e "Quem fez" depois);
   o quadro de Lotes diz "com Caio · pegou 09:12"; a lista mostra "com Caio" no lote em produção e tem "Pegar na cozinha". O mesmo
   no espelho do nível 1 (que vê, solta e passa, com rastro no `auditLog`, mas não pega). De quebra, para todas as telas: o
   "Voltar para…" (componente `Voltar`) fica com 44 px no toque em qualquer largura (antes, 20 px no tablet a partir de 640 px).
8. **Migration** (239, aditiva, segura para superusuário e para dono não-superusuário com e sem FORCE RLS; nenhum passo lê tabela de
   tenant): `responsavelDesde`, os CHECKs `OrdemProducao_responsavel_{com_pessoa,so_em_producao,antes_do_fim,nome_curto}` (`NOT VALID`
   + `VALIDATE` em bloco que avisa) e os índices `(parceiroId, lojaId, concluidaEm)` e `(parceiroId, lojaId, canceladaEm)`. O gatilho
   `OrdemProducao_concluida_imutavel` (3.1) já cobre a coluna nova. `npm run erp:conferir-migracao` confere os CHECKs e os índices.
9. **Fora desta subfase**: freelancers (cadastro por QR Code, termo, check-in, diária: fase tardia, `library:controle-freelancers`;
   o `Colaborador` fica para eles); escala de tarefas (pré-atribuir um lote planejado a alguém); "só os meus" no histórico da
   cozinha; ranking ou meta por pessoa; R$ por pessoa; tempo por etapa (apontamento); produção retroativa; etiqueta do lote (3.4).

**Ajuda: chaves novas/alteradas** (`ajuda.lock.json` regravado, 61 entradas). Novas: `producao-tarefas`, `producao-tarefas-loja`,
`producao-historico`, `producao-historico-loja`, `producao-indicadores`, `producao-indicadores-loja`. Alteradas: `producao-lista-loja`
v2 → v3 (a cozinha pega em Tarefas), `producao-quadro` v1 → v2 (o cartão diz quem pegou), `producao-lote` v1 → v2 (quem está com o
lote) e `producao-concluir` v1 → v2 (quem pegou fica como quem fez).

### Referências Kairu consultadas (regra do plano)

Lidas pelo MCP da Kairu em 21/10/2026, conteúdo integral (não só o título); a página do Notion "Fase tardia · Controle de freelancers"
lida pelo MCP do Notion (só para não fechar a porta). Buscas "desempenho funcionário", "indicadores equipe" e "equipe cozinha
produtividade" na biblioteca: nenhum material; "freelancer": o oficial abaixo e um da comunidade sobre pagamento (Santander, não lido:
fora do tema).

| Material | O que foi lido | Aplicado | Adaptado | Deixado para outra fase (motivo) |
|---|---|---|---|---|
| `prompt:b3592b7c-e37b-4b1d-bffb-9053848afe28` "Da Ficha ao Fornecedor" (comunidade, Fill · Empada da Casa) | descrição e Full Prompt inteiros, de novo nesta subfase (os 3 prints NÃO foram abertos) | a tela da cozinha como "outra coisa": fonte grande, poucos botões, alvo de toque generoso (56 px), que funcione com a mão suja e confirme visualmente cada registro (o aviso do que aconteceu vem para a vista); "todo movimento guarda tipo, referência e autor" (quem pegou, soltou, passou e concluiu, com motivo); "registrar o que saiu" = a conclusão da 3.1 | "perfil de acesso próprio: quem opera aqui não navega no resto do sistema" virou entrada da área pelas Tarefas para quem produz e não define a lista, sem esconder o resto (as permissões da 0.4 já recortam o que cada um vê); "categorias em caixa alta" não entra (o contrato visual do ERP só usa caixa alta no hub e no menu) | o lançamento de produção sem ordem (o tablet registra o que saiu direto): aqui a produção nasce na lista/lote, para a baixa ser a da requisição; a trava de duplicidade de 2 dias (a idempotência da 3.1/3.2 já cobre); busca por número de lote (etiqueta, 3.4) |
| `pass:producao-lotes-e-consumo` "Produção da cozinha" (oficial Kairu/Nina) | `read_material` inteiro, `blueprint.md` e `nina-origin.md` (pelo `read_design_file`); `reference.mjs`, `fixtures.json`, testes e `demo.html` não foram abertos | "planejado × realizado" sempre lado a lado (histórico: "5,6 kg de 6 kg"); "operador inicia o trabalho e, ao terminar, informa a quantidade" (pegar = iniciar, concluir da 3.1); `ProductionEvent` com ator, de/para e motivo, só acrescentando (o histórico do lote); estados com transições sem volta por clique (soltar não volta a Planejada); "custo por kg só se a quantidade real é conhecida e positiva; não dividir pelo planejado" (o custo do lote da 3.1 no histórico); "status e ação principal em 390 × 844"; estados de tela (vazio, sem permissão, parcial) | `expectedVersion` = a versão lida do lote em pegar, soltar e passar; "reatribuição exige evento explícito" (do ciclo do forno) virou "passar para outra pessoa" com motivo e histórico | equipamentos, ciclos, consumo, tarifas e qualidade (fora do ERP agora); versão aprovada da ficha no lote (a 3.1 já retrata nome, unidade e validade) |
| `library:controle-freelancers` "Organize freelancers do QR Code ao plantão" (oficial Kairu, v1.0.0) e a página do Notion | prompt inteiro e a documentação; o print não foi aberto | nada implementado (fase tardia, por pedido) | "quem fez" ficou aberto a quem não tem login: o `Colaborador` e `OrdemProducao.responsavelId` seguem reservados; o check-in (presença) não é "quem fez" — a 3.3 também separa pegar (quem) de concluir (o resultado) | o módulo inteiro: cadastro por QR, termo, check-in, quadro do dia, diária e pagamento |

## Provar a cozinha (3.3)

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-producao-equipe.test.ts` (sem banco, 13): o período (7 dias por padrão, hoje e 30 dias, de/até trocados, futuro e mais de 92
dias sempre com o aviso), o desfecho (concluído, perdido, estornado, cancelado), o dia do lote pelo relógio do Rio (23:30 de 20/10 é de
20/10), o rendimento em palavras, o tempo (de pegar ou da entrega, se foi depois; sem hora de pegar, nada), o resumo, a frase de quem
pegou e a recusa a quem tenta pegar, concluir ou cancelar o lote de outra pessoa, e os indicadores (Caio: 3 concluídos, 1 perdido, 1
cancelado, 14 kg de 15 kg = 93,3 %, um fora da faixa; Duda: amostra pequena, o estornado fora da média; a mesma pessoa com nome novo
aparece uma vez). `tests/erp-producao-equipe.db.test.ts` (15): a tela da cozinha; pegar da lista (o lote nasce pela regra do Gerar, com
a requisição e nada no livro, já com Caio e a hora; duplo toque = o mesmo lote); duas pessoas na mesma linha ao mesmo tempo (um lote
só, a outra lê quem pegou); a linha que a gerência mudou depois que a tela abriu (conflito); pegar o lote planejado em paralelo; soltar
(só quem pegou ou a gerência, com motivo); passar (só a gerência, só para quem registra produção na loja, o planejado não se passa, a
hora de quem recebe começa agora); concluir e cancelar o lote de outra pessoa (só ela ou a gerência; quem pegou fica como quem fez;
sem segunda baixa); o nível 1 não pega; alcance e isolamento (gerente de outra loja, outro parceiro, loja sem estoque); histórico (R$
só com `insumos.ver`); indicadores (só a gerência, sem R$); o banco recusando por SQL cru (dono em lote planejado, dono sem pessoa, troca
de dono no concluído); o estorno guarda quem fez; e o MUTANTE do período (segurar o fechamento: pegar da lista espera e é recusado com
a frase; o lote que já existe ainda se pega). `tests/erp-producao-equipe-telas.db.test.ts` (9): o HTML por perfil (a cozinha com quem
está usando, o botão de 56 px, sem gerência e sem R$; a Duda vendo o lote do Caio sem pegar nem passar e a action de soltar recusada;
a gerência passando só para quem está na lista), as actions voltando às tarefas, o concluir vindo das tarefas, o histórico com e sem
custo, os indicadores só da gerência, 404 de outra loja e de outro parceiro nas três telas, o nível 1 que vê e passa mas não pega, e
"quem fez" no lote concluído. `tests/erp-producao-equipe-migracao.db.test.ts` (3): a migration com dado antigo nos 3 perfis do banco
(superusuário, dono com FORCE RLS, dono sem RLS): nada some, sem aviso, coluna, CHECKs validados, índices, as regras pelo papel do
tenant e o conferidor sem pendência. Mutantes conferidos à mão (6 de 6 derrubam testes): tirar a trava do período em `pegarDaLista`,
tirar o `FOR UPDATE` da lista, deixar pegar o lote de outra pessoa, deixar concluir o lote de outra pessoa, deixar soltar o lote de
outra pessoa e deixar a conclusão sobrescrever quem fez.

Rodada final no código de `159e6fd`: `prisma validate`, `tsc`, lint e portão de conteúdo limpos; `erp:conferir-migracao` e `migrate diff`
vazio no `ff_33`. Suíte inteira com banco, como superusuário: 93 arquivos e 1862 testes passando. Como dono com FORCE RLS (`ff_dono_32`; arquivos da produção,
da lista, da equipe, da RLS, do isolamento e das permissões, 9 arquivos): 154 de 155 passando; a única falha é a já registrada na 3.1 (o
banco montado por psql não tem `_prisma_migrations`, que o teste da 0.2 lê). Sem RLS (`ff_semrls_32`, 7 arquivos): 107 passando e 1
pulado.

Na tela (build de produção do último commit de código, `159e6fd`, com o `BUILD_ID` gerado às 21:02:26, depois do commit das 21:01:16;
porta 3100; banco `ff_33` copiado do `ff_32r1`, com os dados feitos pelas regras do sistema em `.local-scripts/equipe33.ts`, fora do git:
a Duda Lima (Operador, cozinha) e uma semana de produção da Vila da Penha, de 15/10 a 20/10, com o relógio de cada dia — a pessoa
pega, o estoque entrega e a pessoa conclui; um fora da faixa, um perdido, um cancelado com a Duda e um concluído sem pegar —; roteiro
`prova33/jornada.mjs` no scratchpad, 41 conferências, 0 falha). O gerente gera 1 lote na Lista do dia (a Produção abre nela, como na
3.2). O Otto, no celular (390 px com toque), entra na área pelas Tarefas, escolhe a loja (a escolha diz quantas tarefas há para pegar),
lê "Você está como Otto Operador" e "Trocar de pessoa", vê "Para pegar 5" sem R$, e pega o molho de 6 kg com o botão de 56 px: o lote
vai a Em produção com ele, o livro do estoque não muda e o aviso "Lote pego" vem para a vista com o foco. O Concluir fica desabilitado
com o motivo até o estoque entregar. A Duda vê "com Otto Operador · pegou HH:MM", sem Passar; as duas tocam ao mesmo tempo na
maionese e só uma fica com ela; quem perdeu lê "Este lote está com Duda Lima (pegou às 17:47)…"; no lote do Otto, o Concluir dela
diz "Está com Otto Operador". O estoque entrega a requisição, o Concluir vira link, a conclusão diz "Voltar para as tarefas" e volta
para elas; "Feitas hoje" mostra "5,6 kg de 6 kg · rendeu 93,3 % · Otto". O Otto pega a linha de 2 kg da lista: ela vira o lote naquela
hora, já com ele. A gerência, no desktop, passa esse lote para a Duda com motivo (o histórico guarda o motivo e quem passou) e o
formulário fecha. Histórico (7 dias): o resumo do período, o custo do lote para o gerente, "sem hora de pegar" (nunca 0) no concluído
sem pegar, o cancelado com o motivo e o filtro do Otto. Indicadores: Chico, Duda e Otto em ordem alfabética, o aviso de que é retrato e
não nota, a amostra pequena dita e nenhum R$; a cozinha que tenta abrir os indicadores volta para o hub. Matriz (`prova33/matriz.mjs`, axe wcag2a/2aa): dona e gerente × Tarefas (escolha e loja), Histórico, Indicadores, lote em
produção, lote com a requisição e quadro de Lotes; a Duda (cozinha) × Tarefas (escolha e loja), Histórico, lote, Concluir vindo das
tarefas e quadro; × 390, 820, 1180 e 1440 × claro e escuro. São 160 telas, com zero rolagem lateral e zero violação do axe. Alvos abaixo
de 32 px no toque só no shell (pular para o conteúdo, logo, "Seu acesso"), que já existiam, e o "Ver o estoque" do cabeçalho do painel
do lote (3.1, 20 px no tablet: fica para a revisão de UX). Prints em
`pw/prova33/jornada/` (10, da jornada) e `pw/prova33/matriz-{dona,gerente,cozinha}/`.

Observações: (1) o console só registrou o 404 do `favicon.ico` (já existia) e "Failed to fetch RSC payload" de prefetch do Next abortado
quando o roteiro navega; nada das telas da 3.3. (2) A matriz abre uma página nova por endereço: o print `fullPage` do Playwright desliga
a emulação de toque da página (`pointer: coarse` passa a não casar) e, nas rodadas anteriores, todo alvo que depende do toque (o rastro,
"Ver os lotes", "Abrir a requisição") aparecia como pequeno depois do primeiro print — medido à parte, 44 a 48 px. (3) O "R$" que aparece
no `main` do histórico da cozinha é o custo do lote: o Operador tem `insumos.ver` no perfil padrão; sem essa permissão o servidor nem
manda o custo (teste de telas). (4) Na revisão das telas saíram quatro acertos, já no código: a hora do histórico pelo dia da linha
(no lote encerrado em 21/10, "pegou 20/10 às 23:50 · fim 00:30"), o botão da cozinha que quebra a linha em vez de vazar e os botões do formulário um embaixo do
outro no cartão, "Trocar de pessoa" alinhado no celular, e o formulário de passar/soltar que fecha depois de gravar (antes, o lote
passado ficava no mesmo lugar com o formulário aberto e um segundo toque passaria de novo).

## Polimento da 3.3 (depois da aprovação dos fiscais)

Rodada curta, sem mexer no que foi aprovado (concorrência, travas, permissões, isolamento). Sem migration. Decisões 241 e 242;
ajuste na 237. Ajuda: `producao-indicadores-loja` v1 → v2 ("Cancelou" e a FlowFoods fora das pessoas); `producao-concluir`
ganhou a rota nova (lock regravado, 61 entradas).

| Item | O que mudou |
|---|---|
| Nível 1 como pessoa (Guardião M1) | O lote que o nível 1 concluiu na 3.1 tem o login dele gravado. Na LEITURA, quem não tem vínculo com o parceiro (`idsDaEquipe`, credenciais) é a FlowFoods: fora dos indicadores (nota "concluído pela FlowFoods"), do filtro de pessoa e do "quem fez" do histórico ("FlowFoods · concluiu: Rodolfo"). A linha não muda. |
| Cancelados (UX) | "Cancelou" conta só o que a própria pessoa cancelou; os da gerência ficam à parte e não contam para ela. No histórico, o cancelado diz "estava com X" e "cancelou: Gil Gerente (gerência)". |
| Recebeu × pegou (UX) | O lote que a gerência passou diz "recebeu 18:14 (passado por Gil Gerente)" no cartão das Tarefas, no quadro, no lote e no histórico (`passadosPor`, do histórico do lote). |
| Passar relê o acesso (Guardião M2) | `passarProducao` chama `aindaPode` DENTRO da gravação, com o lote travado: a pessoa escolhida tem de continuar ativa, da loja e com "registrar produção" (`aindaProduzNaLoja`). Senão, recusa em "Para quem" e nada é gravado. |
| "Manter" depois do erro | Fecha o formulário de soltar e de passar; o erro dispensado não volta ao reabrir. |
| Abas no celular | Componente comum: a aba atual vem para a vista dentro do trilho (só o trilho rola, sem animação). Vale para o ERP todo. |
| Indicadores no celular | Abaixo de 640 px, o valor embaixo do rótulo; "Ver os lotes" sem quebrar. |
| Perdeu a corrida | O "Pegar" some do cartão; ficam a frase de quem pegou e "Ver de novo". |
| Textos | Subtítulo da escolha de loja com maiúscula; aviso de estoque não aberto (e de período fechado) uma vez só, no alto; o Concluir das Tarefas em `/producao/tarefas/<loja>/<lote>/concluir`, com a aba Tarefas marcada (o endereço antigo continua). |
| "Ver o estoque" (3.1) | Folga de toque: 48 px no tablet. |
| Fica para o Rodolfo | O operador vê R$ no Histórico e no Concluir porque tem `insumos.ver`; na Lista do dia a 3.2 escondeu. Nada mudou: pendência na Herança da 3.3. **Resolvido em 25/10/2026 (decisão 460): R$ da produção só com `insumos.ver` e `compras.ver` na loja.** |

**Provas** (código de `52ecd91`; build com o `BUILD_ID` gerado às 21:51:38, depois do commit das 21:50:30). Testes novos ou
mexidos: `tests/erp-producao-equipe-polimento.test.ts` (5, sem banco: "recebeu", quem cancelou, "Manter" com erro, perder a
corrida, a rolagem da aba); `tests/erp-producao-equipe.db.test.ts` (+2: o lote legado montado como a 3.1 gravava, com o gatilho
desligado só na transação, fora das pessoas, do filtro e dos indicadores; a releitura do passar provada SOB a trava — outra
conexão tenta travar o lote com NOWAIT e não consegue — e "recebeu" nas tarefas, no lote e no quadro); telas (+1 e asserções
novas) e navegação (a rota nova acende Tarefas). Mutantes: tirar o filtro da equipe e reler antes da transação derrubam os
testes. tsc, lint e portão de conteúdo limpos. Suíte inteira com banco, como superusuário: 94 arquivos e 1871 testes passando. Como dono com FORCE RLS (`ff_dono_32`, 9 arquivos): 157 de 158 (a
falha é a conhecida do `_prisma_migrations`); sem RLS (`ff_semrls_32`, 7 arquivos): 110 passando e 1 pulado. O teste do lote
legado desliga o FORCE e o gatilho só na transação dele, como a limpeza (sem isso, com a RLS forçada, o UPDATE do dono não
achava a linha). Na tela, banco `ff_33`
recriado da base com `.local-scripts/legado33p.ts` (um lote de ontem concluído pelo nível 1 com o login gravado, fora do git):
a jornada da 3.3 (`prova33/jornada.mjs`, 41 conferências) e a do polimento (`prova33p/jornada-p.mjs`, 25 conferências), 0
falha. Matriz das telas mexidas (Tarefas e a escolha, Histórico, Indicadores, lote em produção, lote solto, lote concluído,
quadro, Concluir pelas Tarefas, Delivery) × gerente, cozinha (Duda) e dona × 390 e 1180 com toque e 1440 × claro e escuro:
108 telas, zero rolagem lateral e zero violação do axe; alvos abaixo de 32 px só no shell. Console: só o 404 do `favicon.ico`
e o prefetch do Next abortado. Prints em `pw/prova33p/jornada/` (8) e `pw/prova33p/matriz-{gerente,cozinha,dona}/`.

## O que a I.1a entregou — categorias de insumo, obrigatoriedade, confirmação ao salvar e idempotência

Prioridade do Rodolfo de 21/10/2026 (cadastro de insumos), primeira metade. Migrations ADITIVAS `20261101000000_erp_insumo_categorias` (uma
tabela de tenant e colunas anuláveis em `Insumo`) e `20261101010000_erp_catalogo_v3` (só dado). Decisões 243 a 258. Permissão nova
`insumos.categorias`. `VERSAO_DO_ERP` não mudou (a fase é "3.3" até a I.1b fechar a prioridade).

1. **Categorias** (243, 244). `CategoriaInsumo` do parceiro, com as dez do plano (nomes exatos: Proteína; Hortifruti; Mercearias e secos;
   Laticínios, frios e embutidos; Congelados e industrializados; Panificação; Bebidas; Descartáveis e embalagens; Limpeza e higienização;
   Outros / a classificar), semeadas por `npm run erp:semear-categorias` (idempotente por `chave`; só ele devolve uma padrão que a casa tirou) e sozinhas UMA vez, na primeira abertura de
   casa sem categoria nenhuma, em nome do "Sistema" e nunca pela migration; abrir tela depois não recria nada (250). Aba **Categorias** (`insumos/categorias`): criar (entra antes de "Outros"), renomear (com a
   versão lida), subir e descer, desativar (com uso: o insumo continua nela) e reativar, excluir (só sem insumo e sem passagem no
   histórico). "Outros / a classificar" é do sistema: sem botões, e o gatilho do banco recusa até SQL cru. Tudo com antes/depois no
   histórico. Gerir é `insumos.categorias` (rede inteira; só o Dono pelo perfil base); quem só vê lê a lista. Nome único sem diferenciar
   caixa nem acento.
2. **Sugestão pelo nome** (245): `categoria-sugestao.ts`, puro e determinístico, com 71 testes de nomes reais. Farinha → Mercearias e secos;
   coxa de frango congelada → Proteína; pão → Panificação; molho → Mercearias e secos; ambíguo ou desconhecido → Outros com o motivo.
3. **Cadastro** (246, 252, 253). Nome, categoria e unidade base obrigatórios: marcados "(obrigatório)" com `aria-required`, a unidade não
   vem pré-marcada, a categoria sai sugerida (texto "Sugerida pelo nome ("farinha")", trocável, com "Voltar à sugestão") e o servidor
   recusa cada falta no campo, com o resumo, o foco no primeiro problema e o formulário preservado. Depois de salvar: "Insumo salvo com
   sucesso: <nome>" (criado) ou "Insumo atualizado com sucesso: <nome>" (atualizado), região viva preenchida depois da montagem, com "Cadastrar
   outro insumo" e "Ver todos os insumos". Reenvio com a mesma chave devolve o mesmo insumo (um só, mesmo em 5 pedidos paralelos);
   resposta perdida volta como "não deu para confirmar" e tocar de novo não duplica. Pré-preparo criado pela ficha recebe a sugestão
   (ambíguo vai para Outros e a ficha não trava). A chave de envio é por pessoa (252). "Cadastrar outro insumo" abre com tipo, unidade e
   conservação do último (258). Nome em NFC e sem caracteres invisíveis (255).
4. **Classificação assistida dos antigos** (247): aba **Classificar insumos** e o script `erp:classificar-insumos` (`--previa` padrão,
   `--aplicar`, `--reverter <lote>`, `--parceiro`). Prévia sem gravar; aplicar só onde `categoriaId` é nulo, um CLASSIFICOU por insumo;
   2ª vez muda 0; reverter só o intocado; **fila de revisão** (sem categoria ou em Outros, com o motivo, a sugestão e o valor) com edição
   em lote (até 200); contagem e valor sem categoria também no alto da lista de Insumos. A lista ganhou a coluna e o filtro de categoria
   (inclui "Sem categoria" e "A revisar"). Aplicar e desfazer são `insumos.categorias`; classificar em lote é `insumos.editar`.
   "Classificar os N" fica preso à prévia mostrada (257); desfazer não tira a categoria do que uma pessoa salvou depois (256); a fila
   tem "Aceitar a sugestão dos marcados" (258); a página exige `insumos.ver` além de `insumos.editar`.
5. **Nomes parecidos** (251): o que já existia ("Cebola"/"cebola") não é mexido; aparece em Classificar e na prévia do script.
6. **Seed**: `npm run erp:seed-teste` semeia as dez e manda a categoria sugerida; confere o client gerado (`prisma generate`) antes de começar.

### Referências Kairu consultadas (regra do plano)

Lidas pelo MCP da Kairu em 21/10/2026 (análise da I.1), conteúdo integral: `prompt:b3592b7c…` "Da Ficha ao Fornecedor", "Estoque unificado"
(Notion, snapshot de 14/10), `library:inventario-ciclico`, `pass:inventario-contagem-divergencias` e `pass:cmv-fichas-e-margem` (só o prompt).
Buscas "cadastro de insumos categorias", "estoque insumos" e "compras fornecedor": nenhum prompt Kairu sobre categoria ou cadastro de insumo.

| Material | Aplicado | Adaptado | Deixado para depois |
|---|---|---|---|
| Da Ficha ao Fornecedor | custo ausente é pendência, nunca 0; custo incompleto não é custo baixo (o valor sem categoria diz "sem saldo", não R$ 0) | "um clique, um pedido" virou chave de envio + impressão do conteúdo no servidor | cronograma e política de lote (fase 3.x) |
| Inventário cíclico e divergências | "grupo" do inventário é diferente de setor físico: a categoria não é conservação nem onde fica | — | contagem por categoria (I.2) |
| CMV, fichas e margem | categoria é o eixo do CMV gerencial; fotografia de período fechado não muda | a classificação nunca reescreve período fechado (o CMV 2.3 não lê categoria) | meta e desvio por categoria (I.2) |
| Idempotência (pacotes de inventário) | mesma chave + mesmo conteúdo = mesmo resultado; mesma chave com conteúdo diferente = recusa | `409` virou frase no formulário | — |

## Provar a I.1a

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco: 71 de sugestão, permissões v3, navegação, ajuda
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism   # com banco, 2x
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-categoria-sugestao.test.ts` (71, sem banco): as dez, o nome sem caixa nem acento (e a tabela de acentos igual à do banco), os
exemplos do plano, 50 nomes reais, conservação que não decide, natureza que vence "congelados", ambíguo e desconhecido com motivo.
`tests/erp-categorias.db.test.ts` (31): as dez, criar/renomear/mover/desativar/excluir, "Outros" por regra e por gatilho, isolamento (regra,
FK composta, RLS), obrigatoriedade, SUGESTAO × MANUAL, reenvio (inclusive 5 em paralelo), nome parecido (inclusive em paralelo), insumo
antigo, pré-preparo da ficha, a classificação assistida inteira (prévia sem gravar, aplicar, idempotência, fila, lote, reverter só o
intocado, retrato de tudo que não é categoria idêntico) e as actions por perfil. `tests/erp-insumo-categorias-migracao.db.test.ts` (3): a
migration com dado antigo (nomes parecidos incluídos) como superusuário, dono com FORCE RLS e dono sem RLS, sem WARNING, categoria nula,
tabela com CHECKs, índices, gatilho e RLS, e o conferidor acusando o gatilho, o CHECK e a RLS que faltarem. Mutante conferido: tirar a
trava por parceiro do cadastro derruba os testes de paralelo. Os outros testes com banco passaram a cadastrar insumo por
`cadastrarInsumoDeTeste` (`tests/erp-db-apoio.ts`), que semeia as dez e manda a sugestão.

**Resultado da prova (2026-10-22, depois do veto do Guardião).** `npx vitest run` sem banco: 55 arquivos, 1352 testes passando (os de banco
pulados). Com banco (`ff_dev`, superusuário), duas rodadas seguidas: 97 arquivos, 1994 testes, todos passando. Como dono não-superusuário com
FORCE RLS e como dono sem RLS: os 6 arquivos de banco tocados (categorias, insumos, isolamento, permissões, compras, ajuda) com 122 testes
cada, passando. O teste de migração (`erp-insumo-categorias-migracao.db.test.ts`, 3 perfis) cria os próprios bancos e por isso roda só com a
URL de superusuário. `prisma validate`, `typecheck`, `lint`, `gate` e `build` limpos; `erp:conferir-migracao` limpo; `migrate diff` vazio.
Testes novos do veto: abrir formulário, categorias, classificação e ficha como outra pessoa não recria a padrão excluída nem grava `CRIOU`
(só o script, com `completar`, a devolve); nome em NFC e sem invisíveis (insumo, categoria e chave do nome, inclusive no banco); chave de
envio por pessoa; edição que não troca a categoria tira o insumo do lote; "Classificar os N" preso à prévia; "Aceitar a sugestão dos
marcados".
Jornada no navegador (build de produção, banco recriado do zero, 154 conferências, todas ok): cadastro com sugestão e correção manual,
recusa sem categoria com "A sugestão era X" e "Voltar à sugestão", duplo clique, resposta perdida com reenvio, nome parecido, edição
("Insumo atualizado com sucesso"), "Cadastrar outro insumo" com tipo, unidade e conservação do último, aviso de salvo antes da caixa
"Como funciona", prévia/aplicar/idempotência/aceitar sugestão/fila/lote/reverter, CRUD das categorias, padrão excluída pela Dona que o
Operador e o Gerente não trazem de volta (nem `CRIOU` no histórico), "Outros" protegido, Gerente e Operador sem a permissão, isolamento de
outro parceiro e o nível 1 do /rodolfo. Matriz de 6 páginas x 4 tamanhos (1440, 1180, 820, 390) x 2 temas: sem rolagem lateral, sem
violação do axe (52 verificações) e sem texto cortado nos filtros da lista. Com ponteiro de toque real (`isMobile`), as páginas novas não têm
alvo abaixo de 44 px; sobraram só o cabeçalho ordenável da lista e o link "Voltar para a lista" no tablet, que já eram assim antes da I.1a.
Prints em `scratchpad/shots-I1a` (inclui `a2-outro-lembrado`, `a5-erro`, `a7-editado`). Scanner avoid-ai-design nos 25 arquivos de tela
tocados: 0 P0, 0 P1 e 5 P2 (metadado com ponto médio, padrão já usado nas outras telas do ERP).

## Herança da I.1a (para a I.1b, a I.2 e as próximas)

- **A I.1b recebe**: conservação sem valor padrão (hoje o formulário ainda abre em Seco) e o filtro "Conservação"; "Prazo de uso após
  abertura"; "Custo inicial de referência" (e a explicação do preço 0 como sentinela); marca de referência; tipo MATERIAL; "nome uma vez"
  (`?nome=` e volta nos links "Insumo que falta" da nota, da ficha e das embalagens; rótulo da embalagem). A unidade base já é explícita.
- **A I.2 recebe**: `CategoriaNaLoja` (meta e ativação por loja, herdando da rede), painéis de CMV por categoria e a vigência. `CategoriaInsumo`
  já tem `criadaEm`/`desativadaEm`; a classificação passada do insumo está no histórico (`categoria`/`categoriaId`). Ao somar CMV por categoria,
  use a categoria vigente do insumo e NÃO reescreva fotografia de período fechado; "excluir categoria" passa a conferir também as metas.
- **Script de semear** (`erp:semear-categorias`): sem argumento só semeia casa sem categoria nenhuma; devolver a padrão que a casa excluiu é
  ato explícito, `--completar` (teste em `tests/erp-semear-script.db.test.ts`).
- **Baixa — categoria forjada em casa que nunca abriu tela**: a action de criar categoria chamada direto numa casa sem nenhuma deixa só ela e
  "Outros"; as outras nove voltam pelo script com `--completar`.
- **Baixa — nome antigo com invisível**: um insumo já gravado com caractere invisível no nome ainda deixa cadastrar o mesmo nome limpo, porque
  o SQL compara `normalize(nome, NFC)` mas não tira invisíveis. Só vale para o que já existia; o que entra daqui em diante sai limpo.
- **Para a I.1b (UX)**: conferir a conservação lembrada no "Cadastrar outro insumo" com Refrigerado; "Aceitar a sugestão dos marcados" dizer
  quantos "sem certeza" ficaram de fora; "Ver todos os insumos" com forma de botão; print da lista a 390 px com o filtro de categoria.
- **Categoria única da rede** é desvio do "configuração por loja" do plano (decisão 243): fica para o Rodolfo confirmar.
- **Insumo sem categoria existe** (nulo no banco): toda leitura nova trata nulo como "sem categoria", nunca como erro.
- **Cadastro por outro caminho** (importação de insumos, integração) precisa mandar `categoriaId` (ou `entrada.categoriaId` ausente só edita
  insumo que já tem) e, se quiser idempotência, `envio`. Quem cria insumo fora de `cadastrarInsumo` (como o pré-preparo da ficha) usa
  `sugestaoParaInsumo`.
- **Teste que precisa de um insumo** usa `cadastrarInsumoDeTeste`; o teste da regra de cadastro fala direto com `cadastrarInsumo`.
- **Guarda do portão**: relação `insumos:` (e a chave de objeto com esse nome) é barrada pelo teste-guarda em qualquer arquivo; nomeie
  `nInsumos`, `itens`.
- **Ajuda**: `insumos` e `insumo-novo` e `insumo` subiram para a versão 2; as chaves novas são `insumo-categorias` e `insumo-classificar`.
  Os testes não fixam o número da versão de `insumos`.

## O que a I.1b entregou — clareza e correções do cadastro de insumos

Prioridade do Rodolfo de 21/10/2026 (cadastro de insumos), segunda metade. Duas migrations ADITIVAS: `20261102000000_erp_insumo_clareza`
(valor `MATERIAL` em `InsumoTipo` e `Insumo.marcaReferencia`, com CHECK) e `20261102010000_erp_insumo_conservacao_confirmada`
(`Insumo.conservacaoConfirmadaEm`). Nenhum valor antigo é reescrito: o Seco que ninguém escolheu, o custo 0 ("ainda não sei") e a validade
gravada continuam exatamente como estavam. Decisões 259 a 269. Sem permissão nova (tudo é `insumos.editar`).

1. **Nome uma vez só** (259, 260). "Insumo que falta: cadastrar" (nota de compra, ficha, embalagens por canal) abre um campo opcional de nome
   e leva `?nome=` (que o cadastro mostra preenchido, já com a categoria sugerida) e `?volta=` (só caminho interno da área de quem está logado,
   conferido na página e de novo na action: nada de open redirect). Salvou, volta para a tela de origem com `?insumoCriado=<id>`: aviso
   "Insumo salvo com sucesso: <nome>" (lido do banco), o insumo já na lista e escolhido na primeira linha vazia, e o que estava preenchido
   recuperado (guardado só no navegador, 20 minutos, **por parceiro e pessoa**, apagado ao sair, ao trocar de pessoa e ao abrir a tela de entrar, e descartado se a ficha ou a nota mudou desde então; "Descartar e começar de novo"; a foto da ficha não é guardada). O rótulo da outra
   embalagem passou a "Nome desta embalagem de compra", com a ajuda dizendo que o insumo continua o mesmo. O nome do insumo, no formulário,
   já era pedido uma vez só: as causas reais do relato eram o atalho sem nome nem volta e esse rótulo.
2. **Tipo de item** (261). Ingrediente, Embalagem e **Material de limpeza e uso** (`MATERIAL`), com o papel de cada um dito na tela e a
   frase "tipo é o papel, categoria é a natureza para o CMV, conservação é onde fica guardado". Material não entra no seletor da ficha, o
   servidor recusa o item de material numa receita, insumo já usado numa ficha ou na embalagem de um prato não vira material, e a categoria
   sugerida é Limpeza e higienização. Estoque, compra, contagem, requisição e histórico o tratam como qualquer insumo.
3. **Unidade base × embalagem de compra × custo** (265). Três blocos com um rótulo para cada coisa; **Custo inicial de referência (R$ por
   embalagem de compra)** com o texto do plano e o exemplo na unidade escolhida (saco de 5 kg por R$ 25,00 → R$ 5,00/kg), mais a conta ao
   vivo e "Origem: referência inicial, sem compra registrada". "Ainda não sei o custo" = **Custo não informado** em toda a tela do insumo
   (lista, detalhe, prévia, histórico, frases), nunca R$ 0,00; a ficha fica incompleta e a precificação espera o custo. O detalhe diz a
   origem do custo (último preço de compra × custo inicial de referência). Cadastrar não cria nota, movimento, saldo, despesa nem conta.
4. **Conservação separada da categoria** (262, 263). Select obrigatório "Selecione a conservação" (opção desabilitada, não salvável: o servidor
   recusa vazio, espaços, o placeholder e qualquer valor fora de Seco/ambiente, Pista fria, Refrigerado, Congelado, e não grava nada); o
   servidor deixou de assumir Seco; editar sem o campo mantém a gravada; "Cadastrar outro insumo" não lembra mais a conservação. O filtro da lista
   diz "Todas as conservações" e ganhou **Conservação a confirmar**: os Seco antigos, sem confirmação, em Proteína, Laticínios e Hortifruti
   (UM aviso no alto da lista, junto com o de categoria; selo na linha; painel no detalhe com "Confirmar que é seco"). Nada é alterado pelo sistema;
   confirmar (botão, marcador "Confirmo que a conservação é esta" no editar, ou trocar a conservação) grava `conservacaoConfirmadaEm` e um `CONFIRMOU` no
   histórico; salvar sem olhar o campo não confirma.
5. **Prazo de uso após abertura** (264). O campo da validade do insumo comprado (que já era "depois de aberto") tem o nome e o texto do plano,
   em horas ou dias, por conservação; vazio = "não informado", sem padrão nem sugestão. Vencimento do lote e data/hora de abertura **não
   existem no ERP ainda** (o modelo `Etiqueta` tem os campos, mas nada grava, e `NotaEntradaItem` não tem lote): ficam para a 3.4, sem simular.
6. **Marca de referência** (266). Texto opcional (até 80), informativo: não bloqueia compra nem cotação e não é fornecedor; entra no
   histórico como "marca de referência".
7. **Acabamentos da I.1a** (268). "Ver todos os insumos" com forma de botão; a fila diz quantos dos marcados estão "sem certeza" antes de
   "Aceitar a sugestão"; a conservação lembrada saiu do "Cadastrar outro insumo". Ajuda contextual: `insumos`, `insumo-novo` e `insumo` na
   versão 3 e `insumo-embalagem` na 2 (lock regravado).

**Efeito conhecido no CMV (267).** O material de limpeza e uso comprado por nota ainda entra na soma de compras do CMV (o CMV 2.3 não lê tipo nem
categoria); a tela do cadastro avisa. A separação por tipo/categoria é da I.2, sem reescrever fotografia de período fechado.

### Referências Kairu consultadas (regra do plano)

As mesmas da análise da I.1 (MCP da Kairu, 21/10/2026, conteúdo integral; buscas "cadastro de insumos categorias", "estoque insumos" e
"compras fornecedor" não acharam prompt sobre cadastro de insumo): `prompt:b3592b7c…` "Da Ficha ao Fornecedor", "Estoque unificado" (Notion,
snapshot de 14/10), `library:inventario-ciclico`, `pass:inventario-contagem-divergencias` e `pass:cmv-fichas-e-margem` (só o prompt). O que a
I.1b aplicou delas:

| Material | Aplicado na I.1b | Adaptado | Deixado para depois |
|---|---|---|---|
| Da Ficha ao Fornecedor | custo ausente é pendência, nunca 0: "Custo não informado" em toda tela e no histórico; custo incompleto não é custo baixo (ficha incompleta, margem espera o custo) | o 0 do banco segue como sinal interno, nenhuma conta o trata como custo | cronograma e política de lote (fase 3.x) |
| Estoque unificado | não unir por nome: a marca de referência é texto informativo e não identifica insumo nem fornecedor | marca ≠ fornecedor virou regra de tela e de dado | cotação com marca alternativa |
| Inventário cíclico e divergências | "grupo" é diferente de setor físico: tipo × categoria × conservação são três campos com ajuda lado a lado | — | contagem por categoria (I.2) |
| CMV, fichas e margem | fotografia de período fechado não muda: o material no CMV não reescreve nada | aviso no cadastro em vez de mexer na conta | CMV por categoria (I.2) |
| Idempotência (pacotes de inventário) | reenvio com a mesma chave devolve o mesmo insumo, agora também quando o cadastro veio de uma nota | — | — |

## Provar a I.1b

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism   # com banco, 2x
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-insumo-clareza.test.ts` (sem banco): conservação escolhida (vazio, placeholder, valor torto), tipo e sugestão, marca (limpeza e limite),
"a confirmar", custo inicial (exemplo 5 kg por R$ 25, texto do plano, "Custo não informado"), o caminho de volta (aceita só o interno; 19
recusas, entre elas `https://`, `//`, `\\`, `..`, outro parceiro e o laço do próprio cadastro). `tests/erp-insumo-clareza.db.test.ts`: o servidor
recusa a conservação sem escolha e não grava, editar sem o campo mantém, material (fora da ficha e do seletor; insumo em uso não vira
material), marca (salva, edita, apaga, histórico), custo inicial sem nota/movimento/saldo/despesa, sem custo = nulo na lista, no detalhe e
na ficha incompleta, "a confirmar" sem alterar nada, isolamento entre parceiros e as actions com volta (pessoa do parceiro e nível 1).
`tests/erp-insumo-clareza-migracao.db.test.ts`: as duas migrations com dado antigo como superusuário, dono com FORCE RLS e dono sem RLS (sem WARNING,
nada muda, colunas nulas, material e marca funcionam pelo papel do tenant, o conferidor acusa o que faltar).

**Resultado da prova (2026-10-22).** `prisma validate`, `typecheck`, `lint`, `gate` e `build` limpos; `erp:conferir-migracao` limpo e `migrate diff`
vazio no `ff_dev`. `npx vitest run` sem banco: 56 arquivos, 1372 testes passando (os de banco pulados). Com banco (`ff_dev`, superusuário), duas
rodadas seguidas: 101 arquivos, 2031 testes, todos passando. Como dono não-superusuário com FORCE RLS e como dono sem RLS (bancos novos, todas as
migrations aplicadas pelo dono): os 9 arquivos de banco tocados ou vizinhos (clareza, insumos, validade, permissões, categorias, isolamento,
compras, fichas e o apoio) com 160 testes cada, passando; o teste das duas migrations (`erp-insumo-clareza-migracao.db.test.ts`) cria os próprios bancos
nos 3 perfis. Jornada no navegador (build de produção, porta 3100, banco novo copiado do `ff_dev` com os insumos antigos em Seco, 189
conferências, todas ok): conservação sem escolher (recusa no campo, foco nele, formulário preservado, "Conservação" forjado também recusado
no servidor, nada gravado), cadastro completo com custo inicial (5 kg por R$ 25 = R$ 5,00/kg ao vivo e no detalhe, sem nota, item, movimento,
saldo nem despesa), sem custo ("Custo não informado" no cadastro, no detalhe, na lista e na ficha incompleta; o banco guarda só o 0 interno),
material de limpeza e uso (categoria Limpeza sugerida pelo tipo, marca de referência, fora do seletor da ficha), prazo de uso após abertura
(3 dias e 30 dias, edição para 48 horas, erro de prazo cruzado, histórico com antes e depois), nome repetido preservando o formulário, duplo
clique com um insumo só, "Insumo que falta: cadastrar" da nota e da ficha (nome levado, volta à tela de origem, insumo escolhido na linha vazia,
nota e ficha recuperadas, barra de endereço limpa, aviso que não repete ao recarregar, Cancelar volta sem criar, volta externa ignorada e salvar
vai ao detalhe), o mesmo no nível 1 (e a volta para outra casa ignorada), "conservação a confirmar" (aviso com a contagem, filtro, painel, confirmar
sem alterar nada e com histórico, editar para Refrigerado, operador sem o botão), isolamento da outra casa; **o rascunho é de quem o fez** (dona da Alfa deixa a nota, sai, a dona da Beta entra na mesma aba e não recebe nada; rascunho de
outra pessoa do mesmo parceiro plantado no navegador não volta; o do próprio gerente volta; a tela de entrar e o Sair apagam tudo, no parceiro e no nível 1;
ficha alterada por outra pessoa descarta o rascunho velho); um aviso só na lista; a fila diz quantos estão "sem certeza"; "Cadastrar outro insumo" abre sem
conservação. Matriz de 9 páginas x 4 tamanhos
(1440, 1180, 820, 390) x 2 temas: sem rolagem lateral, sem violação do axe (79 verificações) e sem erro de console. Com ponteiro de toque real, o
que sobra abaixo de 44 px são só os cabeçalhos ordenáveis da lista, que já eram assim. Prints em `scratchpad/shots-I1b`. Scanner avoid-ai-design nos
39 arquivos de código tocados: 0 P0, 0 P1 e 0 P2. A jornada achou e fez corrigir três defeitos que os testes não pegam: o rótulo da conservação
exportado de arquivo de cliente quebrava o detalhe em produção; o formulário de nota/ficha só recuperava os campos não controlados; o filtro da
lista não acompanhava o link "Ver quais são".

## Herança da I.1b (para a I.2 e as próximas)

- **A I.2 recebe**: separar o material de limpeza e uso do CMV (por tipo ou por categoria) sem reescrever fotografia de período fechado
  (decisão 267); `CategoriaNaLoja`, metas e painéis por categoria (herança da I.1a).
- **A 3.4 recebe**: Data de vencimento do lote no recebimento e Data/hora de abertura no controle de lote, com a regra de não prolongar o
  vencimento original ao abrir (o modelo `Etiqueta` tem `abertoEm`/`validadeEm`/`loteFornecedor`, mas nada grava; `NotaEntradaItem` não tem
  lote nem vencimento). O cadastro do insumo nunca guarda data de lote.
- **A cotação (futura) recebe**: marca alternativa do fornecedor ao lado da marca de referência, sem trava e sem homologação automática;
  "fornecedor homologado" é outra configuração, possível depois.
- **Quem cria insumo fora de `cadastrarInsumo`** (importação, integração) precisa mandar `conservacao` (o servidor não assume mais Seco) e,
  se quiser idempotência, `envio`; `marcaReferencia` é opcional. Teste que só precisa de um insumo usa `cadastrarInsumoDeTeste`, que diz
  Seco quando a chave não vem.
- **Texto do custo ausente**: "Custo não informado" (ou "sem custo informado") vale nas telas: cadastro, lista, detalhe, histórico, ficha, canais,
  estoque, produção e requisição. Ficam com "sem preço" só as frases MONTADAS na regra e cobertas por teste (custo da ficha, canais, CMV, contagem,
  precificação): dizem a mesma coisa, nunca R$ 0,00 e margem que espera o custo. Trocá-las é redação, com teste junto.
- **Rascunho**: a chave é parceiro + pessoa (ids do servidor) e some ao sair, entrar e trocar de pessoa (decisão 269); o de ficha, nota ou embalagens
  guarda a versão lida e não volta sobre uma versão nova.
- **Lições de código**: valor exportado de um arquivo `'use client'` NÃO chega a componente de servidor (o rótulo da opção de conservação
  quebrou o detalhe em produção até ir para `validade.ts`); `<select defaultValue>` não acompanha mudança de URL sem recarregar (o formulário de
  filtros ganhou `key` com os filtros); formulário que lê o rascunho depois do primeiro desenho precisa nascer de novo (`key`) quando ele chega,
  senão só os campos não controlados mudam.
- **O que não tem volta**: a importação de fichas ("Cadastrar “Picles”") continua indo ao cadastro sem `?volta=` (o texto da planilha vive
  só na tela); "Cadastrar em Insumos" das embalagens por canal só aparece quando não há nenhuma embalagem (provado por leitura do código e do
  formulário, não no navegador); `CamposDeValidade para="insumo"` ficou sem uso (o insumo usa `CamposDeConservacao`).
- **Decisões para o Rodolfo**: (1) o material de limpeza e uso comprado por nota ainda entra no CMV de compra até a I.2 (267); (2) Hortifruti
  entra na lista "a confirmar" mesmo quando o Seco é verdadeiro (batata, alho): confirma-se com um toque (263); (3) a categoria única da
  rede (243, herdada); (4) o rótulo "Material de limpeza e uso" e "Seco (ambiente)"; (5) conservação obrigatória também ao editar um insumo
  antigo (262); (6) `VERSAO_DO_ERP` segue "fase 3.3" (a I.1 não é uma fase numerada).

## O que a I.2a entregou — metas por categoria e CMV por categoria, pelas compras

Prioridade do Rodolfo (decisões de 19 e 21/10/2026), primeira metade da I.2 (a análise foi dividida: a I.2b traz o real por categoria). Uma
migration ADITIVA, `20261103000000_erp_cmv_categorias`: `Contagem.retratoGravadoEm` e quatro tabelas novas (`ContagemRetratoItem`,
`CategoriaNaLoja`, `MetaCmvConjunto`, `MetaCmvCategoria`), todas com `parceiroId`, FK compostas, RLS condicional e `erp_tenant`. Nenhum dado
antigo é reescrito. Decisões 270 a 285. Segunda migration `20261103010000_erp_cmv_categorias_endurecimento` (só gatilhos: conjunto de metas sem vigência retroativa e contagem que não fecha com retrato solto). Sem permissão nova: ver o painel é `dre.ver`, editar as metas é `metas.editar` com a rede inteira.

1. **Metas por categoria** (271, 272, 273). Tela `dre/metas-categorias` (aba "Metas por categoria"): na rede, a meta total do CMV (a MESMA
   `DreMeta` da linha CMV do DRE: uma fonte só, gravada junto sob a trava `erp-metas:<parceiro>`) e a meta de cada categoria, em % da receita
   BRUTA, com duas casas e pontos-base inteiros. Cada loja **segue a rede** ou **personaliza o conjunto inteiro** (e marca quais categorias usa);
   mudar a rede só atinge quem segue a rede e a tela diz quais lojas; mudar uma loja não toca outra. Vigência: o começo do período em curso; os
   períodos anteriores seguem com as metas que valiam neles. Histórico em "Metas por categoria" e "Categoria na loja" (atrás de `dre.ver`).
2. **Modelo de 32%** (274). "Usar o modelo de 32%" preenche os dez campos e o total e **não grava**; o aviso "Confira a divisão" aparece quando
   a soma das categorias difere do total (aviso, não bloqueio). Categoria renomeada mantém; excluída ou desativada fica de fora e a frase diz.
3. **Painel "CMV por categoria"** (275, 277, 279, 280). Tela `dre/cmv-categorias` (aba "CMV por categoria", link também no DRE): escopo rede ou
   loja e período; pelas COMPRAS (data da nota, até ontem no período em curso, "parcial"). Por categoria: realizado em R$ e %, meta em % e R$,
   desvio em pp e R$ (realizado menos meta, o sinal da DRE) e o farol das cinco faixas de custo da 2.4. Maiores desvios (até 3 categorias que SAÍRAM da meta, em R$; quem está "na meta" não entra). Linhas sem
   meta nem farol: Outros / a classificar, Sem categoria e **Pré-preparos (variação do estoque)**. **Sem cor** quando o dado não fecha (falta
   faturamento, "sem o CMV de X", sem contar) ou quando Outros mais Sem categoria passam de 2% do CMV (hipótese a validar), com o motivo escrito e o
   atalho "Classificar N insumos". Período encerrado: a diferença para o CMV real do DRE vai na linha "Variação do estoque, ainda não aberta por
   categoria"; a linha final soma tudo e **é a linha CMV do DRE, ao centavo** (a DRE não muda).
4. **Categoria de hoje** (270). Toda conta ao vivo usa a categoria atual do insumo em todas as compras do período: reclassificar um insumo muda
   o período em curso inteiro e o total não muda. O fechado lê só a fotografia.
5. **Retrato do estoque por insumo** (281). Todo fechamento do período e toda abertura de estoque NOVOS (a cíclica não: é um pedaço do estoque) gravam, na MESMA transação que fecha a
   contagem, uma linha por insumo com saldo (quantidade e valor; nulo para insumo sem preço); a soma é o `valorTotalCentavos` ao centavo (código e
   gatilho do banco recusam diferente). Só inclusão e só em contagem aberta. `Contagem.retratoGravadoEm` nulo = "fechado antes da I.2", nunca
   reconstruído. É o que a I.2b usa para o real por categoria.
6. **Fotografia v4** (283). Fechar o período grava `versaoDaConta = 4` e as categorias por loja em `entrada.categorias`; v1 a v3 dizem "Não
   apurado por categoria (fechado antes da I.2)". Reclassificar depois não muda o fechado.
7. **Excluir categoria** (281). Recusa se houver meta ou retrato (e a FK composta impede por SQL); o apagar da `CategoriaNaLoja` vem antes.
8. **Ajuda contextual.** `dre-cmv-categorias` e `dre-metas-categorias` novas; `periodo` (5), `insumo-categorias` (2), `dre-plano` (5), `dre` (7) e
   `dre-periodo` (4) sobem de versão; `ajuda.lock.json` regravado (65 entradas).

**Ficou para a I.2b:** CMV real por categoria (usa o retrato), compra × real por categoria, evolução de 6 períodos, matriz categoria × loja, meta
total por loja no DRE e no orçamento (resolve a pendência 2.5-(2), salão × delivery). **Ficou para a I.2c (só se o Rodolfo pedir):** limpeza e
descartáveis numa linha própria da DRE.

### Referências Kairu consultadas (regra do plano)

Materiais da análise da I.2 (MCP da Kairu, 22/10/2026): `pass:cmv-fichas-e-margem` (lido inteiro), "Da Ficha ao Fornecedor" e "Estoque unificado"
(Notion, snapshot de 14/10). Buscas "CMV por categoria metas" e "estoque inventário transferência entre lojas" não acharam material próprio.

| Material | Aplicado na I.2a | Adaptado | Deixado para depois |
|---|---|---|---|
| CMV, fichas e margem (`pass:cmv-fichas-e-margem`) | CMV parcial com selo e cobertura dita; `null` é desconhecido, nunca 0 ("sem compra no período", "sem cor"); fotografia de período fechado não muda com compra mais cara amanhã; nomes distintos para CMV de compra, real e gerente | o CMV "gerencial" é o próprio CMV do DRE aberto em categorias (nada de CMV novo) | CMV teórico por categoria e comparação com o real (I.2b) |
| Da Ficha ao Fornecedor | custo ausente é pendência, não 0: insumo sem categoria vai para "Sem categoria", a classificar | a meta de cada categoria é do dono, com um modelo ilustrativo (32%) que nunca grava sozinho | política de lote e cotação |
| Estoque unificado | não unir por nome: pré-preparo tem linha própria, o ingrediente fica na categoria do ingrediente; saldo final bate com o livro (o retrato soma o total) | retrato por insumo gravado na transação que fecha a contagem | transferência entre lojas (não existe; termo da fórmula = 0) |

## Provar a I.2a

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism   # com banco, 2x
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-cmv-categorias.test.ts` (sem banco): modelo de 32%, aviso de soma, leitura do formulário (100,01, negativo e 3,155 recusados), a
montagem do painel (desvio com o sinal da DRE, farol, maiores desvios, "sem cor" e o limiar de 2%, variação do estoque, soma = DRE) e o JSON da
fotografia. `tests/erp-cmv-categorias.db.test.ts`: o cenário da análise (Vila da Penha e Delivery, outubro em curso e setembro encerrado), metas
por vigência e herança, `CategoriaNaLoja`, reclassificar, excluir categoria com meta, fotografia v4, histórico, nº de consultas constante com 1 e
50 lojas e o isolamento entre parceiros. `tests/erp-retrato-estoque.db.test.ts`: o retrato do fechamento e da abertura, e a cíclica sem retrato (soma = total ao
centavo, sem preço = valor nulo, só inclusão, 2ª aplicação não duplica) com mutante (sem a trava, o teste cai). `tests/erp-cmv-categorias-telas.db.test.ts`:
a página e a action de verdade (dona, gerente, comprador, operador). `tests/erp-cmv-categorias-migracao.db.test.ts`: a migration com dado antigo
como superusuário, dono com FORCE RLS e dono sem RLS.

**Resultado da prova (2026-10-22).** `prisma validate`, `typecheck`, `lint`, `gate` e `build` limpos; `erp:conferir-migracao` limpo e `migrate diff`
vazio no `ff_dev`. `npx vitest run` sem banco: 58 arquivos, 1418 testes passando (os de banco pulados). Com banco (`ff_dev`, superusuário), duas
rodadas seguidas: 107 arquivos, 2127 testes, todos passando. Como dono NÃO-superusuário com FORCE RLS e como dono sem RLS (bancos novos, todas as
migrations aplicadas pelo dono, `--no-file-parallelism`): os 17 arquivos de banco tocados ou vizinhos (metas e CMV por categoria, telas, retrato,
CMV, fechamento do DRE, DRE, farol, categorias, contagem, estoque, insumos, isolamento, permissões, RLS, compras, orçamento e ajuda), 375 testes
cada: sem RLS, 368 passando e 7 pulados; com FORCE RLS, 374 passando e 1 falha que já existia e é do banco criado por psql (o teste da 0.2 lê
`_prisma_migrations`, que o psql não cria). O teste da migration cria os próprios bancos nos 3 perfis. Mutantes: tirar `travarParaEscrever` de
`concluirContagem` e `travarMetas` de `salvarMetasPorCategoria` derruba os testes (restaurados). Jornada no navegador (build de produção, porta 3100,
banco novo copiado do `ff_dev`, 87 conferências na jornada e 48 de axe e tamanho na matriz, todas ok): a dona aplica o modelo de 32% (nada gravado),
edita Proteína e vê o aviso de soma, conserta e salva (conjunto da rede com 10 metas, vigência 01/10, meta do CMV do DRE em 32%); personaliza a
Delivery (Proteína 14%) e a Vila da Penha segue a rede em 12%; o painel da rede (R$ 39.350,00, igual à DRE), da Vila da Penha (R$ 34.250,00, Panificação
"um pouco pior", Sem categoria e Pré-preparos) e da Delivery (meta "da loja", "sem compra no período"); reclassifica Pão para Mercearias e o total não
muda; manda o Molho para Outros e as categorias ficam sem cor com o motivo (6,86% a classificar); o estoque de setembro fecha pela tela e grava o
retrato (8 insumos, soma igual ao total do fechamento; a abertura antiga segue sem retrato); setembro com "Variação do estoque, ainda não aberta por
categoria"; fechar setembro no DRE grava a v4 e reclassificar depois não o muda; gerente (só a Vila da Penha, também por `?rede=1` e `?loja=<Delivery>`,
nada da outra no HTML, sem as metas nem no ⌘K), operador e quem só vê o histórico (nada do painel nem das metas). Matriz de 6 páginas x 4 tamanhos
(1440, 1180, 820, 390) x 2 temas: sem rolagem lateral, sem violação do axe, sem erro de console e, com ponteiro de toque real, nenhum alvo abaixo
de 44 px Depois do veto do Guardião (realizado e meta no mesmo conjunto de lojas, com teste de propriedade e a jornada com a Delivery marcando Bebidas como "não usa"; gatilhos de vigência e de retrato; maiores desvios só de quem saiu da meta) a bateria inteira rodou de novo: jornada com 90 conferências e matriz com 48, também com a barra de salvar nunca cobrindo o campo a 390 e 820 px. (A jornada achou e fez corrigir: a mensagem de "salvo" sumia por o formulário remontar quando a versão muda; os links e as setas do período
abaixo de 44 px; o texto do painel fechado dizia "categoria de hoje"). Prints em `scratchpad/shots-I2a`. Scanner avoid-ai-design nos arquivos de
código tocados: 0 P0 e 0 P1 (só P2 de "meta strings com ponto médio", já existentes no padrão da casa). Também entrou a herança do pós-deploy da I.1b: o
aviso de insumos sem categoria diz "sem saldo" em vez de R$ 0,00 (teste novo `erp-aviso-classificar.test.ts`).

## Herança da I.2a (para a I.2b e as próximas)

- **A I.2b recebe**: o real por categoria (estoque inicial e final pelo retrato por insumo, com a abertura antiga lida pelos movimentos
  `ABERTURA` só se a soma bater ao centavo; o corte por categoria; a linha "Pré-preparos" ganha valor), compra × real por categoria, evolução de
  6 períodos, matriz categoria × loja (só a rede inteira) e a meta total por loja no DRE e no orçamento. A linha "Variação do estoque, ainda
  não aberta por categoria" some quando o real abrir por categoria.
- **Quem lê o painel** usa `cmvPorCategoria` (`cmv-categorias.ts`), que roda na MESMA transação que o DRE (`dreDoPeriodoNaTx`): a soma bate com o
  DRE sem dois relógios. `comprasPorLojaECategoria` é o único lugar que junta nota e categoria; item sem insumo ou insumo sem categoria vai para
  "Sem categoria".
- **Meta efetiva** de uma loja: `conjuntosVigentes` e `metasDaLoja` (`metas-categorias.ts`). Quem criar outra tela de meta por categoria não
  recalcula a herança: chama essas funções.
- **Salvar metas** passa por `salvarMetasPorCategoria` (uma transação: conjunto, metas, uso por loja, `DreMeta` do CMV e histórico). A trava
  `erp-metas:<parceiro>` é pega UMA vez; o teste tem mutante.
- **Retrato**: `gravarRetrato` recusa antes de o banco recusar. Quem criar outro jeito de fechar contagem (importação, integração) precisa
  gravar o retrato na mesma transação, senão `retratoGravadoEm` fica nulo e a I.2b trata como "antes da I.2".
- **Fotografia v4**: qualquer mudança no JSON de `entrada.categorias` precisa subir `versao` do bloco (hoje 1) e manter a leitura das versões
  antigas.
- **Lições de código**: formulário com `useFormState` que remonta quando a versão muda perde a mensagem de "salvo" (o `key` do formulário é só a
  loja; a versão chega por prop e o campo oculto acompanha); o teste-guarda barra a chave `insumos:` em objeto de tenant (use `nInsumos`) e a palavra
  "escopo" em texto de tela; texto de aviso do painel muda com o período fechado (a categoria é a do dia do fechamento).
- **Realizado e meta no mesmo conjunto de lojas** (284): quem mexer na linha de categoria do painel mantém a regra: o desvio em R$ sai dos
  centavos e o pp sobre a mesma receita; a loja que "não usa" e comprou deixa a linha sem cor com o motivo. Há teste de propriedade.
- **Para a I.2b**: o uso da categoria por loja (`CategoriaNaLoja`) não tem vigência (285); desvio RELATIVO (% da própria meta) para categorias
  pequenas, onde 0,2 pp é muito (Limpeza em 0,70% contra 0,50% é 40% acima da meta e aparece como "na meta"); as abas do DRE a 390 px rolam e a
  última (Metas por categoria) fica fora da tela até rolar (é do shell, `Abas`, não da I.2a).
- **Defeito que já existia, fora da I.2a**: a tela `/erp/estoque/<loja>/periodo` com o período anterior por fechar loga erro de hidratação do
  React (#418) porque o `Aviso` põe o formulário dentro de um `<p>`; virou tarefa à parte.
- **Decisões para o Rodolfo**: (1) base BRUTA ou líquida (273); (2) a DRE fica inalterada (padrão) ou limpeza e descartáveis ganham linha própria,
  a I.2c (275); (3) o limiar de 2% de Outros mais Sem categoria que tira a cor (279); (4) só o Dono personaliza a loja, o gerente não (282);
  (5) a loja personaliza o conjunto inteiro, não categoria por categoria (272); (6) pré-preparo em linha própria, sem meta (277); (7) a categoria
  única da rede (243, herdada). O desvio do painel segue o sinal da DRE (realizado menos meta): o "-1,30 pp" do cenário da análise tinha o sinal
  invertido (279).

## O que a I.2b entregou — CMV real por categoria, compra × real, evolução, matriz e meta total por loja

Segunda metade da I.2 (fecha a prioridade de categorias e metas do plano). Uma migration ADITIVA, `20261104000000_erp_cmv_real_categorias`: a coluna anulável `MetaCmvConjunto.metaTotalBp` e um CHECK (0 a 100 %, só em conjunto de loja que não segue a rede), `NOT VALID` + `VALIDATE` que avisa e segue; nenhum SELECT, nenhuma linha criada ou mudada (todo conjunto antigo fica sem total próprio, o que valia). O resto é derivado (retrato por insumo, livro e notas). Decisões 286 a 298. Sem permissão nova: tudo é `dre.ver` (e a meta, `metas.editar` com a rede inteira); catálogo na versão 3.

1. **CMV real por categoria** (286, 287). Real = estoque inicial + entradas do livro − estoque final, com o corte da 2.3 aberto por categoria (a MESMA consulta, `cortesDosFechamentos`), a categoria de HOJE do insumo em todas as parcelas, e o estoque de pré-preparo em linha própria. O estoque inicial é o final do período anterior ou o retrato da abertura; a abertura de antes do retrato é lida pelos movimentos ABERTURA só se a soma bater ao centavo. A loja só abre por categoria com os dois retratos e a soma igual ao real do DRE; senão fica pelas compras e a "Variação do estoque, ainda não aberta por categoria" diz qual loja e por quê. A linha final é sempre o CMV do DRE.
2. **Compra × real por categoria** (288), vista `?vista=compra-real`: real menos compra em R$ e pp (mesmo sinal), a frase do estoque que subiu ou desceu, só as lojas com o real aberto e as que ficaram de fora com o motivo.
3. **Evolução** (289), `?vista=evolucao`: os últimos 6 períodos (o pedido e os 5 anteriores), do mais antigo ao mais novo, realizado, meta da época e desvio; o fechado da fotografia como está; período sem dado fica "—" com a frase; sem cor.
4. **Por loja** (291), `?vista=matriz`: categoria × loja só na rede com duas ou mais lojas; cada coluna fecha no CMV do DRE da loja.
5. **Meta total por loja** (290): a loja que personaliza pode ter a meta total do CMV dela, que vale na linha CMV do DRE dela (ao vivo e fotografada), no painel e no orçamento de compra 2.5; vazio = a da rede; a rede segue a da rede. No orçamento da rede, o teto é a soma dos tetos e a meta aparece como "média (cada loja usa a sua)".
6. **Desvio relativo** (292), **frases** (294) e **transferência** (295): o % da própria meta embaixo do desvio (só leitura); "na rede o % de cada categoria é sobre a receita de quem a usa"; conjunto de meta futuro vira frase e é conferido antes de gravar; transferência entre lojas não existe.
7. **Fotografia v5** (293): `entrada.categorias` na versão 2 (inicial, entradas e final por categoria, pré-preparos, motivo); v4 e anteriores são lidas como estão.
8. **Conferidor pós-deploy**: `npm run erp:conferir-migracao` passou a olhar a coluna e o CHECK da I.2b. **Ajuda**: `dre-cmv-categorias` v3 (real, compra × real, evolução, por loja, o relativo, a transferência), `dre-metas-categorias` v3 (total da loja, % da rede), `dre` v8 e `compras-orcamento` v4; lock regravado (65 entradas).

### Cenário com números conferíveis (Casa Beta, setembro de 2026, `tests/erp-cmv-real-categorias.db.test.ts`)

| Loja | Estoque inicial | Compras (livro) | Estoque final (com corte) | Real | Como abre |
|---|---|---|---|---|---|
| Vila da Penha | R$ 10.000,00 (retrato) | R$ 13.800,00 | R$ 11.750,00 | **R$ 12.050,00** | os dois retratos |
| Unidade Tijuca | R$ 2.000,00 (abertura de antes do retrato, pelos movimentos) | R$ 1.000,00 | R$ 2.400,00 | **R$ 600,00** | retrato só no fim; abertura lida pelo livro |
| Centro | R$ 1.000,00 | R$ 500,00 | R$ 1.200,00 (sem retrato) | **R$ 300,00** | não abre: compras + variação |

Vila da Penha, por categoria: Proteína 4.000 + 8.600 − 5.600 = **R$ 7.000,00**; Laticínios 3.000 + 2.000 − 2.500 = **R$ 2.500,00**; Hortifruti **R$ 2.300,00**; Descartáveis **R$ 500,00**; Sem categoria **R$ 50,00**; Pré-preparos 500 − 800 = **−R$ 300,00**; soma **R$ 12.050,00** = CMV do DRE. O corte: uma nota de Proteína de R$ 600,00 de 29/09 lançada só em 02/10 SOMA ao final (depois do retrato, do período); uma de Queijo de R$ 200,00 de 03/10 que entrou no livro em 30/09 SAI do final (o retrato já a trazia, é do período seguinte). Compra × real: compras R$ 13.800,00, diferença **−R$ 1.750,00** (o estoque subiu de 10.000 para 11.750); Proteína compra 8.600, real 7.000, **−R$ 1.600,00** (−1,60 pp), o estoque subiu 1.600; Laticínios **+R$ 500,00**. Rede: CMV **R$ 12.950,00**, Proteína R$ 8.000,00 (7.000 + 500 + 500), variação do estoque **−R$ 200,00** (Centro: real 300 contra compras 500). Evolução da Vila da Penha de maio a outubro: Proteína 4.000, 4.500, 5.000, 5.500 (compras, sem meta), 7.000 (setembro fechado, real, meta de 11 % da época, −4,00 pp) e outubro parcial. Matriz de 3 lojas: R$ 300,00 + R$ 600,00 + R$ 12.050,00 = R$ 12.950,00. Meta total: a Tijuca personalizada com 30 % (a rede 32 %): `metas.cmv` 3.000 em outubro, 3.200 em setembro (a vigência não volta atrás) e a rede 3.200 com "Tijuca tem a própria"; orçamento: teto da Tijuca com 30 %, da Vila da Penha com 32 %, rede mista.

### Referências Kairu consultadas (regra do plano)

`pass:cmv-fichas-e-margem` e `library:inventario-ciclico` (MCP Kairu, 22/10/2026), além dos da I.2a (`pass:cmv-fichas-e-margem`, "Da Ficha ao Fornecedor", "Estoque unificado"; buscas "CMV por categoria metas" e "estoque inventário transferência entre lojas" sem material próprio).

| Material | Aplicado na I.2b | Adaptado | Deixado para depois |
|---|---|---|---|
| CMV, fichas e margem | `null` é desconhecido, nunca zero ("—", "sem consumo no período"); CMV parcial/misto com selo e a origem de cada número; a fotografia não muda com compra mais cara amanhã; nomes distintos (compra, real, gerencial) | o "CMV parcial por cobertura" virou "a loja que não abre por categoria fica pelas compras, dita", porque aqui o real é de estoque e não de venda | CMV teórico por prato e cobertura por venda |
| Inventário cíclico | item não contado não é zero; divergência não é perda comprovada (compra × real não diz "perda"); saldo final bate com o ledger (a soma do retrato é o total fotografado); aplicação idempotente e sob trava (já da I.2a) | o retrato é do fechamento, a contagem cíclica não grava | recontagem com duas versões, lembretes |

## Provar a I.2b

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism   # com banco, 2x
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-cmv-real-categorias.test.ts` (sem banco, 22): o real por categoria no painel, o sinal, a loja que fica pelas compras, a compra de pré-preparo, o desvio relativo, compra × real, a matriz, a **propriedade** (300 sorteios: Σ das linhas = CMV do DRE, pp com o sinal do R$, coluna da matriz fecha), a fotografia v5 de ida e volta e a v4 lida como está, a evolução, a meta total por loja no orçamento e o teste-guarda contra `ProdutoEmbalagem`. `tests/erp-cmv-real-categorias.db.test.ts` (16): o cenário acima, o corte por categoria, a abertura antiga pelos movimentos, a soma que não fecha não abre, reclassificar (o total não muda e o fechado não muda), a evolução de 6 períodos, a meta total da loja no DRE e no orçamento, a frase do conjunto futuro, o CHECK por SQL cru, o isolamento entre parceiros e o número de consultas igual com 1 e 50 lojas (painel e evolução). `tests/erp-cmv-real-categorias-telas.db.test.ts` (7): a página de verdade (dona, gerente em todas as vistas e por `?rede=1`/`?loja=`, comprador, operador; o formulário da meta total e a DRE). `tests/erp-cmv-real-categorias-migracao.db.test.ts` (3): a migration com dado antigo nos 3 perfis do banco.

**Resultado da prova (2026-10-22).** `prisma validate`, `typecheck`, `lint`, `gate` e `build` limpos; `erp:conferir-migracao` limpo e `migrate diff` vazio no `ff_dev`. `npx vitest run` sem banco: 59 arquivos, 1442 testes passando. Com banco (`ff_dev`, superusuário), duas rodadas seguidas: 111 arquivos, 2178 testes, todos passando. Como dono NÃO-superusuário com FORCE RLS e como dono sem RLS (bancos novos, todas as migrations aplicadas pelo dono, `--no-file-parallelism`): os 19 arquivos de banco tocados ou vizinhos, 399 testes cada: sem RLS, 392 passando e 7 pulados; com FORCE RLS, 398 passando e 1 falha que já existia (o teste da 0.2 lê `_prisma_migrations`, que o psql não cria). O teste da migration cria os próprios bancos nos 3 perfis, com conjuntos antigos. Jornada no navegador (build de produção, porta 3100, banco novo copiado do `ff_dev`, 80 conferências na jornada e 96 na matriz, entre axe, tamanho e a evolução com os 6 períodos visíveis, todas ok): a dona lê setembro (rede R$ 12.300,00 pelo real onde o estoque foi contado por insumo e pelas compras na Delivery, com a variação de −R$ 400,00 dizendo "Vila da Penha · Delivery" e o pré-preparo em −R$ 200,00), compra × real (Proteína: o estoque subiu R$ 600,00; total −R$ 500,00; a Delivery "ficou de fora"), por loja (a coluna fecha em R$ 11.700,00 e R$ 600,00) e a evolução (abril sem dado, não inventado); personaliza a Delivery com meta total de 30 % (grava 3000 pontos-base, a rede segue 32 %), o DRE dela compara com 30 %, o da rede diz quem tem a própria, o orçamento mostra tetos de R$ 13.500,00 (30 %) e R$ 48.000,00 (32 %) e a rede "média de 31,5 %"; fecha setembro (fotografia v5, categorias versão 2, a Delivery fotografada com 32 % porque a personalização vale desde outubro), a tabela do fechado é idêntica à do ao vivo de antes de fechar e reclassificar o Blend depois não a muda; o gerente da Vila da Penha recebe só a loja dele em todas as vistas, também por `?rede=1` e `?loja=<Delivery>` (nada da outra no HTML nem no JSON, sem a vista "Por loja"), o operador e quem só vê o histórico não recebem nada. Matriz de 10 páginas x 4 tamanhos (1440, 1180, 820, 390) x 2 temas: sem rolagem lateral, sem violação do axe, sem erro de console e, com ponteiro de toque real, nenhum alvo abaixo de 44 px nas telas da I.2b (a jornada achou e fez corrigir os links e as setas do DRE, que estavam a 20 e 40 px). Depois dos vetos da UX e do Guardião (decisão 299): a evolução abaixo de 1180 px virou um cartão por categoria com uma linha por período (a jornada conta os 6 períodos visíveis a 390, 820, 1180 e 1440, nos dois temas), o "—" no lugar de R$ 0,00 sem dado, a explicação recolhida, as vistas em uma linha no celular, os links, o selo "CMV misto" e a frase de ação do orçamento; e o painel soma os pré-preparos de categorias diferentes (teste com banco e mutante), tira a cor quando não fecha com o DRE e a matriz fecha por loja. Prints em `scratchpad/shots-I2b`. Scanner avoid-ai-design nos arquivos de código tocados: 0 P0 e 0 P1 (só P2 de "meta strings com ponto médio", já existentes no padrão da casa). Lição do veto do Guardião da I.2a mantida: a jornada e os testes seguem com a Delivery e as heranças de 284.

## Herança da I.2b (para as próximas)

- **O real por categoria é UM**: `realPorCategoria` (`cmv-categorias-real.ts`) e o corte `cortesDosFechamentos` (`cmv.ts`, o MESMO do DRE). Qualquer tela nova que abra o estoque por categoria parte deles; quem mudar o corte muda o real do DRE e o por categoria juntos.
- **Retrato**: toda forma nova de fechar contagem grava o retrato na mesma transação (herança da I.2a, agora com consequência: sem ele a loja não abre por categoria naquele período).
- **Fotografia**: `entrada.categorias` versão 2 (v5). Mudar o JSON sobe a versão do bloco e mantém a leitura das anteriores. A linha da loja guarda a meta total própria.
- **Meta total da loja**: `metaTotalDaLoja` (`metas-categorias.ts`) é a única que diz qual meta vale numa loja; o DRE, o fechamento e o orçamento passam por ela.
- **Evolução**: cada período é o painel dele; se ficar lenta, o ponto de otimização é ler só a fotografia dos fechados em uma consulta (hoje são ~25 consultas por período, nunca por loja).
- **Lições de código**: o mock de `hojeNoRio` dos testes de tela precisa deixar passar a data de um instante dado (o dia da abertura), senão o real nunca abre; um insumo sem categoria precisa limpar os campos de classificação (CHECK); o preenchimento de uma conta que pode falhar tem de ser conferido ANTES de gravar (o `transacao` só desfaz se lançar erro).
- **Para o Rodolfo (não bloqueia; padrão em negrito)**: (1) o desvio relativo é só leitura (**sim**) ou vira faixa de verdade (v2 do farol)? (2) a Delivery que tem meta total própria: o orçamento da rede mostra a **média** das metas ou prefere só a soma dos tetos? (3) o uso da categoria por loja sem vigência (**ok**) ou com? (4) a evolução fica em **6** períodos? (5) as lojas que fecharam estoque antes da I.2a só abrem por categoria a partir do **primeiro** período com os dois retratos (o anterior fica com compras + variação): é aceitável ou quer refazer a contagem do mês? (6) as decisões da I.2a seguem abertas: base bruta × líquida, limiar de 2 %, só o Dono personaliza a loja, o conjunto inteiro, pré-preparo em linha própria, categoria única da rede.

## O que a F.1a entregou — cadastro de fornecedor evoluído e CNPJ da loja

Primeira metade da prioridade "evolução do cadastro de fornecedores, preparado para notas fiscais automáticas" (Rodolfo, 21/10/2026). Fica para a F.1b: documento fiscal, vínculo de item, parser de XML, fila de conferência, conciliação e o índice parcial da chave. Uma migration ADITIVA, `20261105000000_erp_fornecedor_cadastro` (colunas em `Fornecedor` e `Loja`, um tipo, CHECKs e dois índices; nenhuma tabela nova). Decisões 300 a 313. Sem permissão nova: `fornecedores.editar` (rede) para o cadastro, `compras.ver` para ver, `lojas.gerir` para o CNPJ da loja. Ajuda: `fornecedores`, `fornecedor-novo` e `fornecedor` na versão 2, `lojas` na 3.

1. **Cadastro** (300, 301). Nome fantasia, razão social, CNPJ ou CPF (dígitos verificadores, `documentoValido` de `compra-campos.ts`), inscrição estadual (ISENTO ou 2 a 14 dígitos: só formato, 306), endereço, município, UF (27 siglas), CEP, contato comercial, WhatsApp com DDD, e-mail e prazo de pagamento (0 a 180 dias, só guardado, 307). Obrigatórios, ditos em palavras e com `aria-required`: nome fantasia, razão social, CNPJ/CPF, e-mail e WhatsApp. Uma exceção: "Compras sem nota fiscal" (nome e WhatsApp; nunca casa com documento fiscal). A regra de "completo" é uma só (`faltaNoCadastro`) e o banco a repete num CHECK.
2. **"A completar"** (302). Só nasce do sistema. A migração põe os fornecedores existentes nele pelo DEFAULT da coluna (mesmos ids, notas, vínculos; o contato em texto livre fica como está, sem virar WhatsApp). A lista mostra o selo e "Falta: ..."; filtro "A completar"; o detalhe tem "Completar o cadastro"; editar exige tudo. Recebe nota normalmente.
3. **Duplicidade** (303). O mesmo CNPJ/CPF normalizado no mesmo parceiro é recusado com o link do que existe (ou de reativar, se desativado). A filial (outro CNPJ) passa e as duas telas avisam "mesma empresa, outro estabelecimento" (raiz de oito dígitos). Nunca funde. Nome repetido (também com outra caixa ou acento) recusado, com a dica de acrescentar bairro ou cidade. Índice único parcial `Fornecedor_parceiroId_documento_key` e bloqueio por parceiro contra a corrida (cinco cadastros simultâneos do mesmo CNPJ: um entra).
4. **Migração com dado antigo** (304, 305). Segura nos 3 perfis do banco; nenhum SELECT sob RLS. CNPJ repetido no banco antigo: a migration termina com WARNING, o índice não nasce e `npm run erp:conferir-migracao` lista os pares por parceiro (pelo portão). Documento antigo inválido fica e vira "Documento a conferir".
5. **Salvar** (309). "Salvando…" no botão (desabilitado) e região viva; confirmação "Fornecedor salvo com sucesso: <nome>" / "atualizado com sucesso" com "Cadastrar outro fornecedor"; erro volta no campo, com resumo e foco, sem perder o digitado; chave de envio por pessoa (clique repetido, 5 pedidos paralelos e resposta perdida: um fornecedor só); duas abas: a segunda recebe o conflito com "Recarregar".
6. **Da nota** (311). "Fornecedor novo: cadastrar" leva com `?volta=` e traz de volta para a nota, com o preenchido e o fornecedor já escolhido.
7. **CNPJ da loja** (310). `Loja.cnpj`, validado, em "CNPJ da loja" na linha da loja (`lojas.gerir`; o gerente vê e não muda), nas duas árvores; não único; histórico antes/depois; condicional ao lido.
8. **Contatos nunca recebem mensagem** (308): sem caminho de envio; teste-guarda por varredura do código.
9. **Conferidor pós-deploy**: `npm run erp:conferir-migracao` confere as 11 CHECKs, os dois índices, lista CNPJ repetido (só quando o índice falta), os "a completar" e os documentos a conferir (estes últimos não mudam o código de saída).
10. **Histórico**: `Fornecedor` e `Loja` mostram razão social, documento, WhatsApp, e-mail, prazo, "cadastro: a completar → completo" e CNPJ com antes e depois.

### Referências Kairu consultadas (regra do plano)

As da análise da F.1 (22/10/2026, MCP Kairu): `library:sefaz` (inteira), `library:compras-cotacoes` e `pass:compras-cotacao-comparavel` (cotação: fora), "Nota Certa" (emissão de venda: fora), "Da Ficha ao Fornecedor". Buscas "nota fiscal", "XML" e "fornecedor".

| Material | Aplicado na F.1a | Adaptado | Deixado para a F.1b |
|---|---|---|---|
| `library:sefaz` | fornecedor reconhecido pelo documento normalizado e validado, nunca pelo nome; nada de manifestação nem ação automática | "nada automático" valeu também para mensagens aos contatos (308) | parser sem entidade externa e com limite, dedup pela chave de 44 dígitos, "resumo não é nota completa" |
| Da Ficha ao Fornecedor | "um clique, um pedido": chave de envio por pessoa + impressão do conteúdo; histórico preservado, mesma tabela e mesmos ids | a memória de código do fornecedor ficou para a F.1b | memória código → insumo com fator auditado |
| `library:compras-cotacoes`, `pass:compras-cotacao-comparavel` | nada (cotação é outro assunto) | — | — |

## Provar a F.1a

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # com banco, 2x
npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-fornecedor.test.ts` (sem banco, 21): o formulário (critérios 1, 2, 3, 4 e 8), WhatsApp, inscrição, e-mail, CEP, prazo, NFC e invisíveis, `faltaNoCadastro`, CNPJ e raiz, CNPJ da loja, o retrato do histórico, a volta da nota e o teste-guarda dos contatos. `tests/erp-fornecedor.db.test.ts` (21, pelas actions de verdade): os critérios 1 a 5, 8, 9 e 10, a idempotência (clique repetido, 5 paralelos, mesma chave com outro conteúdo, chave de outra pessoa), 5 cadastros simultâneos do mesmo CNPJ, o "a completar" que recebe nota e só se edita completando, o antigo sem documento que completa como "sem nota fiscal", permissões (operador, gerente), isolamento, as barreiras do banco (índice, CHECKs) e o CNPJ da loja. `tests/erp-fornecedor-migracao.db.test.ts` (6): critérios 6 e 7 nos 3 perfis do banco, com e sem CNPJ repetido.

**Cenário de números conferíveis (jornada):** a Casa Alfa tem 3 fornecedores de antes (Laticínios Rio com CNPJ 11.222.333/0001-81 e a nota 4501; Feira do Zé sem documento e com contato em texto livre; Frigorífico Velho com CNPJ de dígito errado). A lista mostra "3 fornecedores", os três "A completar"; cadastrar outro com o CNPJ do Laticínios Rio é recusado; a filial 11.222.333/0002-62 entra e as duas se avisam; completar o Laticínios Rio muda o selo e mantém a nota 4501; o Frigorífico só salva com o CNPJ certo; a loja Vila da Penha recebe 11.444.777/0001-61.

**Resultado da prova (2026-10-22).** `prisma validate`, `typecheck`, `lint`, `gate` e `build` limpos; `erp:conferir-migracao` limpo e `migrate diff` vazio no `ff_dev`. `npx vitest run` sem banco: 114 arquivos, 60 rodam e 54 (os de banco) pulam, 1463 testes passando. Com banco (`ff_dev`, superusuário), duas rodadas seguidas: 114 arquivos, 2226 testes, todos passando. Como dono NÃO-superusuário com FORCE RLS e como dono sem RLS (bancos novos, todas as migrations aplicadas pelo dono, `--no-file-parallelism`, um banco de cada vez): os 15 arquivos de banco tocados ou vizinhos, 315 testes cada: sem RLS, 308 passando e 7 pulados; com FORCE RLS, 314 passando e 1 falha que já existia (o teste da 0.2 lê `_prisma_migrations`, que o psql não cria). A migration da F.1a cria os próprios bancos nos 3 perfis (por isso não entra nas rodadas por perfil). Jornada no navegador (build de produção, porta 3100, banco novo copiado do `ff_dev` com os fornecedores "de antes"; 90 conferências na jornada e 72 axe na matriz, todas ok): a dona vê os 3 fornecedores migrados com o selo "A completar" e o que falta; o filtro "A completar" acha os 3; o CNPJ de dígito errado de antes aparece como "Documento a conferir"; no cadastro novo vazio as cinco faltas voltam no campo (foco no primeiro), nada é gravado; CNPJ torto e WhatsApp sem DDD recusados com o formulário preenchido; o CNPJ do Laticínios Rio é recusado com o link; a filial 11.222.333/0002-62 entra, com "Salvando…" visível, "Fornecedor salvo com sucesso" e o aviso "mesma empresa, outro estabelecimento" nos dois cadastros; "Compras sem nota fiscal" salva só com nome e WhatsApp; completar o Laticínios Rio (selo sai, nota 4501 e id intactos), o Frigorífico só com o CNPJ certo e a feira como "sem nota fiscal"; duas abas (a segunda recebe o conflito e fica com o que digitou); a nota de compra oferece fornecedores antigos e novos, "Fornecedor novo: cadastrar" volta para a nota com o preenchido e o fornecedor escolhido, e a nota lança com fornecedor "a completar"; o CNPJ da loja (dígito errado recusado, certo salvo, na lista e no Histórico); o gerente vê o CNPJ e não tem o controle, cadastra fornecedor; o operador não recebe nada; a dona da outra casa não abre o fornecedor da Alfa (404) e cadastra o mesmo CNPJ na casa dela; conexão que cai no envio volta como "não deu para confirmar" e reenviar não duplica. Matriz de 9 páginas x 4 tamanhos (1440, 1180, 820, 390) x 2 temas: sem rolagem lateral, sem violação do axe, sem erro de console e, com ponteiro de toque real, nenhum alvo abaixo de 44 px (a matriz achou e fez corrigir o "Ver todas" do detalhe, a 20 px, e um contato antigo longo que empurrava o celular para 539 px). Prints em `scratchpad/shots-F1a`. Scanner avoid-ai-design nos 13 arquivos de tela tocados: 0 P0 e 0 P1 (só P2 do padrão "A · B", já existente na casa).

## Herança da F.1a (para a F.1b e as próximas)

- **A F.1b usa o que a F.1a deixou**: identificar o emitente por `Fornecedor.documento` (só `COMPLETO` ou `A_COMPLETAR` ativos, nunca `semNotaFiscal`), o destinatário por `Loja.cnpj` (pode repetir em duas lojas: a pessoa escolhe a loja na conferência), e criar o emitente desconhecido como `A_COMPLETAR` com o que vier no XML (razão, fantasia, CNPJ, IE, endereço, UF; e-mail e WhatsApp vazios). Dois fornecedores ativos com o mesmo CNPJ só existem se o índice não nasceu: a conferência nunca escolhe sozinha.
- **Uma regra de obrigatoriedade**: `faltaNoCadastro` (e o CHECK `Fornecedor_completo_tem_o_basico`). Mudar o que é obrigatório muda os dois e a migração dos antigos.
- **Cadastro que só o sistema cria** (`A_COMPLETAR`) precisa de `chaveEnvio` nula: o formulário nunca o produz.
- **Teste-guarda dos contatos**: nova tela de fornecedor ou de compras que importe envio de mensagem reprova o teste. Mudar isso é decisão nova.
- **Lições de código**: o portão veta SQL cru em tabela de tenant até em script (o conferidor lê por `doParceiro`); o aviso de índice que não nasceu não traz o par (o Postgres não o informa); texto livre antigo em subtítulo não pode ficar em `whitespace-nowrap`; a aula da ajuda para todos tem no máximo 4 frases (o teste da ajuda reprova mais).
- **Para o Rodolfo (não bloqueia; padrão em negrito)**: ver a decisão 313: e-mail do fornecedor de feira com CNPJ (**precisa, salvo "sem nota fiscal"**); o "Cepai" é a SEFAZ? (**sem resposta; nada depende**); prazo de pagamento vazio por padrão (**sim**).

## O que a F.1b entregou — notas fiscais por XML (NF-e manual)

Segunda metade da prioridade "notas fiscais automáticas" (Rodolfo, 21/10/2026), na parte MANUAL: a casa sobe o XML que o fornecedor mandou, confere os itens e concilia. Captação automática (SEFAZ, Cepai), manifestação do destinatário e emissão ficam FORA (decisão 317). Uma migration ADITIVA, `20261106000000_erp_documento_fiscal` (três tabelas, dois tipos, um índice parcial). Decisões 314 a 335 (328 a 335 são a rodada de ajustes dos fiscais). Sem permissão nova: `compras.ver` (ver), `compras.lancar` (receber, conferir, conciliar, descartar) e `fornecedores.editar` (trocar uma memória que já existe). Ajuda: `compras-documentos`, `compras-documento-importar` e `compras-documento` novas; `compras` na 2, `compra` na 4 e `fornecedor` na 3. Primeiro, em commit próprio, o polimento da F.1a (decisão 314).

**Telas** (nas duas árvores, `/erp/compras/recebidas` e `/rodolfo/erp/[slug]/compras/recebidas`): aba "Notas recebidas" em Compras, ação "Importar XML", a lista (fila por padrão; filtros de situação, loja e fornecedor), "Importar XML da nota" e a conferência de uma nota.

1. **Receber** (316, 322, 323). Escolher o arquivo, "Ler a nota". Nada é lançado: a nota vira um documento "Aguardando conferência". Recusas em frase, na própria tela, sem gravar e sem jargão: instruções extras no arquivo (DOCTYPE/entidade), arquivo acima de 900 KB (barrado já no navegador; 331), NFC-e, sem protocolo, cStat diferente de 100/150, PDF ou zip, nota de outro CNPJ, loja sem CNPJ cadastrado (a frase manda cadastrar o CNPJ da loja), emitente desativado, "sem nota fiscal" ou transferência do próprio grupo. O mesmo arquivo de novo (ou cinco ao mesmo tempo) é "já recebida": um documento só. A mesma chave com outro conteúdo é recusada, com o link do documento que existe.
2. **Conferir** (319, 332). Cada item mostra o texto do emitente, o código, a quantidade e o custo do item; a pessoa escolhe o insumo, a embalagem e "quantas por <unidade da nota>", e a conta aparece ao vivo ("3 PC → 6 kg", "2 CX → 20 kg", "1 FD → 500 un"). Na nota seguinte do mesmo fornecedor o item vem ligado ("Lembrado deste fornecedor"). Item sem insumo tem "Insumo que falta: cadastrar": leva ao cadastro e volta para a conferência com o que estava escolhido e o insumo novo no item que o pediu. Contador "3 de 3 itens ligados". "Salvar o que escolhi" guarda sem lançar; "Conferir o impacto" mostra o custo e o estoque que mudariam, sem gravar.
3. **Frete, total e data** (318). Itens + frete = total da nota fiscal, com "confere com a nota" ou a diferença; se não fecha, não concilia. Data da entrada editável, começa na emissão.
4. **Conciliar** (320). Uma transação: lança UMA nota de compra (origem IMPORTACAO, com a chave), grava a memória e marca o documento. A nota do XML nunca duplica estoque. Cinco cliques ao mesmo tempo: uma nota.
5. **Ligar à nota já lançada** (320, 329). A casa já tinha lançado a nota à mão: "Ligar a esta nota" só grava a chave nela; nenhum custo, nenhum movimento; conciliar sem ligar é recusado. Vale o CNPJ do fornecedor (não o cadastro). Com total diferente, pede confirmação com a diferença à vista (e o servidor a exige). Fornecedor sem CNPJ: "Não é essa nota: concilie mesmo assim".
6. **Cancelar e descartar** (321). Cancelar a nota de compra que veio do XML devolve o documento à fila; descartar (motivo obrigatório) tira da fila e, se estava conciliado, cancela a nota pelo caminho oficial.
7. **A nota de compra que veio do XML** (324) diz "Esta nota veio da nota fiscal (XML)", leva ao documento, tem "Cancelar" e não tem "Editar nota". Rota que não acha a nota (de outra loja ou parceiro, ou id errado) mostra "Não achamos esta nota fiscal." em português, com o caminho de volta (334).
8. **Histórico**: "Nota fiscal recebida" (recebeu, conciliou, ligou, descartou, com "itens ligados: 0 de 3 → 3 de 3") e "Item do fornecedor" (memória, com antes e depois do fator).
9. **Conferidor pós-deploy**: `npm run erp:conferir-migracao` confere as três tabelas (e a RLS delas), os CHECKs, os índices, os gatilhos e acusa o índice antigo da chave de volta.
10. **Segurança**: sem DTD nem entidade, limites de tamanho, itens, tags e profundidade, tudo em frase (316); assinatura NÃO verificada (317, risco aceito); nenhuma credencial, senha, chave ou certificado é pedido ou gravado; nada sai para a rede.

### Referências Kairu consultadas (regra do plano)

Pelo MCP Kairu: `library:sefaz` (lido inteiro de novo), buscas "nota fiscal XML" e "conferência formulário tabela" (design); da análise da F.1: `library:compras-cotacoes`, `pass:compras-cotacao-comparavel`, "Nota Certa", "Da Ficha ao Fornecedor" e o caso do Spettacolo (notas de entrada).

| Material | Aplicado na F.1b | Fora, de propósito |
|---|---|---|
| `library:sefaz` | parser sem entidade externa e com limite; dedup pela chave de 44 dígitos; "resumo não é nota completa" (só entra nota com protocolo); nenhuma manifestação nem ação automática; nada de segredo em código ou tela | captação automática |
| Da Ficha ao Fornecedor | memória código → insumo com fator auditado; "um clique, um pedido" na conciliação | — |
| Spettacolo (notas de entrada) | a fila de conferência antes de lançar | — |
| `library:compras-cotacoes`, `pass:compras-cotacao-comparavel`, "Nota Certa" | nada | cotação e emissão de venda |

## Provar a F.1b

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # com banco, 2x (também passa com --no-file-parallelism)
NODE_OPTIONS=--max-old-space-size=6144 npm run build        # a heap padrão estoura nesta base
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-nfe-xml.test.ts` (sem banco, 36): o parser (limites, DOCTYPE e entidades, NFC-e, protocolo, chave e dígito verificador, dinheiro e quantidade, o XML sintético do roteiro). `tests/erp-documento-fiscal.db.test.ts` (23, pelas funções de verdade; inclui a corrida entre cancelar a nota e descartar o documento e a confirmação do ligar): os critérios 11 a 28 (loja sem CNPJ, nota de ninguém, receber sem lançar, vincular com a conta, conciliar com líquidos e frete, memória por unidade, fator trocado só por quem edita fornecedores, cancelar e conciliar de novo, ligar sem nota nova, cinco conciliações simultâneas, alcance por loja e isolamento entre parceiros), as barreiras do banco (gatilhos, índice parcial da chave, CHECKs), o ambíguo que não é escolhido sozinho, o item repetido, o período fechado, o insumo desativado e o pré-preparo. `tests/erp-documento-fiscal-telas.db.test.ts` (14): actions e telas nas duas árvores (frases, permissões, a nota que veio do XML). `tests/erp-documento-fiscal-migracao.db.test.ts` (6): a migration nos 3 perfis do banco, com dado antigo.

**Os testes de banco rodam em paralelo ou em sequência** (335): o cenário de dois cadastros com o mesmo CNPJ, que exige derrubar um índice, mora em `tests/erp-documento-fiscal-cnpj-repetido.db.test.ts` (2 testes), num banco descartável criado pelas migrations e apagado no fim. Os arquivos `*-migracao` e este criam os próprios bancos e exigem superusuário: ficam fora das rodadas por perfil de dono (que seguem em sequência).

**Cenário de números conferíveis (jornada):** a Casa Alfa tem a Vila da Penha (11.444.777/0001-61) e o Delivery (12.345.678/0001-95); a Casa Beta tem uma loja com o MESMO CNPJ da Penha; o Laticínios Exemplo (11.222.333/0001-81) nasce "a completar" da primeira nota. A nota 4521 (3 itens: queijo em PC, bacon em CX, guardanapo em FD) soma R$ 550,00 + frete R$ 30,00 = R$ 580,00; ligada: 6 kg, 20 kg e 500 un; líquidos 14500, 38000, 2500 centavos; frete 791, 2073, 136. A nota 4600 traz os mesmos códigos (já ligados) e o bacon passa de fator 10 para 12 (24 kg); a 4521 antiga continua em 20 kg. A nota 4550 vale R$ 581,00 e não fecha (R$ 1,00 a mais). A nota 4570 já fora lançada à mão pelo "Frios do Zé" e só é ligada.

**Resultado da prova (2026-10-22).** `prisma validate`, `typecheck`, `lint`, `gate` (603 arquivos varridos) e `build` limpos; `erp:conferir-migracao` limpo e `migrate diff` vazio no `ff_dev`. `npx vitest run` sem banco: 118 arquivos, 61 rodam e 57 (os de banco) pulam, 1507 testes passando. Com banco (`ff_dev`, superusuário, `--no-file-parallelism`), duas rodadas seguidas: 118 arquivos, 2311 testes, todos passando. Como dono NÃO-superusuário com FORCE RLS e como dono sem RLS (bancos novos, todas as migrations aplicadas pelo dono, um banco de cada vez, sem os `*-migracao`): os 13 arquivos de banco tocados ou vizinhos, 231 testes cada: sem RLS, 224 passando e 7 pulados; com FORCE RLS, 230 passando e 1 falha que já existia (o teste da 0.2 lê `_prisma_migrations`, que o psql não cria). A migration da F.1b cria os próprios bancos nos 3 perfis (6 testes, passando). `npm audit`: 22 avisos, todos já existentes e fora do escopo; o `fast-xml-parser` 5.11.2 não aparece (a 4.x aparecia). Jornada no navegador (build de produção, porta 3100, banco novo copiado do `ff_dev`; 84 conferências, todas ok): fila vazia com o convite a importar; importar não pede senha nem certificado; seis recusas (DOCTYPE com entidade, NFC-e, sem protocolo, cStat 110, PDF, nota de outro CNPJ) com frase na própria tela e NADA gravado; o arquivo de 1,5 MB barrado no navegador; a nota 4521 lida, "nada foi lançado ainda", fornecedor "a completar" criado, nenhum estoque; o mesmo arquivo de novo é "já recebida" e o adulterado é recusado com o link; a conta ao vivo (3 PC → 6 kg, 2 CX → 20 kg, 1 FD → 500 un); a prévia fecha em R$ 580,00 sem gravar; salvar grava as 3 memórias; conciliar lança UMA nota IMPORTACAO com a chave, os líquidos e o frete certos e 3 entradas no estoque (com a data de entrada mudada de 21 para 22/10, depois da abertura); a nota do XML não tem "Editar nota" e a edição direta volta ao detalhe; a 4600 já vem ligada, trocar o fator do bacon de 10 para 12 mostra a conta nova e o aviso, a memória muda e a nota 4521 continua com 20 kg; a 4550 avisa que não fecha (R$ 1,00) e conciliar fica desabilitado; o descarte pede motivo e descarta; a 4570 é ligada à nota que a casa já lançara (nenhuma nota nem estoque novos, a chave gravada) e conciliar sem ligar é recusado; cancelar a nota 4521 estorna uma vez e devolve o documento à fila, e conciliar de novo dá UMA nota ativa; a gerente da Penha vê e abre as notas da loja dela; o gerente do Delivery não vê nada da Penha, recebe 404 no id e importa o XML do CNPJ dele; o operador não tem a aba e, pela rota, volta ao início com "Essa tela não está no seu acesso"; a dona da outra casa recebe 404 no id e recebe a MESMA nota para a loja dela sem herdar memória. Matriz de 13 telas (fila, todas, importar, recusa, arquivo grande, documento pendente, que não fecha, com ligar, descartar, conciliado, nota do XML, fila vazia e histórico; a prévia foi vista em 1440 claro) x 4 tamanhos (1440, 1180, 820, 390) x 2 temas: sem rolagem lateral, 0 violação do axe, sem erro de console e, com ponteiro de toque real, nenhum alvo abaixo de 44 px (a matriz achou e fez corrigir os links soltos do cabeçalho do documento e da nota, a 16 e 17 px, e a prova achou, no teste de banco, uma falha real: conciliar escolhendo a loja ou o fornecedor na hora dava "alguém mexeu nesta nota" porque gravar a escolha já tocava a versão; corrigido e coberto). Prints em `scratchpad/shots-F1b`. A migration da F.1b também foi aplicada à mão como dono não-superusuário, com e sem FORCE RLS, e como superusuário, sobre dado antigo.

### Rodada de ajustes dos fiscais (2026-10-22, depois da aprovação)

Nove ajustes, decisões 328 a 335: travas sempre documento → nota (deadlock vira frase de conflito); ligar compara o CNPJ e, com total diferente, pede confirmação (no servidor também); o formulário da nota manda só a raiz do CNPJ; limite do XML em 900 KB; "Insumo que falta: cadastrar" por item da conferência, com volta; recusas sem jargão e sem eco do arquivo, com o XML e a chave de acesso explicados; "não achamos" em português nas rotas de Compras; o cenário do CNPJ repetido num banco descartável. **Prova:** `typecheck`, `lint`, `gate` (606 arquivos), `build` limpos; `erp:conferir-migracao` limpo e `migrate diff` vazio. Sem banco: 119 arquivos, 61 rodam e 58 pulam, 1507 testes passando. Com banco no `ff_dev`, EM PARALELO, duas rodadas: 119 arquivos, 2316 testes, todos passando (170 s cada), e o índice do documento do fornecedor intacto no fim. Dono sem RLS (13 arquivos, em paralelo): 227 passando e 7 pulados. Dono com FORCE RLS (em sequência): 233 passando e 1 falha que já existia (`_prisma_migrations`); em paralelo, `erp-acesso` e `erp-permissoes` mostram instabilidade antiga de limite de login, sem relação com a F.1b (335). O teste de corrida reprova sem a trava nova. Navegador (build de produção, porta 3100, banco novo; 108 conferências na jornada, 130 na matriz, todas ok): as recusas sem jargão, o atalho por item que volta com as escolhas dos itens 1 e 2, o fator e a data mantidos e o insumo novo no item 3; "Ligar" com a confirmação, a diferença de R$ 520,00 e o "Não ligar"; o 404 da nota de outra loja e de outro parceiro em português, com o link de volta e sem dizer de quem é. Matriz de 16 telas x 4 tamanhos x 2 temas: sem rolagem lateral, 0 violação do axe, sem erro de console e nenhum alvo abaixo de 44 px em toque.

## Herança da F.1b (para a F.2 e as próximas)

- **Um núcleo só lança nota de compra**: `lancarNotaNaTransacao` (e `cancelarNotaNaTransacao`) em `compras.ts`. A nota digitada, a do XML e qualquer captação futura passam por ele; nada de segunda regra de custo, frete ou estoque.
- **Captação automática, quando vier**: entra como mais uma origem de `DocumentoFiscal` (`SEFAZ`, já reservada), usa o MESMO parser e a MESMA fila de conferência; não cria nota sozinha. O parser não muda; o que muda é de onde vêm os bytes. Resumo (`resNFe`) não é nota completa: continua recusado.
- **A memória é por fornecedor + código em caixa alta + unidade comercial**; o fator vive em milésimos (1 a 1.000.000). Mudar a chave da memória é migração.
- **Chave de acesso**: única só entre notas não canceladas (índice parcial, invisível para o `migrate diff`: o conferidor o confere).
- **Ordem das travas (328)**: nota fiscal → nota de compra, sempre. Todo caminho novo que mexe nas duas trava o documento antes (`SELECT … FOR UPDATE` por `notaEntradaId`). Deadlock é convertido em frase de conflito, nunca em 500.
- **Teste que mexe em índice do banco todo não entra em arquivo de banco compartilhado** (335): usa um banco descartável.
- **A situação do item é derivada** (ligado ou pendente): se um dia houver item "fora do lançamento", é coluna nova e decisão nova.
- **Lições de código**: `node:crypto` não entra em componente de cliente (por isso `nfe-limites.ts` é um arquivo à parte); o portão veta nome de relação de tenant como propriedade (`insumos:` virou `opcoesDeInsumos`); `npm run build` precisa de `--max-old-space-size=6144`; a versão do documento é conferida com ele travado e a trava final é só pela situação (gravar a loja escolhida já toca a versão); alvo de toque de link solto em tela de tablet usa `lg:` (não `sm:`) para voltar ao tamanho de texto.
- **Para o Rodolfo (não bloqueia; padrão em negrito)**: ver a decisão 327: e-mail do fornecedor de feira (**precisa, salvo "sem nota fiscal"**); "Cepai é a SEFAZ?" (**sem resposta; nada depende**); nota com mais de 200 itens (**recusada com a frase de dividir**); quem troca a memória (**quem edita fornecedores**); assinatura do XML (**não verificada**); transferência entre lojas (**recusada**).

## O que a L.1 entregou — lista de insumos: caneta e lixeira, filtros combinados, cadastro incompleto, paginação e marca

Primeira entrega da "Evolução prioritária — lista de insumos e relatórios" (Rodolfo, 21/10/2026): só "Lista e ações" e "Complemento — quantidade por página"; os relatórios (histórico por insumo, compras do período, comparação, consumo) ficam para a L.2 em diante. **Sem migration** (336): nenhuma coluna, índice, gatilho nem tabela. Decisões 336 a 354 (349 a 354 são a rodada de ajustes dos fiscais). Sem permissão nova (`insumos.editar` vale para caneta, lixeira e exclusão). Ajuda: `insumos` e `insumo-novo` na versão 4 e `insumo-remover` nova.

1. **Caneta e lixeira** (340). Em toda linha editável da tabela e do cartão do celular: botões de 44 x 44 com o nome no rótulo ("Editar Farinha de trigo"), só para quem tem `insumos.editar` e parceiro não bloqueado; pré-preparo mostra "Pela ficha"; desativado só tem lixeira.
2. **Remover** (341, 342). Tela própria que mostra o que está ligado (14 tipos de vínculo, em frases simples). Com vínculo só desativa; sem vínculo desativa ou "Excluir de vez" com a caixa "Entendi que isto apaga o cadastro e não dá para desfazer" (exigida no servidor). Transação com a linha travada e os vínculos contados depois da trava; corrida resolvida nos dois sentidos; `EXCLUIU` no histórico com quem e o retrato; movimento nunca apagado, ficha nunca invalidada. Também há o caminho "Ver o que está ligado a ele e remover" no detalhe.
3. **Filtros combinados no servidor** (337, 338). Busca (nome ou marca), categoria, tipo, conservação, situação, "só sem custo", **marca** e **cadastro incompleto**, todos em AND e na URL. Filtros ativos como chips com X e "Limpar filtros" (que mantém o tamanho da página), contagem e estado vazio útil (diz quantos há no cadastro).
4. **Cadastro incompleto** (338). Sem categoria, categoria "Outros / a classificar", conservação a confirmar e, no pré-preparo, validade não informada na ficha; cada linha diz o motivo. Sem unidade e sem quantidade da embalagem não existem (NOT NULL e CHECK). Custo não informado é outro filtro.
5. **Paginação** (339). 10, 25, 50 ou 100 (padrão 50) na URL e validado no servidor; "Mostrando 1–25 de 137", "Página 1 de 6", Anterior, números compactos e Próxima; "Itens por página" em quatro links; "No cadastro" × "Nesta lista" com rótulos distintos; volta à página 1 ao mudar filtro ou tamanho; página fora da faixa ajustada; zero resultado sem erro; ordem com desempate por id.
6. **Marca de referência** (337). Texto opcional da I.1b (sem trava, sem homologação, histórico de quem mudou): agora aparece na linha, na busca e no filtro "Marca" (sem diferenciar caixa; "Sem marca informada"). Fornecedor homologado fora.
7. **Retorno e reconciliação** (343, 344, 345). A caneta volta à lista na mesma página, filtros e tamanho, com o aviso e "Continuar editando"; o detalhe e "Novo insumo" também guardam a lista; edição reenviada depois de resposta perdida vira "Nada mudou"; a busca é literal (`%` e `_`).

### Evidência de cada caixa do Notion (para o Maestro marcar; L1104–1118 e L1204–1207, L1252–1257)

| Caixa | Evidência |
|---|---|
| L1110 mensagem visível, que não cobre ação, anunciada por leitor de tela, sem depender de cor nem sumir | `AvisoDeSalvo` (I.1a): texto + ponto, fica na página, não cobre botão, região `role=status` preenchida DEPOIS da montagem. Jornada C6: o texto da região viva confere, o aviso segue visível 6 s depois, axe sem violação na lista com o aviso em 4 tamanhos x 2 temas (J4). Idem nos avisos de desativar e excluir (F2, G3). |
| L1111 erro conserva o formulário; resposta perdida reconcilia antes de criar de novo | Validação: erro no campo, foco nele, formulário preservado (C2). Falha de rede: "Não deu para confirmar", formulário intacto, nada gravado (C3). Resposta perdida: o servidor gravou e a tela não afirma nada (C4); salvar de novo = "Nada mudou", uma linha só no histórico (C5, decisão 344). No cadastro novo, a chave de envio da I.1a (10 envios = 1 insumo). Na exclusão: recusa limpa com "Recarregar" (H2, H3). |
| L1112 retorno coerente à lista/detalhe, continuar editando, cadastrar outro | Caneta -> lista na mesma página, filtros e tamanho (C5); "Continuar editando" (C7); detalhe -> editar -> detalhe com a lista na memória (D1); "Novo insumo", "Ver todos os insumos" e "Cadastrar outro insumo" levam a lista (D2). |
| L1113 testar sucesso, erro de validação, falha de rede, duplo clique, teclado, retorno e edição em computador, tablet e celular nos dois temas | J4: celular (390, escuro), tablet retrato (820, claro), tablet paisagem (1180, escuro) e computador (1440, escuro), cada um com validação, falha de rede, resposta perdida, duplo clique (uma gravação só), retorno à lista e axe. Teclado: foco na caneta e Enter abre a edição (C1); o foco vai ao campo com erro (C2). Matriz de 11 telas x 4 tamanhos x 2 temas + a lista do operador: sem rolagem lateral, axe sem violação (46 verificações), alvos de toque >= 44 px. |
| L1114 registrar resultado e evidência | Esta seção. |
| L1117–1118 obrigatoriedade (nome, categoria, unidade; vazio, espaços, placeholder, unidade inválida, categoria ausente, correção e reenvio) | Fechada na I.1a/I.1b (decisões 246, 252, 253, 262); a L.1 não mexeu: os testes `erp-categorias`, `erp-insumos` e `erp-insumo-clareza` seguem passando nos 3 perfis. Conferido de novo pela caneta: nome vazio na edição é recusado no campo (C2). |
| L1204 caneta e lixeira, rótulos acessíveis, área de toque, permissão no servidor | Jornada C1 (rótulo com o nome, 44 x 44), J1 (operador não vê nem alcança), J2 (gerente), L1/L2 (nível 1); testes de banco com operador, parceiro bloqueado e id de outro parceiro nas duas árvores. |
| L1205 vínculos antes de remover, desativar com vínculo, excluir só sem referência com confirmação e verificação transacional, sem apagar movimento nem invalidar receita | Jornada F1/F2 (com vínculo só desativa), G1–G3 (sem vínculo, confirmação, histórico), H (corrida), I (ficha, pré-preparo, desativado); testes de banco com cada tipo de vínculo, a corrida nos dois sentidos (20 rodadas) e o guarda do catálogo do banco. |
| L1206 filtros combinados (categoria, tipo, conservação; proteína congelada), filtros ativos, limpar, contagem, vazio útil | Jornada B1–B6; teste de banco "proteína congelada = categoria + conservação". |
| L1207 cadastro incompleto com motivos, distinto de custo; manter paginação, filtros e retorno; evitar perda e duplicação ao salvar | Jornada B4 (conferido por SQL independente) e C; teste de banco que compara o filtro com os motivos de cada linha. |
| L1252–1257 quantidade por página, faixa, página x de y, totais distintos, URL, página fora da faixa, 0 resultados, 0/1/limite/limite+1/última, retorno da edição | Jornada A1–A4, B5, B6, E0–E2 (100 de 100 e 101 de 101 criados pela tela) e teste de banco com 137 insumos (os 4 tamanhos, cada insumo uma vez só, ordem por custo, 0, 1, 25, 26, fora da faixa, tamanho torto). |

### Referências Kairu consultadas (regra do plano)

Pelo MCP Kairu em 22/10/2026: `library:design-precisao-corporativo` v1.2.0 (lido inteiro) e `library:design-estoque-editorial` (já a referência principal do contrato); buscas "cadastro de insumos lista paginação filtros" e "insumos" não acharam prompt. O que foi aplicado está na decisão 347 (toolbar e rodapé de paginação do Corporativo, "preserve filtros ao voltar", "busca sem resultado oferece limpar", "todo botão faz algo ou explica", total da página × total dos resultados, exportação com o escopo dos filtros, 44 px). Fora de propósito: seleção em lote e inspetor lateral.

## Provar a L.1

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # com banco, 2x, em paralelo
NODE_OPTIONS=--max-old-space-size=6144 npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-lista-insumos.test.ts` (sem banco, 52): tamanhos por página (valor torto cai em 50), página pedida, marca e incompleto na URL (ida e volta), o "de onde vim" sem open redirect, os motivos do cadastro incompleto, a paginação numerada (todos os cantos) e as frases dos vínculos. `tests/erp-lista-insumos.db.test.ts` (65, Postgres de verdade): paginação (137 insumos, 4 tamanhos, 0/1/25/26, fora da faixa, ordem), filtros combinados, marca, cadastro incompleto (SQL = linha), busca literal, remoção (embalagem, ficha, nota, saldo e movimento, etiqueta, memória, histórico de custo, pré-preparo, outro parceiro, guarda do catálogo), corrida (nos dois sentidos, 20 rodadas, duas exclusões), edição reenviada, actions das duas árvores (operador, bloqueio, confirmação, destino, `de` malicioso, auditoria) e o guarda de código. Mutante conferido: sem o `FOR UPDATE` a corrida de duas exclusões reprova (a de vincular segue limpa pela FK, a última palavra).

**Resultado da prova (2026-10-22).** `prisma validate`, `typecheck`, `lint`, `gate` (615 arquivos varridos) e `build` limpos; `erp:conferir-migracao` limpo e `migrate diff` vazio no `ff_dev` (a L.1 não tem migration). `npx vitest run` sem banco: 121 arquivos, 62 rodam e 59 (os de banco) pulam, 1552 testes passando. Com banco (`ff_dev`, superusuário), EM PARALELO, duas rodadas seguidas: 121 arquivos, 2421 testes, todos passando (170 s cada). Como dono NÃO-superusuário com FORCE RLS e como dono sem RLS (bancos novos, todas as migrations aplicadas pelo dono): os 9 arquivos de banco tocados ou vizinhos (lista, insumos, clareza, categorias, isolamento, permissões, compras, fichas e ajuda), 208 testes cada, todos passando (inclui o `DELETE` pelo papel `erp_tenant` e a corrida).

**Jornada no navegador** (build de produção, porta 3100, banco `ff_l1p` copiado do `ff_dev` com 175 insumos na Casa Alfa e as pessoas de cada perfil; 194 conferências, todas ok; roteiros em `scratchpad/prova-l1`, prints em `scratchpad/shots-L1`): paginação e totais (50, 10, 25 e 100 por página, última página, página fora da faixa, tamanho torto); filtros combinados, chips, limpar, marca, cadastro incompleto (conferido por SQL independente), 0 e 1 resultado; caneta (rótulo, alvo, teclado, voltar à lista, erro de validação, falha de rede, resposta perdida, duplo clique, aviso que não some, continuar editando); detalhe e "Novo insumo" guardando a lista; limite exato (100 de 100) e limite + 1 (101, duas páginas) criados pela própria tela; remover com vínculo (só desativa, histórico com motivo), sem vínculo (confirmação, histórico "Ana Dona"), corrida (alguém usa o insumo entre a tela e o clique), ficha, pré-preparo, desativado sem uso; operador (sem caneta, sem lixeira, barrado nas rotas), gerente (exclui), Casa Beta (só o dela, 404 nos ids da Alfa) e nível 1 (caneta, volta à lista dele, exclusão, auditoria, 404 em outra casa); e a mesma edição em 4 tamanhos x 2 temas. Matriz de 11 telas x 4 tamanhos (1440, 1180, 820, 390) x 2 temas com ponteiro de toque: sem rolagem lateral, 46 verificações do axe sem violação, sem erro de console e sem alvo abaixo de 44 px. A jornada achou e fez corrigir: rolagem lateral de 4 px a 820 px (a coluna nova de ações exigiu tirar "Outras embalagens" e "Custo inicial" abaixo de 1280 px), filtros cortados e "Cadastro incompleto" vazando da caixa a 1180 px (a grade passou a 3 colunas até 1279 px), número repetido em "1  1 item de notas", texto de desativar repetido na tela Remover, cabeçalho ordenável com 32 px em toque, e a busca com `%`, que o teste de banco já tinha achado.

## Herança da L.1 (para a L.2 e as próximas)

- **A L.2 recebe**: o histórico de compras de UM insumo (visão 1) e as compras do dia ou período (visão 2) partem da lista e do detalhe; o filtro de categoria, tipo, conservação e marca da lista pode ser reaproveitado como seletor de insumos. `vinculosDoInsumo` já sabe quantos itens de nota o insumo tem.
- **Padrão de lista paginada** (`PaginacaoNumerada`, `paginasVisiveis`, `faixaDaPagina`, `FiltrosAtivos`, `ResumoDaLista`): fichas e fornecedores ainda usam o rodapé antigo (`Paginacao`) e podem migrar sem mexer na regra.
- **Quem criar tabela com FK para `Insumo`** precisa acrescentá-la a `vinculosDoInsumo` (o teste do catálogo do banco reprova até isso).
- **Exportação**: não existe para insumos; quando existir, cobre todos os filtrados e usa o `filtroDoBanco`.
- **Lição de código**: o Prisma não escapa `%` e `_` em `contains`; qualquer busca por trecho nova precisa escapar; e a abertura de transação com `FOR UPDATE` seguida da contagem dos vínculos é o desenho para "só apaga se ninguém usa" (a FK `Restrict` é a rede de proteção, não o caminho feliz).
- **Decisões para o Rodolfo** (não bloqueiam): 348.

### Rodada de ajustes dos fiscais (2026-10-22, depois da aprovação)

Seis ajustes, decisões 349 a 354: um rótulo só ("Nesta lista", com "(com os filtros)" quando há filtro); todo link com a lista na memória nasce de `comDe` (valor de `de` codificado, com teste de ida e volta); no celular os filtros viram "Filtros (n)" recolhível, placeholder "Buscar nome ou marca" e a ajuda nasce recolhida pelo `recolhida: true` que já existia; o aviso de pendências sem "· sem saldo" solto; a ficha técnica com um insumo excluído no mesmo instante responde "Este insumo acabou de ser excluído do cadastro…" (criar e editar, com a corrida em teste); `npm run typecheck` com a memória do build. **Prova:** `typecheck`, `lint`, `gate` (616 arquivos) e `build` limpos. Sem banco: 121 arquivos, 62 rodam e 59 pulam, 1559 testes passando. Com banco no `ff_dev`, EM PARALELO, duas rodadas: 121 arquivos, 2433 testes, todos passando. Dono sem RLS (9 arquivos, em paralelo): 213 passando. Dono com FORCE RLS (EM SEQUÊNCIA: em paralelo uma limpeza de outro arquivo toma trava exclusiva da tabela e a corrida de 20 rodadas pode cair em deadlock do banco de teste, como já avisado na F.1b): 213 passando. Navegador (build de produção, porta 3100, banco novo): as jornadas A a E (j1 a j4) de novo, todas ok, mais a do celular (j5: 34 conferências: caixa recolhida, filtros recolhidos e abertos, "Filtros (2)" depois de filtrar, placeholder que cabe, primeira linha na primeira tela, rótulo único, `href` com `de` codificado, nos dois temas) e a matriz de 11 telas x 4 tamanhos x 2 temas (46 verificações do axe sem violação, sem rolagem lateral, sem alvo abaixo de 44 px).

## O que a L.2 entregou — relatórios de compras: histórico de um insumo e compras do dia ou período, com planilha e PDF

Segunda entrega da "Evolução prioritária — lista de insumos e relatórios de compras, preços e consumo" (Rodolfo, 21/10/2026): a **Visão 1** (histórico de um insumo) e a **Visão 2** (compras do dia ou período), com a exportação. Comparação de fornecedores e períodos (L.3) e consumo e conciliação de estoque (L.4) ficam de fora. Uma migration ADITIVA (`20261107000000_erp_relatorio_compras`, dois índices). Decisões 355 a 371 (368 é o extra da busca sem acento, pedido pelo Maestro depois do pós-deploy da L.1; 371 é a rodada de ajustes dos fiscais). Sem permissão nova (`compras.ver`, por loja). Ajuda: `compras-relatorio-insumo` e `compras-relatorio-periodo` novas, `compras` na 3 e `insumo` na 4.

**Telas** (nas duas árvores, `/erp/compras/relatorios/insumo`, `/erp/compras/relatorios/periodo` e `/rodolfo/erp/[slug]/compras/relatorios/...`), grupo "Relatórios" no menu de Compras; "Ver o histórico de compras" no detalhe do insumo; a nota aberta pelo relatório volta para ele (`?volta=`, só caminho interno).

1. **O recorte** (355, 356, 357, 364). Lojas só as do acesso (caixa de marcar; sem marcar = todas as dele; loja de fora nunca amplia), dia, intervalo e mês inteiro (De/Até e atalhos hoje, ontem, 7 dias, este mês, mês passado), fornecedor, insumo (lista e busca sem acento), categoria e agrupar por insumo, fornecedor ou dia. **Data usada**: entrada da nota (padrão), emissão da nota fiscal (só as de XML; diz quantas notas digitadas ficaram de fora) ou dia do lançamento no relógio do Rio; a mesma conta SQL em filtro, total, agrupar por dia, planilha e impressão.
2. **Os números** (358, 359, 360, 361, 367). Total (itens + frete), valor dos itens, frete atribuído, descontos (R$ 0,00 dito), quantidade POR UNIDADE (kg, L e un nunca se somam; "sem unidade" à parte), preço médio ponderado e custo médio entregue (só com um insumo no recorte), linhas "sem base" com o motivo. Cancelada fora de todo total e separada; documento fiscal que aguarda conferência não é compra (a tela conta quantos aguardam); nota repetida conta uma vez. Valores do lançamento: renomear o insumo ou mexer na embalagem não reescreve compra antiga.
3. **Tudo abre** (364). Cada indicador tem "Ver as N linhas"; cada grupo e cada fornecedor abre as linhas dele (chip "Aberto: …" com ×); cada linha mostra data, fornecedor, nota (link), embalagem original, quantidade convertida, preço unitário (com e sem frete), frete, descontos e total, e abre a nota e, quando há, a nota fiscal (XML).
4. **Planilha** (365). CSV com `;`, vírgula decimal, BOM e proteção contra fórmula (`= + - @`, tab e CR ganham apóstrofo), duas partes (compras e resumo), cabeçalho com período, data usada, lojas e filtros e rodapé com os mesmos totais da tela; teto de 50.000 linhas (413 em frase, nunca corta calada). 401 sem sessão, 403 sem permissão ou sem loja do acesso, 400 para período torto.
5. **PDF** (366). "Imprimir ou salvar em PDF": a mesma tela com `imprimir=1`, papel claro, sem menu e sem botões, tabelas inteiras (até 1.500 linhas; passou, a página diz e manda para a planilha).
6. **Por baixo** (362, 363). Tudo somado no banco (GROUP BY, LIMIT/OFFSET, contagem na mesma consulta), uma fotografia só por tela (`transacao(…, { repetivel: true })`, opção nova do portão), RLS por baixo; dois índices novos (`lojaId, emitidaEm` e `lojaId, lancadaEm`), conferidos pelo `erp:conferir-migracao`.
7. **Extra**: a busca de insumos (lista, ⌘K e relatórios) ignora acento e caixa, mantendo o texto literal (`%` e `_` são letras) com `translate()`, sem extensão (368).

### Evidência de cada caixa do Notion (para o Maestro marcar; L1211–1214, L1218–1221 e L1244–1246)

| Caixa | Evidência |
|---|---|
| L1211 selecionar insumo, lojas autorizadas e dia, intervalo ou mês; quantidade na unidade base, valor total, preço médio ponderado e fornecedores | Jornada I1–I9, T2, V1–V2 (tela contra SQL independente: 379 kg, R$ 44,45/kg ponderado, R$ 44,73/kg entregue, tabela por fornecedor); testes de banco do mês, dos dois fornecedores e da virada de mês. |
| L1212 detalhe por compra (data, fornecedor, nota, embalagem original, quantidade convertida, preço unitário, descontos, frete, total) e cada indicador abre as linhas | `TabelaDasCompras` e o teste da linha 102 (5 × Peça 2 kg = 10 kg, R$ 470,00 + R$ 5,00); jornada A1–B4, F1–F3, G1–G2 (indicadores, grupos, nota, volta, nota fiscal). |
| L1213 preço médio = valor comparável ÷ quantidade, não a média simples, sem base quando falta dado | Teste puro (5 kg a R$ 46 e 10 kg a R$ 47 = R$ 46,67, não R$ 46,50), teste de banco (R$ 45,62 contra R$ 45,75), linhas sem base (unidade que some e valor zero) em H2 e A8. |
| L1214 preservar unidade, conversão e valores do lançamento | Teste de banco "renomear insumo e mexer na embalagem NÃO reescreve compra antiga" (totais e linhas idênticos). |
| L1218 relatório de todos os insumos de um período, filtros por loja, fornecedor, insumo e categoria, agrupar por insumo, fornecedor ou dia, abrir os documentos de origem | Jornada A, B, C-fornecedor, C-dia, E1, F, G; teste de banco dos filtros e dos agrupamentos. |
| L1219 data usada explícita, escolha explícita, mesma base em filtros, totais e exportação, fuso e limites do dia | Jornada D1–D4 (emissão e lançamento contra SQL), D1–D3 do celular (23:30 do Rio), J6; testes de banco (02:59:59 e 03:00:00 UTC) e propriedade "soma das linhas = grupos = resumo" nas 3 bases × 3 agrupamentos × lançadas e canceladas. |
| L1220 somar dinheiro, nunca kg + L + un; agrupar por unidade | Jornada A4–A5 e teste de banco (kg, L, un e "sem unidade" em linhas separadas). |
| L1221 planilha e PDF com filtros, período, base, unidades e totais iguais à tela, permissões, sem truncar | Jornada J1–J8 (CSV = tela: mesmas linhas, mesma soma), K1–K4 (impressão), L6–L8, O5, B5; testes de banco da planilha (cabeçalho, rodapé, fórmula maliciosa, 401/403/413/400). |
| L1244 amostra: dois fornecedores com embalagens diferentes, frete, mudança de mês, cancelamento, nota repetida, item sem conversão | Cenário do `tests/erp-compras-relatorio.db.test.ts` (Peça de 2 kg do Laticínios contra o quilo solto do Zé, frete R$ 20,00 e R$ 10,00 rateado em 714 + 286, 30/09 e 01/10, nota 103 cancelada e lançada de novo, bacon sem unidade, leite com valor zero). Transferência entre lojas e devolução não são compra e ficam fora (L.4). |
| L1245 soma das linhas × resumo, preço médio ponderado, exportação × tela, abertura da origem, isolamento entre empresas e lojas | Os testes acima, o isolamento (B1–B6, L1–L9, O1–O5, N1–N4) e o conjunto de testes de banco nos 3 perfis. Concorrência ao editar e remover é da L.1. |
| L1246 computador, tablet retrato e paisagem e celular, teclado e leitores de tela | Matriz de 14 telas × 4 tamanhos × 2 temas + gerente; teclado (T1–T2); `aria-current`, `aria-live`, rótulos e `<caption>` nas tabelas. Consumo real e publicação não foram declarados. |

### Referências Kairu consultadas (regra do plano)

Pelo MCP Kairu em 22/10/2026: `library:design-precisao-corporativo` v1.2.0 e `pass:compras-cotacao-comparavel` v1.2.0, lidos inteiros; buscas "relatório de compras por insumo fornecedor período", "relatório tabela exportação" (design), "compras" e "relatório". O que foi aplicado está na decisão 369: exportação com o escopo e os filtros da tela, "valor ausente não vira zero", "toda informação derivada tem unidade, período e origem", datas pelo dia operacional do Rio com intervalo [início, fim), paginar em vez de carregar milhares de linhas, comparar por unidade sem esconder o preço do item do custo entregue, nunca mostrar dado de outra loja sem permissão. Fora de propósito: seleção múltipla e inspetor lateral (a linha abre a nota em tela cheia) e a comparação em si (L.3).

## Provar a L.2

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # com banco, 2x, em paralelo
NODE_OPTIONS=--max-old-space-size=6144 npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio
```
`tests/erp-compras-relatorio.test.ts` (sem banco, 19): filtros da URL (padrões, datas, listas fechadas, ids com lixo, ida e volta), calendário (virada de mês e de ano, bissexto), a frase do período, o preço ponderado (incluindo abaixo de 1 centavo e sem base), a planilha segura. `tests/erp-compras-relatorio.db.test.ts` (19, Postgres de verdade, números do cenário conferidos à mão no cabeçalho do arquivo): totais por unidade, ponderado × média simples, dois fornecedores, sem base, soma das linhas = grupos = resumo (3 bases × 3 agrupamentos × 2 situações), histórico preservado, mês inteiro e virada de mês, as três datas e o limite do dia no Rio, cancelada e nota repetida, documento aguardando e ligado, filtros e busca sem acento, gerente de uma loja, operador, outro parceiro, período torto, paginação e teto, planilha = tela, planilha com fórmula maliciosa e a rota (401, 403, 413, 400, cabeçalhos). `tests/erp-relatorio-compras-migracao.db.test.ts` (6): a migration nos 3 perfis do banco, com dado antigo, duas vezes, o papel do tenant e o conferidor. `tests/erp-busca.test.ts` (4) e o caso "acento" em `erp-lista-insumos.db` e `erp-insumos.db`. Mutantes conferidos: fuso UTC no lugar do Rio e filtro de situação removido reprovam.

**Resultado da prova (2026-10-22).** `prisma validate`, `typecheck`, `lint`, `gate` (632 arquivos varridos) e `build` limpos; `erp:conferir-migracao` limpo e `migrate diff` vazio no `ff_dev` (com a migration da L.2 aplicada). `npx vitest run` sem banco: 125 arquivos, 64 rodam e 61 (os de banco) pulam, 1584 testes passando. Com banco (`ff_dev`, superusuário), EM PARALELO, duas rodadas seguidas: 125 arquivos, 2484 testes, todos passando (181 s cada). Como dono NÃO-superusuário com FORCE RLS (em sequência, bancos novos com todas as migrations aplicadas pelo dono) e como dono sem RLS (em paralelo): os 12 arquivos de banco tocados ou vizinhos (relatório, compras, insumos, lista, clareza, categorias, isolamento, permissões, documento fiscal e telas, RLS, fichas), 278 testes cada: sem RLS, 271 passando e 7 pulados; com FORCE RLS, 277 passando e 1 falha que já existia (o teste da 0.2 lê `_prisma_migrations`, que o psql não cria). A migration da L.2 cria os próprios bancos nos 3 perfis (6 testes, passando). Desempenho (banco copiado com 320 mil itens de nota em 80 mil notas): um mês com 27 mil linhas sai em 0,3 a 0,5 s por qualquer das três datas, o ano (258 mil linhas) em 1,5 s; a planilha acima de 50 mil linhas recusa em 6,6 s.

**Jornada no navegador** (build de produção, porta 3100, banco `ff_l2p` copiado do `ff_dev` com 74 notas de set e out em 3 lojas; roteiros em `scratchpad/prova-l2`, prints em `scratchpad/shots-L2`; 153 conferências, todas ok): resumo do mês contra SQL independente (total, notas, linhas, kg), abrir grupo e voltar, soma dos grupos por fornecedor e por dia, as três datas (emissão e lançamento contra SQL), loja, linha → nota → voltar com o recorte, nota fiscal (XML), canceladas e sem base, histórico do insumo (ponderado, entregue, fornecedores, busca sem acento "acai" e "ype"), planilha igual à tela (mesmas 62 linhas, mesma soma, fórmula com apóstrofo, nenhuma célula começa com `= + - @`), impressão (sem menu, sem botão, todas as linhas); gerente (só a loja dele, loja de outro por URL = vazio, 403 na planilha e na impressão, o id da outra loja nem sai no HTML), operador (sem acesso, sem menu, 403, nenhum valor no HTML), Casa Beta (só a nota dela, nada da Alfa), nível 1 (as duas casas), paginação (150 linhas em 15 páginas, página fora da faixa, tamanho torto), celular (filtros recolhidos, marcar loja, "Filtros (1)"), teclado, "Mês passado", virada de mês, limite do dia (a nota lançada às 23:30 do Rio de 30/09 não aparece em 01/10 pelo lançamento) e a escolha do insumo na lista. Matriz de 14 telas x 4 tamanhos (1440, 1180, 820, 390) x 2 temas com ponteiro de toque, mais o gerente: sem rolagem lateral, 58 verificações do axe sem violação, sem erro de console e sem alvo abaixo de 44 px. A jornada achou e fez corrigir: rolagem lateral de 186 px a 390 px (os três botões de saída no cabeçalho), nome do insumo cortado no cartão do celular (a composição do total espremia a coluna), links soltos de 16 a 20 px (notas "para ler os números" e o número da nota no cartão), rolagem da impressão a 390 px (região focável) e os links do detalhe da nota a 1180 px em toque.

## Herança da L.2 (para a L.3 e as próximas)

- **O motor é um só** (`compras-relatorio.ts`): `fonte` (itens de nota lançada com dia, motivo de "sem base" e unidade), `totaisDoRecorte`, `gruposDoRecorte`, `linhasDoRecorte`, `relatorioDaTela` e `relatorioCompleto` (planilha e impressão). A comparação de fornecedores e de períodos (L.3) parte dele: mesmo recorte, mesma data usada, mesma regra de "sem base" e de unidade; nada de segunda conta de preço médio.
- **Preço do item × custo entregue** já estão separados (`precoMedioPonderado` e `custoMedioEntregue`). O desconto continua R$ 0,00 por linha: se um dia a nota rateá-lo, entra na mesma composição "itens + frete − desconto" e no CSV.
- **Fuso por loja** não existe; a constante `FUSO_OPERACIONAL` é o único lugar a trocar.
- **Auditoria de download** não existe; se a casa quiser, entra no histórico pela rota de planilha.
- **Busca sem acento**: `busca.ts` serve a qualquer lista por nome; fichas e fornecedores ainda usam `contains` insensível a caixa (herança).
- **Portão de tenant**: a opção `repetivel` de `transacao` é para leitura em várias consultas; escrita não a usa. O portão veta `insumos:` como propriedade de código (o relatório usa `listaDeInsumos`) e o teste das rotas de arquivo exige `pode(ctx.alcance, 'compras.ver')` na rota.
- **Alvo de toque** de link solto em tela de tablet: `[@media(pointer:coarse)]:min-h-11` (o `lg:min-h-0` deixava 20 px num tablet deitado a 1180 px; corrigido no detalhe da nota, que o relatório abre).
- **Decisões para o Rodolfo** (não bloqueiam): 370.

### Rodada de ajustes dos fiscais (2026-10-22, depois da aprovação do Guardião e da primeira volta da UX)

Decisão 371: a volta atravessa a nota fiscal (XML), `?pagina=` com teto e queda na última página depois de contar, landmark único na impressão, plural, cartões e canceladas mais claros, filtros em 2 colunas a 820 px, "Data usada" sem corte a 1180 px, "N compras" no subtítulo e ícone próprio. **Prova:** `typecheck`, `lint`, `gate` e `build` limpos; vitest sem e com banco (paralelo); navegador (build de produção, porta 3100): a volta pelo documento (do relatório e da nota, e as quatro voltas maliciosas ignoradas), `pagina` gigante nas duas visões, impressão com axe em 4 tamanhos × 2 temas (relatório do período e histórico do insumo), canceladas, cartões, 820 e 1180 px, e a matriz das telas tocadas em 4 tamanhos × 2 temas.

## O que a L.3 entregou — comparação de fornecedores e de períodos (compras)

Terceira entrega da "Evolução prioritária — lista de insumos e relatórios de compras, preços e consumo" (Rodolfo, 21/10/2026): **"Comparação de fornecedores e períodos"** (L1225–1227), item 3 da "Ordem de entrega" (L1237–1242) e os critérios L1244–1246. Consumo e conciliação de estoque (L.4) ficam de fora. **Sem migration** (374): os índices da L.2 bastam. Decisões 372 a 384 (372 e 373 são a herança da L.2, em commit próprio). Sem permissão nova (`compras.ver`, por loja). Ajuda: `compras-comparar-fornecedores` e `compras-comparar-periodos` novas (versão 1); nenhuma entrada existente mudou de texto.

**Telas** (nas duas árvores: `/erp/compras/relatorios/comparar-fornecedores`, `.../comparar-periodos`, `.../comparar/exportar?tela=fornecedores|periodos` e o espelho em `/rodolfo/erp/[slug]/compras/relatorios/...`), grupo "Relatórios" do menu de Compras. Do histórico de um insumo parte "Comparar os fornecedores deste insumo" e de "Compras do período" parte "Comparar com o período anterior".

1. **Comparar fornecedores** (378, 380). Um insumo e um período; uma tabela por unidade, uma linha por fornecedor: compras, quantidade, embalagens compradas, **preço do item** (R$/un, ponderado), **custo entregue** (com o frete atribuído), peso do frete, diferença para o mais barato em R$/un e em %, selos separados "Mais barato no preço do item" e "Mais barato entregue" (o frete pode inverter a ordem), última compra com link para a nota. Marca de referência visível como informação, sem bloquear marca. Sem base, um fornecedor só e uma compra só são ditos. Nunca "economia".
2. **Comparar períodos** (375, 376, 377, 379). A (base) × B, mesmas lojas, filtros, data usada e medida (custo entregue ou preço do item). Gasto de A, de B e variação (R$ e %); "de onde veio": efeito volume, efeito preço (do mesmo fornecedor × troca de fornecedor), o que só aparece num período ("entrou" e "saiu") e a soma conferida; tabela por insumo (cartões no celular), com um insumo só os fornecedores lado a lado; "Antes de ler" com cobertura, tamanhos, sobreposição, período em andamento, lado sem compra, sem base e documentos aguardando.
3. **Tudo abre** (382). Cada gasto abre as linhas em "Compras do período" com o mesmo recorte e "Voltar para a comparação de compras"; cada linha abre a nota e a nota fiscal (XML), com a volta encadeada.
4. **Planilha e impressão** (381). CSV igual ao da L.2 (protegido contra fórmula) com os mesmos números da tela; "Imprimir ou salvar em PDF" sem menu, tabelas inteiras, landmarks únicos.
5. **Por baixo** (374). `compras-comparacao-campos.ts` (conta pura em BigInt, filtros, avisos), `compras-comparacao.ts` (uma leitura por lado: células insumo × unidade × fornecedor, o que ficou sem base e os totais, numa CTE materializada; B é o recorte do A com as datas trocadas), `compras-comparacao-planilha.ts`. Teto de 20.000 células por lado (recusa em frase).

### A conta (375 a 377)

Por insumo e unidade com compra comparável nos dois lados, G = gasto em centavos pela medida, Q = quantidade em milésimos, P = G ÷ Q:

| Efeito | Fórmula | Exemplo (10 kg a R$ 10,00 → 15 kg a R$ 9,50) |
|---|---|---|
| Preço | (P1 − P0) × (Q0 + Q1) ÷ 2 | (9,50 − 10,00) × 12,5 = −R$ 6,25 |
| Volume | (Q1 − Q0) × (P0 + P1) ÷ 2 | 5 × 9,75 = +R$ 48,75 |
| Variação | G1 − G0 = volume + preço | +R$ 42,50 |
| Troca de fornecedor | efeito preço − Σ (efeito preço de cada fornecedor presente nos dois lados) | 0 (um fornecedor só) |

Forma simétrica (ponto médio): não depende de qual período é a base e não deixa termo de interação. O efeito preço é arredondado UMA vez (metade para longe do zero) e o volume é o que sobra em inteiros: a soma de qualquer conjunto de itens fecha ao centavo. Insumo só num lado = "entrou" ou "saiu" (sem preço nem volume). % só com A > 0. Linha "sem base" (a regra da L.2) fica fora da conta e é contada, valorizada e aberta.

### Evidência de cada caixa do Notion (para o Maestro marcar; L1225–1227, L1237–1242 e L1244–1246)

| Caixa | Evidência |
|---|---|
| L1225 custo por mesma unidade base, frete/descontos pela regra de rateio, preço do item × custo entregue, só especificações compatíveis, sem bloquear marca | Teste de banco "o frete inverte a ordem" (Zé R$ 10,00 / R$ 12,00 × Laticínios R$ 10,50 / R$ 10,50, Peça 2 kg × quilo solto); jornada F1–F11, F18–F19 (marca Camil, dita como informação); testes puros do ranking. O desconto por item segue R$ 0,00 (decisão 367). |
| L1226 comparar períodos: quantidade, gasto e custo médio; separar volume de preço; composição e troca de fornecedor; sem atribuir tudo a inflação ou economia | Testes puros com conta à mão (volume +48,75 e preço −6,25; troca +20,00; mistura 6/4 → 8/2: mesmo fornecedor +6,50, troca −4,50), propriedade com 300 cenários (soma fecha, inverter A e B troca o sinal), teste de banco do cenário inteiro nas duas medidas; jornada P8–P13. |
| L1227 cobertura incompleta, ausência de base, denominador zero; sem crescimento ou economia enganosa; mesmos critérios, lojas e unidades | Testes de banco "A sem compra" (percentual sem base), "só num lado", "sem base dita por insumo", "o filtro de fornecedor vale nos dois lados", "loja"; jornada P14–P20 (nenhum ∞, NaN nem +0,0%). |
| L1237–1242 ordem de entrega, item 3 | Esta entrega. |
| L1244 amostra: dois fornecedores com embalagens diferentes, frete/desconto, mudança de mês, cancelamento, nota repetida, item sem conversão | Cenários dos testes de banco (agosto: Peça 2 kg × quilo solto, frete R$ 20,00, bonificação sem base, cancelada de R$ 500,00; setembro × outubro: mês inteiro de cada lado, troca de fornecedor, cebola sem unidade). Nota repetida e relançada contam uma vez pela mesma regra da L.2. |
| L1245 soma das linhas × resumo, preço médio ponderado, exportação × tela, abertura da origem, isolamento entre empresas e lojas | Testes de banco (soma da coluna Variação da planilha = variação do resumo; planilha = tela nos dois relatórios), jornada X1–X13 contra SQL independente, P21–P23 (linhas, nota, volta), isolamento G1–G7, B1–B7, N1–N5. |
| L1246 computador, tablet retrato e paisagem e celular, teclado e leitores de tela | Matriz de 20 telas × 4 tamanhos × 2 temas com ponteiro de toque (sem rolagem lateral, axe, alvos de 44 px, sem erro de console), gerente, teclado (T1–T4), `caption`, `aria-current`, landmarks únicos na impressão. Consumo real e publicação não foram declarados. |

### Referências Kairu consultadas (regra do plano)

Pelo MCP Kairu em 23/10/2026: `pass:compras-cotacao-comparavel` v1.2.0 (lido inteiro) e buscas "comparação de preços variação volume preço período" e "comparativo antes e depois delta tabela" (design): sem material de comparação de períodos nem de efeito preço × volume (a decomposição é própria, decisão 375). O que foi aplicado está na decisão 383: o menor preço unitário não é o menor custo total (preço do item × custo entregue), `null` é desconhecido (sem base, nunca R$ 0,00 nem % sobre zero), unidade incerta fora da comparação, "melhor preço não substitui decisão do comprador" (nunca "economia"), outra loja sem permissão nem no HTML, na planilha ou na impressão.

## Provar a L.3

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # com banco, 2x, em paralelo
NODE_OPTIONS=--max-old-space-size=6144 npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio (não há migration nova)
```
`tests/erp-compras-comparacao.test.ts` (sem banco, 26): a conta com números à mão, a propriedade dos 300 cenários, os percentuais e as frases, o ranking por preço do item e por custo entregue, os filtros da URL, os avisos de datas, os atalhos, o período anterior, a planilha de 4 casas e o rótulo da volta. `tests/erp-compras-comparacao.db.test.ts` (21, Postgres de verdade, cenário conferido à mão no cabeçalho do arquivo): fornecedores (frete inverte a ordem, última compra ignora linha sem base, data usada pelo lançamento no relógio do Rio, planilha = tela), períodos (as duas medidas, sem base por insumo, cancelada, A sem compra, um insumo só, o filtro vale nos dois lados, loja, gerente, operador, outro parceiro, teto, paginação, data usada nos dois lados) e planilha (= tela, fórmula maliciosa, a rota 401/403/400/413/200). `tests/erp-busca-fichas-fornecedores.db.test.ts` (3): a herança da busca sem acento.

**Resultado da prova (2026-10-23).** `prisma validate`, `typecheck`, `lint`, `gate` (645 arquivos varridos) e `build` limpos; `erp:conferir-migracao` limpo e `migrate diff` vazio no `ff_dev` (sem migration nova: nada a aplicar nos 3 perfis do banco). `npx vitest run` sem banco: 128 arquivos, 65 rodam e 63 (os de banco) pulam, 1616 testes passando. Com banco (`ff_dev`, superusuário), EM PARALELO, duas rodadas seguidas: 128 arquivos, 2541 testes, todos passando (155 s e 152 s). A primeira rodada achou um teste da 1.3 que contava as consultas da lista de fichas (9): a busca sem acento acrescentou uma consulta de ids quando há texto, a mesma com 3 ou com 30 fichas (não é N+1); a expectativa passou a 10, com o motivo escrito no teste. Nos perfis de banco, como a L.3 não tem migration, os 12 arquivos de banco tocados ou vizinhos (comparação, relatório, compras, busca, fornecedor, lista de insumos, insumos, subfichas, fichas, isolamento, permissões, RLS; 248 testes) rodaram como dono NÃO-superusuário com FORCE RLS (em sequência: 247 passando e 1 falha que já existia, o teste da 0.2 que lê `_prisma_migrations`, que o psql não cria) e como dono sem RLS (241 passando e 7 pulados).

**Jornada no navegador** (build de produção, porta 3100, banco `ff_l3p` copiado do `ff_dev` com o cenário da L.2 mais o da L.3 conferido à mão e 24 insumos extras; roteiros em `scratchpad/prova-l3`, prints em `scratchpad/shots-L3`): dona (70 conferências: fornecedores contra SQL independente, o frete que inverte a ordem, a marca de referência, linhas, nota e volta; períodos com gasto de A e de B e a variação contra SQL, as duas medidas, volume, preço, troca, entrou e saiu, A sem compra, critérios iguais nos dois lados, lojas, paginação, atalhos, as saídas partindo dos relatórios da L.2; planilha igual à tela, impressão com as 38 linhas), perfis (36: gerente só da Penha, loja de fora = vazio e 403 na planilha, operador sem acesso e sem R$ no HTML, Casa Beta isolada, nível 1 nas duas casas, volta de fora ignorada, busca sem acento em fichas, fornecedores e no ⌘K), teclado (4) e a matriz de 20 telas × 4 tamanhos (1440, 1180, 820, 390) × 2 temas com ponteiro de toque, mais o gerente: sem rolagem lateral, 84 verificações do axe sem violação, sem erro de console e sem alvo abaixo de 44 px nos botões, chips e links de bloco (o medidor pulava o link de texto dentro de cartão: a 1ª volta da UX achou os nomes dos insumos nos cartões com 19 px, corrigidos e medidos com toque no centro do link na rodada de ajustes abaixo; os links de "nota 4570" e "Mudar a categoria" do detalhe do insumo medem 48 px nos 3 tamanhos). A jornada achou e fez corrigir: as colunas de custo médio e gasto quebravam a linha ("B:" sozinho), o gasto de cada lado era um link de 20 px em tablet, os links de uma palavra ("Ovo", "Alho") de 27 px de largura (herança da L.2, que só aparece com nome curto), os avisos empurravam os números para fora da primeira tela do celular (agora vêm depois dos três cartões, com um link no da variação), "A soma" apertada numa linha só (virou lista), "Ver as 1 linha" e "(1 insumos)", e o sinal duplo na conferência da impressão.

**Desempenho** (banco com 300 mil itens de nota em 60 mil notas, com estatísticas): dois meses de 31 mil linhas cada em 0,6 s; quatro meses contra quatro (250 mil linhas) em 2,0 s; a planilha de mês × mês em 0,8 s; fornecedores de um insumo no ano em 0,24 s.

### Rodada de ajustes da 1ª volta da UX e do Guardião (2026-10-23)

Decisão 385. **UX, bloqueantes:** (B1) os nomes dos insumos nos cartões de "Por insumo" (< 1024 px) ganharam `ff-toque` (44 px, com o toque no centro acertando o link a 390, 820 e 1023 px); (B2) um lado sem compra comparável (B vazio, A vazio, ou "Este mês" no dia 1º) mostra o lado como "Sem compra", a variação como "Sem base" (sem % e sem sinal de queda), os efeitos volume e preço como "—" e mantém "saiu"/"entrou"; o cartão "A soma" some (não há variação a somar), e o rodapé, a impressão e o CSV dizem o mesmo; (B3) "Ver as linhas sem base" no aviso de cobertura e nos cartões de A e B, com `so=sembase`, o mesmo recorte e a volta para a comparação. **UX, não bloqueantes:** "Ver as 0 linhas" virou texto (sem link); "Os períodos A e B terminam depois de hoje"; os avisos (dias diferentes, em andamento, cobertura, lado sem compra, emissão, aguardando) saem no cabeçalho do CSV com as mesmas frases da tela (uma função só, `avisosDaComparacao`); "Tirar o filtro de lojas" só quando há filtro de lojas; insumo só com linha sem base: "Nenhum fornecedor com preço comparável neste período"; impressão com `break-after: avoid` nos títulos; quando "entrou" é mais da metade de uma variação positiva, a nota "a maior parte é de insumo que só aparece em B: não é aumento de preço" fica junto ao % (tela e CSV). **Guardião, baixos:** nota sem fornecedor cadastrado agrupa pelo nome que a nota guardou (`n:<nome>`), e não tudo em "-"; `busca.ts` não corta mais em 5.000 sem avisar (sem `limite`, vêm todos os que casam); a busca que acha um insumo só não lê a comparação duas vezes (a leitura já sai dele e a página só assume o endereço).

**Prova da rodada.** `typecheck`, `lint`, `gate` (645 arquivos) e `build` limpos; `migrate diff` vazio e `erp:conferir-migracao` limpo. Sem banco: 1620 testes passando (65 arquivos rodam, 63 pulam). Com banco (`ff_dev`), EM PARALELO, duas rodadas: 128 arquivos, 2550 testes, todos passando. Novos: 4 testes puros (lado sem compra, "entrou" domina, gramática, avisos) e 5 de banco (B vazio e A vazio com o CSV, avisos no CSV, nota sem fornecedor cadastrado, busca de um insumo só, insumo só com linha sem base). Navegador (build de produção, porta 3100, banco novo): jornada dos pontos tocados (77 conferências em claro e 36 em escuro: hit-test de toque no centro dos links dos cartões a 390, 820 e 1023 px, B vazio e A vazio, as linhas sem base abrindo com a volta e a nota encadeada, o CSV com os avisos da tela, os botões e frases novos, `break-after` na impressão), axe sem violação em 9 telas × 4 tamanhos × 2 temas, e as jornadas e a matriz da entrega anterior de novo, todas ok (70 + 36 conferências e 48 por tema).

## Herança da L.3 (para a L.4 e as próximas)

- **A conta é pura** (`compras-comparacao-campos.ts`): quem precisar de efeito preço × volume em outra tela (consumo, DRE) chama `compararPeriodos(celulasA, celulasB, medida)`; células são `insumo × unidade × fornecedor` já somadas pelo banco.
- **B é o recorte do A com as datas trocadas** (`recorteDoLadoB`): qualquer comparação nova herda lojas, filtros e data usada sem duplicar formulário.
- **Marca comprada não existe na nota**: se a casa quiser comparar por marca, é preciso guardar a marca na linha da nota (fase própria; decisão 384).
- **Fuso por loja** continua inexistente (`FUSO_OPERACIONAL`); desconto por item continua R$ 0,00; auditoria de download continua fora.
- **Teto de 20.000 células** por lado: se algum cliente passar disso, a leitura vira por insumo (paginada no banco) em vez de em memória.
- **`transacao(..., { repetivel: true })`** serve a toda tela que lê o mesmo recorte duas vezes (A e B).

## Mapa do esquema (0.1)

Toda tabela abaixo tem `parceiroId` (tenant) e só se acessa por `doParceiro`.

| Bloco | Tabela | Para quê |
|---|---|---|
| Estrutura | `ParceiroFlow` | N2, o tenant. Ganhou `periodoTipo`/`periodoDiaInicio` (sugestão de período do DRE; desde a 2.2a sem uso: a regra vive em `RegraDoPeriodo`) |
| Estrutura | `Loja` | N3, loja/unidade do parceiro; estoque, produção e faturamento são por loja. F.1a: `cnpj` (destinatário das notas fiscais; opcional, não único). 1.7: regras da contagem (piso do fechamento, frequência ABC, tolerância para fechar sozinha). 2.1: `canaisDeVenda` (em quais canais vende; pelo menos um) |
| Estrutura | `Marca` | marca do grupo; produto e faturamento podem apontar marca |
| Estrutura | `Colaborador` | pessoa da operação; âncora do histórico por funcionário (login vem na 0.3) |
| Insumos | `Insumo` | já existia; ganhou tipo (ingrediente/embalagem/pré-preparo), taxa de entrega, conservação e validade por conservação, mínimo, fornecedor padrão, origem |
| Insumos | `CategoriaInsumo` | I.1a: a categoria da REDE (natureza do insumo para o CMV): `chave` estável das dez padrão, `sistema` ("Outros / a classificar"), `ativa`/`desativadaEm`, `ordem`. `Insumo` ganhou `categoriaId` (nula no banco, obrigatória na regra; FK composta), como foi classificada (`classificadoPor`), o motivo, o lote da classificação assistida e a `chaveEnvio` + `hashEnvio` do cadastro. I.1b: `marcaReferencia` (texto informativo, opcional), `conservacaoConfirmadaEm` (quando uma pessoa confirmou a conservação; nulo no antigo) e o valor `MATERIAL` em `InsumoTipo` |
| Insumos | `InsumoVariante` | outras embalagens de compra do mesmo insumo |
| Compras | `Fornecedor` | quem vende. F.1a: `nome` = nome fantasia (único), `razaoSocial`, `documento` (CNPJ/CPF, único por parceiro onde existe), `inscricaoEstadual`, `endereco`/`municipio`/`uf`/`cep`, `email`, `whatsapp` (dígitos com DDD), `contatoComercial`, `prazoPagamentoDias` (só guardado), `semNotaFiscal`, `situacaoCadastro` (COMPLETO ou A_COMPLETAR), `chaveEnvio` + `hashEnvio` (idempotência do cadastro); `contato` (texto livre da 1.5) só leitura |
| Compras | `NotaEntrada` / `NotaEntradaItem` | nota de compra e itens com snapshot (F.1b: `chaveAcesso` única só entre as não canceladas, índice parcial; `origem` IMPORTACAO quando veio do XML); LANCADA vale para o custo; com o estoque da loja aberto, entra no razão (`MovimentoEstoque.notaId`, 1.6) |
| Compras | `DocumentoFiscal` / `DocumentoFiscalItem` | F.1b: a nota fiscal recebida por XML (chave de 44 dígitos única por parceiro, emitente, destinatário, totais, parcelas, situação AGUARDANDO_CONFERENCIA, CONCILIADO ou CANCELADO) e seus itens como o emitente os escreveu, mais a escolha da casa (insumo, embalagem, fator). Nasce sem lançar nada; conciliar cria a `NotaEntrada` (origem IMPORTACAO) na mesma transação. Conteúdo imutável por gatilho |
| Compras | `VinculoItemFornecedor` | F.1b: a memória de quem vende: fornecedor + código do produto (caixa alta) + unidade comercial → insumo, embalagem e fator (milésimos, de 1 a 1.000.000). Chave imutável; mudar é UPDATE com histórico |
| Ficha | `FichaTecnica` | prato ou pré-preparo, rendimento; pré-preparo pode produzir um Insumo |
| Ficha | `FichaItem` | insumo OU subficha, quantidade líquida, fator de correção |
| Venda | `ProdutoVenda` | item de venda (aponta a ficha). 1.9: o da casa (sem marca, nome = da ficha) é criado com as embalagens |
| Venda | `ProdutoCanal` | preço por canal: o próprio (`precoManualCentavos`, 1.10) sobrescreve o sugerido; `margemAlvoBp` por prato sem uso (o preço próprio é o override) |
| Venda | `ProdutoEmbalagem` | camada de embalagem por canal (delivery, iFood): insumo tipo Embalagem × quantidade por porção (1.9) |
| Venda | `CanalConfig` | taxa do canal por parceiro: comissão (`taxaBp`) + pagamento online (`taxaPagamentoBp`, 1.9) sobre o preço; taxa fixa (sem uso: é do pedido) e margem-alvo (líquida) do canal (`margemAlvoPadraoBp`, 1.10; a linha do iFood nasce com a taxa) |
| Estoque | `SaldoEstoque` | saldo e valor por loja × insumo (soma do razão, atualizada na mesma transação, com versão) |
| Estoque | `MovimentoEstoque` | livro-razão: abertura, entrada, requisição, produção, ajuste, contagem, perda; snapshot e saldo antes/depois; estorno = mesmo tipo, sinal contrário, `estornoDeId` único (1.6) |
| Estoque | `Contagem` / `ContagemItem` | 2.3: `itensSemPreco` (quantos insumos sem preço no retrato da abertura e do fechamento; nulo = antes da 2.3); abertura (1.6: estado da loja), cíclica e fechamento de período (1.7: título, prazo, desfecho aplicada/fechou sozinha/venceu; fechamento aponta o `PeriodoApuracao`, um por loja); esperado (livro na hora de contar) × contado; versão, lista e fator congelados, digitado × normalizado. O piso é regra da lógica com os números na `Loja` |
| Estoque | `Requisicao` / `RequisicaoItem` | pedido do setor (1.8: número por loja, setor da 0.4, para quando, versão, pedida → atendida em parte → atendida · cancelada, ficha de origem); a baixa sai na entrega (`REQUISICAO` com `requisicaoItemId`), devolução por estorno |
| Produção | `OrdemProducao` | lote: planejado/produzido, custo, responsável (snapshot). 3.1: código `AAMMDD-NN` por loja e dia, `requisicaoId` único (a requisição dos insumos), `chaveIdempotencia`, `versao`, retratos da unidade, da conservação e da validade (`validadeEm`), quem planejou/iniciou/concluiu/cancelou, motivos (rendimento e cancelamento), `insumosSemPreco`; o custo por kg nunca é gravado; concluída só muda para CANCELADA (gatilho) |
| Produção | `ListaProducao` / `ListaProducaoItem` | 3.2: a lista do dia de uma loja (única por loja e dia, `versao`, quem criou e mudou) e as linhas (pré-preparo, quanto, retrato do nome e da unidade, `ordemProducaoId` único = o lote que a linha virou). Linha com lote vivo não muda nem sai; o lote é da mesma loja, dia e ficha; a lista não muda de loja nem de dia (gatilhos). A conta (vai usar / tem / comprar) nunca é gravada |
| Produção | `Etiqueta` | etiqueta impressa: lote do fornecedor, validade, abertura, snapshot |
| DRE | `FaturamentoLancamento` | faturamento por loja × canal × dia (2.1: marca nula): valor, pedidos, clientes (= atendimentos do dia, não clientes únicos); chave de idempotência única; origem MANUAL/IMPORTACAO (uma linha humana por grão) ou INTEGRACAO; `atualizadoPorNome`; CHECKs de teto, espaço de chave e valor com pedido |
| DRE | `DreLinha` / `DreMeta` | linhas do DRE (com `sentido`: maior ou menor é melhor; 2.2a: `codigo` estável das linhas do padrão, único por parceiro, nulo nas da casa) e meta % por linha, por canal ou da rede (canal nulo), com vigência; 2.2b: `semMeta` (a ausência de meta também é uma linha vigente), `criadoPorNome`, `atualizadoEm` |
| DRE | `Despesa` | despesa manual/importada numa linha; loja nula = rede, canal nulo = rateio; importada exige chave de idempotência. 2.2a: competência de um dia, mês ou intervalo (`competencia`..`competenciaFim`, até 366 dias), `recorrente` e `repeteDeId` (cadeia mensal, única por parceiro), `vencimento`/`pagaEm`, `atualizadoPorNome`; valor da despesa inteira (a apropriação é conta, não coluna) |
| DRE | `PeriodoApuracao` | períodos configuráveis; contagem de fechamento aponta o período; 2.2a: gatilho recusa sobreposição; 2.2b: `fechadoPorNome`, só vira FECHADO com fotografia vigente |
| DRE | `RegraDoPeriodo` | 2.2a: regra do período do parceiro (mensal, quinzenal ou semanal, dia em que começa), versionada por `vigenteDesde`; só inclusão (gatilho), `parceiroId` imutável; fonte única do DRE e da contagem de estoque |
| DRE | `DreFotografia` / `DreFotografiaLinha` | 2.2b: a fotografia imutável de um período fechado (versão, taxa do iFood congelada, ressalvas, justificativa, quem fechou e quem reabriu e por quê) e suas linhas em BigInt (`valorCentavos`) com a `entrada` de que saíram (2.3: `versaoDaConta` 2 traz o CMV; `entrada.cmv` por loja); só inclusão por gatilho; uma vigente por período (índice parcial); período FECHADO exige fotografia vigente (gatilho adiado) |
| DRE | `FarolFaixa` | 5 faixas por linha do DRE × canal (nulo = rede), sobre o desvio vs meta já com o sentido da linha |
| Insumos | `CategoriaNaLoja` | I.2a: o USO da categoria por loja (`usa`, padrão = usa), com versão; único por loja e categoria; categoria sem uso sai do formulário e do painel daquela loja, salvo se tiver valor |
| DRE | `MetaCmvConjunto` / `MetaCmvCategoria` | I.2a: o conjunto de metas por categoria de um escopo (rede = `lojaId` nulo, ou uma loja; `segueARede`; `aplicouModelo`; `vigenteDesde` única por escopo) e a meta de cada categoria em pontos-base (0 a 10000, FK RESTRICT para a categoria: categoria com meta não se exclui); só o conjunto mais novo do escopo muda (gatilho) |
| Estoque | `ContagemRetratoItem` | I.2a: o retrato do estoque por insumo de uma contagem fechada (quantidade, valor nulo = sem preço); só inclusão, só em contagem aberta; Σ valores = `Contagem.valorTotalCentavos` (gatilho) |
| Onboarding (0.5, FORA do tenant) | `PedidoParceiro` / `PedidoParceiroEvento` / `TentativaPedidoParceiro` | pedido de acesso (landing ou manual) com consentimento, etapa e versão; evento só-inclusão; tentativas do formulário público. Sem `parceiroId`: o vínculo com o parceiro criado é `parceiroCriadoId` |
| Ajuda (0.6, FORA do tenant) | `PreferenciaErp` | o que a pessoa escolheu sobre as caixas de ajuda: dicas ligadas, resposta da 1ª vez, caixas fechadas (`chave@versão`, no máximo 300). Por `UsuarioErp`, sem `parceiroId`, lida com a sessão |
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
  4. **Banco, RLS (0.2).** As 32 tabelas de tenant têm RLS ligada e FORÇADA,
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
  2.1: o humano (digitado ou planilha) usa a chave `manual:<loja>:-:<canal>:<data>` e tem índice único parcial no grão; a integração
  usa `<fonte>:<tipo>:<idExterno>` (o CHECK separa os dois espaços).
- **Nulo que não repete.** Unique com `NULLS NOT DISTINCT` (escrito no SQL, o
  Prisma não descreve): produto sem marca, meta de rede e faixa de rede não
  duplicam.
- **Origem.** `origem` MANUAL/IMPORTACAO/INTEGRACAO onde dado pode vir de fora.
- **Servidor decide.** O formulário manda texto; a conversão e o custo por
  unidade são calculados no servidor. A prévia na tela é só prévia.
- **Ajuda (0.6).** Toda rota do ERP tem entrada em `ajuda-textos.ts` e texto mudado sobe a `versao`
  (`tests/erp-ajuda.test.ts` reprova). Ver "A regra nova: toda subfase atualiza a ajuda".

## Ver funcionando (local, nunca produção)

```bash
# Postgres local com DATABASE_URL apontando para localhost no .env
npx prisma migrate deploy
npm run erp:seed-teste        # Casa Alfa e Beta (ativas) e Gama (suspensa), com lojas, marcas, insumos
npm run build && npm start    # entre em /rodolfo/login → hub → Parceiros Flow
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
- ~~"Piso obrigatório" da contagem fica na lógica da 1.7.~~ **1.7:** `coberturaDoPeriodo` + `concluirContagem`, números na `Loja`.

## Herança da 0.2 (apontada pelos fiscais)

- `cliente.sql` filtra erro de descuido, não código feito para burlar (`query_to_xml`, `U&"…"`, `pg_settings` passam); tem falso positivo com `role`/`begin` em alias/string. Revisar antes da primeira fase com relatório em SQL cru.
- Sem RLS em produção o único sinal é um aviso no log: criar health check que falhe se `papelDisponivel()` for falso no cenário compose.
- Suspensão sob escrita contínua pode esperar; `gravarParceiroFlow` precisa de timeout maior e mensagem em PT-BR para o estouro.
- ~~Na 0.4, `exigirParceiro` passa a conferir se o usuário pertence ao parceiro.~~ **0.4:** `exigirParceiro` é só do nível 1 (que alcança todo parceiro); a pessoa do parceiro nunca passa por ele — o parceiro dela vem da sessão, com vínculo ATIVO conferido a cada requisição (teste).
- ~~Identificador técnico da loja aparece sob o nome.~~ **0.4:** escondido no `/erp`; só o nível 1 vê.

## Herança da 0.3 (para as próximas subfases)

- ~~**0.4:** perfil, setores e lojas no `AcessoParceiro`; `/erp` deixava qualquer pessoa cadastrar insumo.~~ **Feito na 0.4.** `Colaborador` NÃO foi ligado à pessoa: setores não precisaram dele (moram no vínculo). Fica para a fase de RH/produção (3.3): `Colaborador` (tenant) ganharia `usuarioId` SEM relação Prisma (relação criaria campo de volta no `UsuarioErp` e o teste-guarda reprova credencial apontando para tenant), conferido na escrita.
- ~~**0.5:** o envio do link (WhatsApp/e-mail) entra no `criarAcesso`/`gerarNovoLink`; hoje o Rodolfo copia.~~ **0.5:** a ativação mostra o link uma vez com "Copiar" e "Abrir no WhatsApp" (wa.me); sem servidor de envio (sem SMTP, Evolution sem conexão).
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
- ~~O envio do link (0.5) entra em `executar.ts`/`criarAcesso`.~~ **0.5:** botão "Abrir no WhatsApp" (wa.me) no link gerado; a regra do link (decisão 41) já está no servidor.

## Herança da 0.4 (apontada pelos fiscais)

- `validarSessao` (segunda trava por versão) sem teste próprio; entrada pelo rosto durante a limpeza sem teste de ordem forçada.
- Texto em "Seu acesso": "quando sua senha foi trocada ou apagada" é mais preciso.
- `abrirSessao` com timeout 10 s < 15 s de `naEquipe`: login atrás de mudança longa de equipe pode virar erro 500.
- Remover um rosto não derruba sessões abertas por ele (a sessão não guarda o aparelho).
- Dono de A ainda muda perfil/desativa a pessoa em A depois que ela entra em B (afeta só A).

## Herança da 1.1 · shell (para as próximas subfases)

- Sino do parceiro sem fonte: quando houver (requisição, contagem, nota), a
  contagem real entra em `notificacoes` do layout do /erp.
- Visão por loja ainda não filtra nada (só insumos existem, e são da rede):
  estoque, compras e faturamento (1.5+) leem `visaoDaRequisicao`.
- Página do N1 dentro de parceiro usa `exigirPermissao` (lança erro); o /erp
  usa `exigirPermissaoNaPagina` (volta ao hub). N1 tem tudo, então não
  aparece; se um dia houver papel restrito no N1, trocar.

## Herança da 1.1 · insumos (para as próximas subfases)

- Fornecedor padrão do insumo e por embalagem: 1.5 (não há cadastro de
  fornecedor antes; nenhum select vazio na tela).
- "Tornar padrão" uma embalagem (trocar a do insumo pela de uma variante).
- Estoque mínimo (rede × loja): 1.6/3.2. Validades por conservação: 1.4.
- Importar insumos por planilha: o leitor de CSV da 1.2 (`lerCsv`,
  `decodificarPlanilha`) e o padrão prévia → confirmação servem; falta a regra.
- Preço 0 é a sentinela de "Sem preço". Se aparecer item de fato gratuito,
  migrar para `precoEmbalagemCentavos` nulo.
- Ordenar por custo é feito em memória (o custo é derivado, nunca gravado):
  serve a centenas de insumos; com milhares, levar a comparação exata para o
  SQL (`cliente.sql`, numeric).
- Ficha técnica (1.3): custo do item = `custoDaQuantidade(custo, quantidade)`
  — nunca multiplicar o custo/unidade arredondado da tela.
- Nome único é sensível a maiúscula ("Cebola" ≠ "cebola"), como na 0.2.
- O aviso de sair com alterações pega fechar/recarregar, não a navegação
  interna do Next (link do menu).

## Herança da 1.1 (apontada pelos fiscais)

- ~~`custoDaQuantidade` devolve Number de BigInt: antes da 1.3 usar, recusar acima de 2^53 ou devolver BigInt.~~ **1.2:** recusa acima de 2^53; a ficha soma em fração BigInt.
- Casos irreais de custo minúsculo: milheiro "R$ 0,00" e rótulo "menos de R$ 0,000001" citando casa errada.
- Ordenar por custo carrega todos os insumos do parceiro (0,8 s com 5 mil): levar para SQL quando crescer.
- Aviso de sair sem salvar não pega navegação pelo menu; nome do insumo diferencia maiúscula.
- Texto da comparação: "por unidade" e "embalagem padrão" leem melhor.
- `/portal/<token>`: erro de hydration antigo (React #418, `Portal.tsx` lê `window` no render).
- `npm audit`: next 14.2.35 (crítico) e prisma (alto) antigos — planejar atualização.

## Herança da 1.2 (para as próximas subfases)

- ~~1.3: subficha, fator de correção na tela e custo em cascata; ciclo.~~ **Feito na 1.3.**
- ~~1.5: custo pelo último preço de compra troca `custoDoInsumo`.~~ **Feito na 1.5.**
- 1.9/1.10: preço por canal aponta a ficha (`ProdutoVenda.fichaId`).
- XLSX: só CSV. Se entrar lib de planilha, trocar só `decodificarPlanilha`/`lerCsv`.
- Foto: sem faxina de arquivo órfão (processo morto entre gravar o arquivo e a
  transação). Rotina no worker: apagar o que não está em `FichaTecnica.fotoArquivo`.
- Lista de fichas carrega os itens de cada ficha da página para o custo (50
  por página): com fichas enormes, levar a soma para o SQL.
- O seletor de insumo do formulário é um `<select>` com todos os ativos: com
  milhares, trocar por busca.
- Importar reabre a prévia inteira na transação (5000 linhas, timeout 30 s).

## Herança da 1.2 (apontada pelos fiscais)

- ~~[médio] `bodySizeLimit` 9 MB global.~~ **1.3:** rota própria, sessão antes do corpo.
- ~~[médio] Importar 5000 fichas em ~26 s.~~ **1.3:** até 300 por arquivo; estouro com mensagem.
- ~~[médio] Foto com EXIF/GPS.~~ **1.3:** regravada sem metadados.
- ~~[baixo] Suspenso sem fichas; exports internos.~~ **1.3.**
- UX: ~~no celular, modo de preparo logo depois da foto~~ (1.3); trilha a 820 px truncando; hub com atalhos crescendo; faxina de foto órfã no disco; XLSX fora (só CSV); seletor de insumo vira busca com muitos insumos.

## Herança da 1.3 (para as próximas subfases)

- ~~1.4: o insumo produzido nasce "Seco" e não se edita.~~ **1.4:** vem da ficha.
- ~~1.5: o custo pelo último preço de compra entra em `custoDoInsumo`.~~ **Feito na 1.5.**
- 1.6/3.1: o insumo produzido é a face de estoque do pré-preparo (produção dá
  entrada nele); a receita aponta a FICHA (`subfichaId`), não o insumo.
- Planilha: pré-preparo novo usado na mesma planilha exige dois arquivos
  (ordem). Dá para gravar primeiro os pré-preparos da planilha e depois o
  resto, na mesma transação.
- Toda gravação de ficha do parceiro passa por uma trava só (o grafo):
  serializa as gravações de ficha de um parceiro (curtas; ok para o volume de
  hoje). Importação longa segura as edições do parceiro até 30 s.
- O filtro "só custo incompleto" calcula a cascata de TODOS os pré-preparos
  do parceiro; com milhares, levar para SQL recursivo (`cliente.sql`).
- Foto: envio exige JavaScript (o formulário sem JS salva sem foto). ~~Faxina
  de pendentes só no próximo envio.~~ **1.4:** também ao abrir a lista.
- Foto órfã fora de `pendentes/` (processo morto no meio) continua sem faxina
  (herança da 1.2).

## Herança da 1.3 (apontada pelos fiscais)

- ~~[médio] Formulário forjado aceita o insumo produzido como item comum.~~ **1.4** (a).
- ~~[médio] Limpeza de JPEG guarda marcadores desconhecidos.~~ **1.4** (b).
- ~~[baixo] Foto pendente só é faxinada no próximo envio.~~ **1.4** (d).
- UX: ~~trilha a 820 px; histórico de itens pesado; texto do fator; "Sem foto" grande no celular; seta sem exceção do scanner~~ (1.4, e); conferir selo "Custo incompleto" subindo do molho para o prato (segue).

## Herança da 1.4 (para as próximas subfases)

- 3.4 etiquetas: validade da etiqueta = data de produção/abertura + minutos da
  conservação escolhida NA HORA (snapshot na `Etiqueta`; reimpressão não
  recalcula). Insumo comprado: a do fabricante vem do lote; a das colunas é a
  de depois de aberto.
- Pré-preparo sem validade aparece em atenção ("Validade não informada"); a
  3.4 pode exigir antes de imprimir. Não travamos a gravação para não quebrar
  fichas e planilhas da 1.2/1.3.
- ~~CHECKs do Insumo entraram `NOT VALID`.~~ **1.5:** validados por migration.
- O intervalo da faxina de pendentes é por processo (memória); com várias
  réplicas, cada uma faz a sua (o teto por vez continua valendo).
- Histórico de itens lê a frase gravada ("Nome 300 g (fator 1,18)"); nome de
  insumo que termine como quantidade cai na lista inteira (como antes).

## Herança da 1.4 (apontada pelos fiscais)

- ~~[médio] CHECKs de Insumo `NOT VALID` / 23514 dá 500.~~ **1.5** (a).
- ~~[baixo] Marcador JPEG 0xC8.~~ **1.5** (b).
- ~~[baixo] Principal sem validade grava em silêncio.~~ **1.5** (c).
- UX: ~~validade na lista de fichas, "Principal" desabilitado, "Validade não informada", "Depois de aberto", contorno do selo~~ (1.5, d); conferir "Custo incompleto" subindo do molho para o prato (segue).

## Herança da 1.5 (para as próximas subfases)

- ~~**1.6 abertura de estoque**~~ **Feito na 1.6** (decisão 68): ao abrir o estoque de uma loja (data/hora da
  abertura), nota lançada nela daí em diante gera `ENTRADA_COMPRA` na mesma
  transação de `lancarNota`/`editarNota` (editar e cancelar = movimento de
  estorno; o livro-razão não aceita UPDATE). Nota anterior à abertura já está
  na contagem e não gera movimento. Decidir: nota de DATA anterior à abertura
  mas digitada depois. Editar hoje troca os itens por inteiro (ids novos): com
  movimento apontando `notaItemId`, editar precisa estornar e relançar.
- Desconto da nota (`descontoCentavos`) fica 0: quando entrar, ratear como o
  frete e mostrar na prévia. Bonificação (item sem valor) é recusada.
- CSV de notas e XML de NF-e (com memória código do fornecedor → insumo e o
  fator de conversão, Notion Core) não entraram.
- Preço com mais de 2 casas por unidade: a pessoa digita o total da linha, que
  sempre tem 2 casas; não há campo de unitário.
- Conta a pagar (Notion Core: "compra vira estoque e conta a pagar no mesmo
  movimento") é da fase financeira.
- Fornecedor padrão do insumo/embalagem (colunas da 0.1) segue sem tela.
- O custo do insumo é o da última compra da REDE (qualquer loja); os detalhes
  da compra só para quem vê aquela loja. Se um dia o custo for por loja,
  `ultimasCompras` ganha o filtro de loja.
- `NotaEntrada_chave_da_nota` é índice parcial escrito à mão (o Prisma não
  descreve WHERE): migration futura que mexa nele reescreve o SQL. O índice da
  última compra está declarado no `schema.prisma` (`migrate diff` vazio).
- Frete rateado é por nota: a mesma compra relançada com outro valor de item
  muda o rateio (ex.: cheddar R$ 290,00 de R$ 459,50 em itens leva R$ 7,57 dos
  R$ 12,00; com R$ 278,00 de R$ 447,50, leva R$ 7,45).

## Herança da 1.5 (apontada na prova)

- A lista de fichas afetadas na prévia sai inteira em fichas grandes (teto 30
  e "E mais N fichas"); com centenas de fichas, paginar.

## Herança da 1.5 (apontada pelos fiscais)

- [decisão do Rodolfo] Custo de referência da rede mostra o preço/kg (e a data) que outra loja pagou: aceitável como "custo da rede" ou esconder a data/mostrar só para quem vê compras?
- ~~UX: campo de data sem erro visível; "peça a quem cuida das compras"; "Nota 4521-1".~~ **1.6.**
- ~~1.6: nota com data anterior à abertura digitada depois; editar nota com movimento ligado vai precisar de estorno.~~ **1.6** (decisão 68). Seguem: desconto/bonificação; CSV de notas, XML de NF-e e contas a pagar fora; fornecedor padrão do insumo sem tela; índice único parcial da chave da nota só no SQL.

## Herança da 1.6 (para as próximas subfases)

- ~~**1.7 contagem cíclica**~~ **Feito na 1.7** (variantes de embalagem na contagem e recontagem com as duas versões e motivo seguem abertas): reaproveita `ContagemItem` (lista e fator
  congelados, digitado × normalizado, versão por item, conflito), a tela de
  contar (`TelaContagem`) e `gravarMovimentos`; o acerto entra como
  `CONTAGEM` (±) com `contagemItemId`. Falta: agenda/fecha sozinha, janela
  máxima (contagem velha não se aplica como de agora), piso no fechamento do
  período, recontagem com as duas versões e motivo, variantes de embalagem na
  contagem.
- ~~Correção da abertura é pela 1.7.~~ **1.7:** "Recontar" no saldo.
- Nota de HOJE lançada depois de concluir entra no estoque (assume que chegou
  depois da contagem); a conferência avisa das notas de hoje já lançadas. Com
  várias réplicas do app, `lancadaEm` × `fechadaEm` dependem do relógio de
  cada uma (a trava `FOR SHARE`/`FOR UPDATE` ordena as transações).
- Valor no razão é o da época (abertura: custo de referência do momento;
  compra: valor + frete). A tela mostra o valor pelo custo de referência de
  hoje; o CMV real (2.3) decide qual dos dois usa.
- Sem preço/pré-preparo incompleto: a abertura grava valor 0 e a tela diz
  "pendente"; quando o preço chegar, o valor de hoje aparece, o fotografado não muda.
- `estoqueMinimoMilesimos` e a lista do dia (3.2) seguem sem tela.
- Saldo da loja lê todos os saldos e custa em memória (centenas): com
  milhares de insumos, paginar no SQL.
- Índice parcial `Contagem_uma_abertura_por_loja` só no SQL (como o da nota).


## Herança da 1.6 (apontada pelos fiscais)

- ~~[médio] Estouro de INT4~~ **1.7 (a):** contagem de 1.000.000 kg × R$ 26,75 estoura `concluirAbertura` (500, sem corromper); o mesmo pode ocorrer no saldo em `gravarMovimentos` acima de ~R$ 21 mi por insumo. Conferir tetos na conferência e ao gravar movimentos, com frase em vez de 500; baixar o teto da contagem.
- ~~UX (contagem com luva)~~ **1.7 (b):** alvos "Não tem", seletor kg/g e "Tentar de novo" de 40 → 48 px; rascunho local (localStorage) do número que falhou ao salvar, reenviado quando o sinal voltar; "fase 1.7/1.8" → "em breve"; "Só gerente ou dona concluem"; cabeçalho do estoque no celular mais curto; filtro de conservação cortado a 390 px sem indício de rolagem.
- Correção de número errado na abertura só pela 1.7; valor da época × de hoje no CMV real fica para a 2.3; variantes de embalagem na contagem e paginação do saldo para milhares de insumos.

## Herança da 1.7 (para as próximas subfases)

- ~~**1.8 requisição**~~ **Feito na 1.8** (decisões 77–80): a baixa entra no
  livro na entrega; a conferência mostra a baixa depois de contar em "depois
  de contar"; o cruzamento está em Divergências.
- ~~**2.3 CMV real**~~ **Feito na 2.3** (decisões 160–170): inicial = estoque final fotografado do fechamento
  anterior (ou a abertura, no 1º período); final = `valorTotalCentavos` do
  FECHAMENTO aplicado; compras pela data da nota. Fechamento aplicado DEPOIS
  do fim do período inclui o que se moveu entre o fim e o fechamento: a 2.3
  desconta pelo `ocorridoEm` do livro. Valor da época (razão) × custo de
  referência de hoje (fotografado) — a 2.3 escolhe.
- `PeriodoApuracao.status` não muda na 1.7 (é do DRE, 2.2); fechar o
  período no DRE deve exigir o FECHAMENTO aplicado de cada loja aberta.
- ~~Fecha sozinha usa a tolerância por item da loja: diferenças pequenas
  repetidas somam.~~ **1.8:** "pequeno e repetido" nas Divergências.
- A hora de contar vem do aparelho (idade do número): dado não confiável,
  preso entre o início da contagem e agora. O pior caso é o aparelho dizer
  que contou MAIS TARDE do que contou (o esperado passa a incluir o que entrou
  no meio) — indistinguível de recontar de verdade; o histórico guarda quem
  e quando. Relógio do servidor com várias réplicas: `ocorridoEm` × hora
  digitada dependem dele (como na 1.6).
- Sem lembrete/cobrança (Notion §7, outbox) e sem link de contagem sem
  login; contagem vencida só é gravada na próxima escrita da loja (a tela
  já mostra "fechou sem aplicar").
- Universo da cobertura: saldo ≠ 0 agora ∪ contados no período; insumo
  zerado nunca contado não pesa. Período personalizado sem cadastro cai no
  mês civil (avisado).
- Variantes de embalagem na contagem, recontagem com as duas versões e
  motivo (hoje: antes/depois no histórico), paginação para milhares de
  insumos (planejar e saldo leem tudo).

## Herança da 1.7 (apontada pelos fiscais)

- [baixo] A idade do número digitado vem do aparelho: forjá-la empurra o esperado até o início da contagem (fica visível como "depois de contar" e trava o "fecha sozinha"; só o gerente aplica).
- ~~UX: coluna "Contado"; "sem preço · confira".~~ **1.8.**
- ~~1.8: cruzar requisição × contagem; pequenos repetidos.~~ **1.8.** 2.3: CMV desconta o que se moveu entre o fim do período e o fechamento. Sem lembretes de contagem nem link sem login; planejamento e saldo sem paginação.

## Herança da 1.8 (para as próximas subfases)

- **3.1 produção**: o lote baixa os insumos PELA requisição — criar a
  requisição com a origem ficha (`criarRequisicao` com `fichaId` e a
  quantidade) e ligar `OrdemProducao.requisicaoId`; a entrega dela é a baixa.
  `PRODUCAO_CONSUMO`/`PRODUCAO_ENTRADA` já entram no cruzamento (consumo
  explicado e entrada). O pré-preparo pedido pela cozinha vem pronto (sem
  cascata); a cascata é da 3.1.
- **Perda lançada** (`PERDA`) não tem tela: quando tiver, o cruzamento já a
  desconta ("perda lançada") e o sumiço cai.
- **2.3 CMV**: Σ `REQUISICAO` é o consumo requisitado líquido (estornos
  incluídos); o CMV real continua pela contagem (inicial + compras − final).
- O cruzamento lê todos os marcos e movimentos dos insumos com trecho na
  janela (centenas): com milhares, levar a soma por trecho para o SQL.
- Sino do parceiro: requisições pendentes/atrasadas são a primeira fonte
  real (herança da 1.1); não ligado ainda.
- Quem pediu é um nome (snapshot): `Colaborador` segue sem ligação com a
  pessoa do login (herança da 0.3); "minhas requisições" depende disso.
- Valor da baixa = custo de referência de agora (como a abertura e a
  contagem); sem preço entra 0 e a tela diz pendente.
- Devolução estorna TODAS as baixas ativas do item e relança o líquido
  (valor proporcional): várias devoluções viram várias camadas de estorno no
  livro do item — correto e legível no detalhe, mas longo.
- Índice único `(parceiroId, lojaId, numero)` declarado no Prisma; `numero`
  é nulo só nas linhas de antes da 1.8 (nenhuma em produção).

## Herança da 1.8 (apontada pelos fiscais)

- ~~[médio] Confirmação de saldo negativo pulável com duas entregas simultâneas.~~ **1.9 (a):** `saldosTravados`.
- ~~[baixo] `fichaQuantidade` forjado acima de INT4 dá 500.~~ **1.9 (b).**
- ~~[baixo] Teste com banco instável ("cancelar" e "atrasada").~~ **1.9 (c):** era a corrida do número (#2/#3).
- UX: ~~rodapé com "há 3 h"; "Pedida"/"Entregue" no histórico; nome do insumo inteiro no seletor do celular~~ (1.9, d); seguem: print do saldo insuficiente com confirmação; conferir sinal de "Requisitado a mais".
- Sino sem requisições pendentes; "Minhas requisições" depende de ligar `Colaborador` à pessoa; lançar perda à mão sem tela; divergências para milhares de insumos precisam ir para SQL.

## Herança da 1.9 (para as próximas subfases)

- **1.10 preço**: `ProdutoCanal` (preço manual, margem-alvo) e
  `CanalConfig.margemAlvoPadraoBp` seguem intocados. Preço sugerido por canal
  = custo sem taxa ÷ (1 − taxa − margem), em fração exata; com o preço,
  `camadasDoCanal({ precoCentavos })` já devolve a taxa em R$ e o total;
  margem bruta = preço − total; snapshot do custo ao gravar o preço.
- O mesmo prato em duas marcas (preço e embalagem com a marca): `ProdutoVenda`
  com `marcaId` — a 1.9 só cria o da casa (sem marca). Ao entrar, decidir se a
  marca herda as embalagens do da casa.
- Taxa só no iFood. Delivery próprio com maquininha/link de pagamento ou
  outros apps (99Food, Keeta) entram como `CanalConfig` do canal — o enum
  `CanalVenda` só tem LOJA, DELIVERY_PROPRIO e IFOOD (canal novo = ADD VALUE).
- Mensalidade do plano, taxa de entrega e `taxaFixaCentavos` (por pedido) são
  do lucro por pedido (Notion "Evolução · Lucro por pedido"); a 1.9 não as
  rateia no prato.
- Custo por canal é lido por ficha (detalhe). Lista de fichas com o custo do
  iFood e filtro "canal incompleto" pedem a leitura em lote (as embalagens de
  50 produtos numa consulta).
- `ProdutoEmbalagem` não tem ordem própria: a tela ordena pelo nome (o
  retrato também, então a ordem nunca é mudança).

## Herança da 1.9 (apontada pelos fiscais)

- ~~[baixo] Prato com produto de venda pode virar pré-preparo pela edição da ficha~~ **1.10 (a)**: recusado em `conferirEstrutura` (edição e planilha).
- [decisão do Rodolfo] O operador ainda vê o custo da receita no detalhe da ficha (vem da 1.2) — igual à camada "Loja". Esconder também? (segue como está)
- [decisão do Rodolfo] Hipóteses da taxa do iFood (comissão + pagamento online sobre o preço; mensalidade/entrega fora). (segue como está)
- UX: ~~aviso discreto em delivery sem embalagem; exemplo "se vender a R$ 30,00…"; "Camada" → "O que entra"; aviso longo da embalagem vira dica; histórico de embalagens mostrando só o que mudou~~ (1.10, b).
- Taxas só do iFood (maquininha, 99Food, Keeta depois); mesmo prato em duas marcas; ~~custo por canal na lista de fichas~~ (1.10: margem por canal na lista, em lote).

## Herança da 1.10 (para as próximas subfases)

- **2.x DRE**: o preço do canal (próprio ou sugerido) é a referência do
  cardápio; faturamento real vem de `FaturamentoLancamento`. A margem-alvo da
  ficha é parâmetro de precificação, não meta do DRE (`DreMeta`); se o Rodolfo
  quiser ligar as duas, decidir lá. O farol aqui tem 3 estados com palavra; as
  5 faixas (`FarolFaixa`) são do DRE 2.4.
- O histórico guarda o retrato em texto (preço, margem, custo na hora). Se a 2.x
  precisar do número (ex.: CMV teórico por período), gravar o snapshot numérico
  numa tabela própria — hoje nada acumulado é gravado (regra das unidades).
- Override de margem por prato (`ProdutoCanal.margemAlvoBp`) existe no esquema e
  não tem tela: o preço próprio cobre. Se aparecer o caso (bebida com outra
  margem), é só ler o campo em `contaDosCanais` antes do padrão do canal.
- O mesmo prato em duas marcas (preço próprio por marca) segue para quando a
  marca entrar no `ProdutoVenda`.
- Preço sem custo (incompleto) é aceito; a lista mostra "incompleta". O filtro
  "margem abaixo do alvo" na lista pede a conta em lote para todas as páginas
  (hoje é por página).
- Mensalidade do iFood, taxa de entrega e taxa fixa por pedido seguem fora do
  prato (lucro por pedido).

## Herança da 1.10 (apontada pelos fiscais)

- UX: selo "prejuízo" repetido na margem bruta quando ela também fica negativa.
- UX: selo de prejuízo ainda mais forte (caixa alta ou ícone funcional), além do selo cheio de hoje.
- UX: faixa acima do painel quando há prejuízo ("No iFood, a esse preço, cada prato perde R$ X").
- UX: linhas do histórico longas no celular (preço, margem e custo na hora quebram em várias linhas).
- UX: frase "a taxa muda quando o preço muda" perto da taxa do iFood em R$.
- UX: selo "sugerido" para a dona no campo do preço (como o gerente já vê "o sugerido" no texto).
- [Guardião] Testes com banco rodando em paralelo com papel não-superusuário dão deadlock: `limparParceiros` faz `ALTER TABLE … NO FORCE ROW LEVEL SECURITY`. Rodar em série (como hoje) ou trocar a limpeza por exclusão dentro do contexto.
- Pendentes da execução: alvo por prato (`ProdutoCanal.margemAlvoBp` sem tela); filtro "margem abaixo do alvo" na lista (hoje a conta é por página); o mesmo prato em duas marcas; a prova da 1.10 deixou preços e margens da Casa Alfa no `ff_dev` (desfaz com `prova110/montar.ts limpar` no scratchpad).

## Herança da 0.5 (para as próximas subfases)

- **Rotina de retenção** (worker): apagar/anonimizar pedido RECUSADO aos 180 dias, e faxinar
  `TentativaPedidoParceiro`, `PedidoParceiroEvento` antigos, `TentativaEntradaErp`, `SessaoErp` e
  `ConviteAcesso` vencidos. Hoje só o botão "Excluir dados pessoais" (manual).
- **Antes do deploy** (sem acesso à produção nesta fase): contar parceiros em RASCUNHO com pessoas ativas
  (`SELECT count(*) FROM "AcessoParceiro" a JOIN "ParceiroFlow" p ON p.id=a."parceiroId" WHERE p.status='RASCUNHO' AND a.status='ATIVO'`);
  quem existir sai do ar até o parceiro ser ativado. A lista de parceiros do nível 1 já avisa.
- **Página de política de privacidade** completa (hoje só o texto curto do consentimento).
- A decisão 91 desvia da letra do contrato (o Parceiro Flow nasce na ativação, não "aguardando
  liberação" no envio): registrar na seção 8 do Notion para o Rodolfo validar. Se ele quiser o literal, a
  fase precisa de slug editável em RASCUNHO, status RECUSADO no enum, um caminho para apagar spam com
  histórico e um filtro na lista, na busca e no seletor do shell.
- Fora do escopo, anotado: e-mail automático/SMTP e envio pela Evolution; CAPTCHA de terceiros; escolha
  de plano; criar lojas e marcas a partir do número informado (é só informativo); pausar a cadência do
  Barney quando o telefone coincide (hoje só o aviso no cartão); arrastar e soltar; exportar CSV; reabrir
  recusado (novo envio vira novo pedido); trocar o link "/rodolfo/login" do cabeçalho da landing.
- **[médio] Pré-sequestro por pedido** (apontado na aprovação): a conta criada pela ativação de um pedido
  nasce SEM e-mail confirmado (o link vai para o WhatsApp do pedido, não para a caixa do e-mail). Quem manda
  o e-mail de OUTRA pessoa que ainda não tem conta, e é ativado, cria a conta com a senha dele; se depois
  o nível 1 ligar esse e-mail à Equipe de outro parceiro (a pessoa de verdade foi contratada), o dono falso
  entra lá com a senha que escolheu. A ativação já recusa e-mail existente (decisão 99); falta fechar o
  outro lado: marcar a origem da conta ("criada por pedido", sem e-mail confirmado) e, ao ligar essa
  pessoa à Equipe de outro parceiro, pedir confirmação explícita do nível 1 (e ele mandar link novo, que
  apaga a senha do dono falso). Mitigação de hoje: o Rodolfo conversa com a pessoa antes de ativar e vê o
  WhatsApp do pedido no cartão.
- **Retenção automática de 180 dias** (a rotina do worker): o texto público já promete "até 180 dias" e
  pedido de exclusão pelo WhatsApp; até a rotina existir, a exclusão é manual ("Excluir dados pessoais").
- **Infra (já é pendência):** o IP do limite é o `X-Real-Ip` cru do Traefik (porta 3000 nunca exposta; atrás de
  CDN o limite vira por proxy); e os testes com banco como dono não-superusuário com RLS precisam rodar em
  série (`--no-file-parallelism`: a limpeza desliga o FORCE numa transação e dá deadlock em paralelo).
- O quadro é próprio (`onboarding/quadro.tsx`), não uma generalização de `requisicoes/quadro.tsx`: o
  teste-guarda proíbe `telas/` de importar pedido. Se um terceiro quadro aparecer, extrair o esqueleto
  (coluna, cartão com filete) para `telas/quadro/` sem dado de pedido.
- O IP do limite depende do Traefik sobrescrever `X-Real-Ip` (herança da 0.3); atrás de CDN ou rede
  compartilhada (escritório, 4G) o limite de 3/h pode pegar gente de verdade: o bloqueio já mostra a
  saída pelo WhatsApp.
- O formulário não tem CAPTCHA; a armadilha só pega robô simples. Spam feito à mão passa até 3/h por IP
  e 100/dia no total, e cai no quadro como cartão Novo para recusar com motivo.

## Herança da seção 9 (UX.9, para as próximas subfases)

- **Módulo novo = área nova ou aba nova em `areasConstruidas`** (e uma linha em `ROTAS_ATIVAS` do
  `tests/erp-navegacao.test.ts`). O teste que varre o disco falha se uma página do `/erp` ou do espelho do
  nível 1 não acender nenhuma aba. Os módulos futuros (DRE 2.1, Produção 3.1, Etiquetas 3.4) continuam
  desabilitados e sem link até terem tela; quando chegarem, entram como área (ou aba de área existente).
- **Ordem do `itemAtivo`**: o primeiro `ativoEm` que casa vence; depois, o maior prefixo. Rota profunda nova
  dentro de uma loja (`<loja>/algo`) precisa de `ativoEm` ou acende "Visão geral".
- Fora do escopo, anotado: indicadores ou dashboard por papel (não há dado novo), repassar o filtro da lista
  pelo formulário de "Novo" (o `?de=` já volta ao detalhe), tirar o custo do insumo do Operador (é permissão:
  `insumos.ver` é "Ver insumos e custos"), `VERSAO_DO_ERP` e o rodapé do menu.
- A cor da área (card, seletor) não bate com a de algumas telas (Fichas âmbar dentro da área verde de
  Cadastros): a cor marca a tela; aceito.
- Parceiro em RASCUNHO/SUSPENSO: as ações do ⌘K abrem telas que mostram o bloqueio (como os botões hoje).
- **Hub com 1 coluna no celular**: a régua do plano pede 2 colunas; o kit Dark manda 1 abaixo de 600 px e os cards
  de área têm texto longo. Decidido por 1 coluna; se o Rodolfo preferir 2, é só a classe da grade em `ui/hub.tsx`.
- **Grupos do menu com 1 item** (Insumos, Rede, Estoque) repetem a aba logo abaixo; o menu ficou fiel à estrutura
  de abas. Se incomodar, fundir os grupos de 1 item numa seção só (só configuração, em `areasConstruidas`).
- **Divergências a 390 px** (lista de lojas) não mostra estado por loja (só o nome), diferente de Requisições
  (pendentes) e Contagens (selo do estoque). Precisa de uma consulta nova de "divergências abertas por loja".
- **Equipe a 390 px** passa de 41 mil px de altura (lista de pessoas, perfis e lojas, tudo aberto): paginar ou
  colapsar por pessoa. Anterior à UX.9 (a tela é da 0.4), não piorou.
- **Trilha do nível 1 sem a área** (`Parceiros Flow › Aba`): a decisão 105 manteve assim para não alongar a
  trilha; o contrato pede `Início › Área › Aba`. Se o Rodolfo quiser o literal, `montarTrilha` pode inserir a
  área (`item.area`) quando ela difere do módulo.
- **O Operador vê custo de insumo** porque `insumos.ver` é "Ver insumos e custos" (catálogo de permissões da
  0.4): tirar é regra de permissão, fora da UX.9.

## Herança da 0.6 (para as próximas subfases)

- **Toda subfase atualiza a ajuda**: rota nova = entrada nova; função mudada = texto e `versao` (e `npm run ajuda:lock`). A linha
  "Ajuda: chaves novas/alteradas" é obrigatória no "O que a X entregou". Módulo futuro (DRE 2.1, Produção 3.1, Etiquetas 3.4) entra
  como área nova: o tipo `AreaDaAjuda` e o teste de área precisam acompanhar.
- Texto que cita preço ou margem leva `para: ['precos.ver']`; o que é de quem lança leva a permissão da ação. O primeiro bloco da
  aula é sempre para todos (o teste cobra).
- Uma aula por tela: estado que muda o texto (contagem cíclica × fechamento) vai num bloco que diz o caso, não numa variante.
- ~~**Login sem JavaScript dá 500**~~ **Resolvido na própria 0.6** (decisão 122): `/entrar` usava `referrer: 'no-referrer'`, o navegador mandava
  `Origin: null` no POST e o Next recusava a server action. Passou a `same-origin`: nenhum site de fora recebe o endereço (o token do link
  não vaza, que era a intenção da 0.3), e o Origin do próprio site chega. Provado com `javaScriptEnabled: false` (login e senha errada) e com
  o WhatsApp interceptado (sem Referer).
- Outra aba só vê a mudança de preferência ao recarregar (o layout não refaz a cada navegação): fechar de novo é idempotente e
  nenhum fechamento se perde (provado com banco), mas a caixa fechada em outra aba continua na aba velha até ela recarregar.
- "Ver tudo sobre esta tela" e o link "Como a conta é feita" precisam de JavaScript (a gaveta é um diálogo nativo aberto por
  script); sem ele o "?" também não abre. O resto da caixa não depende dele.
- Fora do escopo, anotado: tour guiado, vídeo e imagem na ajuda, busca dentro da ajuda (o ⌘K não acha ajuda), ajuda nas telas do
  Barney, em `/entrar` e na landing, edição do texto pela tela, métricas de leitura, ajuda por setor, tradução, preferência própria
  do nível 1.
- O hub do nível 1 (`/rodolfo/erp/<slug>`) usa o mesmo texto do hub do parceiro ("Áreas da Rede"); a lista de parceiros
  (`/rodolfo/erp`) e o quadro de onboarding não têm ajuda.

## Herança da 2.1 (para as próximas subfases)

- **Migration sob RLS**: nenhum passo de migration pode depender de SELECT em tabela de tenant (o dono não-superusuário com FORCE RLS
  enxerga 0 linhas). Checar dado antigo = tentar a operação (CREATE UNIQUE INDEX, VALIDATE CONSTRAINT) e apanhar `unique_violation`
  ou `check_violation`; o WARNING não chega ao log do deploy, então toda migration tolerante a dado antigo ganha um passo
  verificável pós-deploy (`erp:conferir-migracao` é o da 2.1). Teste de migration com dado antigo roda nos 3 perfis do banco.
- **Instabilidade apontada pelo Guardião** entre os testes com banco de `erp-acesso` e o trigger do onboarding (0.5): fora do escopo
  da 2.1 e sem falha vista nas rodadas finais (2 vezes seguidas, 60 arquivos); segue anotada para quem mexer em acesso ou onboarding.
- **A leitura do faturamento é UMA**: `faturamentoDosGraos` / `faturamentoDoGrao` (integração vence; a digitada vira conferência).
  A 2.2 (DRE) lê só por elas e filtra por `faturamento.ver`/`dre.ver` na página; a função só filtra lojas pelo alcance.
- **Fechar período é da 2.2**: pegar `travarParaFechar(tx)` (`periodo-trava.ts`) ANTES de ler o faturamento e de marcar o período
  FECHADO, na mesma transação. A 2.1 só lê `PeriodoApuracao` (nome, início, fim, status).
- **Receita do DRE = `valorCentavos` do grão** (venda de produtos, líquida de desconto da casa). Comissão e taxa de pagamento do iFood
  são dedução da 2.2 (`CanalConfig`); taxa de entrega, gorjeta e cancelado não entram. Desconto não é campo: se entrar, bruto =
  valor + descontos (aditivo).
- **Marca no faturamento**: entra com a integração por loja do iFood, sob "um grão é sem marca OU por marca, nunca os dois"
  (hoje o índice parcial usa `COALESCE(marcaId,'-')`).
- **Integração**: só o contrato existe (`chaveDeIntegracao`, `EntradaDeIntegracao`). Falta o worker, o mapeamento loja do iFood →
  `Loja` e a decisão de reconciliar a diferença digitado × integração (hoje só aparece como conferência).
- **Exportar CSV** (fora do escopo): quando existir, prefixar `'` em célula que começa com `= + - @`.
- **Faltas contam canal-dia** (cada canal em cada dia); o "dia sem lançamento" como sino ou lembrete pelo WhatsApp ficou de fora.
- **Telas ficam stale por ~1 s depois de salvar** (o roteador do Next atualiza a página depois de a action responder); o dado já
  está gravado e o histórico aparece em seguida. A prova espera por isso.
- Fora do escopo, anotado: integrações reais (iFood, Anota AI, Saipos), marca no faturamento, descontos/taxa de entrega/10 % como campos,
  comparação com o ano passado e metas (2.2), DRE/CMV/farol (2.2 a 2.4), fechar período, exportar CSV, XLSX, faturamento por hora/turno.
- `Selo` de erro ficou sem tinta de fundo (no tema escuro o texto #F2323F sobre o fundo tingido dava menos de 4,5:1 no axe).
- Produção: antes do deploy, conferir que não há linha de faturamento violando os CHECKs (esperado: zero linhas; se houver, a migration
  avisa e deixa o CHECK NOT VALID).

## Herança da 2.2a (para a 2.2b e as próximas)

- **A regra do período é UMA**: ler sempre por `periodos.ts` (`periodoDe`, `periodoAnteriorDe`, `situacaoDosPeriodos`,
  `registrarPeriodo`); nunca por `ParceiroFlow.periodoTipo/periodoDiaInicio` (colunas sem uso, ficam até uma limpeza própria) nem
  montar período na mão. `PERSONALIZADO` existe só no enum e em dado legado: não aparece em tela nem em regra nova.
- **Fechar período é da 2.2b** e pega `travarParaFechar` (`periodo-trava.ts`; a escrita pega a trava compartilhada
  `travarParaEscrever`) ANTES de ler faturamento e despesa, na mesma transação. Despesa e faturamento já recusam escrita em
  período FECHADO (`intervaloEmPeriodoFechado`, que olha o intervalo inteiro da competência). A 2.2b liga a mesma regra em notas de
  compra e fechamento de estoque.
- **A fotografia do fechamento** deve gravar o DRE como ele saiu de `montarDre` (puro): é a mesma função, com `EntradaDoDre`; guardar
  a entrada e o resultado, não recalcular depois com plano ou taxa que mudaram.
- **Metas** (`DreMeta`) e farol (`FarolFaixa`) ligam em `LinhaDoDre.chave` (`codigo` ou `id:<id>`), não no nome. `metas.editar` já
  exige a rede inteira.
- **Taxa do iFood é estimada pela configuração de HOJE** (`CanalConfig`): o DRE de um período antigo recalcula com a taxa atual até a
  fotografia existir. Despesas financeiras reais (tarifas, antecipação) entram como despesa lançada, não na taxa estimada.
- **CMV chega na 2.3** como linha calculada `cmv` do plano: `montarDre` já deixa o lugar e a mensagem "sem contar o CMV" em margem e
  resultados; quando o CMV vier, os `semContar` saem sozinhos.
- **Plano de contas**: linha nova de parceiro tem `codigo` nulo e chave `id:<id>`; o grupo não muda depois de criada. Se um dia houver
  importação de despesa (planilha ou integração), ela casa por `chaveDaLinha`, nunca pelo nome.
- **Despesa importada/integrada** (`origem`, chave de idempotência já existem no esquema) fica para depois; a 2.2a só grava MANUAL.
- **Gerente vê salário da loja?** Hoje vê (as linhas de Pessoal da loja dele entram no DRE e na lista de despesas). É decisão de
  negócio do Rodolfo; trocar é esconder o grupo PESSOAL para quem não tem a rede inteira, na leitura (`dre.ts`/`despesas.ts`).
- **Quem reabre período fechado**: resolvido na 2.2b como só nível 1 (decisão 154).
- **Telas ficam stale por ~1 s depois de salvar** (herdado da 2.1); a prova espera por isso.
- **Apropriação**: a soma de várias fatias do mesmo valor fecha ao centavo, mas a soma de duas despesas diferentes apropriadas na
  mesma fatia pode diferir em 1 centavo da apropriação da soma (cada despesa arredonda a dela; a tela soma o que cada uma arredondou).
- **Produção**: antes do deploy rodar `npm run erp:conferir-migracao` depois da migration (esperado: mensagem de CHECKs validados). Se
  houver despesa antiga violando algum CHECK, a migration avisa e deixa o CHECK `NOT VALID`; corrigir a linha e `VALIDATE CONSTRAINT`.

## Herança da 2.2b (para a 2.3 e as próximas)

- **A leitura do DRE é UMA**: `entradaDoDre(tx, alcance, periodo, ate, { hoje, lojaId })` em `dre-entrada.ts`. O DRE ao vivo e a fotografia
  do fechamento usam a mesma; qualquer fonte nova (CMV, despesa importada) entra ali, nunca num caminho paralelo no fechamento.
- **O que a 2.3 recebe**: a fotografia guarda a `entrada` e `versaoDaConta = 1`. O CMV entra como linha calculada nova da conta e,
  para períodos já fechados, só por uma fotografia NOVA (versão 2, depois de reabrir pelo nível 1); nunca recalculando a vigente.
  Toda escrita da 2.3 que caia num período (custo, ajuste de estoque, baixa) pega `travarParaEscrever` primeiro e recusa período FECHADO
  com `fraseDoPeriodoFechado`.
- **Ordem das travas** (nunca inverter): chave do período (`erp-faturamento:<parceiro>`) → loja/aberturas → `erp-periodos`. `erp-metas:<parceiro>`
  só é pega por `salvarMetas`, sozinha.
- **Período FECHADO por SQL na mão**: o gatilho adiado recusa no commit se não houver fotografia vigente; para consertar um FECHADO
  legado sem fotografia, reabrir pelo nível 1 e fechar de novo pela tela. Um período FECHADO de antes da 2.2b (sem fotografia) é lido
  AO VIVO até alguém reabrir e fechar de novo; a tela não finge fotografia que não existe.
- **Fotografia é só inclusão**: nada em código atualiza nem apaga `DreFotografia`/`DreFotografiaLinha`; reabrir só fecha a vigente
  (`substituidaEm`, `reabertaPorNome`, `motivoReabertura`). Teste que precise montar período fechado usa os apoios de
  `tests/erp-db-apoio.ts` (`criarPeriodoFechadoDeTeste`, `reabrirPeriodoDeTeste`), que gravam pelo `doParceiro`.
- **Meta liga na chave da linha** (`LinhaDoDre.chave`) e na vigência; o `sentido` da linha (`LinhaDoDre.sentido`) decide a palavra do
  desvio. Farol por faixa, meta por canal/loja/em reais e alerta: 2.4.
- **Ajuda**: toda tela nova entra em `ajuda-textos.ts` e o lock é regravado; ver a linha "Ajuda: chaves novas/alteradas" acima.
- **Em aberto para o Rodolfo**: (1) só a FlowFoods reabre período; o dono pode vir a reabrir? (2) loja que nunca lançou nada é
  ressalva (fecha com justificativa) numa rede que já tem lançamento; é isso mesmo? (3) o gerente de uma loja continua vendo o
  salário da loja dele (herdado da 2.2a).
- **Troca completa numa transação só, sem REABRIU no Histórico (aceito)**: quem tem o papel do tenant e SQL cru pode, numa única transação,
  marcar a fotografia vigente como substituída, voltar o período a ABERTO e depois inserir a versão seguinte e marcar FECHADO. Os gatilhos
  garantem versão, ordem e que nunca sobra período FECHADO sem fotografia nem ABERTO com vigente, mas o Histórico só ganha o REABRIU quando
  o caminho é o do sistema (é a aplicação que o grava). Está dentro do que a RLS e os gatilhos prometem (isolamento entre parceiros e
  fotografia imutável por linha); impedir isso exigiria o REABRIU nascer no banco.
- **Deadlock dos testes em paralelo com dono + FORCE RLS** (registrado pelo Guardião, ainda aberto): `tests/erp-db-apoio.ts` (`limparParceiros`) liga
  e desliga o FORCE por DDL (`ALTER TABLE ... NO FORCE`), que pega `AccessExclusiveLock` em todas as tabelas de tenant e entra em deadlock com
  os outros arquivos rodando ao mesmo tempo no mesmo banco. Em banco de dono não-superusuário rode `--no-file-parallelism`. A saída barata para
  uma subfase de testes é a limpeza não usar DDL (apagar com `SET LOCAL role` do dono e sem mexer no FORCE).
- **Decisões de negócio em aberto para o Rodolfo**: (1) quem reabre período fechado: hoje só a FlowFoods (nível 1); o dono poderia, com permissão
  nova; (2) loja que nunca lançou nada no período é ressalva (fecha com justificativa), não bloqueio, numa rede que já tem lançamento; (3) o
  gerente de uma loja vê os salários da loja dele (herdado da 2.2a; esconder o grupo Pessoal para quem não tem a rede inteira é uma mudança
  de leitura em `dre.ts` e `despesas.ts`).
- **Teste mutante de trava**: toda trava nova (`travarParaEscrever`/`travarParaFechar`) precisa de um teste que a segure à mão e prove que a
  operação ESPERA; teste de corrida sem isso passa mesmo sem a trava.
- **Fotografia só nasce com o período ABERTO**: quem escrever fotografia (2.3, teste, importação) grava ANTES de marcar FECHADO, na mesma
  transação (`criarPeriodoFechadoDeTeste` faz assim).

## Herança da 2.3 (para a 2.4, a 2.5 e as próximas)

- **A leitura do CMV é UMA**: `cmvDasLojas` (`cmv.ts`), chamada só por `entradaDoDre`; o ao vivo e o fechamento leem o mesmo. A conta mora em `cmv-campos.ts`
  (puro: corte, real, o que vale, selo, fotografia de ida e volta) e `cmv-comparacao.ts` (compra × real). Qualquer tela nova de CMV parte de `CmvDoDre`.
- **A 2.4 (faróis) recebe**: a linha `cmv` com valor, fonte (real | compras | misto | nulo) e meta com desvio. O CMV NÃO existe por canal (a compra é da loja):
  a 2.4 decide se o farol do CMV fica só na visão sem canal ou rateia pela receita (e então diz que é hipótese).
- **A 2.5 (orçamento) recebe**: a compra por loja e dia (`cmvDasLojas` e a mesma consulta agrupada por loja; extrair por dia é uma mudança local), a meta vigente
  do `cmv`, a receita até ontem e o estoque final do período anterior (estoque disponível, `estoqueFinalDe`).
- **Fotografia**: a v2 tem o CMV; a v1 nunca é recalculada. Quem gravar fotografia nova usa `versaoDaConta` explícita em `gravarFotografia` (o padrão é 2).
  O nome de loja e o motivo estão em `entrada.cmv`; a tela de loja nunca recebe a `entrada` inteira.
- **Linha de detalhe do CMV** (`cmv:compra`, `cmv:real`) é tipo `linha` com chave fora do plano (o CHECK da fotografia limita o tipo e `nota` a 120 letras). Linha nova
  de CMV (por exemplo, o teórico) segue o mesmo padrão e entra em `aceitaMeta` conforme couber.
- **Data da nota trocada de mês depois do retrato** (veto do Guardião): a conta do corte não supõe nada sobre a data da nota; a consulta junta os movimentos de instante recente e os de
  nota com data depois do fim (de qualquer instante). Testado nos dois sentidos, com e sem mudança de valor. Saldo negativo segue fora do retrato.
- **O índice do livro** é `(parceiroId, lojaId, tipo, ocorridoEm)`; a consulta do corte lista todos os tipos para usá-lo. Com milhões de movimentos por loja, um índice
  `(parceiroId, lojaId, ocorridoEm)` é uma migration aditiva pequena.
- **Teste de migration com dado antigo nos 3 perfis** e `erp:conferir-migracao` com o CHECK novo; toda migration tolerante a dado antigo continua precisando dos dois.
- **Para o Rodolfo (decisão de negócio, não bloqueia)**: (1) material de limpeza ou descartável lançado como nota infla o CMV; quer um tipo de insumo próprio (fora do
  CMV) ou prefere seguir com a regra "lance como despesa"? (2) Valentin's: as duas unidades dividem estoque? Sem transferência entre lojas, o real por loja
  distorce (quem manda perde, quem recebe sobra); o da rede continua certo.
- **Frases do desvio quando falta CMV de alguma loja (deixadas pela 2.3, a 2.4 só tirou a cor)**: a rede soma o CMV só das lojas que o têm, então o % do CMV e o desvio dele parecem melhores do que são. A 2.4 tira a cor de margem e resultados nesse caso, mas o desvio do próprio CMV ainda aparece
  sem uma frase de "desvio otimista: falta o CMV de X"; e falta a frase positiva espelho, "já com o CMV de A e B", dizendo quais lojas ENTRAM na conta (hoje só se diz quais saem).
- **Tempo da consulta do corte em produção**: acompanhar a duração da consulta de `cmvDasLojas` (o corte do estoque final) com o livro real; se passar de alguns segundos, rodar `ANALYZE` nas tabelas do livro e do estoque e, com milhões de movimentos por loja, a migration aditiva do índice `(parceiroId, lojaId, ocorridoEm)`.

## Herança da 2.4 (para a 2.5 e as próximas)

- **O farol é UM**: `faixaDoDesvio` (`farol-campos.ts`) para a faixa e `farolDoDre` (`farol-dre-campos.ts`) para "vira cor ou não". Qualquer tela que pinte uma meta (a 2.5, o orçamento ao vivo) parte deles; as faixas v1 são congeladas, e mudar um limite é a v2 (e a fotografia guarda a versão: `entrada.farol.versao`).
- **A 2.5 (orçamento) recebe**: `faixaDoDesvio` com a escala de custo para pintar o orçamento ao vivo; a meta vigente do `cmv` (`metasDoPeriodo`); o desvio do CMV pelas compras no período em curso; e a regra "sem cor quando faltar faturamento" (um orçamento sobre receita incompleta mente igual).
- **Meta de receita é de crescimento**: `tipoDaMeta(chave)`; `ComparacaoComMeta` ganhou `tipo`, `variacaoBp` e `faixa` (a palavra da 2.2b saiu). Meta por canal em `DreMeta.canal`, em R$ e por loja continuam fora; se um dia entrarem, são aditivas.
- **Fotografia**: a v3 é o que o fechamento grava. `gravarFotografia` mantém o padrão 2 para os apoios de teste (`criarPeriodoFechadoDeTeste`): quem gravar fotografia na mão e quiser farol passa `versaoDaConta: 3` e `entrada.anoPassado`. A leitura do ano passado e dos pedidos é `lerCanaisDaFotografia` (só as lojas do alcance).
- **Cobertura por loja**: qualquer comparação nova que agregue a rede (orçamento da 2.5, por exemplo) checa a completude POR LOJA antes de pintar, como o ano passado, o CMV e as despesas que repetem; somar primeiro esconde o buraco de uma loja atrás da outra. Despesa lançada de menos numa loja (que não repete todo mês) ainda não tem como ser detectada.
- **v1 e v2 e o painel do ano passado**: nos períodos fechados antes do farol o painel "Receita contra o ano passado" da 2.2b ainda lê o faturamento do ano passado ao vivo (herança da 2.2b); só o farol e o painel por canal não o recalculam. Uma limpeza própria pode trocar isso por "não apurado".
- **Ajuda sem vazar**: bloco de ajuda que descreve dado de uma permissão leva `para: [...]`; o layout entrega o registro filtrado ao shell inteiro, então um texto sem `para` chega a quem não pode ver a tela.
- **`Despesa.canal` e as linhas "Entregas e motoboy" e "Taxas de cartão"** continuam sem canal: quando entrarem no formulário, motoboy e cartão por canal (de verdade, não rateados) ganham farol por canal sem rateio.
- **Em aberto para o Rodolfo (decisão de negócio, não bloqueia)**: (1) o gerente de uma loja vê o farol de Pessoal da loja dele (herança dos salários, 2.2a); (2) os limites das 5 faixas (3,0 / 0,5 / 1,5 / 3,0 pontos; 5 / 1 / 3 / 6 na receita) são hipótese a validar com o Valentin's; (3) uma loja ativa que ainda não tem um ano de lançamentos (loja nova) deixa a receita da rede sem cor até completar o ano, com o nome dela na frase; quer comparar só as lojas que já existiam (mesmo critério dos dois lados)? (4) meta de crescimento de 0 a 100 % cobre o cliente ativo, mas uma casa que cai de propósito (fechar um canal) precisa de meta negativa: quer?

## Herança da 2.5 (para a 2.6, a 3.x e as próximas)

- **O orçamento é UM**: `orcamentoDeCompra` (a tela) e `orcamentoNaNota` (a prévia e o detalhe da nota), em `orcamento.ts`; a conta em `orcamento-campos.ts`.
  Qualquer lugar novo que fale de "quanto cabe" (lista de compras da semana, sugestão de pedido, alerta) parte deles, nunca refaz a conta.
- **A soma das compras é UMA**: `comprasPorLoja` (`cmv.ts`), a mesma do CMV de compra. Mudar o que conta como compra (bonificação, desconto, tipo "limpeza" fora do
  CMV) muda o DRE e o orçamento juntos.
- **A vista é montada no servidor**: quem não tem `dre.ver` na loja recebe `VistaResumida` (só o "cabe" pelo teto arredondado, o motivo e os avisos), e a tela
  fala com ela em "limite seguro" (nunca "orçamento", "passou" ou "teto"; valores em degraus de R$ 100; tom de atenção; decisão 217). Arredonda-se o
  TETO, nunca o saldo (decisão 213): qualquer número novo para quem não vê a receita parte de `tetoArredondado`, ou um comprador acha o centavo comparando notas. Campo novo no orçamento que dependa
  da receita entra só na `VistaCompleta`; o teste de banco confere o JSON inteiro do comprador.
- **A previsão é hipótese** (decisão 209): média por dia da semana nas últimas 4 semanas, mínimo de 14 dias completos. Se o Rodolfo quiser o dia de pagamento ou a
  sazonalidade, a mudança é só em `preverReceita` (pura, com teste).
- **Para o Rodolfo (decisão de negócio, não bloqueia)**: (1) o comprador vê o "cabe" em R$, pelo teto arredondado para baixo em degraus por faixa; quem souber a
  meta do CMV sabe a receita prevista com erro de ±1 % a ±5 % com meta de 30 % (teto a partir de R$ 6 mil; ±1,4 % numa loja de R$ 120 mil por mês), e no fim
  do período a prevista é quase a realizada. Risco aceito (Maestro): quem vê faturamento sem ver o DRE descobre a meta do CMV em ~14 dias. Serve, ou o comprador do
  Valentin's deve ver só "cabe com folga / cabe pouco / passou", sem número? (2) A meta do CMV é uma só para todas as lojas;
  salão e 100 % delivery têm CMV diferente: vale meta por loja (aditiva em `DreMeta`)? (3) 4 semanas e 14 dias: é a régua certa? (4) O frete entra no "já comprado"
  (igual ao CMV de compra). (5) A loja nova sem 14 dias de faturamento deixa a rede sem número até completar; prefere a rede somar só as lojas com número, dizendo
  quais ficaram de fora?

## Herança da 3.1 (para a 3.2 e as próximas)

- **A produção é UMA**: `planejarProducao`, `iniciarProducao`, `concluirProducao`, `cancelarProducao` e `estornarProducao` em `producao.ts`; a conta pura
  (rendimento, custo, validade, atraso, situação dos insumos) em `producao-campos.ts`. A requisição do lote nasce por `criarRequisicaoNaTx` e a lista da ficha
  por `listaDaFichaNaTx` (`requisicao.ts`); outra fonte de requisição automática usa as mesmas duas.
- **Ordem das travas** (não trocar): período (compartilhada) → abertura da loja → requisição FOR UPDATE → ordem FOR UPDATE → saldos. Quem escrever movimento novo
  chama `conferirPeriodoAberto` antes de qualquer SELECT FOR UPDATE; o teste mutante (segurar `travarParaFechar`) é o modelo para provar.
- **A 3.2 recebe**: o lote concluído com custo real (baixas ÷ quantidade, em fração) e o `PRODUCAO_ENTRADA` com `ordemProducaoId` no livro; o custo do pré-preparo na
  ficha continua o de referência (a ficha), e o do lote mostra o real ao lado, sem mexer nele. Se a 3.2 quiser que o custo do insumo produzido siga o lote, é decisão
  nova (hoje o valor da entrada já é o real, e o saldo valoriza por ele).
- **`PRODUCAO_CONSUMO` está reservado**: não use para a saída dos insumos de uma ordem; ela é `REQUISICAO` com o documento da requisição do lote.
- **Esqueleto dos quadros**: `telas/quadro/quadro.tsx`. Quadro novo usa os três componentes (filete de 2 ou 3 px, `apagado` sem opacidade) e a coluna vazia diz
  "Nenhum item nesta etapa" (ou o texto que a etapa pedir).
- **Custo só com `insumos.ver`**: o servidor monta a tela sem o valor (não esconde no navegador); o Histórico tira os campos de custo da produção
  (`semCustoDaProducao`, filtro `verCustos`, ausente = fechado). Tela nova com custo de lote segue o mesmo contrato.
- **Teste de banco que lê com SQL cru** precisa do contexto do parceiro (`cru` do apoio) ou do portão: com dono e FORCE RLS o SELECT cru enxerga 0 linhas.
- **Teste de migration com dado antigo nos 3 perfis** e `erp:conferir-migracao` com os CHECKs, o índice e os gatilhos da 3.1 continuam obrigatórios.
- **Resíduo de valor do lote (a mostrar no fechamento do CMV)**: o lote entra no estoque pelo custo REAL (R$ 117,81 por 4,6 kg) e sai pelo custo de referência
  da ficha (R$ 23,56/kg). Ao esgotar o molho (saldo 0 kg) pode sobrar valor no saldo (no exemplo dos 400 g que faltaram, R$ 9,42). Hoje nenhuma tela
  mostra esse resíduo; quem mexer no fechamento do CMV (2.4 ou 3.2) o exibe como linha própria, para o CMV real não esconder a diferença.
- **Quem vê o custo do insumo**: o operador da cozinha vê o custo dos insumos do lote porque `insumos.ver` é "Ver insumos e custos" (uma permissão só para
  insumo e custo). Separar "ver insumo" de "ver custo" é decisão de negócio (ver abaixo) e mexe no catálogo de permissões.
- **Nomes na tela**: a aba da área é "Lotes" (a trilha fica "Produção › Lotes › loja › lote", sem repetir "Produção"); o botão "Concluir o lote" fica desabilitado
  com o motivo ("Falta entregar os insumos (requisição #N)") até a requisição ser atendida; o cartão do quadro diz "Insumos: a entregar (requisição #N)",
  "rendeu 88%" e, quando o lote vem de outro dia, o dia e a hora ("planejada 15/10 11:09"). Custo de insumo ainda não entregue é "a entregar" ou "—", nunca R$ 0,00.
  O aviso de período fechado (`AvisoDoPeriodoFechado`) aparece antes de preencher a conclusão e, se o servidor recusar, rola até ele acima da barra fixa.
- **Para o Rodolfo (decisão de negócio, não bloqueia)**: (1) a faixa de ±10% do rendimento serve para todas as fichas ou há pré-preparo (caldo, molho reduzido) que
  precisa de faixa própria? (2) produção sem data retroativa: se o cozinheiro esquece de lançar ontem, hoje não dá para planejar para ontem; vale abrir exceção
  para o gerente? (3) a requisição de produção deve aparecer nas Divergências (requisição × contagem)? Hoje ela conta como requisitado no cruzamento, mas não há
  filtro para separar a de produção da do salão. (4) `insumos.ver` hoje mistura "ver insumo" e "ver custo": o operador da cozinha vê o custo dos insumos do lote. Vale uma permissão só para custo?

## Herança da 3.2 (para a 3.3 e as próximas)

- **Revisão final do Guardião (21/10, aprovado), dois pontos para depois**: (N1) `permissoesDoPerfil` / `permissoesNoCatalogoAtual` tratam a versão do
  catálogo AUSENTE como v1 — hoje é inexplorável (a coluna é NOT NULL e todas as leituras trazem a versão), mas código novo que monte o acesso
  sem passar a versão daria `producao.planejar` a um perfil v2 salvo sem ela: passe sempre a versão (ou torne-a obrigatória no tipo). (N2) A
  migration de dado `20261030010000_erp_catalogo_v2` promove o perfil v1 completo sem linha no Histórico (a migration não tem contexto de
  parceiro); o motivo fica registrado na decisão 219. Polimento de UX para depois: seletor de ficha com pelo menos 240 px em telas largas,
  "a conta desta tela" no rodapé do formulário, esconder "Salvar a lista" quando tudo já virou lote, tirar o aviso antigo quando o formulário
  mostra erro.

- **A lista é UMA**: `obterListaDoDia`, `salvarListaDoDia`, `porNaListaDoDia` e `gerarLotesDaLista` em `producao-lista.ts`; a conta pura (vai usar /
  tem / comprar, cascata, custo, frases) em `producao-lista-campos.ts`. Quem precisar de "o que falta para a produção do dia" (sugestão de
  compra, alerta, PDF) parte de `contaDaLista`, nunca refaz a explosão.
- **Planejar é UMA regra**: `planejarProducaoNaTx` (`producao.ts`) serve a Nova produção e a lista. A 3.3 ("funcionário pega da lista") usa a
  mesma: pegar a linha = `gerarLotesDaLista` com `linhas: [id]` (o servidor já aceita um subconjunto) ou um caminho novo que chame
  `planejarProducaoNaTx` e grave `ordemProducaoId` na linha, travando a lista antes. Quem fez cada etapa já está no lote (planejou, iniciou,
  concluiu: nomes e `responsavelUsuarioId` na conclusão) — é a base do histórico por funcionário.
- **A linha guarda o lote, não o contrário**: `ListaProducaoItem.ordemProducaoId` (único). Lote cancelado devolve a linha (estado derivado,
  `estadoDaLinha`); o gatilho `ListaProducaoItem_lote_confere` não deixa a linha com lote vivo mudar ou sair. Quem precisar apagar uma lista com
  lote (limpeza de teste) desliga o gatilho na transação (`SEM_GATILHO_NA_LIMPEZA` em `tests/erp-db-apoio.ts`).
- **Ordem das travas** (não trocar): período (compartilhada) → a lista (`FOR UPDATE`) → as da 3.1 (dia do lote, requisição da loja; e, nas
  outras escritas, abertura → requisição → ordem → saldos). Nenhum caminho trava a lista depois de travar requisição ou ordem: cancelar e
  estornar o lote travam a lista do lote ANTES dele (`travarListaDoLote` em `producao.ts`) e sobem a versão dela (decisão 228). Escrita nova
  da 3.1 que mude o estado de um lote da lista (devolver a linha, por exemplo) faz o mesmo.
- **O formulário manda o que viu**: salvar leva `vistas` (as linhas em aberto da tela) e gerar leva `linha` (só essas viram lote). A 3.3
  ("pegar da lista") pega pela linha (`linhas: [id]`), nunca "todas as em aberto".
- **A lista apagada fica no banco** (sem linhas): a versão por loja e dia nunca recomeça (decisão 229). Lista "existe" = tem linhas; quem
  contar listas conta as com linhas.
- **Sem segunda baixa na conta**: linha em lote conta o que falta SAIR pela requisição dele (`faltaDe` com a requisição aberta ou em parte);
  concluído não conta; o insumo que o lote tocou e ficou abaixo de zero continua na conta (`tocados`). Mudar o que a requisição pede muda a
  conta junto — de propósito.
- **Custo e orçamento**: custo estimado só para quem tem `insumos.ver` E define a lista ou compra (decisão 226, corrigida na rodada 1: a
  cozinha lê só quantidades); orçamento pela `orcamentoNaNota` da 2.5 (a vista de quem lê; sem custo = parte de zero). Campo novo com valor
  entra no mesmo contrato e nos testes do HTML do "chefe sem custos" e do operador padrão (que tem `insumos.ver`).
- **Catálogo versionado de verdade**: permissão nova entra em `NOVAS_NA_VERSAO` (`permissoes.ts`) com `VERSAO_DO_CATALOGO` + 1 e uma migration
  de dado como a `20261030010000_erp_catalogo_v2` (o "copiado do Dono" ganha; os demais, a Equipe pede para revisar). O teste confere a
  lista do SQL contra o catálogo.
- **Ajuda do shell manda texto de todas as telas** (0.6, achado na prova): blocos sem `para` vão a todos, inclusive "nunca R$ 0,00" do DRE para
  quem não vê o DRE. Não é valor nem vem da lista, mas um teste que procure "R$" no HTML inteiro acha; procure no `main`. Vale rever na 0.6.
- **Para o Rodolfo (decisão de negócio, não bloqueia)**: (1) quem monta a lista é a gerência (`producao.planejar`); a cozinha só lê e executa.
  Serve, ou o cozinheiro-chefe também monta? (dá para dar a permissão por pessoa). (2) Saldo negativo entra no "comprar" (compra-se o buraco
  do livro também); se o negativo for quase sempre nota esquecida, o comprador vai comprar a mais — preferem que o negativo conte como zero e
  só avise? (3) "Pôr na lista" sugere exatamente o que falta (300 g), sem lote mínimo nem embalagem fechada; querem uma regra de lote por
  ficha (ex.: base de cebola sempre de 2 kg)? (4) O "tem" é o saldo da loja agora: não desconta requisições abertas de outros setores (salão)
  nem o estoque mínimo. (5) A lista vai até 14 dias à frente e não volta no tempo (como o lote). (6) Resolvido na rodada 1 (decisão do Maestro):
  a cozinha não vê R$ na lista, mesmo com `insumos.ver`; o lote (3.1) continua mostrando custo a quem tem `insumos.ver` — separar "ver insumo"
  de "ver custo" no catálogo inteiro segue como decisão de catálogo. (7) Perfil próprio antigo (catálogo v1) que não tinha tudo não ganha
  "definir a lista do dia": a Equipe avisa para revisar.

## Herança da 3.3 (para a 3.4 e as próximas)

- **A produção continua UMA**: pegar, soltar e passar moram em `producao.ts` (`pegarNaTx` é a regra; `pegarProducao` é o
  `iniciarProducao` da 3.1, que ficou como apelido); pegar uma linha da lista mora em `producao-lista.ts` (`pegarDaLista`). As
  leituras da cozinha, do histórico e dos indicadores ficam em `producao-equipe.ts`; a conta pura em `producao-equipe-campos.ts`.
  Quem precisar de "quem fez", "tempo" ou "indicador por pessoa" (etiqueta com o nome de quem fez, relatório mensal) parte de
  `lotesEncerrados`/`indicadoresPorPessoa`, nunca refaz a conta.
- **Quem fez = `responsavelUsuarioId` + `responsavelNomeSnapshot`, SE o login é da equipe**; `responsavelDesde` nulo = não pegou
  pelo ERP (lote da 3.1 ou concluído direto: sem tempo). O nível 1 nunca é quem fez: o lote que ele concluiu na 3.1 tem o login
  dele gravado, e a leitura o tira (`idsDaEquipe` das credenciais, passado a `historicoDaProducao`/`indicadoresDaProducao`;
  polimento, decisão 241). Leitura nova de "quem fez" recebe a equipe também. Freelancer (fase tardia) entra por `responsavelId` (Colaborador): aí
  "quem fez" passa a ser pessoa do login OU colaborador, e os indicadores agrupam pelos dois.
- **Lote com outra pessoa**: só ela ou a gerência (`producao.planejar`) conclui, cancela ou solta; escrita nova sobre um lote
  pendente (etiqueta impressa antes de concluir, por exemplo) decide se respeita o dono e diz por quê. A gerência passa só para
  quem `pessoasQueProduzem` devolve (credenciais, no servidor), e `passarProducao` relê na gravação, com o lote travado, se a
  escolhida ainda pode (`QuemPodeReceber.aindaPode` = `aindaProduzNaLoja`; decisão 241). "Recebeu × pegou": `passadosPor` (o
  último "pegou"/"passou" do histórico do lote).
- **Pegar não mexe no livro nem no DRE**: vale com período fechado. Qualquer escrita nova que mexa (baixa, entrada) chama
  `conferirPeriodoAberto` e segue a ordem das travas da 3.1/3.2 (período → lista → abertura → requisição → ordem → saldos).
- **A ordem fixa vale no pegar**: `pegarNaTx` trava requisição → ordem (`travarOrdem`); `pegarDaLista` trava período → lista →
  as de planejar → as de pegar. Não trave a lista depois da ordem.
- **Entrada da área por perfil**: `Tela.entradaPara` (`modulos.ts`) — a cozinha entra na Produção pelas Tarefas. Outra área que
  precise de entrada por perfil usa o mesmo campo (sem mudar a ordem das abas).
- **Botão da tela da cozinha**: `classeDeBotaoDaCozinha` / `BotaoEnviar cozinha` (56 px em qualquer largura). Tela de bancada nova
  (etiqueta, contagem rápida) usa o mesmo.
- **Testes**: a conclusão com relógio fixo precisa pegar antes (o CHECK `responsavel_antes_do_fim`); página que renderiza o lote em
  produção para a gerência chama `pessoasQueProduzem` (credenciais, outro banco no teste): mocke (`tests/erp-producao-equipe-telas`).
- **Formulário de lote que fica no mesmo lugar depois de gravar** (passar, soltar, pegar): `key` com a versão do lote, para fechar
  depois de gravar (sem isso, a escolha velha ficava na tela com a versão nova e um segundo toque gravava de novo).
- **Concluir pelas Tarefas**: `/producao/tarefas/<loja>/<lote>/concluir` (a aba vem do caminho; decisão 242). Tela nova aberta a
  partir de uma aba que não é a "dona" do recurso faz o mesmo: endereço debaixo da aba, não `?de=`.
- **Matriz de telas**: uma página nova por endereço. O print `fullPage` do Playwright desliga a emulação de toque da página e, dali em
  diante, todo alvo que só cresce com `pointer: coarse` aparece pequeno (falso alarme).
- **Para o Rodolfo (decisão de negócio, não bloqueia)**: (1) no tablet compartilhado cada um entra com o próprio acesso (senha ou
  rosto) — a cozinha do Valentin's topa? Se o tablet ficar logado numa pessoa só, o histórico mente; (2) a cozinha vê no histórico o
  que cada colega fez (como já via no quadro): serve, ou cada um só o seu?; (3) os indicadores são hipótese: amostra pequena abaixo
  de 5 lotes; tempo de pegar (ou da entrega dos insumos) até concluir; rendimento médio com cada lote pesando igual; "Cancelou"
  conta só o que a própria pessoa cancelou e o da gerência fica à parte (ajuste da 237, pelo nome gravado) — de acordo?; (4) passar para
  outra pessoa é só da gerência; o próprio cozinheiro pode passar para um colega?; (5) a gerência não pré-escala lote planejado
  ("a Duda faz o molho amanhã"): quer escala de tarefas numa fase própria?; (6) pegar e soltar valem com o período fechado (não
  mexem em dinheiro nem em estoque): de acordo?; (7) **pendência de decisão (polimento, fiscal de UX):** o operador vê R$ no
  Histórico da produção e no Concluir porque o perfil padrão do Operador tem `insumos.ver` (custos); na Lista do dia a 3.2
  escondeu a estimativa de compra dele. A regra do sistema é a permissão (quem tem `insumos.ver` vê custo), e a incoerência fica
  para o Rodolfo decidir: tirar `insumos.ver` do Operador padrão (a cozinha deixa de ver custo em toda parte) ou aceitar que a
  cozinha veja o custo do lote. Nada foi mudado. **Resolvido em 25/10/2026 (decisão 460):** a regra do Rodolfo ("Operador
  nunca recebe R$") virou a régua única `veCustosDaProducao` (`insumos.ver` E `compras.ver` na loja) no lote, no Concluir, no
  Histórico e na lista do dia; a requisição do lote segue a régua do estoque (`compras.ver` na loja, decisão 459); o perfil do
  Operador não mudou.

## Revisão visual de 21/10/2026 (antes das próximas funcionalidades)

**O que foi feito.** Diagnóstico no build de produção com dados de teste, em 10 telas × 4 formatos (celular 390, tablet em pé 820, tablet deitado
1180, desktop 1440) × 2 temas = 80 telas, com toque ligado no celular e no tablet, axe (WCAG 2 A/AA), rolagem lateral e alvos de toque. Depois,
varredura de todas as telas alcançáveis: 70 com a dona no tablet deitado, 25 com o operador no celular.

**Referências Kairu realmente consultadas** (MCP, 21/10): Editorial v1.2.0, Corporativo v1.2.0 e Dark v2.0.0 (prompt completo, DESIGN.md e
código). Escolha e motivos na decisão 202. As prévias em imagem não abriram (rede da sessão bloqueia portal.kairulabs.com.br: proxy 403).

**Achados e correções.**

| Achado | Correção | Onde |
|---|---|---|
| Caixa "Como funciona" acima do título: na 1ª visita o título aparecia depois de uma dobra inteira | caixa dentro do `PageHeader`, abaixo do título; sem o título repetido em serifa | `ui/caixa-da-tela.tsx`, `ui/cabecalho.tsx`, `shell/Shell.tsx`, `shell/ajuda.tsx` |
| Filtros dos insumos estouravam a 1180 px com o menu (53 px de rolagem lateral) | linha única só a partir de 1280; em 1024–1279, busca em cima e 4 filtros embaixo | `telas/insumos/lista.tsx` |
| Tablet recebia alvos de mouse (40/36 px) | `pointer: coarse` devolve 44 px; links de texto ganham área de toque | `tokens.css` |
| Grupo do menu com um item só ("INSUMOS › Insumos") | vira o item direto | `shell/NavLateral.tsx` |
| Selo "Sem CMV" no DRE escuro com 4,42:1 | erro escuro #F5525A | `tokens.css`, `tailwind.config.ts` |
| Hub em 1 coluna no celular (herança da UX.5) | 2 colunas, card compacto | `ui/hub.tsx` |

**Resultado.** 80 de 80 telas sem rolagem lateral e sem violação do axe; 95 telas varridas com um h1 cada e a caixa de ajuda abaixo dele. Testes:
1.575 passaram (com banco, `--no-file-parallelism`), typecheck e lint limpos. Nenhuma regra, dado, permissão ou rota mudou.

**Herança (para as próximas).** Tela nova usa `PageHeader` (é ele que traz a caixa de ajuda). Alvo novo que encolhe acima de 600 px usa as classes
já cobertas pela regra de toque (`sm:min-h-10`, `sm:min-h-[42px]`…) ou entra na lista em `tokens.css`. Fica para depois: Equipe longa no celular e
"Ver tudo sobre esta tela" como link de texto em vez de botão fantasma.

## O que a L.4 entregou — consumo e conciliação de estoque (relatório)

Quarta entrega da "Evolução prioritária — lista de insumos e relatórios de compras, preços e consumo" (Rodolfo, 21/10/2026): **"Consumo e conciliação de estoque"** (L1231–1235), item 4 da "Ordem de entrega" (L1237–1242: "após validar cobertura dos movimentos") e os critérios L1244–1246. **Sem migration** (387): o livro do estoque já tem tudo. Decisões 386 a 397 (386 é a herança da L.3, em commit próprio). Sem permissão nova (`estoque.ver` por loja; R$ só com `compras.ver`, 390). Ajuda: `estoque-consumo` nova (versão 1; nenhuma entrada existente mudou).

**Heranças da L.3 resolvidas (386, primeiro commit).** Fornecedor sem cadastro separado pelo nome da nota, também em "Comparar fornecedores" e nos agrupamentos de "Compras do período" (`n:<nome>`, mostrado "(sem cadastro)"); "Comparar períodos" sem "Tirar os filtros" à toa, sem "B: R$ 0,00" num lado sem compra, com um aviso só quando os dois lados não têm compra comparável e sem "cobre 0,0%", e "1 compra · nenhum fornecedor com preço comparável"; e a área de toque dos links de texto (nomes curtos, "nota 301", "Abrir o cadastro", fornecedores, "Ver as canceladas"): `position: relative; z-index: 1` + `min-width: 44px` no `ff-toque`/link de tabela e passo de 44 px nas linhas de tabela no toque (sistêmico, `tokens.css`).

**Telas** (`/erp/estoque/relatorios/consumo`, `.../consumo/movimentos`, `.../consumo/exportar` e o espelho `/rodolfo/erp/[slug]/estoque/relatorios/consumo...`), grupo "Relatórios" do menu de Estoque e Movimentações (394).

1. **A ponte de cada unidade** (kg, L e un nunca somados): Saldo inicial → Compras → Produzido → Uso → Perdas → Devoluções → Estornos → Ajustes → Saldo final, com a linha "Transferências entre lojas: ainda não existe no sistema", o selo "Confere" e a conta de bruto × líquido. Cada número abre os movimentos que o formam.
2. **Tabela por insumo e loja** (≥ 1280 px; cartões abaixo): as mesmas colunas, número com sinal, R$ embaixo para quem vê, selos de lacuna. Abrir o nome do insumo leva ao **linha a linha** (17 caixas em 4 grupos, cada uma com "de onde vem", quantos movimentos e a quantidade; o que ainda não existe diz isso; as lacunas em frase).
3. **Antes de ler** (392): o que ficou fora ou pede olhar: período em andamento, loja sem a abertura do estoque, notas fiscais (XML) que aguardam conferência (fora até virarem nota lançada), contagem em andamento, lacunas duras, sem contagem no período, sem valor.
4. **Movimentos** (395): a coluna, o saldo inicial ou o final aberto, do mais novo ao mais velho, com quantidade com sinal, saldo antes › depois, selo "Estorno" e a origem com link (requisição #N e lote, nota, contagem ou abertura) conforme a permissão da loja; `volta` para o relatório.
5. **Planilha e impressão** (395): CSV protegido (avisos no cabeçalho, 17 caixas, ponte conferida por linha, totais por unidade; `parte=movimentos` baixa os movimentos de um número) e "Imprimir ou salvar em PDF" com landmarks únicos.

### O indicador e o que o relatório nunca faz (391)

"Uso" é a **requisição registrada** (a baixa que o estoque deu ao entregar), não o consumo aferido por contagem (esse é o das Divergências, 1.8). O relatório só lê: não dá baixa pela venda, pela geração da tela, da planilha, da impressão nem dos movimentos (teste de contagem de linhas antes e depois). A diferença da contagem é Ajuste (sobra ou falta), nunca consumo nem perda presumidos.

### A conta (387 a 389)

Cada movimento cai numa coluna só (`BUCKET`, um `CASE` em SQL): compra (1º lançamento da nota), nota corrigida (o estorno do lançamento antigo e a nova entrada, juntos: só a diferença), nota cancelada (estorno do último lançamento de uma nota `CANCELADA`), produzido, lote desfeito, uso de lote, uso de setor, devolução (o estorno da baixa e o relançamento do líquido, juntos), perda, sobra e falta na contagem, ajuste manual, abertura, outros estornos e as duas caixas reservadas de transferência. Inicial = soma do livro até o dia anterior; final = soma até o fim do último dia (relógio do Rio); a ponte (inicial + soma das colunas) é conferida por uma segunda soma direta e o livro é conferido com `SaldoEstoque`.

| Cebola, Casa, 01–31/10/2026 (conta à mão) | Quantidade |
|---|---|
| Saldo inicial (abertura de 28/09) | 20 kg |
| Compras (3 notas lançadas: 50 + 20 + 10 kg) | +80 kg |
| Estornos: nota cancelada −20 kg; nota corrigida de 10 para 12 kg +2 kg | −18 kg |
| Uso: requisição de setor −30 kg; dois lotes −0,885 e −0,354 kg | −31,239 kg |
| Devoluções (5 kg voltaram da requisição de setor: estorno +30, relança −25) | +5 kg |
| Ajustes (a contagem de 12/10 achou 55 kg onde o livro tinha 55,761) | −0,761 kg |
| **Saldo final** (20 + 80 − 18 − 31,239 + 5 − 0,761) | **55 kg** |

### Evidência de cada caixa do Notion (para o Maestro marcar; L1231–1235, L1237–1242 e L1244–1246)

| Caixa | Evidência |
|---|---|
| L1231 compras e consumo separados; entrada de nota não é uso; transferência interna não é compra nem consumo | Colunas Compras e Uso separadas (teste de banco: Cebola, e `compra` só de nota lançada); "Produzido" não é compra; transferência dita como inexistente e com linhas reservadas no detalhe e no CSV (393); jornada: ponte e linha a linha. |
| L1232 saldo inicial, entradas, uso, perdas, devoluções, transferências, ajustes e saldo final, com sinais e origens | Ponte, tabela e linha a linha com sinal e "de onde vem"; 17 caixas; movimentos com a origem (nota, requisição e lote, contagem, abertura); testes de banco (cenário de outubro, SQL independente) e jornada dona. |
| L1233 baixa na requisição; nunca de novo pela venda nem pela geração; dizer se é requisição registrada ou aferido | Decisão 391; teste "o relatório só lê" (linhas de movimento, saldo, requisição, item atendido, nota, histórico, contagem e ordem iguais antes e depois de tela, planilha, impressão e movimentos); frase na primeira dobra, nas notas, na ajuda e no CSV. |
| L1234 saldo final concilia; diferença de inventário é ajuste; lacunas | Ponte conferida por segunda soma e por `SaldoEstoque` (389); a contagem entra como sobra/falta em Ajustes; lacunas: sem contagem (com a última data), negativo no fim e no meio, sem origem, saldo que não bate, sem valor, unidade que mudou (392). |
| L1235 cancelamentos, estornos e devoluções separados; bruto × líquido; documento só capturado fora | Colunas Estornos e Devoluções à parte, bruto/líquido definidos e escritos (388); nota cancelada, corrigida e devolução em duas rodadas (devolução parcial); XML aguardando fora do livro, avisado com o número (teste de banco e jornada). |
| L1237–1242 ordem de entrega, item 4 | Esta entrega, depois de validada a cobertura dos movimentos (quadro "Cobertura" abaixo). |
| L1244 amostra: mudança de mês, devolução/cancelamento, nota repetida, transferência entre lojas | Fuso (23:30 de 31/10 em outubro, 00:30 de 01/11 em novembro), nota cancelada e corrigida, devolução, requisição de lote e lote estornado; nota repetida e relançada conta pela chave de idempotência do livro; transferência entre lojas não existe (dito). |
| L1245 soma das linhas × resumo, exportação × tela, abertura da origem, isolamento entre empresas e lojas | Testes de banco (soma das caixas = final − inicial, CSV parseado = tela linha a linha e totais), "cada número abre as linhas" com `volta` (jornada), isolamento: gerente só da loja dele, parceiro B invisível, operador sem R$, 401/403/400/413. |
| L1246 computador, tablet retrato e paisagem, celular, teclado e leitores de tela | Matriz de 14 telas × 4 tamanhos × 2 temas com ponteiro de toque, axe e hit-test; `caption`, `aria-label` com o que cada número abre, `aria-current`, landmarks únicos na impressão. Consumo real e publicação não foram declarados. |

### Cobertura dos movimentos (o que falta, dito antes de entregar)

Gravados hoje: abertura, compra, requisição, entrada de lote e contagem. **Sem quem grave**: perda (`PERDA`), ajuste manual (`AJUSTE`) e `PRODUCAO_CONSUMO`. **Inexistente**: transferência entre lojas. A contagem que bate não gera movimento (a cobertura de contagem vem de `ContagemItem`). O R$ da baixa é o custo de referência do dia da entrega; insumo sem preço entra com zero e é dito. Nada disso foi inventado: as colunas existem vazias e a tela diz por quê.

### Referências Kairu consultadas (regra do plano)

Pelo MCP Kairu em 23/10/2026: `pass:inventario-contagem-divergencias` v1.2.0, `library:inventario-ciclico` v1.0.0 e `pass:cmv-fichas-e-margem` v1.2.0 (lidos inteiros). O que foi aplicado está na decisão 396: item não contado não é zero, divergência não prova perda, saldo final que bate com o razão, custo ausente é indisponível (nunca zero), cobertura parcial dita antes dos números, "nunca compensar com baixa silenciosa" (o relatório não grava), dia operacional do Rio com [início, fim) e isolamento de outra loja testado em HTML, planilha e movimentos.

## Provar a L.4

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                              # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run   # com banco, 2x, em paralelo
NODE_OPTIONS=--max-old-space-size=6144 npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code   # vazio (não há migration nova)
```
`tests/erp-consumo-estoque.test.ts` (sem banco, 19): o mapa das caixas (uma coluna por caixa), a ponte, bruto × líquido, a propriedade com 300 sequências, as lacunas, os filtros da URL, o sinal, a planilha de negativo e os avisos. `tests/erp-consumo-estoque.db.test.ts` (Postgres de verdade, cenário conferido à mão no cabeçalho do arquivo, 26 testes, a planilha inclusa): a conta da Cebola, SQL independente, contado e não contado, lote e lote estornado, negativos, sem origem e perda, o dia do Rio, o resumo por unidade, os filtros, o XML aguardando, "só lê", os movimentos de cada número, perfis e isolamento, o dinheiro do livro e o teto, o R$ zerado na própria consulta de quem não vê custo e o relatório respondendo com a frase quando as vagas estão ocupadas. `tests/erp-vagas-de-relatorio.test.ts` (sem banco, 5) e `tests/erp-relatorio-teto.db.test.ts` (Postgres, 5): vagas e fila, teto cortado pelo banco, somente leitura no portão e no banco, o teto que não vaza no pool e seis relatórios juntos com no máximo três ao mesmo tempo. Sem migration: os 3 perfis de banco não têm o que aplicar; os arquivos de banco tocados rodam nos dois perfis.

**Resultado da prova (L.4), rodada do Guardião e da UX (disponibilidade)**

| Prova | Resultado |
|---|---|
| `prisma validate`, `typecheck`, `lint`, `gate` (661 arquivos), `build` | limpos |
| `erp:conferir-migracao` e `migrate diff` contra o schema | conferido; "No difference detected" (a L.4 não tem migration) |
| `vitest` sem banco | 1.647 passaram, 918 pulados (sem `ERP_DB_TESTE`) |
| `vitest` com banco, 2 rodadas em paralelo (superusuário) | 2.609 de 2.609 nas duas |
| Arquivos de banco tocados (consumo, teto de relatório, relatório e comparação de compras), dono não-superusuário **com** RLS (42 políticas) e **sem** RLS (0 políticas), em série | 77 de 77 nos dois |
| Produção local (`next start`, porta 3100), matriz de 10 telas x 4 larguras (1440, 1180, 820, 390), claro e escuro | 0 problemas em 56 combinações por tema: sem rolagem lateral, sem texto miúdo, hit-test de toque ≥ 44 px sem sobreposição, axe sem violação, sem erro de console |
| Jornada por perfil (dono, gerente só das lojas dele, operador e cozinha sem R$, isolamento entre dois parceiros) | 76 verificações, 0 falhas |
| Pontos tocados na rodada, no navegador | 21 de 21: links de origem com volta (nota, requisição, lote, contagem) e volta forjada ignorada; grupo Relatórios no menu; "0 L" no lugar de "0 ml"; número e unidade sem quebra a 390 px; R$ negativo do Alho explicado; aviso da comparação uma vez só; Compras/Uso bruto e líquido na impressão e no CSV |

**Desempenho e concorrência** (320 mil movimentos: 8 lojas x 400 insumos x 100 movimentos; banco local de 4 núcleos):

| Medida | Antes da rodada | Depois |
|---|---|---|
| Tela de 1 mês, banco aquecido | 7 a 10 s (o livro lido 3 vezes) | **1,9 s** (uma leitura) |
| Tela de 1 mês, cache frio (banco recém-reiniciado) | 8 a 31 s | **4,3 s** |
| 3 meses, ano, planilha completa (3.200 linhas) | 8 s, 8 s, 6 s | 2,0 s, 2,2 s, 2,2 s |
| Uma loja, um mês | 4,4 s | 0,4 s |
| Movimentos de um número (um par) / da coluna "ajustes" inteira | 34 ms / 2,4 s | 33 ms / 0,4 s |
| 20 pedidos pesados ao mesmo tempo (HTTP, produção local) | pool esgotado: erro "Unable to start a transaction" e o ERP travado | **20 respostas 200 em 9,8 s: 6 com os números, 14 com "Há outro relatório grande rodando", nenhum 5xx** |
| Tela leve durante os 20 pesados | travava | mediana de 77 ms (repouso: 90 ms); maior espera de 809 ms, todas 200 |
| Consulta que passa do teto | seguia rodando no banco depois do erro do Prisma | cortada pelo Postgres aos 20 s; frase "O relatório ficou grande demais" |

Observação: um banco recém-carregado (sem `VACUUM`) levou mais de 20 s na primeira leitura de cada recorte, por causa dos bits de consulta ainda não marcados; isso não acontece em produção com o autovacuum, e o teto de 20 s corta o caso com a frase em vez de travar. O limite continua dito: acima disso o caminho é guardar o saldo por dia, não afrouxar o teto.

### Herança da L.4 (para as próximas)

- **Perda, ajuste manual e transferência entre lojas** não têm tela nem tipo: quando existirem, entram nas caixas já reservadas (`perda`, `ajuste`, `transf_entrada`, `transf_saida`) e o relatório não muda de forma. Transferência pede um tipo novo no livro (migration) e saída e entrada ligadas, sem contar como compra nem consumo da rede.
- **A classificação mora num `CASE` só** (`BUCKET` em `consumo-estoque.ts`): quem criar um tipo de movimento ou uma nova forma de estorno precisa dizer em que caixa ele cai, ou ele vira "Outros estornos" (e o teste de banco denuncia).
- **Consumo aferido** (inicial contado + entradas − final contado) continua nas Divergências; trazê-lo para este relatório exige contagem nas duas pontas do período.
- **O R$ da baixa é o custo de referência do dia**; um preço mudado depois não reescreve o passado, mas a baixa sem preço entra com zero (dita).
- **O livro de estoque da loja (1.6) mostra valor a quem tem `estoque.ver`**, inclusive o operador; este relatório não (pergunta 2 da decisão 397).
- **Desempenho**: a leitura soma o livro inteiro da loja até o fim do período (`MovimentoEstoque` por loja e insumo). Medido em 320 mil movimentos (ver "Resultado da prova"), numa leitura só por tela, com teto de 20 s e 3 vagas por processo (decisão 398); com muitos anos de livro, levar o saldo inicial para uma tabela de fechamento é a saída.

## O que a 3.4 entregou — etiquetas: o lote produzido, o lote do fornecedor e a embalagem aberta, na Zebra ou no papel

Subfase 3.4 do plano ("Etiquetas"): etiqueta 60 × 40 e 60 × 60 mm com produto, conservação, manipulação ou abertura, validade,
responsável, quantidade, lote e loja; o lote e o vencimento do item comprado registrados no recebimento; a abertura da
embalagem com a validade efetiva; ZPL para a Zebra pelo Browser Print, com arquivo .zpl e papel A4 quando não der; retrato que
a reimpressão não recalcula. Decisões 400 a 416. Migration aditiva `20261110000000_erp_etiquetas` (três tabelas de tenant com
RLS; a "Etiqueta" da 0.1 virou a emissão). Sem permissão nova: `etiquetas.imprimir` por loja (o operador tem); o lote na nota é
`compras.lancar`. `VERSAO_DO_ERP` = "Barney ERP · fase 3.4"; a lista de módulos "em breve" ficou vazia.

| Peça | Onde |
|---|---|
| Regras puras: relógio do Rio, validade da abertura, leitura dos formulários, código da etiqueta, frases | `src/lib/erp/etiqueta-campos.ts` |
| O desenho: texto limpo, quebra e medida, layout em pontos (203/300 dpi), ZPL, etiqueta de teste | `src/lib/erp/etiqueta-zpl.ts` |
| Com banco: lojas, painel, lote, abertura, emissão, pedido e resultado, histórico, lote da nota, papel | `src/lib/erp/etiquetas.ts` |
| `rastro` do XML guardado (nLote, qLote, dFab, dVal) | `rastrosDoXmlGuardado` em `src/lib/erp/nfe-xml.ts` |
| Telas (as mesmas no /erp e no nível 1) | `src/components/erp/telas/etiquetas/` (`painel`, `lote`, `form-emitir`, `abrir`, `form-abrir`, `aberta`, `emissao`, `painel-impressao`, `browser-print.ts`, `papel`, `historico`, `impressora`, `config-impressora`, `lotes-da-nota`, `form-lote-nota`, `previa`) |
| Rotas | `/erp/etiquetas` (`[loja]`, `[loja]/lote/[lote]`, `[loja]/abrir`, `[loja]/aberta/[abertura]`, `[loja]/[etiqueta]`, `[loja]/[etiqueta]/papel?pedido=`, `abrir`, `historico`, `historico/[loja]`, `impressora`), `/erp/compras/[id]/lotes` e o espelho em `/rodolfo/erp/[slug]/...` (ações com `auditLog`) |
| Banco | `EtiquetaImpressao`, `LoteDeInsumo`, `AberturaDeLote` + colunas da "Etiqueta"; gatilhos `Etiqueta_origem_confere`, `EtiquetaImpressao_confere`, `LoteDeInsumo_confere`, `AberturaDeLote_confere` e os de parceiro imutável; conferidas por `npm run erp:conferir-migracao` |

**O fluxo.** (1) O lote concluído na Produção ganha "Imprimir etiqueta" → a etiqueta do lote: tamanho, quantas (até 50, uma
por pote), quanto em cada (opcional; juntas não passam do que saiu) e se a hora aparece, com a prévia proporcional redesenhada
ao vivo → "Emitir" grava o retrato e leva à emissão. (2) A emissão: prévia do retrato, o painel de impressão (Zebra pelo
Browser Print, "Baixar o arquivo .zpl", "Imprimir no papel (A4)", cópias) e os pedidos com o que aconteceu. (3) No
recebimento, a nota tem "Lote e vencimento": por insumo, o lote como veio na embalagem (o rastro do XML como sugestão). (4) Na
cozinha, "Abrir embalagem": o insumo, o lote (da nota, lido agora na embalagem ou "não informado"), onde vai ficar e quanto;
a hora é a do registro; a tela mostra ao vivo até quando vale e recusa o lote vencido → a embalagem aberta emite a etiqueta
dela. (5) Histórico de impressões por loja e período, com os totais que separam pedidos de etiquetas.

### A regra da validade (decisões 401 a 403)

| Caso | Na etiqueta |
|---|---|
| Lote produzido com validade (conclusão às 14:05, refrigerado 3 dias) | `MANIPULADO 23/10/26 14:05` e `VALIDADE 26/10/26 14:05` (a da conclusão, para sempre) |
| Lote produzido sem validade na ficha | `VALIDADE NÃO INFORMADA` (e a tela pede para completar a ficha) |
| Embalagem aberta 23/10 14:05, prazo 3 dias, lote vence 10/11 | `USAR ATÉ 26/10/26 14:05` (o prazo vem antes) e `VENC. LOTE 10/11/26` |
| A mesma, lote vence 24/10 | `USAR ATÉ 24/10/26` (o vencimento vem antes: vale até o fim do dia no Rio; abrir não prolonga) |
| Sem prazo depois de aberto na conservação escolhida | `PRAZO NÃO INFORMADO` (o vencimento do lote não vira validade depois de aberto) |
| Lote vencido | não abre: "Este lote venceu em …: não abra. Separe para descarte e avise a gerência." |
| Lote não informado | `VENC. LOTE NÃO INFORMADO` e `LOTE FORN. NÃO INFORMADO` (vale só o prazo) |

### Referências Kairu consultadas (regra do plano)

| Material | Lido | Aplicado | Adaptado | Fora, e por quê |
|---|---|---|---|---|
| `library:impressao-etiquetas` v1.0.0 (MCP, 23/10/2026) | inteiro | abas Imprimir/Histórico/Impressora; 60 × 40 e 60 × 60 a 203 dpi (480 × 320, 480 × 480); ZPL sanitizado com acentos (`^CI28`, `^FH`); prévia e ZPL do mesmo layout; nome grande quebra ou pede o formato maior, nunca trunca; snapshot e reimpressão sem recalcular; pedido gravado antes do envio, idempotência, reenvio consciente com aviso de duplicação; estados sem "impressa" automático, arquivo ≠ impressão; total de pedidos ≠ total de etiquetas; emissor da sessão separado de quem manipulou; emissão não mexe no estoque; validade no servidor no fuso da loja, dias como duração; isolamento por loja no servidor; instalar o aplicativo, aceitar o domínio e testar UMA etiqueta fictícia | sem prazo, o material bloqueia a emissão: aqui o lote sem validade sai "não informada" e a embalagem sem prazo "prazo não informado", com aviso (regra do coordenador de nunca inventar; perguntas 1 e 2 da decisão 415); cópias até 50, não 10 (412); Browser Print pela API local, sem empacotar o SDK (409) | logo e CNPJ na etiqueta (pergunta 8); hash do payload (o retrato regera o mesmo ZPL, testado); estado "confirmada pelo operador" (pergunta 9); limite de frequência; manipulação retroativa (manipulação = conclusão) |
| `prompt:b3592b7c-e37b-4b1d-bffb-9053848afe28` "Da Ficha ao Fornecedor" (comunidade, MCP, 23/10/2026) | inteiro | busca pelo número do lote para conferir uma etiqueta impressa (painel da loja); validade = fabricação + prazo quando existe (herdado da 3.1) | — | rastreio de qual lote de insumo entrou no lote produzido (limitação também do material: pede outro desenho); botões de 56 px da tela de bancada (a etiqueta usa os de 44 px do formulário) |

## Provar as etiquetas (3.4)

```bash
npx prisma validate && npm run typecheck && npm run lint && npm run gate
npx vitest run                                                         # sem banco
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism   # com banco (em blocos, se preferir)
NODE_OPTIONS=--max-old-space-size=6144 npm run build
npm run erp:conferir-migracao
npx prisma migrate diff --from-url <banco> --to-schema-datamodel prisma/schema.prisma --exit-code
```

`tests/erp-etiquetas.test.ts` (sem banco, 30): relógio do Rio, a regra da validade em cada caso, as situações, a leitura dos
formulários, o ZPL (estrutura, limites, quebra, fonte mínima, campos que saem, acentos, sem validade), segurança (`^`, `~`,
`_`, quebra, controle, largura zero, emoji, U+2028), nome do arquivo, etiqueta de teste, retrato determinístico e o rastro do
XML. `tests/erp-etiquetas.db.test.ts` (Postgres, 15): emissão do lote e idempotência (5 emissões juntas, códigos sem repetir),
recusas (não concluído, perdido, estornado; o estornado depois não imprime), reimpressão que não recalcula, pedidos e
resultados, lotes da nota e a sugestão do XML, a regra da abertura, o item aberto, nota cancelada, escopo, isolamento e RLS,
período fechado, totais do histórico e as barreiras do banco em SQL cru. `tests/erp-etiquetas-telas.db.test.ts` (8): as páginas
e as actions de verdade por perfil (sem R$, 404 fora da loja e do parceiro, o nível 1 que não abre, o papel só com o pedido).
`tests/erp-etiquetas-migracao.db.test.ts` (3 perfis): dado antigo (lote da 3.1 e uma "Etiqueta" da 0.1), nada some, sem aviso,
regras pelo papel do tenant, conferidor limpo e acusando o que faltar. Jornada e matriz no navegador: scripts em
`scratchpad/pw/prova34.mjs` e `matriz34.mjs` (Browser Print simulado por `page.route` em `localhost:9100`).

**Resultado da prova (2026-10-23, depois do merge da L.4)**

| Prova | Resultado |
|---|---|
| `prisma validate`, `typecheck`, `lint`, `gate` (710 arquivos), `build` | limpos |
| `erp:conferir-migracao` e `migrate diff` | conferido (3.4 inclusa); vazio |
| `vitest` sem banco | 136 arquivos (68 de banco pulam), 1.702 passando |
| `vitest` com banco, superusuário, banco novo por `migrate deploy`, em 4 blocos | 81 arquivos, 1.291 testes, todos passando |
| Dono NÃO-superusuário com FORCE RLS (migrations pelo dono), 15 arquivos de banco tocados ou vizinhos | 331 de 332 (a falha é a conhecida do teste da 0.2, que lê `_prisma_migrations`) |
| Dono sem RLS, os mesmos 15 | 324 passando, 8 pulados |
| Migration da 3.4 com dado antigo nos 3 perfis | 3 passando |
| Jornada (build de produção, banco cópia do `ff_33` + migrations + categorias) | 34 de 34 conferências: concluir, emitir, Zebra (POST com o device e o ZPL `^CI28`, 480 × 320, `^PQ2`), .zpl (421 bytes), papel 60 × 40 mm (227 × 151 px a 96 dpi) e PDF A4, sem Browser Print, Zebra que recusa, 3 lotes na nota (a nota não muda), abrir pelo vencimento, sem prazo, abrir não mexe no estoque, histórico 5 pedidos · 9 etiquetas · 3 enviadas · 4 arquivo ou papel · 1 falhou |
| Matriz: 10 telas × dona/gerente/operador × 1440/1180/820/390 × claro/escuro (232) | 0 rolagem lateral, 0 violação do axe, 0 erro de console, 0 alvo abaixo de 44 px com toque real, 0 R$, um h1 por tela |

O que a prova achou e fez corrigir está na decisão 416 (a chave do formulário do lote na nota, os alvos de toque). O teste
físico na Zebra do Valentin's (os dois rolos, 203 ou 300 dpi) depende do Rodolfo: o Browser Print instalado no computador da
impressora, o domínio aceito e a etiqueta de teste da aba Impressora.

## Herança da 3.4 (para as próximas)

- **A emissão é imutável** (gatilho `Etiqueta_origem_confere`): corrigir é emitir de novo. Reimprimir é `EtiquetaImpressao` nova
  do mesmo retrato (`pedirImpressao`). Mudou o desenho? Suba `VERSAO_DO_LAYOUT` e mantenha o retrato regerando o mesmo papel
  (o teste do retrato determinístico denuncia).
- **Uma função desenha tudo** (`montarEtiqueta`): prévia, papel e ZPL. Campo novo na etiqueta entra em `linhasDoConteudo`,
  com `essencial` (recusa o formato se não couber) ou opcional (sai e é dito em `fora`), e um teste de nome longo nos dois tamanhos.
- **Texto do usuário no ZPL só por `paraCampoZpl`** (normaliza e põe `^ ~ _` em hexadecimal dentro de `^FH`). Nunca concatene
  texto cru num comando.
- **A validade efetiva mora em dois lugares que precisam concordar**: `validadeDaAbertura` (JS) e os CHECKs da `AberturaDeLote`
  (banco). Regra nova (horas, outra conservação) muda os dois e o teste das barreiras.
- **O pedido de impressão muda uma vez** (de "preparada" para o resultado). "Enviada" não é "impressa": a confirmação física,
  se vier, é um estado novo, não um uso diferente de "enviada".
- **Browser Print**: os caminhos ficam em `browser-print.ts` (um adaptador). Se a versão instalada no Valentin's não aceitar o
  POST de texto puro em `/write`, troque o adaptador (a biblioteca oficial da Zebra, servida como arquivo próprio), não o resto.
  O que precisa sair do navegador já está: o pedido gravado antes e o resultado depois.
- **O lote do fornecedor é por (nota, insumo)** e não muda; o lote lido na embalagem é de origem "abertura", sem nota. Nada de
  vencimento no cadastro do insumo. Rastreio de qual lote de insumo entrou no lote produzido não existe (pede outro desenho).
- **Formulário que volta para a mesma tela depois de gravar** leva a chave do envio da leitura como `key` (decisão 416).
- **Matriz**: a pergunta da 1ª visita da caixa de ajuda (0.6) traz o link "Seu acesso" de 16 px; a matriz responde a pergunta
  antes de medir. O link é da caixa (todo o ERP), não das telas.
- **Para o Rodolfo** (decisão 415): imprimir ou bloquear sem validade/sem prazo; o fim do dia do vencimento; 50 etiquetas e
  cópias; a FlowFoods não abre; lote na nota de quem lança nota; 203 ou 300 dpi e os rolos; CNPJ/logo; "saiu no papel".

## Rodada de correção 1 da 3.4

O Guardião aprovou (1 importante + 7 menores) e a UX reprovou (2 médios + menores). O que mudou, com as decisões 417–423 (e
as 400, 401, 406, 408, 409, 410, 414, 415 e 416 corrigidas no lugar):

- **Vencido não sai** (417): lote produzido vencido, como a embalagem aberta vencida, não emite nem reimprime (Zebra, arquivo,
  papel, nem o papel de um pedido antigo), para ninguém, e o servidor recusa. A tela diz em vermelho "Este lote venceu em
  DD/MM às HH:MM: não use. Separe para descarte e avise a gerência."; no painel, "venceu: não use", fora da fila.
- **A fila** (418): "Esperando a impressora" só se esvazia com a Zebra aceitando o envio ou com **"Já imprimi"** (quem e
  quando, gravados no pedido: `confirmadaEm`, `confirmadaPorNome`, `confirmadaPorUsuarioId`). Baixar o .zpl ou abrir o papel
  não tira. Sem Browser Print: "Sem Zebra neste aparelho" e a etiqueta fica na fila. Pedidos por nome: Zebra, Arquivo, Papel.
- **Zebra** (419): sem resposta em 15 s = "Sem resposta" / "Sem resultado" (pode ter saído), não "Falhou"; os erros comuns da
  Zebra em palavras (`traduzirErroDaZebra`).
- **Banco** (420, 421): a etiqueta confere manipulação, quem fez, lote do fornecedor e marca com a origem; pedido e abertura não
  somem (gatilho de DELETE); pedido não troca de id nem conclui antes de ser pedido; a chave do envio é da loja; 300 dpi é o
  desenho de 203 ampliado (nada some calado); o lote aceita `_ : #`; pré-preparo numa nota = frase, não erro 500. A migration
  `20261110000000_erp_etiquetas` foi ajustada no lugar (ainda não está na master).
- **Telas** (422, 423): papel A4 sem a folha em branco (estilo de impressão só da página do papel); o link dos lotes na nota
  com 44 px e a contagem; "Não cabe: use 60 × 60" com o botão de trocar; um termo para o sem prazo ("Prazo após abertura não
  informado"); barras de ação presas até 900 px (tablet em pé) e a impressão antes da prévia no celular e no tablet; a aba
  Impressora com a licença de rede local do Chrome e o certificado de https://localhost:9101; lote que chegou vencido na nota:
  "separe e devolva ao fornecedor".

**Herança que muda:** o pedido de impressão muda uma vez (o resultado) e ganha, uma vez, a confirmação "Já imprimi"; a fila e
o histórico leem os dois (`situacao = 'ENVIADA'` ou `confirmadaEm` preenchida). Etiqueta nova que se imprime passa por
`bloqueioDaEmissao` (estornado ou vencido) em TODOS os caminhos (emitir, pedir, papel, confirmar).

**Resultado da prova da rodada 1 (2026-10-23)**

| Prova | Resultado |
|---|---|
| `typecheck`, `lint`, `gate` (710 arquivos), `prisma validate`, `build` (0cffaa0) | limpos |
| `erp:conferir-migracao` e `migrate diff` (banco novo por `migrate deploy`) | conferido; vazio |
| `vitest` sem banco | 68 arquivos rodam (68 de banco pulam), 1.708 passando |
| `vitest` com banco, superusuário, banco novo, em 4 blocos | 68 arquivos, 995 testes, todos passando (o da migration corrigido, decisão 424) |
| Dono NÃO-superusuário com FORCE RLS (migrations pelo dono), 15 arquivos (etiquetas, telas, isolamento, RLS, acesso, permissões, produção, compras, estoque, requisição, validade, documento fiscal, insumos, onboarding) | 283 de 284 (a falha é a conhecida da 0.2, `_prisma_migrations`) |
| Dono sem RLS, os mesmos 15 | 276 passando, 8 pulados |
| Migration da 3.4 com dado antigo nos 3 perfis | 3 passando |
| Ataques do Guardião (`rev34/t`, 5 arquivos) como superusuário, dono com RLS e dono sem RLS | 20/20 em cada; todo SQL cru recusado; 300 dpi: 0 diferença (antes 56) |
| Jornada curta (build de produção) | 31 de 31: lote vencido bloqueado (painel, lote, emissão, papel antigo); sem Zebra no tablet, .zpl e papel não tiram da fila; papel A4 com 2 cópias = 1 folha (PDF); "Já imprimi" tira, com quem e quando; Zebra muda = "Sem resposta"/"Sem resultado"; "Paper out" em palavras; Zebra aceita = sai da fila; histórico com "Já imprimi" |
| Matriz das telas mexidas × dona/operador × 390/820/1180/1440 × claro/escuro | 224 medições: 0 rolagem lateral, 0 violação do axe, 0 erro de console, nenhum alvo abaixo de 44 px com toque (depois do "Ver o estoque"), um h1, nenhum R$ nas telas de etiqueta |

## Rodada final da 3.4

Os dois fiscais aprovaram a rodada 1, com um ponto de segurança do alimento e menores (decisões 425–428; 402, 408, 418 e
423 corrigidas no lugar):

- **Embalagem sem prazo vence com o lote** (425): `limiteDeUso` = a validade gravada ou, sem ela, o fim do dia do vencimento
  do lote no Rio. Depois disso não emite, não imprime (Zebra, arquivo, papel novo e antigo), não confirma, sai da fila e o
  painel diz "venceu: não use". A etiqueta continua sem data de validade.
- **"Já imprimi" × Zebra** (426): pedidos lidos com `FOR UPDATE`; sem erro cru; o gatilho recusa pedido que nasce confirmado
  e confirmação no futuro.
- **Versão do layout** (427): é a 1; `desenhoDaEmissao` desenha pela versão gravada (versão desconhecida não imprime).
  Mudou o desenho? Versão 2 ao lado da 1. `emissaoParaArquivo` saiu.
- **Telas** (428): o sem prazo em duas linhas na etiqueta; "Etiqueta emitida: ela espera a impressora."; histórico com
  detalhes curtos e o cartão "Esperando o Já imprimi".


**Resultado da prova da rodada final (2026-10-23)**

| Prova | Resultado |
|---|---|
| `typecheck`, `lint`, `gate` (710 arquivos), `build` (e7d44fb) | limpos |
| `erp:conferir-migracao` e `migrate diff` (banco novo por `migrate deploy`) | conferido; vazio |
| `vitest` sem banco | 68 arquivos rodam, 1.710 passando |
| `vitest` com banco, superusuário, banco novo, em 4 blocos | 68 arquivos, 999 testes, todos passando |
| Dono NÃO-superusuário com FORCE RLS (migrations pelo dono), os 15 arquivos | 287 de 288 (a conhecida da 0.2, `_prisma_migrations`) |
| Dono sem RLS, os mesmos 15 | 280 passando, 8 pulados |
| Migration da 3.4 com dado antigo nos 3 perfis | 3 passando (nasce confirmado e confirmação no futuro recusados) |
| Ataques do Guardião (`rev34/t`, 27 testes) nos 3 perfis | 27/27 em cada, nenhum achado; sem prazo + lote vencido: nada emite, imprime nem confirma; corrida "Já imprimi" × Zebra: 20 rodadas, 0 erro cru |
| Jornada da rodada (build de produção) | 14 de 14: embalagem sem prazo de lote vencido bloqueada (painel, abertura, emissão, papel); o sem prazo em duas linhas na prévia (285 de 480 pontos); "Etiqueta emitida: ela espera a impressora."; histórico com "Esperando o Já imprimi", sem cartão cortado a 1440 e a 390 |
| Matriz das telas mexidas × dona/operador × 390/1180/1440 × claro/escuro | 48 telas: 0 rolagem lateral, 0 axe, 0 alvo abaixo de 44 px, um h1, nenhum R$ |

## Prioridade nº 1 (23/10) — ajuda por ponto, em card flutuante (24/10/2026)

Pedido de Rodolfo: trocar o texto didático fixo por ajuda sob demanda, junto do campo, seção ou ação que ela explica. Evolução da 0.6 (mesmo registro, mesma preferência por pessoa), não outro sistema. Decisões 433–436.

**O que mudou na tela**

- Botão `?` discreto ao lado dos campos e seções (`<PontoDeAjuda ponto="...">`, `src/components/erp/ui/ponto-de-ajuda.tsx`). Abre um card flutuante único (`src/components/erp/shell/pontos.tsx`): etiqueta "Como funciona", título, explicação curta, "Ver passo a passo" (abre a gaveta na seção certa, quando existe) e "Não mostrar novamente"; X para fechar. Sem botão de vídeo: não há vídeo.
- Cadastrar insumo: tipo, marca, conservação, prazo após abertura, unidade/embalagem/custo. Montar a ficha: prato ou pré-preparo, descrição comercial, foto, rendimento, etapas.
- Continua à vista o que é indispensável para agir: rótulos, obrigatório, unidades, erros, alertas, a linha curta do tipo, a categoria sugerida, os formatos da foto e "não é a data de vencimento impressa no lote".

**Regras** (confirmadas em 23/10; ver decisão 433)

- Abre sozinho na 1ª visita e de novo 7 dias depois da última abertura automática; uma abertura automática por visita, na ordem da tela; nunca junto com a caixa "Como funciona" ou a gaveta; nunca com as dicas desligadas ou no nível 1.
- X/Escape dispensa agora sem perder nada; "Não mostrar novamente" corta a abertura automática; o botão abre sempre.
- Abertura automática: não rouba foco, não rola a página, avisa o leitor de tela. Abertura manual: foco no card, a página sobe se o card cobrir o campo, Escape devolve o foco ao botão.

**Onde mora**

- Texto: `ajuda-textos.ts`, campo `pontos` da entrada da tela (1 a 3 frases, mesmo lint da 0.6; um teste reprova botão sem texto no registro). Fora do `ajuda.lock.json` (decisão 434).
- "Já viu": `PreferenciaErp.pontos` (migration aditiva `20261111000000_erp_ajuda_pontos`), `chave.ponto=DIA` ou `=x`, dia de Brasília calculado no servidor, lista branca, gravação atômica, teto 300 com CHECK. "Mostrar as dicas de novo" zera também os pontos.

**Provas desta rodada** (Postgres 16 local, dados isolados; produção não verificada)

- Suíte completa com banco: **143 arquivos, 2.747 aprovados, 46 pulados, 0 falhas** (linha de base antes da mudança: 141 / 2.712 / 46 / 0). Os 46 pulados são as variantes que exigem papéis de banco não-superusuário, como nas rodadas anteriores. Novos: `tests/erp-ajuda-pontos.test.ts` (regras, dia de Brasília, lista branca, lint, cobertura dos botões) e `tests/erp-ajuda-pontos.db.test.ts` (gravação, "não mostrar" que não volta, duas abas, teto e CHECK, sem sessão nada grava, papel do tenant sem acesso). O teste com banco pegou um item duplicado no "visto" do mesmo dia, corrigido antes do commit.
- Lint, typecheck e portão de conteúdo limpos.
- No navegador (app local, dona de teste): 1ª visita só a caixa da tela; visita seguinte o card abre sozinho com o foco no campo de nome; Escape fecha; o mesmo ponto não volta e o próximo abre na visita seguinte; abertura manual leva o foco ao título e devolve ao botão; trocar de ponto mantém um card só; o formulário preservado; "Ver passo a passo" abre a gaveta; "Não mostrar novamente" fecha e grava. A 1440×900, 1180×820, 820×1180, 390×844 e 844×390: sem rolagem lateral e card dentro da tela; com toque, botão de 44 px e o campo fica visível acima do card.
- Teste com pessoa operadora e gestora reais: **não feito**.

**Referências Kairu (regra do plano):** busca na biblioteca por ajuda contextual, onboarding, tooltip e card flutuante sem resultado; a Formação recusa (matrícula da Turma 05 em diante). A referência visual seguida é a imagem aprovada por Rodolfo (card no canto inferior direito), adaptada aos componentes do ERP, sem marca de terceiros.

**Base:** o bloco N (N.1–N.5, branch `bruce/admiring-pascal-4qnypz`, sem merge na master) foi integrado nesta branch antes, porque a N.5 mexeu na ajuda: merge sem conflito.

**Próximo passo:** estender os pontos às outras telas com texto fixo longo (embalagem de compra, compras, produção, DRE) e decidir se a caixa "Como funciona" da tela também vira card (hoje continua como na 0.6).

## N.1 — custo médio ponderado por loja (24/10/2026)

Decisões 437 a 440. Prospectivo: cada loja nasce no método antigo (último preço da rede) e só muda quando a FlowFoods liga em **Rede e Equipe › Custo médio por loja** (nível 1). Nada em produção muda sem esse clique.

| Peça | Onde |
|---|---|
| Marco e diferença de base | `Loja.custoMedioDesde`, `Loja.custoMedioPonteCentavos` (migration `20261112000000_erp_custo_medio_loja`) |
| Método de cada movimento | `MovimentoEstoque.valorMetodo` (`INFORMADO`, `MEDIA_LOJA`, `ESTORNO`, `REFERENCIA`, `SEM_CUSTO`) |
| Custo desconhecido | `SaldoEstoque.valorIncompleto` |
| Regra pura | `valorPelaMediaDaLoja`, `aplicarNosSaldos` em `src/lib/erp/estoque-campos.ts` |
| Gravação | `gravarMovimentos` em `src/lib/erp/estoque.ts` (lê `lojasComCustoMedioEm`) |
| Custo para as telas | `custosPorLoja` / `custosDaLoja` (média do livro; incompleto = sem custo) |
| Impacto e troca | `src/lib/erp/custo-medio.ts`, página `/rodolfo/erp/[slug]/custo-medio` |
| Aviso no DRE | `trocasDeCustoNoPeriodo` em `src/lib/erp/dre.ts` |

### Provar a N.1

```
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff npx vitest run tests/erp-custo-medio.test.ts tests/erp-custo-medio.db.test.ts tests/erp-custo-duas-lojas.db.test.ts
```

O aceite sintético do Notion (A e B com 10 kg a R$ 10; A compra 10 kg por R$ 200) fecha com CMV real de R$ 20 em B (antes: −R$ 100) e R$ 90 em A. A loja sem marco segue no método antigo (`erp-custo-duas-lojas.db.test.ts` continua passando).

### Antes de ligar em produção

- Ler o impacto de cada loja: linha com "valor negativo" ou "resíduo" vem de lançamento antigo e merece olhar antes.
- Ligar logo depois de um fechamento deixa o período seguinte inteiro no método novo e evita o aviso de troca no DRE.

## F4 — jornadas da ficha e dos insumos (24/10/2026)

Decisões 441 a 446. Nada publicado; sem merge.

| Entrega | Onde | Prova |
|---|---|---|
| Filtro da lista de fichas pelo farol do CMV num canal (servidor, lista inteira; só `precos.ver`) | `listarFichas`, `lerFiltroDoCmv` | `erp-cmv-produto.db.test.ts`, `erp-fichas.test.ts` |
| Busca do item da ficha pelo nome ou categoria | `seletor-campos.ts`, `fichas/seletor-de-item.tsx` | `erp-seletor-item.test.ts` |
| Caneta e lixeira na lista de fichas (a lixeira desativa) | `fichas/[id]/remover`, `lerRemocaoDaFicha` | `erp-subfichas.db.test.ts` |
| Consumo imediato (ficha, lote, etiqueta) | migration `20261113000000_erp_consumo_imediato` | `erp-consumo-imediato.db.test.ts`, `erp-producao.db.test.ts` |
| Fotos principal e de apoio | migration `20261114000000_erp_ficha_fotos_apoio`, `ficha-fotos.ts`, `fichas/[id]/fotos` | `erp-fichas.db.test.ts` |
| Categorias em painel na lista de insumos e troca em lote | `insumos/painel-categorias.tsx`, `barra-categoria.tsx` | `erp-categorias.db.test.ts` |

**Pendente da F4:** recorte opcional das fotos; fotos de apoio na impressão; seções do cardápio e farol principal de CMV (especificação própria no plano).

## Reorganização visual e estrutural — rodada 1 (24/10/2026)

Prioridade definida por Rodolfo em 24/10 (Notion, "Revisão aprofundada iFood"). Decisões 449–452. Sem merge e sem deploy.

| Entrega | Onde | Prova |
|---|---|---|
| Explicação da tela no card flutuante (linha "Como funciona esta tela"; 1ª visita e 7 dias; "Não mostrar novamente" por versão) — as 89 telas | `shell/ajuda.tsx` (`CaixaDeAula`), `shell/pontos.tsx` (ponto `tela`), `PONTO_DA_TELA` em `ajuda-rota.ts`, lista branca em `ajuda.ts` | `erp-ajuda.test.ts`, `erp-ajuda-pontos.test.ts` |
| Véu vermelho clarinho no card e na gaveta da ajuda; tocar fora fecha | `--ff-veu-ajuda` em `tokens.css` | navegador (abaixo) |
| Onde é usado (detalhe) e alcance (editar) | `lib/erp/onde-e-usado.ts`, `insumos/onde-e-usado.tsx` | `erp-onde-e-usado.db.test.ts` |
| Vocabulário e larguras (Fichas técnicas, Áreas da Rede, Precificação no tablet, seletor de visão, ações no card do celular) | `modulos.ts`, `fichas/canais.tsx`, `SeletorVisao.tsx`, `insumos/lista.tsx` | `erp-navegacao.test.ts`, `erp-shell.test.ts` |
| Mapa de navegação, proposta e os quatro modelos de tela | `docs/NAVEGACAO.md` | — |

**Testes (Postgres 16 local, dados isolados):** suíte completa com banco 148 arquivos, 2.811 aprovados, 46 pulados (as variantes que exigem papéis não-superusuário, como antes), 1 falha — o teste com banco fixava a versão 3 do texto de Fichas, que subiu para 4 com o título novo; corrigido para ler a versão do registro e o arquivo reexecutado: 13/13. Lint, typecheck e portão de conteúdo limpos.

**No navegador (app local, banco de teste, Dona e Operador da Casa Alfa):** 1ª visita abre o card da tela sozinho com o véu; clicar fora, X e Escape fecham; a linha reabre; a 2ª visita no mesmo dia não reabre; outra tela abre a dela; botão de campo troca o conteúdo (um card só); "Não mostrar novamente" fecha e grava. Lista filtrada → detalhe (Onde é usado com 2 fichas) → "Voltar para a lista" mantém o filtro; editar mostra o alcance e "Ver quais" leva ao painel. 1440, 1180×820, 1024×768, 820×1180, 390×844 e 844×390: card dentro da tela e sem rolagem lateral. Tema escuro (1180×820, Operador): card legível e véu visível. **Não feito:** teste com pessoas do Valentin's, aparelho real, produção.

**Próximo passo:** validar a proposta de `docs/NAVEGACAO.md` com operador e gestor; estender a ajuda ao painel do Barney (`/rodolfo`, hoje fora do registro de ajuda); revisar as outras telas com coluna lateral de 340 px a 1024 px.

## Gráficos e análises — referência Nina (24/10/2026)

Pedido de Rodolfo: criar gráficos e análises a partir dos módulos da Nina, evoluindo o ERP. Decisões 453 e 454. Sem merge e sem deploy. Análise completa no Notion: "Nina × FlowFoods — análise visual e funcional dos 8 módulos".

| Entrega | Onde | Prova |
|---|---|---|
| Componente de gráfico de colunas (SVG próprio, dica, legenda, tabela) e cores dos canais validadas | `ui/grafico-colunas.tsx`, `lib/erp/grafico.ts`, `--ff-serie-*` em `tokens.css` | `erp-graficos.test.ts` |
| Faturamento por dia e canal | `telas/faturamento/mes.tsx` (`GraficoDoMes`) | navegador |
| Saúde do cardápio e célula de canal enxuta | `lib/erp/saude-do-cardapio.ts`, `telas/fichas/saude.tsx`, `telas/fichas/lista.tsx` | `erp-graficos.test.ts`, `erp-painel-do-dia.db.test.ts` |
| Início de trabalho (indicadores e pendências por permissão) | `lib/erp/painel-do-dia.ts`, `telas/painel-do-dia.tsx`, `hub-do-parceiro.tsx` | `erp-painel-do-dia.db.test.ts` |

**No navegador (app local, mês sintético de faturamento, Dona):** gráfico a 1440 (claro), 1180 (escuro) e 390 (celular), dica ao passar o mouse com as três séries e o total, dias com falta marcados, sem rolagem lateral. Saúde do cardápio e Início nos mesmos tamanhos. **Não feito:** teste com pessoas do Valentin's e produção. Os prints originais da Nina não foram abertos (o portal da Kairu é bloqueado na rede do ambiente).

**Rodada 2 (decisão 455):** barras horizontais em três telas.

| Entrega | Onde | Prova |
|---|---|---|
| Componente de barras horizontais (valor escrito, traço da meta, resto em cinza) | `ui/barras-horizontais.tsx` | navegador |
| CMV por categoria: realizado × meta | `telas/dre/cmv-categorias.tsx` (`RealizadoXMeta`) | navegador |
| Compras do período: por fornecedor e por categoria | `lib/erp/compras-relatorio.ts` (`distribuicaoDoRecorte`), `telas/compras/relatorio-partes.tsx` (`ParaOndeFoiODinheiro`) | `erp-compras-relatorio.db.test.ts` |
| Produção: rendimento por preparo | `lib/erp/producao-equipe-campos.ts` (`produzidoPorFicha`), `telas/producao/indicadores.tsx` | `erp-graficos.test.ts` |

**No navegador:** os três painéis com dados sintéticos a 1440 (claro), 1180 (escuro) e 390, sem rolagem lateral. O banco local não tem compras nem lotes; as telas de verdade foram conferidas pelos testes com banco.

**Próximo passo:** simulador de preço na ficha; evolução do CMV por categoria em linhas (6 períodos).

## Roteiro E1–E3 — jornada piloto percorrida e rotas por destino (24/10/2026)

Seguindo "COMEÇAR AQUI" (Notion). Decisão 456. Sem merge e sem deploy.

| Entrega | Onde | Prova |
|---|---|---|
| Rascunho lido uma vez por visita (a ficha não volta vazia depois de cadastrar o insumo) | `telas/cadastro/rascunho.tsx` | navegador (roteiro da jornada) |
| Insumo cadastrado entra numa linha da receita (vazia ou nova) | `lib/erp/ficha-campos.ts` (`colocarInsumoCriado`), `telas/fichas/form-ficha.tsx` | `erp-graficos.test.ts`, navegador |
| Rotas afetadas por destino (98 páginas, permissão de entrada de cada uma) | `docs/NAVEGACAO.md` §6 | lido do código |

**Jornada piloto (passos 1–9 do roteiro), app local, Dona e Operador, 1440 e 390:** lista com busca → detalhe com "Onde é usado" e volta com a busca → ficha nova com nome, rendimento e item → "Insumo que falta: cadastrar" com o nome levado → erros por campo sem perder o digitado → "Cadastrar e voltar" → ficha recuperada com aviso e o insumo novo na linha 2 → salvar → reabrir com 2 itens → "Onde é usado" do insumo novo lista a ficha → operador abre a ficha sem R$. **Não feito:** validação com operador e gestor do Valentin's; o mesmo percurso na nota de compra e nas embalagens foi coberto pela mesma correção, sem roteiro próprio.

**E4 · compras (decisão 457):** jornada da nota percorrida no app local a 1440 e 390 com Dona e um Gerente de uma loja (pessoa de teste criada só no banco local). Lançar nota → fornecedor novo pelo atalho (volta escolhido, número/loja/itens recuperados) → insumo que falta (volta numa linha nova) → total errado barrado → lançar → nota e insumo no relatório do período, painel de fornecedor e categoria com a soma certa → Gerente: só a loja dele no formulário, nota de outra loja fora das linhas mesmo pedindo a loja na URL, endereço direto 404. Corrigido: o insumo criado entra na nota sem linha vazia (`colocarInsumoCriado` genérico, testado). **Não feito:** conferência de nota recebida por XML (precisa de XML de teste no fluxo do navegador; o motor tem testes com banco).

**E4 · estoque (decisão 458):** jornada percorrida no app local com Dona, Gerente de uma loja e Operador: abertura com contagem (computador e celular), conferência e conclusão, compra que entra no saldo, requisição pedida pelo Operador e entregue pelo Gerente, Consumo e conciliação fechando a conta (0 + 300 + 100 − 50 = 350) sem R$ para o Operador. Ajustado: largura do campo "Solto" no celular. **Pendente de decisão:** o Operador vê o valor do saldo na tela do estoque da loja (pergunta 2 da decisão 397). **Não feito:** divergências de uma contagem com diferença e fechamento do período (1.7) pelo navegador.

**R$ do estoque (decisão 459):** o operador lê só quantidades em todas as telas de estoque (loja, visão geral, período, cobertura, conferências, saldo no insumo). Prova: `erp-estoque.db.test.ts` (nada de valor no retorno para o operador) e navegador (nenhum R$ nas telas do operador a 390 e 1440; gerente e dona continuam vendo).


**E4 · produção, lote e etiqueta (decisões 460 e 461, 25/10/2026):** jornada 3 percorrida no app local (build de produção,
porta 3100, banco `ff_app` preparado pelas regras do sistema: Casa Alfa do seed, estoque da Vila da Penha aberto e duas
fichas de pré-preparo; roteiros `scratchpad/jornada3/p1…p6`, fora do git). Pessoas: Dora (Dona), Gil (Gerente da Penha),
Otto e Duda (Operador, cozinha da Penha).

| Passo | O que se viu | Perfil e tamanho |
|---|---|---|
| Lista do dia | Molho cheddar 5 kg + Cebola caramelizada 3 kg; a conta fecha (cebola 5,835 kg × 5 kg = falta 835 g; óleo 1,05 L; cheddar 3 kg); compra estimada R$ 3,59 só para o Gerente | Gil 1440; Otto 390 lê sem R$ e sem formulário |
| Gerar | 261025-01 e 261025-02 com as requisições #1 e #2; "Gerar" some; o estoque não muda (cheddar 6 kg, cebola 5 kg) | Gil 1440 |
| Pegar | Otto pega o molho (botão de 56 px, "Você está como Otto", sem R$); Duda vê "com Otto" e pega a cebola; o estoque não muda; Concluir fechado com "Falta o estoque entregar os insumos" | Otto 390 toque; Duda 820 toque |
| Entregar | #1 inteira; #2 com a cebola que restava (4,115 kg) e "Encerrar o resto"; cada baixa entra uma vez (cheddar 6 → 3 kg, óleo 4 → 2,95 L, cebola 5 → 0) | Gil 1440 |
| Concluir | Otto: 4,6 kg (92%, faltaram 400 g), refrigerado, volta às Tarefas, "4,6 kg de 5 kg · rendeu 92%", sem R$; Duda: 2,5 kg (83,3%) sem motivo é recusado pelo servidor com a frase no campo e o digitado fica; com o motivo, conclui. Entradas no estoque: +4,6 kg (R$ 138,74) e +2,5 kg (R$ 20,63) | Otto 390; Duda 820 |
| Etiqueta | 2 etiquetas de 2,3 kg (E261025-0001), prévia, arquivo .zpl com lote, validade (28/10 08:58) e responsável, "Já imprimi" registrado; saldo do molho e livro do estoque iguais antes e depois (sem nova baixa); nada de R$ | Otto 1180 toque |
| Histórico | os 2 lotes, "fora de ±10%", o motivo da Duda, tempo; Otto sem R$, Gil com R$ 138,74 e R$ 20,63 | Otto 390; Gil 1440 |
| Indicadores | Duda e Otto em ordem alfabética, "amostra pequena", sem R$; rendimento por preparo com dado real: Cebola caramelizada 83,3% (fora de ±10%), Molho 92%; o Operador volta ao início | Gil 1440 |

**Matriz:** 11 telas da jornada × 6 tamanhos (1440, 1180, 1024, 820, 390, 844×390) × claro e escuro × Dona, Gerente e
Operador = 396 telas: 0 rolagem lateral, 0 erro de página, e o Operador sem R$ no conteúdo (inclusive o escondido) e sem
nenhum valor de custo da jornada no HTML. **Achados corrigidos:** (1) o Operador abria a requisição do lote e lia o valor de
cada saída (decisão 460); (2) a 1024 o cabeçalho passava da tela (até 86 px com a Dona) — os botões da direita não encolhem a
partir de 1024 e a trilha cede, com os níveis do meio em "…" abaixo de 1280, recorte na própria caixa, o nome da tela atual
por último a encolher e o "Ctrl K" só a partir de 1280 (decisão 461). **Revisor de UX (independente):** aprovado com
ressalvas; os achados de tela da produção seguem na rodada de acabamento (abaixo).
**Observação:** o pacote da ajuda (texto fixo, igual para todos, desde a 0.6) vai inteiro ao navegador e tem exemplos com
R$ ("saco de 5 kg por R$ 25"); não é dado da operação. **Não feito:** validação com a cozinha e a gerência do Valentin's;
impressão física na Zebra (sem impressora aqui); aparelho real.

**E4 · produção, rodada de acabamento (decisão 462, 25/10/2026):** os "deveria" do revisor de UX resolvidos sem regra nova:
"fora de ±10%" no lote, nas Tarefas e no quadro; "Não saiu" no lote quando a requisição foi encerrada com corte; a falta do dia
(no estoque e a produzir) dita junto do "Gerar os lotes" (`faltasDaConta`); "Imprimir a etiqueta do lote" (56 px) na confirmação de concluir
pelas Tarefas, sem falar de custo; Tarefas que se atualizam sozinhas (`telas/producao/atualizar-sozinho.tsx`: a cada minuto e
ao voltar à tela, não enquanto alguém digita; a confirmação fica e a tela não rola de novo até ela); a etiqueta do lote avisa
no alto que já foi emitida, com "Reimprimir"; no quadro, "Tarefas da cozinha" como ação principal para quem não planeja.
**Provas:** testes com banco nas telas (lote fora da faixa e "Não saiu", botão principal por perfil, etiqueta depois de
concluir com e sem permissão e com lote de fora, aviso de etiqueta já emitida) e teste puro da frase de falta; navegador:
Otto pega um lote no tablet, o Gerente entrega a requisição em outra tela e, sem recarregar, o Concluir aparece na tela do
Otto; concluir mostra o botão da etiqueta (56 px) e ele leva à etiqueta do lote; o relógio de 1 minuto pede os dados de
novo sem foco nem recarga; lista de amanhã com a falta de Cebola roxa (4,95 kg) junto do botão. **Fiscal independente:** aprovado com ressalvas; os 4
"deveria" (confirmação que sumia e fazia a tela pular, frase do concluído que prometia validade, falta atribuída ao lote a
gerar, "Não saiu" no lote cancelado) corrigidos antes do commit.

**E4 · pendências das jornadas 1 e 2 (decisão 463, 25/10/2026):** percorridas no app local, sem mudança de código.

*Jornada 2 — contagem com diferença, divergências e fechamento do período.* O Gerente planeja a contagem do refrigerado (o lugar
todo, 6 insumos); o Otto conta no celular (390, toque) com diferença — molho 5 kg contra 5,55 no livro, bacon 2,9 contra 3 —, com
"Não tem" nos zerados e os números mantidos ao recarregar, sem R$; não fecha sozinha (o molho passa da tolerância de R$ 5,00); a
conferência mostra −550 g (R$ 15,26 a menos · confira) e −100 g (R$ 4,29) ao Gerente e só as quantidades ao Otto (nem no HTML); o
Gerente aplica e o livro fica molho 5 kg, bacon 2,9 kg, cheddar 2,4 kg. Divergências do período: o bacon como "sumiu sem
requisição" (−100 g, R$ 4,29; duas contagens, ninguém pediu); o molho fica de fora porque só tem uma contagem (o cruzamento pede
contagem nas duas pontas); "requisitado sem contagem para cruzar" lista cebola e óleo; o Operador não abre a tela. Fechamento: no
banco local, regra semanal desde 19/10 gravada direto (a tela só muda a regra a partir do próximo período, decisão 144), para a
semana 19–25/10 terminar hoje; o Gerente começa o fechamento (lista vazia: tudo já contado no período, cobertura 100%), confere e
fecha — "Período fechado", estoque final fotografado em R$ 1.078,43. Matriz: 6 telas (período, contagem, conferência, fechamento,
divergências, estoque) × 6 tamanhos × 2 temas × Gerente e Operador = 144 telas, sem rolagem lateral, sem erro e o Operador sem R$.

*Jornada 1 — conferência de nota por XML.* O Gerente da Penha sobe o XML sintético (nota 4521) com a loja sem CNPJ: recusa em frase
("Nenhuma loja sua tem o CNPJ 11.444.777/0001-61… Cadastre o CNPJ da loja"), só a loja dele citada, nada gravado; a Dona cadastra o
CNPJ em Lojas (dígito errado recusado no campo); de novo, a nota vira documento "Aguardando conferência" com o fornecedor "a
completar"; o Gerente liga bacon (2 CX → 20 kg) e guardanapo (1 FD → 500 un), cadastra a mussarela pelo "Insumo que falta: cadastrar"
(nome levado, categoria sugerida) e volta com as escolhas; "3 PC → 6 kg", 3 de 3 ligados, R$ 550,00 + frete R$ 30,00 = R$ 580,00
"confere"; data de entrada trocada para hoje (a emissão, 21/10, é antes da abertura); a prévia mostra o custo novo de cada insumo e
"Nada foi gravado"; conciliar lança UMA nota (IMPORTACAO, R$ 580,00), o estoque sobe uma vez (bacon 2,9 → 22,9 kg, guardanapo 500
un, mussarela 6 kg), a nota diz que veio do XML e não tem "Editar"; o mesmo arquivo de novo é "já recebida"; o Operador não acessa.
Matriz: 4 telas × 6 tamanhos × 2 temas × Gerente e Dona = 96 telas, sem falha. **Observação (não mudou):** a parte "Estoque" da
prévia é uma frase ("Entra no estoque da Vila da Penha ao lançar"); as quantidades estão em cada item ("2 CX → 20 kg").
**Não feito:** validação com o Valentin's; XML real de fornecedor (só o sintético).

**E4 · resultados, composição e fechamento — jornada 4 (decisão 464, 25/10/2026):** percorrida no app local (build de produção,
banco `ff_app`, Casa Alfa de teste), com dados entrando pelas telas: a Dona tira o salão da loja só-delivery (canais Delivery ·
iFood), importa a planilha de outubro (01/10 a 24/10, 120 lançamentos de loja × canal × dia, prévia "120 novas · 0 com erro"),
configura a taxa do iFood (12 % + 3,2 %) e lança aluguel das duas lojas, contador da rede, folha e um conserto de um dia; o Gerente
da Penha lança a luz (só a loja dele no formulário); a Dona lança duas notas no período de agora (R$ 861,50 e R$ 495,90).
*Conferência dos números:* 01/10 a 18/10 receita R$ 180.301,75 (loja R$ 48.501,33 · delivery R$ 36.872,96 · iFood R$ 94.927,46,
igual à planilha), aluguel R$ 8.100,00 (18/31 de R$ 9.300,00 + 18/31 de R$ 4.650,00), taxa do iFood por loja com um arredondamento,
resultado R$ 143.672,78; período de agora até ontem (24/10) com 6/31 das despesas do mês e CMV pelas compras R$ 1.357,40 (as duas
notas), aberto por categoria (Proteína R$ 540,00, Laticínios R$ 315,50, Embalagens R$ 310,00…). *Fechamento:* antes da taxa, "Houve
venda no iFood e a taxa do iFood não está configurada" (com "Configurar a taxa"); depois, "Nenhuma condição pendente"; a Dona fecha
01/10 a 18/10 — o DRE fechado bate linha a linha com o ao vivo na rede e em cada loja; o Gerente vê o fechado da loja dele, sem
fechar. *Isolamento:* o Gerente só recebe a Vila da Penha (também com `?rede=1` e `?loja=<outra>`); o Operador não abre DRE, CMV por
categoria, despesas, períodos nem faturamento.
*Achado e mudança (decisão 464):* nenhum número do DRE abria o que o forma. Agora o valor de cada despesa abre a composição (cada
despesa, os dias no recorte e a parte que entra; soma = número do DRE) → a despesa → volta para a composição → volta para o DRE;
"Pelas compras" abre o relatório de compras do recorte (na rede, as lojas por extenso) → linha → nota; o CMV abre o CMV por
categoria → a categoria abre as compras dela (só quando o destino soma o mesmo) → nota; a receita ganha "Lançamentos de <mês>"; o
painel compra × real, "Ver as compras de dd/mm a dd/mm". Importação de faturamento diz "lançamentos", não "dias".
*Roteiros:* `scratchpad/jornada3/j4a…j4g` e `j4-matriz.mjs` (fora do git).
*Fiscais:* revisor de código/QA e guardião de isolamento, aprovados com ressalvas e sem vazamento; corrigido antes do commit: na
rede, o relatório de compras herdava a loja escolhida no topo (as lojas agora vão por extenso no endereço); categoria com
pré-preparo comprado em nota não abre (o relatório somaria diferente do painel); o painel abre as linhas; o título da composição
sem loja; testes que comparam o total da tela de destino, o nível 1 e quem só lança despesas. *Checks:* suíte com banco 151
arquivos, 2.844 aprovados, 46 pulados, 0 falhas; lint, typecheck e gate limpos; teste novo `erp-dre-composicao` (9 casos, com
banco) e 3 puros em `erp-dre.test`; navegador: jornada de composição com 23 conferências e o nível 1 (composição e voltas com a
raiz do parceiro). **Não feito:** validação com o Valentin's; dados reais de faturamento.
*Acabamento (decisão 465):* revisor de UX aprovou com ressalvas (6 "deve", 8 "deveria"); aplicados: a composição abre com o número,
o período pelo nome e a situação ("Parcial · até ontem", "Período fechado"); tabela só a partir de 1280 px (a 1024 cortava "Entra
no DRE"); número sublinhado com alvo de 44 px por fora, sem crescer a linha (a 390 com toque, a linha do aluguel fica com 44 px);
ponto de ajuda "De onde vem este número"; "Voltar para Aluguel no DRE" no detalhe; "Voltar para o DRE" na linha de onde veio;
textos sem "recorte", "competência" e "rateio"; "O valor sublinhado abre o que forma o número" no DRE e no CMV por categoria.
Jornada de novo no navegador: 23 de 23; suíte com banco 151 arquivos, 2.845 aprovados, 46 pulados, 0 falhas; lint, typecheck e
gate limpos.
Matriz (antes e depois do acabamento): 9 telas (DRE de agora, fechado e de uma loja, composição de agora e do fechado, despesa com
volta, CMV por categoria, compras da categoria, importação) × 6 tamanhos × claro e escuro × Dona, Gerente e Operador = 324 telas,
0 falhas: sem rolagem lateral, sem tabela cortada na própria caixa, sem erro de página; o Operador redirecionado em todas, sem R$.

**E5.1 · painel do nível 1 com os padrões do ERP, primeira fatia (decisões 466 e 467, 25/10/2026):** E0 conferido antes de mexer
(13 páginas do painel `/rodolfo` × 6 tamanhos × claro e escuro, 156 telas sem erro). Revisor de UX independente: 10 "deve", 12
"deveria", 6 sugestões; esta fatia fez os 10 "deve" (466): nomes em português para todo status do banco e para o toque
("1ª mensagem (dia 0)"), um botão principal por estado na Cadência, Hoje com frases de ação, Config recusando salvar sem dia,
contagens certas em Visitas, etapa não medida como "—" em Métricas, avisos do ERP no lugar das caixas de borda colorida, filtro
"Sem classificar" na Inbox, Portal sem o caminho do servidor e com o "apagar respostas" num bloco fechado.
*Régua de rolagem lateral:* na emulação de celular o `innerWidth` cresce com a página e escondia a rolagem; os roteiros passaram a
medir `scrollWidth − clientWidth`. Varredura de todas as telas alcançáveis pelos links a 390, 820 e 844×390 (Dona no ERP, 780; o
Rodolfo no painel, 960): 1 no painel (Portal, o caminho do servidor, já retirado) e 18 no ERP (faturamento do dia a 820, menu da
pessoa 1 a 6 px fora — os botões da direita do topo não encolhem mais desde 640 px; reconferido em 180 telas, Dona e Gerente, de
640 a 1180: 0).
*Revisor de código e segurança:* reprovou a primeira versão com 2 bloqueantes — o botão de envio sumia depois de cada envio do
aquecimento (levando a confirmação junto) e o lote cancelado continuava enviando, pelo botão e pelo worker com aprovação
automática — e 5 "deveria" (botão sem lote, plural e nome de botão antigo no texto do aquecimento, Hoje mandando fazer os 10 envios
com o número aquecido, vazio errado da Inbox filtrada, código do banco ainda na tela). Corrigidos (467): decisão dos botões numa
função pura (`telaDaCadencia`), espera com o botão desabilitado e a tela que se atualiza sozinha, cancelado recusado em
`dispararProximo` por todos os caminhos, "Enviar o próximo" esperando a aprovação do lote como o worker, recusas sem código
(`textoDaRecusa`). Reconferência: **aprovado**. O "deveria" que sobrou ("Montar de novo" tirava a aprovação de lote aprovado e
reescrevia a fila em envio) também foi corrigido.
*Achado do passeio:* "Montar lote" quebrava em banco sem modelos de texto (`upsert` com categoria nula na chave composta, recusado
pelo Prisma); num banco novo, o primeiro lote nunca saía. Corrigido (procura e cria só o que falta).
*Navegador (build de produção, banco local com 4 leads fictícios montados e apagados no fim; sem Evolution configurada, todo envio
é simulação):* Cadência em 8 situações a 390 (sem lote com disparo desligado, aguardando aprovação, aprovado aquecendo, logo depois
de um envio, cancelado, lote vazio, WhatsApp fora, aguardando com aprovação automática) — os botões e o motivo de cada uma batem com
o servidor; a espera de 5 s libera o botão sozinha; cancelar e montar de novo volta para "Aguardando aprovação" com "2 leads no lote
de hoje."; "Simular o lote" → "2 mensagens simuladas. Nada foi enviado.". Hoje, Inbox filtrada, Lead 360, Visitas, Config (dias
desmarcados recusados) e Portal em claro e escuro: sem código do banco, sem rolagem lateral, sem erro de página. Matriz do painel
com o cenário montado: 15 telas × 6 tamanhos × 2 temas = 180, 0 falhas; Cadência e Hoje de novo depois da última mudança: 24, 0.
*Checks:* suíte com banco 153 arquivos, 2.871 aprovados, 46 pulados, 0 falhas; lint, typecheck e portão limpos; testes novos
`rodolfo-painel-e5` (rótulos, botões da Cadência em 12 casos e 61 combinações, dia forjado na Config) e `rodolfo-lote-disparo`
(cancelado, aprovação, seed dos modelos, "Montar de novo" em lote aprovado). **Não feito:** a fila de "deveria" da revisão de UX
(próxima fatia da E5.1); validação com pessoas reais; nenhum envio de verdade (piloto E5.2).

**E5.1 · painel do nível 1, segunda fatia (a) (decisão 468, 25/10/2026):** os "deveria" S3, S4, S5, S9, S10, S11 e S12 da
revisão de UX. Importação de leads em tela própria (`/rodolfo/leads/importar`, como as importações do ERP, com "Como funciona" e
retorno em frase: "3 linhas lidas: 1 novo, 0 atualizados e 2 sem celular (em Visita e Instagram)."); lista de Leads com "Importar
leads" como principal, vazios com o próximo passo e status/canal da URL validados (um valor inventado derrubava a página); Lead 360
com "Enviar agora" no cabeçalho, trilha com o nome, Voltar de 44 px, "Histórico", telefone legível e "Outras ações" no fim; Portal do
cliente com trilha, Voltar e "Pulados com motivo"; Inbox com o nome abrindo o Lead 360 e "Cancelar"; "Visita e Instagram" em todo
lugar; textos sem jargão (Visitas, Onboarding, pedido manual, retornos das ações); pedido manual alinhado; ícone próprio em
Aguardando liberação. *Navegador (build de produção, banco local; leads de teste importados pela tela e apagados no fim):* lista
vazia, status inventado (200), importar a 390 e 1440, Lead 360 com os dois botões no cabeçalho e um só principal, Inbox com o link do
nome, Portal com a trilha "Portal do cliente › Grupo Valentin's", pedido manual com título e cartão na mesma coluna; sem rolagem
lateral nem erro de página. Matriz do painel com as telas novas: 16 telas × 6 tamanhos × 2 temas = 192, 0 falhas. *Checks:* suíte com
banco 154 arquivos, 2.874 aprovados, 46 pulados, 0 falhas; lint, typecheck e portão limpos; teste novo `rodolfo-leads-e5` e casos
novos em `rodolfo-painel-e5`. Revisão independente (código e UX): reprovou com 2 bloqueantes (busca de texto casando com todo lead com
telefone; links novos com 20 px no toque) e 6 "deveria" (entre eles: "Enviar agora" aparecendo para fixo, Visita e quem não está no
lote de hoje; lead movido para Visita ainda recebendo o WhatsApp do lote no servidor); todos corrigidos antes do commit, com testes
(`envioNoLead360`, busca, canal no envio).

**E5.1 · painel do nível 1, segunda fatia (b) (decisão 469, 25/10/2026):** os "deveria" S1, S2, S6, S7 e S8 e as sugestões G1, G2 e
G4. Início com os números do dia e "O que precisa de você" (na ordem de resolver, cada um com a ação; dia tranquilo sem pendência);
"Regras de envio" (era Config) em Comercial, com a chave geral em painel próprio ("Ligar o disparo"/"Desligar o disparo", com
confirmação) e o formulário só com os limites (intervalo em minutos), sem jargão; módulo "Sistema" removido; Métricas com a base no
subtítulo e sem R$ 0,00 sem classificação; vazios com o próximo passo em Hoje, Inbox (WhatsApp desconectado) e Aguardando liberação;
"Manuais restantes" na Cadência; seletor "Abrir parceiro"; RUNBOOK e pendências com a ordem certa (ligar o disparo antes dos 10
manuais, como o código exige). *Navegador (build de produção, banco local montado e apagado):* Início em três situações (banco vazio:
4 pendências; com pendências: 5; tranquilo: só o formulário do cliente), Regras de envio desligando e ligando o disparo pela tela e
salvando o intervalo em minutos sem mexer na chave, Métricas, Hoje, Inbox, Aguardando liberação e Cadência a 390; sem rolagem lateral
nem erro de página. Matriz: 156 telas (com e sem dados), 0 falhas. *Checks:* suíte com banco 155 arquivos, 2.883 aprovados, 46
pulados, 0 falhas; lint, typecheck e portão limpos; teste novo `rodolfo-inicio-e5`, casos novos em `rodolfo-painel-e5` (chave geral
fora do formulário, minutos) e `erp-shell` (módulos e atalhos). Revisão independente: reprovou com 2 bloqueantes (links de "O que
precisa de você" com 22 px no toque de 640 px para cima; emergência do RUNBOOK citando a caixa que saiu) e 10 "deveria" (pausa
automática fora do Início, dois vermelhos em Regras de envio, desligar com confirmação, onde conectar o WhatsApp, zero sem dado,
intervalo antigo travando o formulário, entre outros); corrigidos no commit seguinte, com testes.

**E5.1 · telas públicas: site e Portal do cliente (decisão 470, 25/10/2026):** E0 em 24 telas (2 telas × 6 tamanhos × claro e
escuro do sistema) com a régua corrigida: sem rolagem lateral; o Portal dava erro de React #418 em todo carregamento (o gravador de
áudio decidia na renderização se o navegador grava: falso no servidor, verdadeiro no navegador) — corrigido, com teste
`portal-hidratacao`; o site tinha 13 a 21 alvos abaixo de 44 px no toque (menu, rodapé, consentimento) — corrigido só em tela de
toque, sem mudar o visual no computador. Sem tema escuro no site e no Portal, de propósito (material da marca para o cliente). Login,
`/entrar`, primeiro acesso e os botões de acesso do site ficam de fora (adiados). Matriz depois: 24 telas, 0 falhas. Suíte com banco
2.886 aprovados, 46 pulados, 0 falhas; lint, typecheck e portão limpos. Revisão de UX independente em andamento no commit.

**E5.1 · visual do site e do Portal liberado (decisão 471, 25/10/2026):** o Rodolfo liberou mudar o visual. Site e Portal com claro e
escuro pelo sistema (`.ff-site`, `--site-*`), vermelho por papel como no ERP (botão #C41522, letra pequena #C41522/#F5525A, #EA1D2C
só no filete e na logo), cinzas legíveis, sem borda colorida, 44 px sempre. Portal com os 9 "deve" da revisão de UX: barra que diz
a verdade, confirmação de envio inteira com dia e hora, "Salvar áudio" e envio que não passa por cima de áudio ou anexo pendente,
aviso ao sair e rascunho no aparelho sem conexão, selo "Não salvo", páginas de erro em português. Matriz 24 telas: 0 falhas;
contraste claro e escuro: 0 textos abaixo do mínimo (eram 160); comportamento do Portal com API simulada: ok. Suíte com banco
2.895 aprovados, 46 pulados, 0 falhas; lint, typecheck e portão limpos; testes novos `site-tema` e `portal-tela`.

**E5.1 · sugestões G3 e G5 (decisão 472, 25/10/2026):** nas respostas do cliente no painel (`/rodolfo/portal/[id]`), cada bloco
diz quantos itens chegaram ("1 de 7 recebidos, 2 pulados", a mesma régua do formulário e da Situação) e um filtro na URL mostra só
os recebidos, os pulados com motivo ou os pendentes, descendo até a lista (`#itens`); o bloco sem item daquela situação some, e o
filtro sem resultado diz qual e volta para todos. Em Leads, os quatro números abrem a lista que contam; "Visita e Instagram" passou a
contar com a régua da tela Visitas (`NA_LISTA_DE_VISITA`; antes incluía quem pediu para sair). Matriz 96 telas: 0 falhas; jornada
dos filtros e dos cards ok. Suíte com banco 2.902 aprovados, 46 pulados, 0 falhas; lint, typecheck e portão limpos; teste novo
`portal-painel-filtro`.

**E5.1 · ajustes conhecidos do painel do nível 1 (decisão 473, 25/10/2026):** a fila da Cadência mostra a situação de cada lead
com a régua do disparo (na fila, enviada hoje, sem confirmação, não saiu, texto recusado, respondeu, pediu para sair, conflito,
Visita e Instagram, sem celular) e "N na fila de M"; com ninguém na fila, "Enviar o próximo" some e a tela diz que a fila de hoje
terminou (antes: botão habilitado e "Nada elegível"). Teto da hora com a hora real em que a vaga abre. Regras de envio: campo vazio
mantém o gravado e valor fora da faixa é recusado com o campo e a faixa (antes apertava em silêncio); intervalo até 60 minutos.
Barra de "Enviados hoje" cinza no parcial. Modelos padrão sob trava do banco (sem duplicar em dois "Montar lote"). Revisor: reprovou
a primeira rodada (texto recusado aparecia "Na fila"), aprovou a reconferência. Matriz 60 telas: 0 falhas. Suíte com banco 2.925
aprovados, 46 pulados, 0 falhas; lint, typecheck e portão limpos; testes novos `rodolfo-fila-c1`, `rodolfo-fila-disparo` e
`rodolfo-modelos.db`.

**DRE · a rede no subtítulo e o voltar para a composição (decisão 474, 25/10/2026):** DRE, CMV por categoria, Faturamento e a
lista de Despesas dizem a loja aberta ou a rede (antes, ao entrar por "Ver a rede" com uma loja no topo, diziam a loja do topo);
no nível 1, com o parceiro na frente; "Editar despesa" diz a loja da despesa. A despesa aberta pela composição mantém "Voltar para
<linha> no DRE" depois de editar, pagar, desfazer e "não repete mais" (a volta segue no link e no formulário e é conferida de novo
no servidor). Alvos de 44 px no toque nas mesmas telas (setas de mês, "Ver a rede", "Voltar para este mês/período de agora",
"definir", nome da loja e da despesa nas tabelas, "Mostrar linhas zeradas", "Ver os períodos"). Revisor: reprovou a primeira
rodada (três links pequenos), aprovou a reconferência. Matriz 108 telas: 0 falhas; jornada no navegador ok. Testes novos
`erp-dre-volta` e casos de página nos testes com banco do DRE e do Faturamento.

**Produção e navegação · etiqueta em "Feitas hoje" e o "…" da trilha (decisão 475, 25/10/2026):** para quem imprime etiquetas,
cada lote concluído hoje diz "com etiqueta" ou "sem etiqueta" (só cobra o lote que pode recebê-la, pela mesma regra da tela de
imprimir, agora em `etiqueta-campos.ts`). Abaixo de 1280 px a trilha fica "Início › … › tela atual" e o "…" é um botão de 44 px
que abre os níveis acima; o que não cabe sai do Tab, sem sair do leitor de tela. Revisor: reprovou duas rodadas (foco invisível
a 1024 no nível 1; pai encavalado no toque), aprovou a terceira. Matrizes de 108 e 72 telas: 0 falhas desta fatia. Também:
`COR.sistema` removida (sem uso).

**Engenharia · paleta escura (decisão 476, 25/10/2026):** teste `paleta-escura` impede que os três blocos de cores escuras (ERP
escolhido, ERP do sistema e site/Portal) divirjam, em vez de reescrever o CSS. Suíte com banco 2.936 aprovados, 46 pulados,
0 falhas; lint, typecheck e portão limpos.

**Portal do cliente · cadastrar cliente pela tela (decisão 477, 25/10/2026):** em `/rodolfo/portal`, "Cadastrar cliente" (nome,
questionário e a confirmação da marca, porque o questionário cita a marca nas perguntas) cria o cliente com endereço único e
link novo e abre a página dele com o link para copiar; antes era SQL. Conferência no servidor (nome, palavra longa, questionário
da lista, marca confirmada, nome repetido sem contar acento, caixa e apóstrofo), cadastro e auditoria na mesma transação, erro do
banco sem quebrar a tela e registrado no log. Os títulos do formulário público e do cabeçalho do painel quebram palavra que não
cabe. Revisor: reprovou a primeira rodada (questionário do Valentin's marcado por padrão para qualquer cliente), aprovou a
segunda. Também: o nome da loja na lista do Estoque no celular ganhou 44 px no toque. Matriz 72 telas: 0 falhas. Suíte com
banco 2.939 aprovados, 46 pulados, 0 falhas; testes novos `portal-cadastro` e `portal-cadastro.db`.

**Relatório de compras · pedido para a rede (decisão 478, 26/10/2026):** o DRE e o CMV por categoria da rede abrem o relatório de
compras com `rede=1` em vez de listar cada loja no endereço (com mais de ~55 lojas a volta da nota se perdia; com mais de 100, a
lista era cortada calada). Com `rede=1` valem todas as lojas do acesso e a loja escolhida no topo é só dita ("Mostrando todas as
suas lojas, não só <loja>… Ver só <loja>"); marcar loja vale mais. A regra mora em `recorteDaVisao` e vale para o relatório e as
duas comparações; links, formulário, planilha e impressão levam a rede adiante. Revisor: aprovou na primeira rodada. Matriz 96
telas: 0 falhas. Suíte com banco 2.945 aprovados, 46 pulados, 0 falhas; teste novo `erp-compras-rede`.

**Ajuda em sequência guiada (decisão 479, 26–29/10/2026):** os cards flutuantes da tela formam um passo a passo na ordem da
página: o X ("Fechar etapa e continuar") e "Continuar" avançam, o último conclui, "Encerrar ajuda", Escape e tocar fora saem.
Começa sozinha na 1ª visita e a cada 7 dias, uma tentativa por visita, nunca por cima de quem digita nem com o menu ou a gaveta
de ajuda abertos; a gaveta e o card nunca ficam abertos juntos. No celular, o card cabe sem esconder o alvo, reposiciona ao
girar (não ao rolar), mantém à vista o campo de quem digita e sobe com o teclado virtual. Revisor: cinco conferências
(as três primeiras e a quarta reprovaram; a quinta aprovou, com a confirmação dos últimos ajustes). Commits e45c969, af6b68b, b190793 e b3ffda7. Hipótese sem prova: teclado e barra de endereço de um celular real.

**Cadastro de insumo · unidade, embalagem e custo nos cards (decisão 480, 28–29/10/2026):** a frase de abertura, "Quanto vem na
embalagem", "Custo inicial e frete" e a seção "Entenda com exemplos" saíram do corpo e entraram na sequência (7 e 8 de 8 depois de
marcar a unidade); a região explicada fica inteira acima do card; R$ só para quem vê custo. Commits 342c42f, b190793 e b3ffda7.
Validação acompanhada com o cliente fundador: pendente (operação).

**PRIORIDADE 004 · Central de Integrações e cliente iFood (decisões 481–488, 28–29/10/2026):** INT-1.1 (dados da Central com RLS,
liberação do módulo Integração, estados), INT-1.2 (cofre), INT-1.3 (cliente iFood) e INT-1.4 (comando da leitura TEST) prontos
na versão de trabalho, com duas rodadas de correção da revisão independente (487 e 488; o "deve" era gatilho enganável por
tabela temporária). Migrations aditivas `20261115000000_erp_integracao_fundacao`, `20261116000000_erp_integracao_endurecimento`
e `20261117000000_erp_integracao_ajustes`; o conferidor pós-deploy cobre as três. **Nenhuma chamada real ao iFood foi feita.** A
primeira (INT-1.4) depende de Rodolfo pôr `IFOOD_TEST_CLIENT_SECRET` no Dokploy, do merge e deploy (decisão dele) e de
`INTEGRACAO_IFOOD_ATIVA=true`; como rodar está em `docs/DEPLOY_DOKPLOY.md`. INT-1.5 a 1.7 esperam a resposta real do TEST.

**Provas desta rodada** (Postgres 16 local, dados sintéticos; produção não verificada): suíte completa com banco no commit 19debd7: **179 arquivos, 3.090 aprovados, 0 pulados, 0 falhas**; os
perfis de dono não-superusuário (com e sem RLS) passaram a rodar depois de criar os papéis locais `ff_dono` e `ff_semrls` (antes,
46 testes ficavam pulados); 16 testes de migração em 3 perfis. No navegador (build de produção local): 70 + 90 conferências da
480, 9 da quinta rodada e os roteiros dos revisores da 479 (sequência, fluxos, 7 dias, alvo que some, giro em 11 combinações,
gaveta e atalho, menu, campo sob o card, teclado e barra de endereço simulados, editar e "Outra embalagem").

**Publicação de 29/10 (decisão 489):** com a autorização permanente de Rodolfo (merge e deploy sem pedir; ver `CLAUDE.md`, "Publicação"), a versão de trabalho foi para a `master` (`2d4bdfe`, deploy concluído às 09h40 UTC) e depois `195d829` (no ar às 10h21). A leitura TEST roda pelo GitHub (barney-ops → `reerguer-vps` → `leitura-ifood-test`), num compose de uso único no worker. Provada no servidor às 10h24: achou o worker novo e recusou sem chamar o iFood. Motivos: chave geral desligada e `IFOOD_TEST_CLIENT_SECRET` ausente; a chave de cifragem já está presente. Trava nova: o segredo combina com o ambiente do app.

**Central de Integrações do nível 1 (INT-1.8, primeira parte; decisão 490):** `/rodolfo/integracoes` reúne apps, leituras de teste e parceiros. `/rodolfo/integracoes/<parceiro>` cobre liberação, marca de testes, lojas do iFood, módulos e histórico. Nada nela chama o iFood. Duas revisões independentes: as duas reprovaram na 1ª rodada; nos recheques, engenharia aprovou e tela aprovou com ressalvas, corrigidas. A tela do parceiro (nível 2 e 3) é a segunda parte; o Painel iFood e o selo no Faturamento esperam a INT-1.5 a 1.7.

**Integrações do parceiro (INT-1.8, segunda parte; decisão 491):** a tela só leitura `/erp/integracoes` (aba em Rede e Equipe) aparece só com o módulo Integração liberado e a permissão `integracao.ver` (Dono pelo perfil base; os demais como extra). Mostra as lojas do iFood ligadas às lojas do alcance e o estado de cada módulo em linguagem simples. O pedido de conexão vai para o WhatsApp da FlowFoods. Catálogo de permissões 4, com a migration que só promove o perfil "copiado do Dono". O Painel iFood e o selo no Faturamento esperam a INT-1.5 a 1.7.

## Continuidade Codex — 29/10/2026 (decisão 492)

Base reconciliada com o Notion: master `5243e00677bb28f7473982a326f56836831f3f08`; branch `codex/erp-ux-continuidade-20261029`.

- Formulários de ficha retiram custos no servidor para quem edita receita sem precos.ver; composição operacional e cálculo no servidor preservados.
- Históricos recolhidos em 28 blocos, com wrapper acessível e reset por consulta/contexto. Alertas e pendências continuam visíveis.
- Cards, seletor e menu usam a mesma identidade cromática central dos ícones, em claro/escuro.
- Retorno seguro nas listas/hubs e controles locais nas lacunas autenticadas; queries e contexto preservados, sem retorno externo ou ciclos. Inventário estático de 217 rotas, distinguindo controles, impressão e redirecionamento; não significa 217 jornadas operacionais testadas.
- Links de saída de formulários alterados pedem confirmação, inclusive com vários formulários na mesma tela.
- Home diferencia ausência de lançamentos de zero informado. Custo médio por loja não foi ativado.

QA real local com dados sintéticos: 18 cenários aprovados; 3 telas × 3 larguras × 2 temas sem transbordamento; editor sem preços; teclado/retorno/filtros/troca de visão; insumo → ficha → custo atualizado de R$ 2 para R$ 4. Revisões independentes executadas. Tipos, lint e baterias focadas aprovados. A suíte completa/build no Windows teve limitações de fixtures CRLF, caminhos e argumentos psql; publicação depende do portão Linux existente. Acompanhar commit, resultado CI e comprovação do ambiente no registro de execução da página principal do Notion. Sem migration nova ou ação real de integração/anúncios.

## Home e formulários — segunda rodada Codex (decisão 493)

- Home do parceiro e espelho do nível 1 consultam faturamento/estoque na loja selecionada e dentro do alcance. O cadastro compartilhado do cardápio informa “Da rede”; links preservam mês, loja e parceiro. Visão inválida não vira Rede silenciosamente. Ausência de lançamento continua diferente de zero.
- Após resposta de erro ao salvar, 18 formulários recuperam o aviso de saída com alterações. Sucesso não gera aviso falso nem apaga edições feitas durante o envio.
- 30 testes dirigidos com banco, tipos, lint e portão de conteúdo aprovados. Dois cenários reais de Chrome com dados sintéticos: erro/cancelar/corrigir/persistir e Rede R$ 8.000 → loja B R$ 7.000, em 360/1440 sem transbordamento. Revisão independente sem bloqueantes. CI, merge e publicação desta rodada são acompanhados no mesmo plano Notion.
- H-A14 do resumo existente evoluiu; H1/estados independentes e a Home analítica de seis famílias continuam na fila. Sem migration, regra financeira nova ou ativação de integração/custeio.

## Resumo com estados independentes e CI — terceira rodada Codex (decisão 494)

- As três fontes existentes da Home têm estados independentes de erro, ausência, parcial e dados disponíveis. Falha em uma fonte conserva as outras; autorização antecede cada consulta/estado. Mês/escopo/momento da consulta e ausência versus zero ficam explícitos.
- Atualizar resumo reconsulta manualmente a rota com anúncio local; Enter recupera dados após falha mantendo foco. O painel institucional permanece compatível com o contrato anterior.
- CI prepara e verifica os três perfis do Postgres efêmero, com e sem RLS; ausência de perfil ou falha de login interrompe o job. Nenhuma configuração de produção é alterada.
- 44 testes dirigidos com banco aprovados, além da bateria isolada sobreposta de 22 testes; tipos/lint/conteúdo aprovados. SQL de preparação validado em cluster novo. Revisões independentes sem bloqueantes. Três cenários de Chrome com dados sintéticos aprovados, incluindo falha real/restauração/foco e layout 360/1440. CI, merge e ambiente servido são acompanhados no mesmo plano Notion.
- Recorte parcial de H1; H1 completo e H3 continuam pendentes. Próximo: contrato e CMV de uma loja a partir de um DreDoPeriodo canônico, sem recalcular regras ou ativar custeio/integracao.

## Home operacional e confirmação da publicação — quarta rodada Codex (decisão 495)

- Produção na Home de uma loja: pré-preparos na lista de hoje e ainda sem lote ativo, com data Rio, link do mesmo dia/loja e estados honestos. Somente com producao.ver, sem valores financeiros, geração de lotes ou consolidado de rede.
- Contrato puro CMV preserva a leitura autorizada de um único DRE: valor, percentual, denominador, período, fonte, ressalvas e fotografia. Ainda não ligado à composição visual; o fallback sem DTO precisa receber período validado antes dessa integração. Nenhuma fórmula ou consulta nova.
- Deploy deixa de confundir fila aceita com término: helper acompanha a tentativa correlacionada, com timeout e saídas mínimas. Webhook sozinho continua aceito sem confirmação; título não comprova o SHA compilado. Testes HTTP simulados fazem parte do portão.
- 98 testes dirigidos com banco e quatro jornadas reais de Chrome com dados sintéticos aprovados; tipos/lint/conteúdo passaram. Inclui operador sem custos, retorno da lista, nenhuma escrita e 360/1440 sem transbordamento. Revisões e CI/publicação são registrados no mesmo plano Notion. H1/H3 e validação operacional de produção permanecem parciais.
