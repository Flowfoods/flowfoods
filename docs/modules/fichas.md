# Fichas Técnicas e Precificação

`project_id: flowfoods-erp` · módulo `fichas` · piloto `FT-FILTROS-UX`.
Contrato derivado do pacote vigente de 10/11/2026 e código em `a8d294a1ca34a81ed69bb5b9e4f18b058569e88c`.
Não substitui autoridade de negócio nem libera funcionalidades futuras.

## Existente e donos

- 3A: seção/subseção opcionais por parceiro, filtros dependentes e multiseleção CMV.
- 3B: cinco faixas configuráveis por canal; comparação com meta separada das faixas.
- 3C: receita/embalagens por canal, salvamento seguro, prévia/impressão. PR34–37 integrados; não reconstruir.
- [ficha-campos](../../src/lib/erp/ficha-campos.ts): tipos, parser GET, serialização e retorno.
- [fichas](../../src/lib/erp/fichas.ts): listagem, contagem e filtro no universo completo, tenant/permissões.
- [canais](../../src/lib/erp/canais.ts): cálculo e fotografia CMV. Apresentação não cria outro motor.
- [filtros](../../src/components/erp/telas/fichas/filtros.tsx): seleção local e formulário GET.
- [resumo dos filtros](../../src/components/erp/telas/fichas/filtros-resumo.ts): apresenta a URL aplicada e cria remoções pelo serializador existente; não recalcula resultados.
- [lista](../../src/components/erp/telas/fichas/lista.tsx): resultados/navegação; compartilhada por ERP e N1.
- [classificação](../../src/components/erp/telas/fichas/campos-classificacao.tsx): seleção/criação. Seção não é CategoriaInsumo.

## Invariantes

1. OR entre pares dentro de cada grupo; AND entre grupos ativos e demais filtros. Comparação/meta e faixa/farol separados, com pares de canais distintos.
2. Sem modo Qualquer/Todos ou canal global novo. Preservar nomes/valores GET, URLs antigas, paginação, quantidade, Voltar e posição.
3. Aplicado vem da URL; rascunho da seleção local. Alterar controle não muda significado dos resultados antes de aplicar.
4. Mudar seção remove subseção incompatível, sem ocultá-la selecionada. Classificações arquivadas/ausentes têm estados explícitos.
5. Sem dados, Não ofertado e Faixas não configuradas não são faixas numéricas nem zero. Sem permissão financeira, não mostrar/aplicar dados protegidos.
6. Criar seção/subseção continua descobrível sob permissão existente, conserva busca e só muda recorte após aplicação.
7. Fórmulas/preços/limites/metas/schema/estoque/integrações fora da entrega. Sugestão continua custo físico/meta; preço manual prevalece. Taxa percentual separada do custo físico; P−C−tP não é lucro líquido.
8. Loja considera receita; Delivery próprio/iFood incluem embalagens configuradas. Previsão por porção não é consumo real/baixa; nenhum canal/padrão/rateio inventado.

## Aceite e referências sob demanda

Busca/classificação primeiro; avançados recolhíveis; resumo de TODOS os filtros aplicados; seleção pendente clara; Aplicar/Limpar no final; alvos 44 px.
320–1920 px, temas, teclado/foco, zoom 200%, textos longos, zero resultados, múltiplas seleções e perfil sem preços.

Testes: [UI 3A](../../tests/erp-ficha-3a-ui.test.ts), [filtros com banco](../../tests/erp-ficha-filtros-3a.db.test.ts), [faixas UI](../../tests/erp-ficha-faixas-ui.test.ts), [busca](../../tests/erp-ficha-3a-busca.test.ts), [foco](../../tests/erp-ficha-foco.test.ts).
Regressão desta entrega: [resumo, rascunho e remoção](../../tests/erp-ficha-filtros-ux.test.ts).
Banco exige `ERP_DB_TESTE` isolado; ausência produz skip, não aprovação.

Origem: pacote técnico, revisão vigente e diagnóstico do card Fichas; mapeamento privado no Notion. Fórmulas/limites não tocados ficam nos donos acima; qualquer alteração exige localizar a decisão exata.
Matriz Vendas × CMV permanece planejada/fora desta entrega; Analytics agregado não prova dados por SKU.
