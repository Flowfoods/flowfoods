# Seleção por toque e clique nas Fichas

| Consumidor de [SeletorDeItem](../../src/components/erp/telas/fichas/seletor-de-item.tsx) | Valor confirmado |
| --- | --- |
| [Filtros da lista](../../src/components/erp/telas/fichas/filtros.tsx) | `secao` e `subsecao` no rascunho do GET, inclusive `sem` e o valor vazio de Todas. A subseção só abre com uma seção específica. |
| [Classificação da ficha](../../src/components/erp/telas/fichas/campos-classificacao.tsx) | `secaoId` e `subsecaoId` existentes. A busca paginada mantém a seleção fora da página e oferece Carregar mais. |
| [Receita da ficha](../../src/components/erp/telas/fichas/form-ficha.tsx) | `item_insumo` da linha de insumo ou pré-preparo, inclusive o prefixo de pré-preparo. |
| [Embalagens na ficha e na tela de canais](../../src/components/erp/telas/fichas/campos-embalagens.tsx) | `emb_insumo` da linha e canal atuais. O valor vem da opção do catálogo. |

Durante a pesquisa o campo oculto conserva o valor confirmado. Uma busca sem opções não confirma ao apertar Enter. Nos filtros, Todas e Sem continuam disponíveis. O campo bloqueado fecha a lista. A busca global do ERP tem implementação própria. Tipo, Situação e os controles de CMV usam controles nativos.
