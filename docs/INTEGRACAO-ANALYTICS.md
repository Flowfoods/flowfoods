# Coleta Analytics — INT-1.6

O worker mantém uma rotina Analytics separada da prospecção. Ela não cadastra,
autoriza nem ativa lojas. A automação atende somente conexões de PRODUCAO,
com app homologado, parceiro ativo e liberação do módulo Integração. TEST
continua restrito ao comando manual de leitura e aos testes sintéticos.

## Pausar e conferir

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
- Revisão dos16 dias anteriores. D-1 e revisão disputam a mesma identidade;
  repetir o planejamento no mesmo ciclo não reexecuta uma janela concluída.
- Histórico por dia, atrás do primeiro dia planejado, até13 meses. No máximo
  uma janela histórica por loja/rodada e20 pendentes. Não supor que dia vazio
  encerra o histórico nem que a API garante essa retenção.
- 429 respeita `naoAntesDe` integral no banco e bloqueia conservadoramente
  todas as chamadas Analytics até o prazo, inclusive depois de reinício;
  sem prazo informado, a espera operacional é de4 h;
  prazo inválido ou fora da faixa de armazenamento é terminal e não reabre
  no próximo ciclo automático; também pausa o coletor até conferência
  administrativa. Rede/5xx e404 ficam para nova tentativa após4 h.
  Contrato inválido exige diagnóstico, não repetição imediata.

Há rodízio por parceiro e módulo, com uma tarefa por rodada. Histórico tem
prioridade inferior a D-1/revisão. A reserva Analytics persiste espaçamento
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
PENDENTE_PERIODO, conservando o último PUBLICADO. Não há ponte para faturamento
ou DRE nesta fatia; essa é a INT-1.7.

## Diagnóstico e retomada

Conferir o estado da execução, geração, HTTP, requestId, `naoAntesDe` e o
último snapshot pelo contexto do parceiro. Não imprimir o corpo inteiro em
logs nem consultar outro parceiro. Preservar os recibos para análise do
contrato. Após corrigir o motivo de uma falha terminal, o próximo ciclo diário
reagenda as janelas ainda na revisão; retomada manual de histórico antigo
fica para os controles administrativos da próxima fatia.

Não apagar evidências automaticamente:13 meses é meta de cobertura,
não autorização de retenção/limpeza. Reverter a versão do aplicativo mantém
as tabelas aditivas; não executar migration destrutiva de retorno. Pausar o
coletor antes de uma investigação preserva o último resultado válido.
