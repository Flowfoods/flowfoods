-- ERP INT-1.8 · catálogo de permissões v4 (decisão 491): entrou `integracao.ver` ("Ver as integrações das lojas (iFood)").
--
-- Mesma regra das v2 e v3: perfil próprio salvo na v3 com TODAS as permissões da v3 (o "copiado do Dono", o sócio
-- administrador) ganha a nova e passa para a v4, sem escalada (já tinha tudo) e para continuar cobrindo o Dono base. Os demais
-- perfis NÃO ganham nada: ficam na versão em que nasceram e a Equipe avisa "Perfil do catálogo antigo: revise…". A tela
-- ainda depende do módulo Integração liberado para o parceiro (decisão 482). Só DADO, nenhuma estrutura muda.
--
-- `PerfilAcesso` fica fora do tenant (decisão 39, sem RLS): o UPDATE alcança todos os parceiros como superusuário e como dono
-- não-superusuário. Rodar de novo não muda nada (só pega quem está abaixo da v4 e ainda não tem a permissão). Perfis das
-- versões anteriores completos já foram promovidos pelas `20261030010000_erp_catalogo_v2` e `20261101010000_erp_catalogo_v3`.
UPDATE "PerfilAcesso"
SET "permissoes" = array_append("permissoes", 'integracao.ver'),
    "catalogoVersao" = 4
WHERE "catalogoVersao" < 4
  AND NOT ('integracao.ver' = ANY ("permissoes"))
  AND "permissoes" @> ARRAY[
    'insumos.ver', 'insumos.editar', 'insumos.categorias', 'lojas.ver', 'lojas.gerir', 'acessos.gerir', 'historico.ver',
    'fichas.ver', 'fichas.editar', 'compras.ver', 'compras.lancar', 'fornecedores.editar', 'estoque.ver', 'estoque.contar',
    'estoque.ajustar', 'requisicao.pedir', 'requisicao.atender', 'producao.ver', 'producao.registrar', 'producao.planejar',
    'etiquetas.imprimir', 'faturamento.ver', 'faturamento.lancar', 'dre.ver', 'despesas.lancar', 'metas.editar', 'precos.ver',
    'precos.editar'
  ]::text[];
