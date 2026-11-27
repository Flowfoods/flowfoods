-- Catálogo v5: a prévia de Consultoria acrescenta uma permissão de leitura por loja.
-- Mantém a regra do catálogo para perfis próprios completos. O acesso efetivo depende da liberação da Consultoria,
-- do alcance da pessoa, das permissões da fonte e do estado da integração na loja.
UPDATE "PerfilAcesso"
SET "permissoes" = array_append("permissoes", 'consultoria.ver'),
    "catalogoVersao" = 5
WHERE "catalogoVersao" < 5
  AND NOT ('consultoria.ver' = ANY ("permissoes"))
  AND "permissoes" @> ARRAY[
    'insumos.ver', 'insumos.editar', 'insumos.categorias', 'lojas.ver', 'lojas.gerir', 'acessos.gerir', 'historico.ver',
    'fichas.ver', 'fichas.editar', 'compras.ver', 'compras.lancar', 'fornecedores.editar', 'estoque.ver', 'estoque.contar',
    'estoque.ajustar', 'requisicao.pedir', 'requisicao.atender', 'producao.ver', 'producao.registrar', 'producao.planejar',
    'etiquetas.imprimir', 'faturamento.ver', 'faturamento.lancar', 'dre.ver', 'despesas.lancar', 'metas.editar', 'precos.ver',
    'precos.editar', 'integracao.ver'
  ]::text[];
