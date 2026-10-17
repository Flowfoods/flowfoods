-- ERP 0.6 — Ajuda contextual: a preferência da pessoa sobre as caixas de aula
-- (ligadas ou desligadas, a resposta da 1ª vez e quais ela já fechou).
--
-- Só ADITIVA: 1 tabela nova, 1 função de apoio ao CHECK; nenhuma tabela
-- existente muda (a relação de volta no `UsuarioErp` é só do Prisma, sem
-- coluna). Sem índice parcial: `migrate diff` fica vazio.
--
-- A tabela fica FORA do tenant de propósito (decisão 112): é por PESSOA (não por
-- pessoa × parceiro) e é lida junto com a sessão, antes de saber o parceiro,
-- como o resto das credenciais. Então:
--   - não entra na RLS nem recebe GRANT do papel `erp_tenant` (o bloco do fim
--     REVOGA, por garantia, qualquer privilégio herdado de default);
--   - só `src/lib/erp/credenciais.ts` toca nela (o prisma do portal recusa em
--     runtime e o teste-guarda reprova o resto);
--   - apagar a pessoa apaga a preferência (ON DELETE CASCADE).
--
-- Segura para produção nos dois cenários da 0.2 (superusuário e dono
-- não-superusuário): CREATE TABLE/FUNCTION/CONSTRAINT só exigem ser dono do
-- schema, e o bloco condicional só mexe no papel se ele existir e quem roda puder.

-- CreateTable
CREATE TABLE "PreferenciaErp" (
    "usuarioId" TEXT NOT NULL,
    "dicasLigadas" BOOLEAN NOT NULL DEFAULT true,
    "escolhidaEm" TIMESTAMP(3),
    "fechadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreferenciaErp_pkey" PRIMARY KEY ("usuarioId")
);

-- AddForeignKey
ALTER TABLE "PreferenciaErp" ADD CONSTRAINT "PreferenciaErp_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioErp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK não aceita subconsulta; a função (imutável) confere cada item da lista.
CREATE FUNCTION "erp_itens_ate"(itens text[], maximo integer) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT NOT EXISTS (SELECT 1 FROM unnest(itens) AS x WHERE x IS NULL OR length(x) > maximo) $$;

-- No máximo 300 caixas fechadas, cada uma "chave@versão" de até 120 caracteres.
-- O servidor só grava chave que existe no registro; o banco segura o teto.
ALTER TABLE "PreferenciaErp" ADD CONSTRAINT "PreferenciaErp_fechadas_limite"
  CHECK ("fechadas" IS NULL OR (cardinality("fechadas") <= 300 AND "erp_itens_ate"("fechadas", 120)));

-- O papel do tenant NÃO alcança a preferência. Condicional, no padrão da 0.3:
-- só se o papel existir e quem roda for dono da tabela (que acabou de criar);
-- senão avisa e segue.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    RAISE NOTICE 'ERP 0.6: papel erp_tenant não existe; nada a revogar.';
    RETURN;
  END IF;
  BEGIN
    EXECUTE 'REVOKE ALL ON "PreferenciaErp" FROM erp_tenant';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ERP 0.6: % não pôde revogar PreferenciaErp de erp_tenant (sem privilégio); o papel não recebeu GRANT nela.', current_user;
  END;
END $$;
