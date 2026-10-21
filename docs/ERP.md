# ERP Barney — fatia vertical (Passo zero), fundação do banco (0.1), multi-tenant (0.2), login (0.3), permissões (0.4), shell único e cadastro de insumos (1.1), ficha técnica (1.2), pré-preparos e custo em cascata (1.3), validade por conservação (1.4), entrada de compra e custo pelo último preço (1.5), abertura do estoque (1.6), contagem do dia a dia com piso no fechamento do período (1.7), requisição com baixa e cruzamento requisição × contagem (1.8), precificação dentro da ficha: custo por canal em camadas (1.9), preço e margem por canal na ficha (1.10), onboarding: pedido de acesso, quadro e ativação (0.5), ajuda contextual (0.6), entrada de faturamento por canal (2.1), DRE ao vivo (2.2a), metas e fechamento do período (2.2b), dois CMVs: compra e real (2.3), farol por canal em 5 faixas (2.4)

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
3. **"Ainda não sei o preço"** grava 0 e a tela diz **"Sem preço"** (custo
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
9. **Fornecedor**: nome (único no parceiro), CNPJ/CPF opcional (dígitos
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
   lançamento da loja não existe; dia da semana sem amostra nas 4 semanas conta zero, com a frase ("segunda sem venda lançada nas últimas 4 semanas: conta como zero";
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

## Provar o orçamento de compra (2.5)

```bash
npx tsc --noEmit && npm run lint && npm run gate && npx vitest run
ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/<banco> npx vitest run --no-file-parallelism
npm run build
```
`tests/erp-orcamento.test.ts` (sem banco, 23): a previsão por dia da semana (5 sábados, dia sem um canal pela média, "Não vendeu" é zero, dia da semana sem amostra,
o mínimo de 14 dias, o 1º dia do período, semanal e quinzenal), o teto com um arredondamento, o passou, sem meta, as 5 faixas do ritmo, sem cor por falta de faturamento e
por loja sem nota, a cobertura por loja da rede, o arredondamento prudente e a prévia arredondada. `tests/erp-orcamento-tela.test.ts` (sem banco, 5): a linha da prévia,
o aviso do detalhe, a tela de quem não vê a receita (nenhuma palavra da conta, nenhum R$ 0,00). `tests/erp-orcamento.db.test.ts` (18): o cenário da Casa Orçamento
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

## Mapa do esquema (0.1)

Toda tabela abaixo tem `parceiroId` (tenant) e só se acessa por `doParceiro`.

| Bloco | Tabela | Para quê |
|---|---|---|
| Estrutura | `ParceiroFlow` | N2, o tenant. Ganhou `periodoTipo`/`periodoDiaInicio` (sugestão de período do DRE; desde a 2.2a sem uso: a regra vive em `RegraDoPeriodo`) |
| Estrutura | `Loja` | N3, loja/unidade do parceiro; estoque, produção e faturamento são por loja. 1.7: regras da contagem (piso do fechamento, frequência ABC, tolerância para fechar sozinha). 2.1: `canaisDeVenda` (em quais canais vende; pelo menos um) |
| Estrutura | `Marca` | marca do grupo; produto e faturamento podem apontar marca |
| Estrutura | `Colaborador` | pessoa da operação; âncora do histórico por funcionário (login vem na 0.3) |
| Insumos | `Insumo` | já existia; ganhou tipo (ingrediente/embalagem/pré-preparo), taxa de entrega, conservação e validade por conservação, mínimo, fornecedor padrão, origem |
| Insumos | `InsumoVariante` | outras embalagens de compra do mesmo insumo |
| Compras | `Fornecedor` | quem vende |
| Compras | `NotaEntrada` / `NotaEntradaItem` | nota de compra e itens com snapshot; LANCADA vale para o custo; com o estoque da loja aberto, entra no razão (`MovimentoEstoque.notaId`, 1.6) |
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
| Produção | `Etiqueta` | etiqueta impressa: lote do fornecedor, validade, abertura, snapshot |
| DRE | `FaturamentoLancamento` | faturamento por loja × canal × dia (2.1: marca nula): valor, pedidos, clientes (= atendimentos do dia, não clientes únicos); chave de idempotência única; origem MANUAL/IMPORTACAO (uma linha humana por grão) ou INTEGRACAO; `atualizadoPorNome`; CHECKs de teto, espaço de chave e valor com pedido |
| DRE | `DreLinha` / `DreMeta` | linhas do DRE (com `sentido`: maior ou menor é melhor; 2.2a: `codigo` estável das linhas do padrão, único por parceiro, nulo nas da casa) e meta % por linha, por canal ou da rede (canal nulo), com vigência; 2.2b: `semMeta` (a ausência de meta também é uma linha vigente), `criadoPorNome`, `atualizadoEm` |
| DRE | `Despesa` | despesa manual/importada numa linha; loja nula = rede, canal nulo = rateio; importada exige chave de idempotência. 2.2a: competência de um dia, mês ou intervalo (`competencia`..`competenciaFim`, até 366 dias), `recorrente` e `repeteDeId` (cadeia mensal, única por parceiro), `vencimento`/`pagaEm`, `atualizadoPorNome`; valor da despesa inteira (a apropriação é conta, não coluna) |
| DRE | `PeriodoApuracao` | períodos configuráveis; contagem de fechamento aponta o período; 2.2a: gatilho recusa sobreposição; 2.2b: `fechadoPorNome`, só vira FECHADO com fotografia vigente |
| DRE | `RegraDoPeriodo` | 2.2a: regra do período do parceiro (mensal, quinzenal ou semanal, dia em que começa), versionada por `vigenteDesde`; só inclusão (gatilho), `parceiroId` imutável; fonte única do DRE e da contagem de estoque |
| DRE | `DreFotografia` / `DreFotografiaLinha` | 2.2b: a fotografia imutável de um período fechado (versão, taxa do iFood congelada, ressalvas, justificativa, quem fechou e quem reabriu e por quê) e suas linhas em BigInt (`valorCentavos`) com a `entrada` de que saíram (2.3: `versaoDaConta` 2 traz o CMV; `entrada.cmv` por loja); só inclusão por gatilho; uma vigente por período (índice parcial); período FECHADO exige fotografia vigente (gatilho adiado) |
| DRE | `FarolFaixa` | 5 faixas por linha do DRE × canal (nulo = rede), sobre o desvio vs meta já com o sentido da linha |
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
- **A vista é montada no servidor**: quem não tem `dre.ver` na loja recebe `VistaResumida` (só o "cabe" pelo teto arredondado, o motivo e os avisos). Arredonda-se o
  TETO, nunca o saldo (decisão 213): qualquer número novo para quem não vê a receita parte de `tetoArredondado`, ou um comprador acha o centavo comparando notas. Campo novo no orçamento que dependa
  da receita entra só na `VistaCompleta`; o teste de banco confere o JSON inteiro do comprador.
- **A previsão é hipótese** (decisão 209): média por dia da semana nas últimas 4 semanas, mínimo de 14 dias completos. Se o Rodolfo quiser o dia de pagamento ou a
  sazonalidade, a mudança é só em `preverReceita` (pura, com teste).
- **Para o Rodolfo (decisão de negócio, não bloqueia)**: (1) o comprador vê o "cabe" em R$, pelo teto arredondado para baixo em degraus por faixa; quem souber a
  meta do CMV estima a receita prevista com erro de até ~±8 % (com meta de 30 %), e no fim do período a prevista é quase a realizada. Serve, ou o comprador do
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
