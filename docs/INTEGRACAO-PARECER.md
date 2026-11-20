# Registro de parecer externo dos apps iFood

A Central do nível 1 registra a situação conferida no provedor, com datas, referência e histórico. Este contrato técnico não escolhe a fila de execução nem substitui o acompanhamento vigente.

| Ambiente e categoria | Módulos aceitos nesta tela |
| --- | --- |
| Produção · BI | Analytics |
| Produção · Finanças | Financial; opcionalmente Merchant, em qualquer ordem |

TEST, Avaliações, Finanças apenas com Merchant, módulos repetidos e combinações fora da categoria são recusados. A mesma elegibilidade controla o link da Central, a página direta e a gravação. O título mostra a categoria e os módulos do cadastro.

O formulário conserva a distinção entre aprovação técnica e liberação pelo iFood. Homologado exige as duas datas e conferência explícita; datas desconhecidas não podem ser inventadas. A referência aceita somente uma página HTTPS do Developer sem parâmetros, fragmentos ou credenciais. Relatórios e capturas permanecem fora do repositório.

Estado e auditoria são gravados na mesma transação. A versão, o Client ID, a categoria e os módulos originais, inclusive sua ordem, precisam continuar iguais no momento da escrita. Uma edição concorrente devolve conflito; falha da auditoria reverte o estado.

Registrar um parecer não grava grants, conexões, módulos ou tokens, nem configura segredos ou consulta o provedor. Registrar Homologado pode tornar elegíveis conexões já autorizadas e ativas, desde que os demais controles permitam. O worker existente coleta Analytics; este recorte não cria coleta Financial. Homologação, autorização por loja, ativação, aquisição dos dados e conciliação continuam etapas distintas. Retirar a homologação mantém os vínculos e o histórico; as guardas existentes impedem novas sincronizações quando o app deixa de estar apto.

## Código e verificação

- Elegibilidade e campos: `src/lib/integracoes/core/homologacao-campos.ts`.
- Transação e histórico: `src/lib/integracoes/core/homologacao.ts`.
- Página: `src/app/rodolfo/(painel)/integracoes/apps/[id]/page.tsx`; action e link reutilizam a Central existente.
- `npm test -- tests/integracao-homologacao.test.ts`: combinações e validação pura.
- `npm test -- tests/integracao-central.db.test.ts`: PostgreSQL local descartável e perfis do portão; página/action, concorrência, rollback e preservação de conexões, autorizações e tokens.

Esses testes não comprovam homologação, acesso externo ou operação real. Revisão independente e portão integral continuam exigidos para publicação.
