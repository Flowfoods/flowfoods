-- ERP 3.2 · catálogo de permissões v2 (decisão 219): entrou `producao.planejar` ("Definir a lista do dia").
--
-- Perfil próprio salvo na v1 com TODAS as permissões da v1 (o "copiado do Dono", o sócio administrador) ganha a nova e passa
-- para a v2: sem escalada (já tinha tudo) e, sem isso, deixaria de cobrir o Gerente e o Dono base — não editaria, não
-- suspenderia nem geraria link para eles, nem daria a si mesmo a permissão nova. Os demais perfis NÃO ganham nada: ficam na
-- v1 e a Equipe avisa "Perfil do catálogo antigo: revise…". Só DADO, nenhuma estrutura muda.
--
-- `PerfilAcesso` fica fora do tenant (decisão 39, sem RLS): o UPDATE alcança todos os parceiros como superusuário e como dono
-- não-superusuário, com ou sem RLS nas tabelas do tenant. Rodar de novo não muda nada (só pega quem está na v1).
UPDATE "PerfilAcesso"
SET "permissoes" = array_append("permissoes", 'producao.planejar'),
    "catalogoVersao" = 2
WHERE "catalogoVersao" < 2
  AND NOT ('producao.planejar' = ANY ("permissoes"))
  AND "permissoes" @> ARRAY[
    'insumos.ver', 'insumos.editar', 'lojas.ver', 'lojas.gerir', 'acessos.gerir', 'historico.ver', 'fichas.ver', 'fichas.editar',
    'compras.ver', 'compras.lancar', 'fornecedores.editar', 'estoque.ver', 'estoque.contar', 'estoque.ajustar', 'requisicao.pedir',
    'requisicao.atender', 'producao.ver', 'producao.registrar', 'etiquetas.imprimir', 'faturamento.ver', 'faturamento.lancar',
    'dre.ver', 'despesas.lancar', 'metas.editar', 'precos.ver', 'precos.editar'
  ]::text[];
