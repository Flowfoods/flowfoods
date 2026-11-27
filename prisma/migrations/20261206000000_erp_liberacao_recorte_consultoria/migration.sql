-- A prévia usa uma única conexão de origem na loja e no parceiro da liberação.
ALTER TABLE "LiberacaoDeModulo"
  ADD COLUMN "consultoriaLojaId" TEXT,
  ADD COLUMN "consultoriaConexaoId" TEXT;

CREATE UNIQUE INDEX "IntegracaoConexao_tenant_loja_id_key" ON "IntegracaoConexao" ("parceiroId", "lojaId", "id");

ALTER TABLE "LiberacaoDeModulo"
  ADD CONSTRAINT "LiberacaoDeModulo_consultoria_conexao_fkey"
    FOREIGN KEY ("parceiroId", "consultoriaLojaId", "consultoriaConexaoId")
    REFERENCES "IntegracaoConexao" ("parceiroId", "lojaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "LiberacaoDeModulo_consultoria_recorte_check" CHECK (
    CASE WHEN "modulo" = 'consultoria-de-delivery' THEN
      ("consultoriaLojaId" IS NOT NULL AND "consultoriaConexaoId" IS NOT NULL)
      OR (NOT "liberado" AND "consultoriaLojaId" IS NULL AND "consultoriaConexaoId" IS NULL)
    ELSE
      "consultoriaLojaId" IS NULL AND "consultoriaConexaoId" IS NULL
    END
  );
