# ERP Barney — fatia vertical (Passo zero), fundação do banco (0.1), multi-tenant (0.2), login (0.3), permissões (0.4), shell único e cadastro de insumos (1.1), ficha técnica (1.2), pré-preparos e custo em cascata (1.3), validade por conservação (1.4), entrada de compra e custo pelo último preço (1.5)

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
| Foto sem metadados e envio por rota própria (1.3, herança da 1.2) | `src/lib/erp/{foto-metadados,foto-envio}.ts`; rotas `/erp/fichas/fotos` e `/rodolfo/erp/<slug>/fichas/fotos` |
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
| Compras | `NotaEntrada` / `NotaEntradaItem` | nota de compra e itens com snapshot; LANCADA vale para o custo; movimento de estoque só com o estoque da loja aberto (1.6) |
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

- **1.6 abertura de estoque**: ao abrir o estoque de uma loja (data/hora da
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
