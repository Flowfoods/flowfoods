-- ERP I.1a · catálogo de permissões v3 (decisão 248): entrou `insumos.categorias` ("Gerir categorias de insumos").
--
-- Perfil próprio salvo na v2 com TODAS as permissões da v2 (o "copiado do Dono", o sócio administrador) ganha a nova e passa
-- para a v3: sem escalada (já tinha tudo) e, sem isso, deixaria de cobrir o Dono base — não daria a permissão nova a ninguém,
-- nem a si mesmo. Os demais perfis NÃO ganham nada: ficam na versão em que nasceram e a Equipe avisa "Perfil do catálogo
-- antigo: revise…". Só DADO, nenhuma estrutura muda.
--
-- `PerfilAcesso` fica fora do tenant (decisão 39, sem RLS): o UPDATE alcança todos os parceiros como superusuário e como dono
-- não-superusuário, com ou sem RLS nas tabelas do tenant. Rodar de novo não muda nada (só pega quem está abaixo da v3 e ainda
-- não tem a permissão). Um perfil que ainda está na v1 completo é promovido antes pela `20261030010000_erp_catalogo_v2`.
UPDATE "PerfilAcesso"
SET "permissoes" = array_append("permissoes", 'insumos.categorias'),
    "catalogoVersao" = 3
WHERE "catalogoVersao" < 3
  AND NOT ('insumos.categorias' = ANY ("permissoes"))
  AND "permissoes" @> ARRAY[
    'insumos.ver', 'insumos.editar', 'lojas.ver', 'lojas.gerir', 'acessos.gerir', 'historico.ver', 'fichas.ver', 'fichas.editar',
    'compras.ver', 'compras.lancar', 'fornecedores.editar', 'estoque.ver', 'estoque.contar', 'estoque.ajustar', 'requisicao.pedir',
    'requisicao.atender', 'producao.ver', 'producao.registrar', 'producao.planejar', 'etiquetas.imprimir', 'faturamento.ver',
    'faturamento.lancar', 'dre.ver', 'despesas.lancar', 'metas.editar', 'precos.ver', 'precos.editar'
  ]::text[];
