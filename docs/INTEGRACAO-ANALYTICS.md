# Coleta Analytics — diário e distribuições

O worker mantém uma rotina Analytics separada da prospecção. Ela não cadastra,
autoriza nem ativa lojas. A automação atende somente conexões de PRODUCAO,
com app homologado, parceiro ativo e liberação do módulo Integração. TEST
continua restrito ao comando manual de leitura e aos testes sintéticos.

## Pausar e conferir

### Registrar o parecer do iFood (INT-1.9)

Na Central, cada app de produção BI com somente Analytics oferece **Registrar
parecer do iFood**. O nível 1 registra a situação conferida no Developer, a
data da validação técnica e, quando existir, a data de liberação. Use as datas
civis de Brasília; aprovação técnica com app ainda em revisão corresponde a
**Em andamento**, não a Homologado. A liberação precisa ser posterior ou igual
à validação. Guarde relatório/captura no dossiê privado e informe a página
consultada, sem query string, segredo ou link temporário do PDF.

Situação e recibo de auditoria são gravados na mesma transação. A versão do app
impede um formulário antigo de sobrescrever outro registro. O histórico mostra
os últimos 20 registros com autor, datas e referência. A referência identifica
a página consultada; não substitui a evidência guardada nem verifica o iFood.
O primeiro HTTP autorizado por loja continua sendo evidência separada.

Essa tela não faz chamadas externas, não concede acesso e não ativa conexões.
**Registrar Homologado pode liberar a coleta de conexões já ativas/autorizadas**,
se todos os demais controles permitirem. Retirar a homologação bloqueia novas
emissões/publicações pelos controles existentes, preservando vínculos e dados.
Uma requisição em voo pode terminar, mas sua publicação reconfere o acesso.
Não usar o registro para contornar uma revisão ainda pendente no provedor.

### Controle da coleta

No ambiente seguro do servidor, dentro do serviço FlowFoods:

```sh
npm run integracao:analytics-controle -- --estado
npm run integracao:analytics-controle -- --pausar --autor "Responsável"
npm run integracao:analytics-controle -- --retomar --autor "Responsável"
```

A pausa é persistida com auditoria e vale sem deploy. O coletor a reconfere
antes de cada emissão e publicação. Uma chamada que já saiu pode terminar,
mas não publica depois da pausa. Retomar não libera parceiro, app ou loja.
`INTEGRACAO_IFOOD_ATIVA=true` continua sendo necessária. O comando de estado
não revela URLs, identificadores da sessão, credenciais ou respostas.

## Ordem, histórico e erros

- Acesso diário, inclusive para módulo AUTORIZADO ainda não ativo; 403 grava
  ERRO_PERMISSAO e não repete. Corrigir a autorização pela Central é ação
  administrativa, nunca reação automática ao 403.
- D-1 a partir de 9h30 de Brasília; a data civil vem do fuso da janela. Hoje
  o cadastro de lojas usa o fuso da operação no Rio; o job o registra
  explicitamente. Alterar o fuso de uma janela existente é recusado.
- Revisão dos 16 dias anteriores em cada perfil: `diario`, `pagamentos` e `complementares`.
  D-1 e revisão disputam a mesma identidade dentro do perfil;
  repetir o planejamento no mesmo ciclo não reexecuta uma janela concluída.
- Histórico por dia, atrás do primeiro dia planejado, até 13 meses. Cada perfil
  tem marco próprio, no máximo uma janela histórica por loja/rodada e 20
  pendentes. Não supor que dia vazio
  encerra o histórico nem que a API garante essa retenção.
- 429 respeita `naoAntesDe` integral no banco e bloqueia conservadoramente
  todas as chamadas Analytics até o prazo, inclusive depois de reinício;
  sem prazo informado, a espera operacional é de4 h;
  prazo inválido ou fora da faixa de armazenamento é terminal e não reabre
  no próximo ciclo automático; também pausa o coletor até conferência
  administrativa. Rede/5xx e404 ficam para nova tentativa após4 h.
  Contrato inválido exige diagnóstico, não repetição imediata.

Há rodízio por parceiro e módulo, com uma tarefa por rodada. Dentro do parceiro,
os perfis elegíveis são ordenados pela última tentativa iniciada persistida;
os nunca iniciados vêm antes, com desempate inicial acesso/diário/pagamentos/complementares.
Isso preserva o rodízio após reinício e evita uma fila diária continuamente
elegível monopolizar as marginais. Não define prazo sob sobrecarga. Histórico tem
prioridade inferior a D-1/revisão dentro de cada perfil.

Após 9h30, módulo ATIVO planeja no máximo 52 upserts: um de acesso e até 17
por perfil (16 dias recentes e uma janela histórica). Módulo AUTORIZADO
continua somente com verificação de acesso. Uma rodada adquire uma tarefa,
com `maxTentativas=1` no cliente HTTP. O perfil diário conserva sua paginação;
cada marginal solicita apenas página 1/tamanho 1. Cada emissão passa novamente
pelo guard e pela cota, inclusive a renovação canônica após 401. OAuth conserva
seu fluxo separado. A reserva Analytics persiste espaçamento
de150 ms entre chamadas (teto local400/min); OAuth mantém seu limitador e
cache coordenado próprios. A reserva pode desperdiçar uma posição em falha,
mas não a reutiliza antecipadamente.

## Concorrência e evidência

A URL PostgreSQL deve ser direta, ou usar pool de sessão. Pool transacional
é incompatível com a posse; `pgbouncer=true` é recusado. A posse usa uma
conexão dedicada de sessão, identificada por UUID e advisory lock estável.
O SQL confere sessão viva, dono registrado, geração e prazo da tentativa.
A idade do lease sozinha nunca autoriza outro executor da mesma posse.
Uma nova posse só recupera uma janela expirada após a sessão anterior acabar.

Cada tentativa incrementa a geração. Páginas antigas não são misturadas com
a nova geração. Corpo original UTF-8, hash SHA-256 e JSON interpretado são
imutáveis. JSON que o PostgreSQL não representa (overflow numérico, NUL ou
Unicode inválido) é recusado antes do driver; não é alegado como arquivado.
Limites locais:2 MiB por resposta,32 MiB por janela,1.000 páginas e50.000 grupos.

Publicação exige todas as páginas, as quatro dimensões e seis métricas do
contrato diário. Valores monetários ficam em centavos BigInt dentro da faixa
exata do contrato; nulos e negativos são preservados. A unidade é explícita
e não pode mudar na janela. O grão inclui categoria e distingue todos os
grupos com dimensões nulas, sem duplicá-los.

Uma nova versão substitui a leitura anterior; nunca soma duas versões. Hash
igual não cria versão redundante. Vazio oficial tem cabeçalho próprio com
zero grupos. Falha ou ausência nunca se torna zero. O último snapshot válido
é retornado junto com o estado/erro da coleta. Período fechado recebe versão
PENDENTE_PERIODO, conservando o último PUBLICADO. A ponte da INT-1.7 usa somente
o perfil diário elegível; marginais não alimentam faturamento ou DRE.

## Marginal de pagamentos — INT-1.8C

O perfil `pagamentos` tem recibos e snapshots próprios, contrato versão 1 e
hash que inclui ambiente, merchant, dia, fuso e parcelas. O corpo original
continua imutável. O recibo marginal exige versão 1; recibos legados mantêm
versão NULL, sem backfill. O [contrato de pagamentos](IFOOD_ANALYTICS_CONTRATO.md#pagamentos--int-18c-versão-1)
define o envelope e os limites. Não é usado o parser de grupos diários.

`IntegracaoPagamentoSnapshot` conserva SQL NULL para agregado ausente e array
vazio para mapa explícito sem ocorrências. Métodos e contagens exatas são
persistidos como parcelas; não viram pedidos únicos, dinheiro ou lançamento
de faturamento. Snapshot igual reutiliza a última PUBLICADO sem mudar sua
data, mas o novo recibo permanece. Revisão em período fechado fica como
PENDENTE_PERIODO e não substitui a versão disponível. O no-op também reconfere
o raw atual; uma versão pendente não é elegível como anterior publicado.

A publicação marginal preserva a ordem período/acesso/fence, relê os recibos
sob trava e exige sessão da posse viva, geração e prazo também na validação
diferida do COMMIT. Acrescentar página depois da validação ou perder a sessão
não permite concluir a tentativa como válida. 403/429, pausa e espaçamento
global são os mesmos dos outros perfis, sem cota ou autorização paralela.

No painel autorizado por Integração e Faturamento, cobertura e timestamps da
marginal são próprios. Diário completo não completa pagamentos ausentes, nem
pagamentos completos completam o diário. O total e os percentuais marginais
usam ocorrências de métodos. Todos os readers compartilham uma transação
repetível e somente leitura, sem misturar versões durante a consulta.

Não foi capturada resposta marginal real nesta entrega. A implementação e os
testes sintéticos não ativam apps, lojas, segredos ou homologação. O rollout
continua condicionado aos mesmos controles administrativos.

## Horário e primeiro pedido — INT-1.8D

O perfil `complementares` solicita os termos `orderCreationHour` e
`customerFirstOrderInMerchant` em uma única consulta versionada, sem pagamento
ou groupBy. `IntegracaoDistribuicaoSnapshot` guarda os dois mapas na mesma
versão, cada um como array de termos/ocorrências ou SQL NULL. Campo ausente
recusa a publicação; agregado explicitamente nulo preserva ausência apenas
daquele valor. Mapa vazio e zero informado continuam distintos.

Marco histórico, raw, hash, última PUBLICADO e cobertura são próprios. O hash
inclui ambos os mapas, identidade e fuso do recorte. A mesma ordem de locks,
fence, prova de posse no COMMIT e recusa de append tardio se aplica; no-op
também confronta os dois mapas atuais com o raw. Não muda as versões de
pagamentos/diário nem sinaliza aplicação financeira.

Horas são exibidas como informadas pela origem; o fuso usado nos buckets não
é inferido do fuso da janela. Primeiro pedido significa primeiro naquele
estabelecimento de origem (merchant), não cliente novo/único da loja ERP ou
da rede. Cada distribuição tem seu próprio total de ocorrências e percentual;
não se cruzam hora, primeiro pedido, pagamento ou pedidos financeiros.

As contagens usam o scanner lexical exato compartilhado com C, antes de
aceitar Number. O staging persiste raw parametrizado como JSONB para conservar
chaves próprias como `__proto__`, sob os mesmos CHECKs, triggers e portão tenant.
O helper não é aplicado ao contrato monetário diário.

Também não existe amostra marginal real completa de D capturada nesta entrega.
Testes sintéticos e implementação documental não habilitam coleta, apps ou
homologação. O painel exige os mesmos dois acessos e uma fotografia RR+RO.

## Diagnóstico e retomada

Conferir o estado da execução, geração, HTTP, requestId, `naoAntesDe` e o
último snapshot pelo contexto do parceiro. Não imprimir o corpo inteiro em
logs nem consultar outro parceiro. Preservar os recibos para análise do
contrato. Na Situação da Central de nível 1, selecione a loja de produção e o
dia encerrado em São Paulo. Cada fonte mostra a geração, o início e quantas
páginas dessa geração chegaram ao banco. O total de páginas mede o progresso
da tentativa. Consulte também a versão publicada e a aplicação no faturamento.

“Solicitar releitura do dia” devolve a janela diária existente à fila após uma
tentativa terminal ou uma execução expirada cuja posse tenha terminado. O
pedido registra o responsável e respeita a pausa, o prazo do provedor e a
autorização da fonte. Consulte novamente para acompanhar a próxima geração.
O pedido requer uma tentativa anterior para a fonte e o dia selecionados.

Não apagar evidências automaticamente:13 meses é meta de cobertura,
não autorização de retenção/limpeza. Reverter a versão do aplicativo mantém
as tabelas aditivas; não executar migration destrutiva de retorno. Pausar o
coletor antes de uma investigação preserva o último resultado válido.
