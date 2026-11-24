-- Decisão 536 — "Editar barra": os quatro atalhos laterais da barra de Módulos (celular e tablet), por vínculo
-- pessoa × parceiro.
--
-- Só ADITIVA: 1 tabela nova; nenhuma tabela existente muda (a relação de volta no `AcessoParceiro` é só do Prisma, sem
-- coluna). Reusa a função de apoio `erp_itens_ate` da 0.6 (CHECK não aceita subconsulta).
--
-- A tabela fica FORA do tenant, como as outras credenciais (lida junto com a sessão, antes do contexto do parceiro):
--   - não entra na RLS nem recebe GRANT do papel `erp_tenant` (o bloco do fim REVOGA, por garantia, qualquer privilégio
--     herdado de default);
--   - só `src/lib/erp/credenciais.ts` toca nela (o prisma do portal recusa em runtime e o teste-guarda reprova o resto);
--   - apagar o vínculo apaga os atalhos (ON DELETE CASCADE).
--
-- É preferência, não permissão: guarda chaves de área; quem decide o que aparece é o menu da pessoa (o shell filtra) e o
-- servidor só grava chave que está nele.
--
-- Segura para produção nos dois cenários da 0.2 (superusuário e dono não-superusuário): CREATE TABLE/CONSTRAINT só exigem
-- ser dono do schema, e o bloco condicional só mexe no papel se ele existir e quem roda puder.

-- CreateTable
CREATE TABLE "AtalhosDaBarraErp" (
    "acessoId" TEXT NOT NULL,
    "chaves" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtalhosDaBarraErp_pkey" PRIMARY KEY ("acessoId")
);

-- AddForeignKey
ALTER TABLE "AtalhosDaBarraErp" ADD CONSTRAINT "AtalhosDaBarraErp_acessoId_fkey" FOREIGN KEY ("acessoId") REFERENCES "AcessoParceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No máximo 4 atalhos, cada um uma chave de área de até 40 caracteres. O servidor só grava chave do menu da pessoa; o banco
-- segura o teto.
ALTER TABLE "AtalhosDaBarraErp" ADD CONSTRAINT "AtalhosDaBarraErp_chaves_limite"
  CHECK ("chaves" IS NULL OR (cardinality("chaves") <= 4 AND "erp_itens_ate"("chaves", 40)));

-- O papel do tenant NÃO alcança os atalhos. Condicional, no padrão da 0.3: só se o papel existir e quem roda for dono da
-- tabela (que acabou de criar); senão avisa e segue.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    RAISE NOTICE 'Decisão 536: papel erp_tenant não existe; nada a revogar.';
    RETURN;
  END IF;
  BEGIN
    EXECUTE 'REVOKE ALL ON "AtalhosDaBarraErp" FROM erp_tenant';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Decisão 536: % não pôde revogar AtalhosDaBarraErp de erp_tenant (sem privilégio); o papel não recebeu GRANT nela.', current_user;
  END;
END $$;
